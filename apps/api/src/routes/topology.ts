import { Router } from "express";
import { query } from "@fibrepulse/db";

const router = Router();

const verificationStatuses = new Set([
  "verified",
  "candidate",
  "rejected",
  "unsupported",
]);

const locationTypes = new Set([
  "country",
  "province",
  "district",
  "municipality",
  "city",
  "town",
  "suburb",
  "coverage_zone",
]);

function optionalPositiveInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

router.get("/fnos", async (req, res, next) => {
  try {
    const requestedStatus = String(
      req.query.verification_status ?? "",
    );

    if (
      requestedStatus &&
      !verificationStatuses.has(requestedStatus)
    ) {
      return res.status(400).json({
        error: "invalid_verification_status",
        message:
          "verification_status must be verified, candidate, rejected or unsupported",
      });
    }

    const items = await query<{
      fno_id: number;
      fno_name: string;
      fno_verification_status: string;
      related_isp_count: number;
      footprint_count: number;
      location_count: number;
      last_footprint_verified_at: string | null;
    }>(
      `
        select *
        from topology_fno_overview
        where ($1::text = '' or fno_verification_status = $1)
        order by fno_name;
      `,
      [requestedStatus],
    );

    res.json({
      generated_at: new Date().toISOString(),
      meaning:
        "Topology records describe documented relationships and footprint presence, not current live service health.",
      filters: {
        verification_status:
          requestedStatus || null,
      },
      totals: {
        total: items.length,
        verified: items.filter(
          (item) =>
            item.fno_verification_status === "verified",
        ).length,
        candidate: items.filter(
          (item) =>
            item.fno_verification_status === "candidate",
        ).length,
      },
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/fnos/:id", async (req, res, next) => {
  try {
    const fnoId = optionalPositiveInteger(req.params.id);

    if (!fnoId) {
      return res.status(400).json({
        error: "invalid_fno_id",
        message: "FNO id must be a positive integer",
      });
    }

    const fnoRows = await query<{
      id: number;
      name: string;
      provider_type: string;
      verification_status: string;
      monitoring_mode: string;
      website_url: string | null;
      status_page_url: string | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `
        select
          id,
          name,
          provider_type,
          verification_status,
          monitoring_mode,
          website_url,
          status_page_url,
          notes,
          created_at,
          updated_at
        from providers
        where id = $1
          and provider_type = 'FNO';
      `,
      [fnoId],
    );

    const fno = fnoRows[0];

    if (!fno) {
      return res.status(404).json({
        error: "fno_not_found",
        message: "No FNO was found for the supplied id",
      });
    }

    const providers = await query(
      `
        select
          pr.id as relationship_id,
          pr.relationship_type,
          pr.verification_status,
          pr.confidence_score,
          pr.valid_from,
          pr.valid_to,
          pr.source_metadata,
          pr.notes,
          downstream.id as provider_id,
          downstream.name as provider_name,
          downstream.provider_type,
          downstream.verification_status as provider_verification_status
        from provider_relationships pr
        join providers downstream
          on downstream.id = pr.downstream_provider_id
        where pr.upstream_provider_id = $1
          and pr.verification_status <> 'rejected'
        order by
          pr.verification_status = 'verified' desc,
          downstream.name;
      `,
      [fnoId],
    );

    const footprints = await query(
      `
        with recursive location_path as (
          select
            l.id,
            l.parent_location_id,
            l.location_type,
            l.name,
            l.canonical_name,
            l.verification_status,
            array[l.name]::text[] as path_names,
            array[l.id]::bigint[] as path_ids
          from locations l
          where l.parent_location_id is null

          union all

          select
            child.id,
            child.parent_location_id,
            child.location_type,
            child.name,
            child.canonical_name,
            child.verification_status,
            parent.path_names || child.name,
            parent.path_ids || child.id
          from locations child
          join location_path parent
            on parent.id = child.parent_location_id
        )
        select
          nf.id as footprint_id,
          nf.service_type,
          nf.footprint_status,
          nf.verification_status,
          nf.confidence_score,
          nf.source_metadata,
          nf.first_observed_at,
          nf.last_verified_at,
          lp.id as location_id,
          lp.location_type,
          lp.name as location_name,
          lp.canonical_name,
          lp.verification_status as location_verification_status,
          lp.path_names as location_path,
          coalesce(
            jsonb_agg(
              jsonb_build_object(
                'footprint_provider_id', fp.id,
                'provider_id', isp.id,
                'provider_name', isp.name,
                'provider_type', isp.provider_type,
                'service_status', fp.service_status,
                'verification_status', fp.verification_status,
                'confidence_score', fp.confidence_score,
                'source_metadata', fp.source_metadata,
                'last_verified_at', fp.last_verified_at
              )
              order by isp.name
            ) filter (where fp.id is not null),
            '[]'::jsonb
          ) as providers
        from network_footprints nf
        join location_path lp
          on lp.id = nf.location_id
        left join footprint_providers fp
          on fp.network_footprint_id = nf.id
         and fp.verification_status <> 'rejected'
        left join providers isp
          on isp.id = fp.isp_provider_id
        where nf.fno_provider_id = $1
          and nf.verification_status <> 'rejected'
        group by
          nf.id,
          nf.service_type,
          nf.footprint_status,
          nf.verification_status,
          nf.confidence_score,
          nf.source_metadata,
          nf.first_observed_at,
          nf.last_verified_at,
          lp.id,
          lp.location_type,
          lp.name,
          lp.canonical_name,
          lp.verification_status,
          lp.path_names
        order by lp.path_names, nf.service_type;
      `,
      [fnoId],
    );

    res.json({
      generated_at: new Date().toISOString(),
      meaning:
        "Footprint availability describes documented service presence. It is not a live online or offline status.",
      fno,
      relationships: providers,
      footprints,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/locations", async (req, res, next) => {
  try {
    const parentId = optionalPositiveInteger(
      req.query.parent_id,
    );
    const requestedType = String(
      req.query.location_type ?? "",
    );
    const requestedStatus = String(
      req.query.verification_status ?? "",
    );

    if (
      req.query.parent_id !== undefined &&
      !parentId
    ) {
      return res.status(400).json({
        error: "invalid_parent_id",
        message: "parent_id must be a positive integer",
      });
    }

    if (
      requestedType &&
      !locationTypes.has(requestedType)
    ) {
      return res.status(400).json({
        error: "invalid_location_type",
        message: "Unsupported location_type",
      });
    }

    if (
      requestedStatus &&
      !verificationStatuses.has(requestedStatus)
    ) {
      return res.status(400).json({
        error: "invalid_verification_status",
        message:
          "verification_status must be verified, candidate, rejected or unsupported",
      });
    }

    const items = await query(
      `
        select
          l.id,
          l.parent_location_id,
          l.location_type,
          l.name,
          l.canonical_name,
          l.country_code,
          l.province_code,
          l.municipality_code,
          l.latitude,
          l.longitude,
          l.external_ids,
          l.source_metadata,
          l.verification_status,
          l.created_at,
          l.updated_at,
          count(child.id)::int as child_count,
          count(nf.id)::int as footprint_count
        from locations l
        left join locations child
          on child.parent_location_id = l.id
        left join network_footprints nf
          on nf.location_id = l.id
         and nf.verification_status <> 'rejected'
        where (
          ($1::bigint is null and l.parent_location_id is null)
          or l.parent_location_id = $1
        )
          and ($2::text = '' or l.location_type = $2)
          and ($3::text = '' or l.verification_status = $3)
        group by l.id
        order by l.name;
      `,
      [parentId, requestedType, requestedStatus],
    );

    res.json({
      generated_at: new Date().toISOString(),
      filters: {
        parent_id: parentId,
        location_type: requestedType || null,
        verification_status:
          requestedStatus || null,
      },
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/unmapped", async (_req, res, next) => {
  try {
    const fnoWithoutRelationships = await query(
      `
        select
          p.id,
          p.name,
          p.verification_status,
          p.monitoring_mode,
          count(pa.id)::int as asn_count
        from providers p
        left join provider_asns pa
          on pa.provider_id = p.id
        where p.provider_type = 'FNO'
          and p.display_enabled = true
          and not exists (
            select 1
            from provider_relationships pr
            where pr.upstream_provider_id = p.id
              and pr.relationship_type = 'provides_access_to'
              and pr.verification_status <> 'rejected'
          )
        group by p.id
        order by p.name;
      `,
    );

    const fnoWithoutFootprints = await query(
      `
        select
          p.id,
          p.name,
          p.verification_status,
          p.monitoring_mode
        from providers p
        where p.provider_type = 'FNO'
          and p.display_enabled = true
          and not exists (
            select 1
            from network_footprints nf
            where nf.fno_provider_id = p.id
              and nf.verification_status <> 'rejected'
          )
        order by p.name;
      `,
    );

    const candidateRelationships = await query(
      `
        select
          pr.id,
          upstream.id as upstream_provider_id,
          upstream.name as upstream_provider_name,
          upstream.provider_type as upstream_provider_type,
          downstream.id as downstream_provider_id,
          downstream.name as downstream_provider_name,
          downstream.provider_type as downstream_provider_type,
          pr.relationship_type,
          pr.confidence_score,
          pr.source_metadata,
          pr.created_at,
          pr.updated_at
        from provider_relationships pr
        join providers upstream
          on upstream.id = pr.upstream_provider_id
        join providers downstream
          on downstream.id = pr.downstream_provider_id
        where pr.verification_status = 'candidate'
        order by upstream.name, downstream.name;
      `,
    );

    const candidateFootprints = await query(
      `
        select
          nf.id,
          fno.id as fno_id,
          fno.name as fno_name,
          l.id as location_id,
          l.name as location_name,
          l.location_type,
          nf.service_type,
          nf.footprint_status,
          nf.confidence_score,
          nf.source_metadata,
          nf.created_at,
          nf.updated_at
        from network_footprints nf
        join providers fno
          on fno.id = nf.fno_provider_id
        join locations l
          on l.id = nf.location_id
        where nf.verification_status = 'candidate'
        order by fno.name, l.name;
      `,
    );

    res.json({
      generated_at: new Date().toISOString(),
      meaning:
        "These records require mapping or verification and must not be treated as live availability conclusions.",
      totals: {
        fnos_without_relationships:
          fnoWithoutRelationships.length,
        fnos_without_footprints:
          fnoWithoutFootprints.length,
        candidate_relationships:
          candidateRelationships.length,
        candidate_footprints:
          candidateFootprints.length,
      },
      fnos_without_relationships:
        fnoWithoutRelationships,
      fnos_without_footprints:
        fnoWithoutFootprints,
      candidate_relationships:
        candidateRelationships,
      candidate_footprints:
        candidateFootprints,
    });
  } catch (error) {
    next(error);
  }
});

export { router as topologyRouter };
