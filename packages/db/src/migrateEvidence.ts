import { db } from "./index.js";

async function migrateEvidence(): Promise<void> {
  console.log("Running evidence foundation migration...");
  await db.query("begin");

  try {
    await db.query(`
      create table if not exists evidence_sources (
        id bigserial primary key,
        source_key text not null unique,
        source_type text not null check (
          source_type in (
            'bgp', 'rpki', 'official_status', 'social',
            'user_report', 'probe', 'manual', 'other'
          )
        ),
        name text not null,
        enabled boolean not null default true,
        trust_weight numeric(5,4) not null default 0.5
          check (trust_weight between 0 and 1),
        source_metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);

    await db.query(`
      create table if not exists evidence_events (
        id bigserial primary key,
        evidence_source_id bigint not null
          references evidence_sources(id) on delete restrict,
        fno_provider_id bigint references providers(id) on delete restrict,
        isp_provider_id bigint references providers(id) on delete restrict,
        location_id bigint references locations(id) on delete restrict,
        network_footprint_id bigint
          references network_footprints(id) on delete restrict,
        bgp_incident_id bigint references bgp_incidents(id) on delete set null,
        evidence_type text not null check (
          evidence_type in (
            'routing_state', 'service_state', 'reachability',
            'latency', 'packet_loss', 'dns_state',
            'operator_notice', 'maintenance', 'other'
          )
        ),
        observed_status text not null check (
          observed_status in (
            'online', 'degraded', 'offline', 'unknown',
            'maintenance', 'valid', 'invalid'
          )
        ),
        confidence_score numeric(5,4) not null default 0
          check (confidence_score between 0 and 1),
        observed_at timestamptz not null,
        expires_at timestamptz,
        external_reference text,
        deduplication_key text,
        payload jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        check (expires_at is null or expires_at > observed_at),
        check (
          fno_provider_id is not null
          or isp_provider_id is not null
          or location_id is not null
          or network_footprint_id is not null
          or bgp_incident_id is not null
        )
      );
    `);

    await db.query(`
      create unique index if not exists idx_evidence_events_dedupe
      on evidence_events(evidence_source_id, deduplication_key)
      where deduplication_key is not null;
    `);

    await db.query(`
      create index if not exists idx_evidence_events_observed_at
      on evidence_events(observed_at desc);
    `);

    await db.query(`
      create index if not exists idx_evidence_events_fno_location
      on evidence_events(fno_provider_id, location_id, observed_at desc);
    `);

    await db.query(`
      create index if not exists idx_evidence_events_isp_location
      on evidence_events(isp_provider_id, location_id, observed_at desc);
    `);

    await db.query(`
      insert into evidence_sources (
        source_key, source_type, name, enabled, trust_weight, source_metadata
      ) values
        ('fibrepulse-bgp', 'bgp', 'FibrePulse BGP monitor', true, 0.8,
          '{"implemented":true}'::jsonb),
        ('fibrepulse-rpki', 'rpki', 'FibrePulse RPKI monitor', true, 0.8,
          '{"implemented":true}'::jsonb),
        ('future-user-reports', 'user_report', 'Future user reports', false, 0.2,
          '{"implemented":false}'::jsonb),
        ('future-probes', 'probe', 'Future deployable probes', false, 0.85,
          '{"implemented":false}'::jsonb)
      on conflict (source_key) do nothing;
    `);

    await db.query("commit");
    console.log("Evidence foundation migration complete.");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await db.end();
  }
}

migrateEvidence().catch((error) => {
  console.error("Evidence migration failed:", error);
  process.exit(1);
});
