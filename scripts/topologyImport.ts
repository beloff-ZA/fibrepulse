import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "../packages/db/src/index.js";

type ImportDocument = {
  locations?: Array<{
    parentCanonicalName?: string | null;
    locationType: string;
    name: string;
    canonicalName: string;
    countryCode?: string;
    provinceCode?: string | null;
    municipalityCode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    verificationStatus?: string;
    sourceMetadata: Record<string, unknown>;
  }>;
  relationships?: Array<{
    upstreamProvider: string;
    downstreamProvider: string;
    relationshipType?: string;
    verificationStatus?: string;
    confidenceScore?: number;
    sourceMetadata: Record<string, unknown>;
    notes?: string | null;
  }>;
  footprints?: Array<{
    fnoProvider: string;
    locationCanonicalName: string;
    serviceType?: string;
    footprintStatus?: string;
    verificationStatus?: string;
    confidenceScore?: number;
    sourceMetadata: Record<string, unknown>;
    ispProviders?: string[];
  }>;
};

const verificationStatuses = new Set([
  "verified", "candidate", "rejected", "unsupported",
]);
const relationshipTypes = new Set([
  "provides_access_to", "resells", "aggregates",
  "owns", "operates", "uses_backhaul_from",
]);
const locationTypes = new Set([
  "country", "province", "district", "municipality",
  "city", "town", "suburb", "coverage_zone",
]);
const serviceTypes = new Set([
  "ftth", "fttb", "open_access", "active_ethernet",
  "gpon", "xgs_pon", "unknown",
]);
const footprintStatuses = new Set([
  "available", "planned", "limited", "unavailable", "unknown",
]);

function requiredSourceMetadata(
  value: Record<string, unknown> | undefined,
  context: string,
): Record<string, unknown> {
  if (!value || Object.keys(value).length === 0) {
    throw new Error(`${context}: sourceMetadata is required`);
  }
  return value;
}

function confidence(value: number | undefined): number {
  const result = value ?? 0;
  if (result < 0 || result > 1) {
    throw new Error("confidenceScore must be between 0 and 1");
  }
  return result;
}

async function providerByName(name: string) {
  const result = await db.query<{
    id: string;
    provider_type: string;
  }>(
    `select id, provider_type from providers where lower(name) = lower($1)`,
    [name],
  );

  if (result.rows.length !== 1) {
    throw new Error(
      `Provider '${name}' was not found uniquely; create or correct it first`,
    );
  }
  return result.rows[0];
}

async function locationByCanonicalName(name: string) {
  const result = await db.query<{ id: string }>(
    `select id from locations where canonical_name = $1`,
    [name],
  );

  if (result.rows.length !== 1) {
    throw new Error(
      `Location '${name}' was not found uniquely; import its parent first`,
    );
  }
  return result.rows[0];
}

async function importLocations(items: NonNullable<ImportDocument["locations"]>) {
  for (const item of items) {
    if (!locationTypes.has(item.locationType)) {
      throw new Error(`Unsupported locationType '${item.locationType}'`);
    }

    const status = item.verificationStatus ?? "candidate";
    if (!verificationStatuses.has(status)) {
      throw new Error(`Unsupported verificationStatus '${status}'`);
    }

    const parentId = item.parentCanonicalName
      ? Number((await locationByCanonicalName(item.parentCanonicalName)).id)
      : null;

    if (item.locationType !== "country" && !parentId) {
      throw new Error(`${item.canonicalName}: non-country locations need a parent`);
    }

    await db.query(
      `
        insert into locations (
          parent_location_id, location_type, name, canonical_name,
          country_code, province_code, municipality_code,
          latitude, longitude, verification_status, source_metadata
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
        on conflict (parent_location_id, location_type, canonical_name)
        do update set
          name = excluded.name,
          province_code = excluded.province_code,
          municipality_code = excluded.municipality_code,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          verification_status = excluded.verification_status,
          source_metadata = excluded.source_metadata,
          updated_at = now();
      `,
      [
        parentId,
        item.locationType,
        item.name,
        item.canonicalName,
        item.countryCode ?? "ZA",
        item.provinceCode ?? null,
        item.municipalityCode ?? null,
        item.latitude ?? null,
        item.longitude ?? null,
        status,
        JSON.stringify(requiredSourceMetadata(item.sourceMetadata, item.canonicalName)),
      ],
    );
  }
}

