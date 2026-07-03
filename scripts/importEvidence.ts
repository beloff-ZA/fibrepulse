import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "../packages/db/src/index.js";

type EvidenceDocument = {
  source: {
    sourceKey: string;
    sourceType:
      | "bgp"
      | "rpki"
      | "official_status"
      | "social"
      | "manual"
      | "other";
    name: string;
    enabled?: boolean;
    trustWeight?: number;
    sourceMetadata?: Record<string, unknown>;
  };
  events: Array<{
    fnoProvider?: string;
    ispProvider?: string;
    locationCanonicalName?: string;
    networkFootprintId?: number;
    bgpIncidentId?: number;
    evidenceType:
      | "routing_state"
      | "service_state"
      | "reachability"
      | "latency"
      | "packet_loss"
      | "dns_state"
      | "operator_notice"
      | "maintenance"
      | "other";
    observedStatus:
      | "online"
      | "degraded"
      | "offline"
      | "unknown"
      | "maintenance"
      | "valid"
      | "invalid";
    confidenceScore?: number;
    observedAt: string;
    expiresAt?: string;
    externalReference?: string;
    deduplicationKey?: string;
    payload?: Record<string, unknown>;
  }>;
};

function score(value: number | undefined, label: string): number {
  const result = value ?? 0;
  if (result < 0 || result > 1) {
    throw new Error(`${label} must be between 0 and 1`);
  }
  return result;
}

async function providerId(name: string | undefined, type: "FNO" | "ISP") {
  if (!name) return null;
  const result = await db.query<{ id: string }>(
    `select id from providers where lower(name) = lower($1) and provider_type = $2`,
    [name, type],
  );
  if (result.rows.length !== 1) {
    throw new Error(`${type} provider '${name}' was not found uniquely`);
  }
  return Number(result.rows[0].id);
}

async function locationId(canonicalName: string | undefined) {
  if (!canonicalName) return null;
  const result = await db.query<{ id: string }>(
    `select id from locations where canonical_name = $1`,
    [canonicalName],
  );
  if (result.rows.length !== 1) {
    throw new Error(`Location '${canonicalName}' was not found uniquely`);
  }
  return Number(result.rows[0].id);
}

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("Usage: npm run evidence:import -- <file.json>");
  }

  const document = JSON.parse(
    await readFile(resolve(inputPath), "utf8"),
  ) as EvidenceDocument;

  if (!document.source?.sourceKey || !document.source.name) {
    throw new Error("Source key and source name are required");
  }

  await db.query("begin");
  try {
    const sourceResult = await db.query<{ id: string }>(
      `
        insert into evidence_sources (
          source_key, source_type, name, enabled,
          trust_weight, source_metadata
        ) values ($1,$2,$3,$4,$5,$6::jsonb)
        on conflict (source_key) do update set
          source_type = excluded.source_type,
          name = excluded.name,
          enabled = excluded.enabled,
          trust_weight = excluded.trust_weight,
          source_metadata = excluded.source_metadata,
          updated_at = now()
        returning id;
      `,
      [
        document.source.sourceKey,
        document.source.sourceType,
        document.source.name,
        document.source.enabled ?? true,
        score(document.source.trustWeight ?? 0.5, "trustWeight"),
        JSON.stringify(document.source.sourceMetadata ?? {}),
      ],
    );

    const sourceId = Number(sourceResult.rows[0]?.id);

    for (const event of document.events ?? []) {
      const fnoId = await providerId(event.fnoProvider, "FNO");
      const ispId = await providerId(event.ispProvider, "ISP");
      const locId = await locationId(event.locationCanonicalName);

      if (
        !fnoId &&
        !ispId &&
        !locId &&
        !event.networkFootprintId &&
        !event.bgpIncidentId
      ) {
        throw new Error(
          "Each event must reference an FNO, ISP, location, footprint or BGP incident",
        );
      }

      const observedAt = new Date(event.observedAt);
      if (Number.isNaN(observedAt.getTime())) {
        throw new Error(`Invalid observedAt '${event.observedAt}'`);
      }

      if (event.expiresAt) {
        const expiresAt = new Date(event.expiresAt);
        if (
          Number.isNaN(expiresAt.getTime()) ||
          expiresAt <= observedAt
        ) {
          throw new Error("expiresAt must be a valid time after observedAt");
        }
      }

      await db.query(
        `
          insert into evidence_events (
            evidence_source_id,
            fno_provider_id,
            isp_provider_id,
            location_id,
            network_footprint_id,
            bgp_incident_id,
            evidence_type,
            observed_status,
            confidence_score,
            observed_at,
            expires_at,
            external_reference,
            deduplication_key,
            payload
          ) values (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb
          )
          on conflict (evidence_source_id, deduplication_key)
            where deduplication_key is not null
          do update set
            observed_status = excluded.observed_status,
            confidence_score = excluded.confidence_score,
            observed_at = excluded.observed_at,
            expires_at = excluded.expires_at,
            external_reference = excluded.external_reference,
            payload = excluded.payload;
        `,
        [
          sourceId,
          fnoId,
          ispId,
          locId,
          event.networkFootprintId ?? null,
          event.bgpIncidentId ?? null,
          event.evidenceType,
          event.observedStatus,
          score(event.confidenceScore, "confidenceScore"),
          event.observedAt,
          event.expiresAt ?? null,
          event.externalReference ?? null,
          event.deduplicationKey ?? null,
          JSON.stringify(event.payload ?? {}),
        ],
      );
    }

    await db.query("commit");
    console.log(`Imported ${document.events.length} evidence event(s).`);
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error("Evidence import failed:", error);
  process.exit(1);
});
