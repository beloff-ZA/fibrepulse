import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import crypto from "node:crypto";
import axios from "axios";
import { db } from "../packages/db/src/index.js";

type SourceConfig = {
  enabled: boolean;
  sourceKey: string;
  name: string;
  url: string;
  fnoProvider?: string;
  ispProvider?: string;
  locationCanonicalName?: string;
  trustWeight?: number;
  confidenceScore?: number;
  ttlMinutes?: number;
  evidenceType?: "operator_notice" | "maintenance" | "service_state" | "other";
  rules: Array<{
    pattern: string;
    status: "online" | "degraded" | "offline" | "unknown" | "maintenance";
  }>;
  fallbackStatus?: "online" | "degraded" | "offline" | "unknown" | "maintenance";
};

type PollConfig = { sources: SourceConfig[] };

function bounded(value: number | undefined, fallback: number): number {
  const result = value ?? fallback;
  if (result < 0 || result > 1) {
    throw new Error("Trust and confidence values must be between 0 and 1");
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

async function locationId(name: string | undefined) {
  if (!name) return null;
  const result = await db.query<{ id: string }>(
    `select id from locations where canonical_name = $1`,
    [name],
  );
  if (result.rows.length !== 1) {
    throw new Error(`Location '${name}' was not found uniquely`);
  }
  return Number(result.rows[0].id);
}

async function pollSource(source: SourceConfig): Promise<void> {
  if (!source.enabled) {
    console.log(`Skipping disabled source ${source.sourceKey}`);
    return;
  }

  const response = await axios.get<string>(source.url, {
    timeout: 15_000,
    responseType: "text",
    headers: {
      "User-Agent": "FibrePulseZA/0.1 official-status-monitor",
      Accept: "text/html,application/json,text/plain;q=0.9,*/*;q=0.8",
    },
  });

  const body = typeof response.data === "string"
    ? response.data
    : JSON.stringify(response.data);

  let observedStatus = source.fallbackStatus ?? "unknown";
  let matchedPattern: string | null = null;

  for (const rule of source.rules) {
    if (new RegExp(rule.pattern, "i").test(body)) {
      observedStatus = rule.status;
      matchedPattern = rule.pattern;
      break;
    }
  }

  const fnoId = await providerId(source.fnoProvider, "FNO");
  const ispId = await providerId(source.ispProvider, "ISP");
  const locId = await locationId(source.locationCanonicalName);

  if (!fnoId && !ispId && !locId) {
    throw new Error(`${source.sourceKey} must target an FNO, ISP or location`);
  }

  const sourceResult = await db.query<{ id: string }>(
    `
      insert into evidence_sources (
        source_key, source_type, name, enabled,
        trust_weight, source_metadata
      ) values ($1, 'official_status', $2, true, $3, $4::jsonb)
      on conflict (source_key) do update set
        name = excluded.name,
        enabled = true,
        trust_weight = excluded.trust_weight,
        source_metadata = excluded.source_metadata,
        updated_at = now()
      returning id;
    `,
    [
      source.sourceKey,
      source.name,
      bounded(source.trustWeight, 0.9),
      JSON.stringify({ url: source.url, poller: "official-status" }),
    ],
  );

  const now = new Date();
  const ttlMinutes = Math.max(source.ttlMinutes ?? 30, 1);
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);
  const bucket = now.toISOString().slice(0, 16);
  const dedupe = crypto
    .createHash("sha256")
    .update(`${source.sourceKey}:${observedStatus}:${bucket}`)
    .digest("hex");

  await db.query(
    `
      insert into evidence_events (
        evidence_source_id, fno_provider_id, isp_provider_id,
        location_id, evidence_type, observed_status,
        confidence_score, observed_at, expires_at,
        external_reference, deduplication_key, payload
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
      on conflict (evidence_source_id, deduplication_key)
        where deduplication_key is not null
      do update set
        observed_status = excluded.observed_status,
        confidence_score = excluded.confidence_score,
        observed_at = excluded.observed_at,
        expires_at = excluded.expires_at,
        payload = excluded.payload;
    `,
    [
      Number(sourceResult.rows[0].id),
      fnoId,
      ispId,
      locId,
      source.evidenceType ?? "operator_notice",
      observedStatus,
      bounded(source.confidenceScore, 0.9),
      now.toISOString(),
      expiresAt.toISOString(),
      source.url,
      dedupe,
      JSON.stringify({
        httpStatus: response.status,
        matchedPattern,
        contentLength: body.length,
      }),
    ],
  );

  console.log(`${source.sourceKey}: ${observedStatus}`);
}

async function main(): Promise<void> {
  const configPath = process.argv[2] ?? "config/status-sources.json";
  const config = JSON.parse(
    await readFile(resolve(configPath), "utf8"),
  ) as PollConfig;

  for (const source of config.sources ?? []) {
    try {
      await pollSource(source);
    } catch (error) {
      console.error(
        `${source.sourceKey} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  await db.end();
}

main().catch(async (error) => {
  console.error("Official source poll failed:", error);
  await db.end();
  process.exit(1);
});