async function importRelationships(
  items: NonNullable<ImportDocument["relationships"]>,
) {
  for (const item of items) {
    const relationshipType = item.relationshipType ?? "provides_access_to";
    const status = item.verificationStatus ?? "candidate";

    if (!relationshipTypes.has(relationshipType)) {
      throw new Error(`Unsupported relationshipType '${relationshipType}'`);
    }
    if (!verificationStatuses.has(status)) {
      throw new Error(`Unsupported verificationStatus '${status}'`);
    }

    const upstream = await providerByName(item.upstreamProvider);
    const downstream = await providerByName(item.downstreamProvider);

    if (relationshipType === "provides_access_to") {
      if (upstream.provider_type !== "FNO") {
        throw new Error(`${item.upstreamProvider} must be an FNO`);
      }
      if (downstream.provider_type !== "ISP") {
        throw new Error(`${item.downstreamProvider} must be an ISP`);
      }
    }

    await db.query(
      `
        insert into provider_relationships (
          upstream_provider_id, downstream_provider_id,
          relationship_type, verification_status,
          confidence_score, source_metadata, notes
        ) values ($1,$2,$3,$4,$5,$6::jsonb,$7)
        on conflict (
          upstream_provider_id, downstream_provider_id, relationship_type
        ) do update set
          verification_status = excluded.verification_status,
          confidence_score = excluded.confidence_score,
          source_metadata = excluded.source_metadata,
          notes = excluded.notes,
          updated_at = now();
      `,
      [
        Number(upstream.id),
        Number(downstream.id),
        relationshipType,
        status,
        confidence(item.confidenceScore),
        JSON.stringify(requiredSourceMetadata(
          item.sourceMetadata,
          `${item.upstreamProvider} -> ${item.downstreamProvider}`,
        )),
        item.notes ?? null,
      ],
    );
  }
}

async function importFootprints(items: NonNullable<ImportDocument["footprints"]>) {
  for (const item of items) {
    const serviceType = item.serviceType ?? "unknown";
    const footprintStatus = item.footprintStatus ?? "unknown";
    const status = item.verificationStatus ?? "candidate";

    if (!serviceTypes.has(serviceType)) {
      throw new Error(`Unsupported serviceType '${serviceType}'`);
    }
    if (!footprintStatuses.has(footprintStatus)) {
      throw new Error(`Unsupported footprintStatus '${footprintStatus}'`);
    }
    if (!verificationStatuses.has(status)) {
      throw new Error(`Unsupported verificationStatus '${status}'`);
    }

    const fno = await providerByName(item.fnoProvider);
    if (fno.provider_type !== "FNO") {
      throw new Error(`${item.fnoProvider} must be an FNO`);
    }
    const location = await locationByCanonicalName(item.locationCanonicalName);
    const sourceMetadata = requiredSourceMetadata(
      item.sourceMetadata,
      `${item.fnoProvider} at ${item.locationCanonicalName}`,
    );

    const footprintResult = await db.query<{ id: string }>(
      `
        insert into network_footprints (
          fno_provider_id, location_id, service_type,
          footprint_status, verification_status,
          confidence_score, source_metadata,
          first_observed_at, last_verified_at
        ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,now(),
          case when $5 = 'verified' then now() else null end)
        on conflict (fno_provider_id, location_id, service_type)
        do update set
          footprint_status = excluded.footprint_status,
          verification_status = excluded.verification_status,
          confidence_score = excluded.confidence_score,
          source_metadata = excluded.source_metadata,
          last_verified_at = case
            when excluded.verification_status = 'verified' then now()
            else network_footprints.last_verified_at
          end,
          updated_at = now()
        returning id;
      `,
      [
        Number(fno.id),
        Number(location.id),
        serviceType,
        footprintStatus,
        status,
        confidence(item.confidenceScore),
        JSON.stringify(sourceMetadata),
      ],
    );

    const footprintId = Number(footprintResult.rows[0]?.id);
    for (const ispName of item.ispProviders ?? []) {
      const isp = await providerByName(ispName);
      if (isp.provider_type !== "ISP") {
        throw new Error(`${ispName} must be an ISP`);
      }

      await db.query(
        `
          insert into footprint_providers (
            network_footprint_id, isp_provider_id,
            service_status, verification_status,
            confidence_score, source_metadata,
            last_verified_at
          ) values ($1,$2,$3,$4,$5,$6::jsonb,
            case when $4 = 'verified' then now() else null end)
          on conflict (network_footprint_id, isp_provider_id)
          do update set
            service_status = excluded.service_status,
            verification_status = excluded.verification_status,
            confidence_score = excluded.confidence_score,
            source_metadata = excluded.source_metadata,
            updated_at = now();
        `,
        [
          footprintId,
          Number(isp.id),
          footprintStatus,
          status,
          confidence(item.confidenceScore),
          JSON.stringify(sourceMetadata),
        ],
      );
    }
  }
}

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("Usage: npm run topology:import -- <file.json>");
  }

  const document = JSON.parse(
    await readFile(resolve(inputPath), "utf8"),
  ) as ImportDocument;

  await db.query("begin");
  try {
    await importLocations(document.locations ?? []);
    await importRelationships(document.relationships ?? []);
    await importFootprints(document.footprints ?? []);
    await db.query("commit");
    console.log("Topology import completed successfully.");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error("Topology import failed:", error);
  process.exit(1);
});
