import { db } from "./index.js";

async function migrate() {
  console.log("Running database migrations...");

  await db.query(`
    create table if not exists providers (
      id bigserial primary key,
      name text not null unique,
      provider_type text not null check (provider_type in ('FNO', 'ISP', 'Aggregator')),
      country text default 'ZA',
      created_at timestamptz default now()
    );
  `);

  await db.query(`
  alter table providers
  add column if not exists verification_status text
    not null default 'candidate'
    check (
      verification_status in (
        'verified',
        'candidate',
        'rejected',
        'unsupported'
      )
    );
  `);

  await db.query(`
  alter table providers
  add column if not exists monitoring_mode text
    not null default 'observation'
    check (
      monitoring_mode in (
        'full',
        'observation',
        'probe_only',
        'disabled'
      )
    );
  `);

  await db.query(`
  alter table providers
  add column if not exists display_enabled boolean
    not null default true;
  `);

  await db.query(`
  alter table providers
  add column if not exists incident_enabled boolean
    not null default false;
  `);

  await db.query(`
  alter table providers
  add column if not exists website_url text;
  `);

  await db.query(`
  alter table providers
  add column if not exists status_page_url text;
  `);

  await db.query(`
  alter table providers
  add column if not exists notes text;
  `);

  await db.query(`
  alter table providers
  add column if not exists updated_at timestamptz
    not null default now();
  `);

  await db.query(`
  create index if not exists idx_providers_verification_status
  on providers(verification_status);
  `);

  await db.query(`
  create index if not exists idx_providers_monitoring_mode
  on providers(monitoring_mode);
  `);

  await db.query(`
  create index if not exists idx_providers_display_enabled
  on providers(display_enabled);
  `);

  await db.query(`
    create table if not exists provider_asns (
      id bigserial primary key,
      provider_id bigint references providers(id) on delete cascade,
      asn integer not null,
      label text,
      created_at timestamptz default now(),
      unique(provider_id, asn)
    );
  `);

  await db.query(`
    create table if not exists monitored_prefixes (
      id bigserial primary key,
      provider_asn_id bigint references provider_asns(id) on delete cascade,
      prefix cidr not null,
      expected_origin_asn integer not null,
      description text,
      monitor_enabled boolean default true,
      created_at timestamptz default now(),
      unique(prefix, expected_origin_asn)
    );
  `);

  await db.query(`
  create unique index if not exists
    idx_monitored_prefixes_provider_asn_prefix
  on monitored_prefixes (
    provider_asn_id,
    prefix
  );
  `);

  await db.query(`
    create table if not exists bgp_checks (
      id bigserial primary key,
      monitored_prefix_id bigint references monitored_prefixes(id) on delete cascade,
      bgp_status text not null check (bgp_status in ('valid', 'invalid', 'unknown')),
      rpki_status text not null check (rpki_status in ('valid', 'invalid', 'unknown')),
      overall_status text not null check (overall_status in ('valid', 'invalid', 'unknown')),
      observed_origin_asns integer[],
      sources jsonb not null default '{}',
      message text,
      checked_at timestamptz default now()
    );
  `);

  await db.query(`
    alter table bgp_checks
    add column if not exists source_confidence text
    check (source_confidence in ('high', 'medium', 'low', 'unknown'))
    default 'unknown';
  `);

  await db.query(`
    alter table bgp_checks
    add column if not exists source_agreement text
    check (source_agreement in ('full', 'partial', 'conflict', 'unknown'))
    default 'unknown';
  `);

  await db.query(`
    alter table bgp_checks
    add column if not exists source_score numeric(5,2)
    default 0;
  `);

  await db.query(`
    create table if not exists bgp_incidents (
      id bigserial primary key,
      monitored_prefix_id bigint references monitored_prefixes(id) on delete cascade,
      status text not null check (status in ('open', 'resolved')),
      severity text not null check (severity in ('warning', 'major', 'critical')) default 'major',
      previous_status text check (previous_status in ('valid', 'invalid', 'unknown')),
      current_status text not null check (current_status in ('valid', 'invalid', 'unknown')),
      started_at timestamptz not null default now(),
      resolved_at timestamptz,
      summary text not null,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `);

  await db.query(`
  create table if not exists source_health (
    id bigserial primary key,

    source_name text not null unique,

    status text not null default 'unknown'
      check (
        status in (
          'healthy',
          'degraded',
          'offline',
          'unknown'
        )
      ),

    last_success_at timestamptz,
    last_failure_at timestamptz,

    consecutive_failures integer not null default 0
      check (consecutive_failures >= 0),

    last_error text,

    response_time_ms integer
      check (
        response_time_ms is null
        or response_time_ms >= 0
      ),

    updated_at timestamptz not null default now()
  );
  `);

  await db.query(`
  create index if not exists idx_source_health_status
  on source_health(status);
  `);

  await db.query(`
  create index if not exists idx_source_health_updated_at
  on source_health(updated_at desc);
  `);

  await db.query(`
    create index if not exists idx_bgp_incidents_prefix_status
    on bgp_incidents(monitored_prefix_id, status);
  `);

  await db.query(`
    create index if not exists idx_bgp_incidents_started_at
    on bgp_incidents(started_at desc);
  `);

  await db.query(`
    create or replace view latest_bgp_incidents as
    select
      bi.id,
      p.name as provider,
      p.provider_type,
      pa.asn,
      mp.prefix::text as prefix,
      bi.status,
      bi.severity,
      bi.previous_status,
      bi.current_status,
      bi.started_at,
      bi.resolved_at,
      case
        when bi.resolved_at is not null then
          extract(epoch from (bi.resolved_at - bi.started_at))::int
        else
          extract(epoch from (now() - bi.started_at))::int
      end as duration_seconds,
      bi.summary,
      bi.created_at,
      bi.updated_at
    from bgp_incidents bi
    join monitored_prefixes mp on mp.id = bi.monitored_prefix_id
    join provider_asns pa on pa.id = mp.provider_asn_id
    join providers p on p.id = pa.provider_id;
  `);

  await db.query(`
    create index if not exists idx_bgp_checks_prefix_time
    on bgp_checks(monitored_prefix_id, checked_at desc);
  `);

  await db.query(`
  drop view if exists latest_bgp_status;
  `);

  await db.query(`
  create view latest_bgp_status as
  select distinct on (mp.id)
    p.name as provider,
    p.provider_type,
    pa.asn,
    mp.prefix::text as prefix,
    bc.bgp_status,
    bc.rpki_status,
    bc.overall_status,
    bc.observed_origin_asns,
    bc.message,
    bc.source_confidence,
    bc.source_agreement,
    bc.source_score,
    bc.checked_at
  from monitored_prefixes mp
  join provider_asns pa
    on pa.id = mp.provider_asn_id
  join providers p
    on p.id = pa.provider_id
  left join bgp_checks bc
    on bc.monitored_prefix_id = mp.id
  where mp.monitor_enabled = true
  order by
    mp.id,
    bc.checked_at desc;
  `);

  console.log("Migrations complete.");
  await db.end();
}

migrate().catch(async (error) => {
  console.error("Migration failed:", error);
  await db.end();
  process.exit(1);
});
