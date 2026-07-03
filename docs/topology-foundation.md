# FibrePulse topology foundation

This migration adds a verified, evidence-friendly topology layer without changing the existing BGP monitoring model.

## Scope of this step

The topology foundation introduces:

- hierarchical locations;
- explicit relationships between FNOs, ISPs and aggregators;
- FNO geographic footprints;
- ISP availability associations within a footprint;
- confidence, verification and source metadata on imported or manually curated records;
- a summary view for future API and interface work.

It does **not** introduce:

- user outage submissions;
- deployable probes;
- automatic availability conclusions;
- public incident correlation;
- inferred FNO or ISP relationships.

## Migration

Run the normal database migration command:

```bash
npm run db:migrate
```

This runs the existing core migration first and the topology migration second.

The topology migration can also be run independently:

```bash
npm run db:migrate:topology
```

All statements are additive and use `if not exists` where PostgreSQL supports it. The migration runs inside a transaction.

## Tables

### `locations`

Represents a hierarchy such as:

```text
South Africa
└── Gauteng
    └── City of Johannesburg
        └── Johannesburg
            └── Northcliff
```

The initial application may use only Province, City and Suburb while retaining support for districts, municipalities and coverage zones.

### `provider_relationships`

Represents explicit many-to-many relationships between existing records in `providers`.

The primary relationship for the first rollout is:

```text
FNO --provides_access_to--> ISP
```

A relationship is not treated as trusted merely because it exists. It carries a verification status, confidence score and source metadata.

### `network_footprints`

Associates an FNO with a location and service type. `footprint_status` describes documented service availability, not live network health.

For example:

```text
Vumatel + Northcliff + FTTH + available
```

This row means FibrePulse has evidence that the FNO offers that service in the area. It does not mean the service is currently online.

### `footprint_providers`

Associates ISPs with a documented FNO footprint. This supports one ISP across many FNOs and one FNO footprint across many ISPs.

## Evidence-ready design

The schema includes stable references that future evidence records can use:

- `provider_id` for an FNO or ISP;
- `location_id` for the affected geographic scope;
- `network_footprint_id` for a specific FNO/service/location combination.

Future user submissions and probes can therefore attach to the same topology without changing the relationship model.

## Data rules

1. Candidate records may be imported but must remain visibly unverified.
2. No footprint should be marked `available` without source metadata.
3. Live service health must not be derived from `footprint_status`.
4. BGP status remains independent from geographic availability.
5. Rejected records remain available for audit history but should not appear in normal public queries.

## Next build step

The next step is a read-only topology API with these responsibilities:

- list FNO topology summaries;
- return related ISPs for an FNO;
- return verified and candidate footprints separately;
- expose location hierarchy without claiming live availability;
- provide an admin-oriented view of unmapped relationships and locations.
