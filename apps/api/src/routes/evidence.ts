import { Router } from "express";
import { query } from "@fibrepulse/db";

const router = Router();

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

router.get("/sources", async (_req, res, next) => {
  try {
    const items = await query(`
      select
        id,
        source_key,
        source_type,
        name,
        enabled,
        trust_weight,
        source_metadata,
        created_at,
        updated_at
      from evidence_sources
      order by enabled desc, source_type, name;
    `);

    res.json({
      generated_at: new Date().toISOString(),
      meaning:
        "Evidence sources describe where observations originate. Enabled does not mean the source currently reports a fault.",
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/events", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 1), 500);
    const fnoId = req.query.fno_id ? positiveInteger(req.query.fno_id) : null;
    const ispId = req.query.isp_id ? positiveInteger(req.query.isp_id) : null;
    const locationId = req.query.location_id
      ? positiveInteger(req.query.location_id)
      : null;
    const activeOnly = String(req.query.active_only ?? "false") === "true";

    if (req.query.fno_id && !fnoId) {
      return res.status(400).json({
        error: "invalid_fno_id",
        message: "fno_id must be a positive integer",
      });
    }
    if (req.query.isp_id && !ispId) {
      return res.status(400).json({
        error: "invalid_isp_id",
        message: "isp_id must be a positive integer",
      });
    }
    if (req.query.location_id && !locationId) {
      return res.status(400).json({
        error: "invalid_location_id",
        message: "location_id must be a positive integer",
      });
    }

    const items = await query(
      `
        select
          ee.id,
          es.source_key,
          es.source_type,
          es.name as source_name,
          es.trust_weight,
          ee.evidence_type,
          ee.observed_status,
          ee.confidence_score,
          ee.observed_at,
          ee.expires_at,
          ee.external_reference,
          ee.payload,
          fno.id as fno_id,
          fno.name as fno_name,
          isp.id as isp_id,
          isp.name as isp_name,
          l.id as location_id,
          l.name as location_name,
          l.location_type,
          ee.network_footprint_id,
          ee.bgp_incident_id,
          ee.created_at
        from evidence_events ee
        join evidence_sources es on es.id = ee.evidence_source_id
        left join providers fno on fno.id = ee.fno_provider_id
        left join providers isp on isp.id = ee.isp_provider_id
        left join locations l on l.id = ee.location_id
        where ($1::bigint is null or ee.fno_provider_id = $1)
          and ($2::bigint is null or ee.isp_provider_id = $2)
          and ($3::bigint is null or ee.location_id = $3)
          and (
            $4::boolean = false
            or ee.expires_at is null
            or ee.expires_at > now()
          )
        order by ee.observed_at desc
        limit $5;
      `,
      [fnoId, ispId, locationId, activeOnly, limit],
    );

    res.json({
      generated_at: new Date().toISOString(),
      meaning:
        "Evidence events are observations, not FibrePulse availability conclusions.",
      filters: {
        fno_id: fnoId,
        isp_id: ispId,
        location_id: locationId,
        active_only: activeOnly,
        limit,
      },
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/routing/fnos", async (_req, res, next) => {
  try {
    const items = await query(`
      with latest as (
        select
          p.id as fno_id,
          p.name as fno_name,
          lbs.prefix,
          lbs.bgp_status,
          lbs.rpki_status,
          lbs.overall_status,
          lbs.source_confidence,
          lbs.source_agreement,
          lbs.source_score,
          lbs.checked_at
        from latest_bgp_status lbs
        join provider_asns pa on pa.asn = lbs.expected_origin_asn
        join providers p on p.id = pa.provider_id
        where p.provider_type = 'FNO'
          and p.display_enabled = true
      )
      select
        fno_id,
        fno_name,
        count(*)::int as prefix_count,
        count(*) filter (where bgp_status = 'valid')::int as bgp_valid_count,
        count(*) filter (where bgp_status = 'invalid')::int as bgp_invalid_count,
        count(*) filter (
          where bgp_status = 'unknown' or bgp_status is null
        )::int as bgp_unknown_count,
        count(*) filter (where rpki_status = 'valid')::int as rpki_valid_count,
        count(*) filter (where rpki_status = 'invalid')::int as rpki_invalid_count,
        count(*) filter (
          where rpki_status = 'unknown' or rpki_status is null
        )::int as rpki_unknown_count,
        count(*) filter (where overall_status = 'valid')::int as overall_valid_count,
        count(*) filter (where overall_status = 'invalid')::int as overall_invalid_count,
        count(*) filter (
          where overall_status = 'unknown' or overall_status is null
        )::int as overall_unknown_count,
        case
          when count(*) filter (where overall_status = 'invalid') > 0 then 'invalid'
          when count(*) filter (
            where overall_status = 'unknown' or overall_status is null
          ) > 0 then 'unknown'
          when count(*) > 0 then 'valid'
          else 'unknown'
        end as routing_status,
        max(checked_at) as latest_observed_at,
        round(avg(source_score)::numeric, 4) as average_source_score
      from latest
      group by fno_id, fno_name
      order by fno_name;
    `);

    res.json({
      generated_at: new Date().toISOString(),
      meaning:
        "These are current BGP and RPKI routing observations. They do not prove last-mile customer availability.",
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/routing/prefixes", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 200), 1), 1000);
    const items = await query(
      `
        select
          p.id as fno_id,
          p.name as fno_name,
          lbs.prefix,
          lbs.expected_origin_asn,
          lbs.observed_origin_asns,
          lbs.bgp_status,
          lbs.rpki_status,
          lbs.overall_status,
          lbs.source_confidence,
          lbs.source_agreement,
          lbs.source_score,
          lbs.message,
          lbs.checked_at
        from latest_bgp_status lbs
        join provider_asns pa on pa.asn = lbs.expected_origin_asn
        join providers p on p.id = pa.provider_id
        where p.provider_type = 'FNO'
          and p.display_enabled = true
        order by p.name, lbs.prefix
        limit $1;
      `,
      [limit],
    );

    res.json({
      generated_at: new Date().toISOString(),
      meaning:
        "Prefix observations show routing and RPKI state only, not end-user service availability.",
      limit,
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/summary/fnos", async (_req, res, next) => {
  try {
    const items = await query(`
      select
        p.id as fno_id,
        p.name as fno_name,
        count(ee.id)::int as active_evidence_count,
        count(ee.id) filter (
          where ee.observed_status in ('offline', 'invalid')
        )::int as adverse_evidence_count,
        count(ee.id) filter (
          where ee.observed_status in ('online', 'valid')
        )::int as positive_evidence_count,
        count(ee.id) filter (
          where ee.observed_status in ('degraded', 'maintenance')
        )::int as degraded_evidence_count,
        max(ee.observed_at) as latest_observed_at,
        coalesce(
          round(
            avg(ee.confidence_score * es.trust_weight)
              filter (where ee.id is not null),
            4
          ),
          0
        ) as average_weighted_confidence
      from providers p
      left join evidence_events ee
        on ee.fno_provider_id = p.id
       and (ee.expires_at is null or ee.expires_at > now())
      left join evidence_sources es
        on es.id = ee.evidence_source_id
       and es.enabled = true
      where p.provider_type = 'FNO'
        and p.display_enabled = true
      group by p.id, p.name
      order by p.name;
    `);

    res.json({
      generated_at: new Date().toISOString(),
      meaning:
        "Counts summarise active non-routing evidence events only. Routing observations are available under /api/evidence/routing/fnos.",
      items,
    });
  } catch (error) {
    next(error);
  }
});

export { router as evidenceRouter };
