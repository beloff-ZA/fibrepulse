# FibrePulse topology operations

## Purpose

This release establishes the complete non-public-reporting topology foundation:

- hierarchical South African locations;
- FNO-to-ISP and related provider relationships;
- documented FNO footprints;
- ISP associations within footprints;
- read-only topology API endpoints;
- controlled transactional imports;
- candidate review commands;
- future-ready evidence source and event tables.

It deliberately does not infer current customer availability from a footprint, BGP state or candidate record.

## Initial deployment

Run:

```bash
npm install
npm run check
npm run db:migrate
npm run db:seed:topology
```

The topology seed is idempotent. It inserts South Africa and all nine provinces as verified root geography records.

## Start the topology API

```bash
TOPOLOGY_API_PORT=3031 npm run dev:topology-api
```

When `TOPOLOGY_API_PORT` is omitted, the service uses `API_PORT + 1`.

Health check:

```bash
curl http://127.0.0.1:3031/health
```

Topology checks:

```bash
curl http://127.0.0.1:3031/api/topology/fnos
curl http://127.0.0.1:3031/api/topology/locations
curl http://127.0.0.1:3031/api/topology/unmapped
```

## Import topology data

Copy the template before editing it:

```bash
cp data/topology/import-template.json data/topology/my-import.json
```

Then run:

```bash
npm run topology:import -- data/topology/my-import.json
```

The import is transactional. If one row fails validation, the entire file is rolled back.

### Import requirements

- provider names must already exist uniquely in `providers`;
- `provides_access_to` requires an FNO upstream and ISP downstream;
- non-country locations require an existing parent location;
- every imported record requires non-empty `sourceMetadata`;
- confidence scores must be between 0 and 1;
- uncertain records should enter as `candidate`;
- documented `available` footprint status is not a live online status.

## Review candidate records

Syntax:

```bash
npm run topology:review -- <entity> <id> <decision>
```

Entities:

```text
location
relationship
footprint
footprint-provider
```

Decisions:

```text
verified
candidate
rejected
unsupported
```

Examples:

```bash
npm run topology:review -- relationship 12 verified
npm run topology:review -- footprint 31 rejected
```

Use the unmapped endpoint to find review work:

```bash
curl http://127.0.0.1:3031/api/topology/unmapped
```

## Evidence foundation

The migration creates:

- `evidence_sources`;
- `evidence_events`.

Registered but disabled source placeholders are included for future user reports and deployable probes. BGP and RPKI source records are enabled.

No public evidence submission endpoint is included. Future reporters, probes, official notices and social sources can write events linked to:

- an FNO;
- an ISP;
- a location;
- a network footprint;
- a BGP incident.

## Rollback considerations

The migrations are additive. Existing BGP tables and routes are not removed or redefined.

Before deployment, take a PostgreSQL backup:

```bash
docker exec fibrepulse-postgres pg_dump -U postgres -d fibrepulse -Fc \
  > fibrepulse-before-topology.dump
```

The new tables can be left empty without affecting the BGP monitor. Do not drop topology tables after data ingestion without first checking foreign-key references from evidence events.
