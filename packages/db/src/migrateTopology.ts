import { db } from "./index.js";

async function migrateTopology(): Promise<void> {
  console.log("Running topology foundation migration...");

  await db.query("begin");

  try {
    await db.query(`
      create table if not exists locations (
        id bigserial primary key,
        parent_location_id bigint references locations(id) on delete restrict,
        location_type text not null check (
          location_type in (
            'country',
            'province',
            'district',
            'municipality',
            'city',
            'town',
            'suburb',
            'coverage_zone'
          )
        ),
        name text not null,
        canonical_name text not null,
        country_code char(2) not null default 'ZA',
        province_code text,
        municipality_code text,
        latitude numeric(9,6),
        longitude numeric(9,6),
        external_ids jsonb not null default '{}'::jsonb,
        source_metadata jsonb not null default '{}'::jsonb,
        verification_status text not null default 'candidate' check (
          verification_status in (
            'verified',
            'candidate',
            'rejected',
            'unsupported'
          )
        ),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (
          (latitude is null and longitude is null)
          or (
            latitude between -90 and 90
            and longitude between -180 and 180
          )
        ),
        unique(parent_location_id, location_type, canonical_name)
      );
    `);

    await db.query(`
      create unique index if not exists idx_locations_root_unique
      on locations(location_type, canonical_name, country_code)
      where parent_location_id is null;
    `);

    await db.query(`
      create index if not exists idx_locations_parent
      on locations(parent_location_id);
    `);

    await db.query(`
      create index if not exists idx_locations_type
      on locations(location_type);
    `);

    await db.query(`
      create index if not exists idx_locations_verification_status
      on locations(verification_status);
    `);

    await db.query(`
      create table if not exists provider_relationships (
        id bigserial primary key,
        upstream_provider_id bigint not null references providers(id) on delete cascade,
        downstream_provider_id bigint not null references providers(id) on delete cascade,
        relationship_type text not null check (
          relationship_type in (
            'provides_access_to',
            'resells',
            'aggregates',
            'owns',
            'operates',
            'uses_backhaul_from'
          )
        ),
        verification_status text not null default 'candidate' check (
          verification_status in (
            'verified',
            'candidate',
            'rejected',
            'unsupported'
          )
        ),
        confidence_score numeric(5,4) not null default 0 check (
          confidence_score between 0 and 1
        ),
        valid_from timestamptz,
        valid_to timestamptz,
        source_metadata jsonb not null default '{}'::jsonb,
        notes text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (upstream_provider_id <> downstream_provider_id),
        check (valid_to is null or valid_from is null or valid_to > valid_from),
        unique(
          upstream_provider_id,
          downstream_provider_id,
          relationship_type
        )
      );
    `);

    await db.query(`
      create index if not exists idx_provider_relationships_upstream
      on provider_relationships(upstream_provider_id);
    `);

    await db.query(`
      create index if not exists idx_provider_relationships_downstream
      on provider_relationships(downstream_provider_id);
    `);

    await db.query(`
      create index if not exists idx_provider_relationships_status
      on provider_relationships(verification_status);
    `);

    await db.query(`
      create table if not exists network_footprints (
        id bigserial primary key,
        fno_provider_id bigint not null references providers(id) on delete cascade,
        location_id bigint not null references locations(id) on delete restrict,
        service_type text not null default 'unknown' check (
          service_type in (
            'ftth',
            'fttb',
            'open_access',
            'active_ethernet',
            'gpon',
            'xgs_pon',
            'unknown'
          )
        ),
        footprint_status text not null default 'unknown' check (
          footprint_status in (
            'available',
            'planned',
            'limited',
            'unavailable',
            'unknown'
          )
        ),
        verification_status text not null default 'candidate' check (
          verification_status in (
            'verified',
            'candidate',
            'rejected',
            'unsupported'
          )
        ),
        confidence_score numeric(5,4) not null default 0 check (
          confidence_score between 0 and 1
        ),
        source_metadata jsonb not null default '{}'::jsonb,
        first_observed_at timestamptz,
        last_verified_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique(fno_provider_id, location_id, service_type)
      );
    `);

    await db.query(`
      create index if not exists idx_network_footprints_fno
      on network_footprints(fno_provider_id);
    `);

    await db.query(`
      create index if not exists idx_network_footprints_location
      on network_footprints(location_id);
    `);

    await db.query(`
      create index if not exists idx_network_footprints_status
      on network_footprints(footprint_status, verification_status);
    `);

    await db.query(`
      create table if not exists footprint_providers (
        id bigserial primary key,
        network_footprint_id bigint not null references network_footprints(id) on delete cascade,
        isp_provider_id bigint not null references providers(id) on delete cascade,
        service_status text not null default 'unknown' check (
          service_status in (
            'available',
            'planned',
            'limited',
            'unavailable',
            'unknown'
          )
        ),
        verification_status text not null default 'candidate' check (
          verification_status in (
            'verified',
            'candidate',
            'rejected',
            'unsupported'
          )
        ),
        confidence_score numeric(5,4) not null default 0 check (
          confidence_score between 0 and 1
        ),
        source_metadata jsonb not null default '{}'::jsonb,
        last_verified_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique(network_footprint_id, isp_provider_id)
      );
    `);

    await db.query(`
      create index if not exists idx_footprint_providers_footprint
      on footprint_providers(network_footprint_id);
    `);

    await db.query(`
      create index if not exists idx_footprint_providers_isp
      on footprint_providers(isp_provider_id);
    `);

    await db.query(`
      create or replace view topology_fno_overview as
      select
        fno.id as fno_id,
        fno.name as fno_name,
        fno.verification_status as fno_verification_status,
        count(distinct pr.downstream_provider_id)::int as related_isp_count,
        count(distinct nf.id)::int as footprint_count,
        count(distinct nf.location_id)::int as location_count,
        max(nf.last_verified_at) as last_footprint_verified_at
      from providers fno
      left join provider_relationships pr
        on pr.upstream_provider_id = fno.id
       and pr.relationship_type = 'provides_access_to'
       and pr.verification_status <> 'rejected'
      left join network_footprints nf
        on nf.fno_provider_id = fno.id
       and nf.verification_status <> 'rejected'
      where fno.provider_type = 'FNO'
      group by
        fno.id,
        fno.name,
        fno.verification_status;
    `);

    await db.query("commit");
    console.log("Topology foundation migration complete.");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await db.end();
  }
}

migrateTopology().catch((error) => {
  console.error("Topology migration failed:", error);
  process.exit(1);
});
