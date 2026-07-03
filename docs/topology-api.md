# FibrePulse read-only topology API

The topology API exposes documented FNO, ISP and geographic relationships without presenting them as live network-health conclusions.

## Start the service

Run the database migrations first:

```bash
npm run db:migrate
```

Then start the topology API:

```bash
npm run dev:topology-api
```

The service listens on `TOPOLOGY_API_PORT` when supplied. Otherwise it uses `API_PORT + 1` so it can run alongside the existing BGP API during this incremental rollout.

Example:

```bash
TOPOLOGY_API_PORT=3031 npm run dev:topology-api
```

## Endpoints

### `GET /api/topology/fnos`

Returns FNO topology summaries.

Optional query parameter:

```text
verification_status=verified|candidate|rejected|unsupported
```

The response includes counts of documented ISP relationships, footprints and locations. These counts do not represent live availability.

### `GET /api/topology/fnos/:id`

Returns:

- the FNO record;
- documented downstream provider relationships;
- geographic footprints;
- ISP associations within each footprint;
- verification status, confidence and source metadata.

Rejected relationships and footprints are excluded from the normal detail response but remain stored for audit purposes.

### `GET /api/topology/locations`

Returns one level of the location hierarchy.

Optional query parameters:

```text
parent_id=<positive integer>
location_type=country|province|district|municipality|city|town|suburb|coverage_zone
verification_status=verified|candidate|rejected|unsupported
```

When `parent_id` is omitted, root locations are returned.

### `GET /api/topology/unmapped`

Returns administrative mapping queues:

- FNOs without documented ISP relationships;
- FNOs without geographic footprints;
- candidate provider relationships;
- candidate footprints.

This endpoint is read-only. It does not infer or automatically approve relationships.

## Response semantics

The following fields must remain distinct:

- `footprint_status`: documented service presence in a location;
- `verification_status`: whether FibrePulse trusts the record;
- `confidence_score`: confidence in the supporting evidence;
- BGP or RPKI status: routing evidence from the existing monitor;
- future live availability status: a later conclusion based on multiple evidence sources.

A footprint can be verified and documented as available while its current live status remains unknown.

## Next step

The next implementation stage is controlled topology ingestion and administration:

1. seed the South Africa and province hierarchy;
2. add provider relationship import templates;
3. add footprint import templates;
4. validate provider types and parent location hierarchy during ingestion;
5. expose candidate records in an administrative review interface.
