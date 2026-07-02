import { db, query } from "@fibrepulse/db";
import type {
  HealthStatus,
  MonitoredPrefix,
  SourceAgreement,
  SourceConfidence,
} from "./types.js";

export async function getMonitoredPrefixes(): Promise<MonitoredPrefix[]> {
  return query<MonitoredPrefix>(`
    select
      mp.id as monitored_prefix_id,
      mp.prefix::text as prefix,
      mp.expected_origin_asn,
      p.name as provider_name,
      pa.asn
    from monitored_prefixes mp
    join provider_asns pa on pa.id = mp.provider_asn_id
    join providers p on p.id = pa.provider_id
    where mp.monitor_enabled = true
    order by p.name, mp.prefix
  `);
}

export async function getLatestCheck(
  monitoredPrefixId: number,
): Promise<{
  overall_status: HealthStatus;
  checked_at: string;
} | null> {
  const rows = await query<{
    overall_status: HealthStatus;
    checked_at: string;
  }>(
    `
    select
      overall_status,
      checked_at
    from bgp_checks
    where monitored_prefix_id = $1
    order by checked_at desc
    limit 1
    `,
    [monitoredPrefixId],
  );

  return rows[0] ?? null;
}

export async function writeCheck(input: {
  monitoredPrefixId: number;
  bgpStatus: HealthStatus;
  rpkiStatus: HealthStatus;
  overallStatus: HealthStatus;
  observedOriginAsns: number[];
  sources: Record<string, unknown>;
  message: string;
  sourceConfidence: SourceConfidence;
  sourceAgreement: SourceAgreement;
  sourceScore: number;
}): Promise<void> {
  await db.query(
    `
    insert into bgp_checks (
      monitored_prefix_id,
      bgp_status,
      rpki_status,
      overall_status,
      observed_origin_asns,
      sources,
      message,
      source_confidence,
      source_agreement,
      source_score
    )
    values (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6::jsonb,
      $7,
      $8,
      $9,
      $10
    )
    `,
    [
      input.monitoredPrefixId,
      input.bgpStatus,
      input.rpkiStatus,
      input.overallStatus,
      input.observedOriginAsns,
      JSON.stringify(input.sources),
      input.message,
      input.sourceConfidence,
      input.sourceAgreement,
      input.sourceScore,
    ],
  );
}

export async function getOpenIncident(
  monitoredPrefixId: number,
): Promise<{
  id: number;
  current_status: HealthStatus;
  started_at: string;
} | null> {
  const rows = await query<{
    id: number;
    current_status: HealthStatus;
    started_at: string;
  }>(
    `
    select
      id,
      current_status,
      started_at
    from bgp_incidents
    where monitored_prefix_id = $1
      and status = 'open'
    order by started_at desc
    limit 1
    `,
    [monitoredPrefixId],
  );

  return rows[0] ?? null;
}

export async function openIncident(input: {
  monitoredPrefixId: number;
  severity: "warning" | "major" | "critical";
  previousStatus: HealthStatus | null;
  currentStatus: HealthStatus;
  summary: string;
}): Promise<void> {
  await db.query(
    `
    insert into bgp_incidents (
      monitored_prefix_id,
      status,
      severity,
      previous_status,
      current_status,
      started_at,
      summary
    )
    values (
      $1,
      'open',
      $2,
      $3,
      $4,
      now(),
      $5
    )
    `,
    [
      input.monitoredPrefixId,
      input.severity,
      input.previousStatus,
      input.currentStatus,
      input.summary,
    ],
  );
}

export async function resolveIncident(input: {
  incidentId: number;
  currentStatus: HealthStatus;
}): Promise<void> {
  await db.query(
    `
    update bgp_incidents
    set
      status = 'resolved',
      current_status = $2,
      resolved_at = now(),
      updated_at = now(),
      summary = summary || ' Resolved when status returned to valid.'
    where id = $1
    `,
    [
      input.incidentId,
      input.currentStatus,
    ],
  );
}

export { db };
