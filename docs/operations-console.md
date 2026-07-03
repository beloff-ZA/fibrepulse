# FibrePulse operations console

## Components

This release adds:

- a combined topology and evidence API on port 3031;
- a React operations console on port 5174 during development;
- a production static build for Nginx;
- controlled manual evidence imports;
- a configurable official-status source poller;
- systemd service and timer templates;
- GitHub Actions validation.

## Development

Start the operations API:

```bash
OPERATIONS_API_PORT=3031 npm run dev:operations-api
```

Start the operations console:

```bash
npm run dev:operations-web
```

Open:

```text
http://SERVER_IP:5174
```

## Production build

```bash
npm run build:operations-web
```

The output is written to:

```text
apps/operations-web/dist
```

The Nginx template in `infra/nginx/fibrepulse-operations.conf` serves the static console on port 8081 and proxies `/api/` to the operations API on port 3031.

## Evidence endpoints

```text
GET /api/evidence/sources
GET /api/evidence/events
GET /api/evidence/summary/fnos
```

Evidence summaries are observations only. They do not declare a provider online or offline.

## Manual evidence import

Copy the template:

```bash
cp data/evidence/import-template.json data/evidence/my-event.json
```

Edit it and import:

```bash
npm run evidence:import -- data/evidence/my-event.json
```

Imports are transactional and support stable deduplication keys.

## Official status polling

Copy the disabled example:

```bash
cp config/status-sources.example.json config/status-sources.json
```

Only enable a source after confirming:

- the page is official;
- the provider name already exists in FibrePulse;
- the location canonical name exists when supplied;
- the matching expressions are narrow enough not to classify navigation text or old notices;
- the source terms permit automated retrieval.

Run one poll manually:

```bash
npm run evidence:poll-official -- config/status-sources.json
```

The poller records:

- the matched status;
- the matched expression;
- HTTP response status;
- response length;
- source URL;
- expiry time.

It does not store the full remote page.

## systemd

Install the operations API service:

```bash
sudo cp infra/systemd/fibrepulse-operations-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fibrepulse-operations-api
```

Check it:

```bash
sudo systemctl status fibrepulse-operations-api
curl http://127.0.0.1:3031/health
```

Install the optional official-source timer only after creating and validating `config/status-sources.json`:

```bash
sudo cp infra/systemd/fibrepulse-official-status.service /etc/systemd/system/
sudo cp infra/systemd/fibrepulse-official-status.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fibrepulse-official-status.timer
```

Inspect runs:

```bash
systemctl list-timers fibrepulse-official-status.timer
journalctl -u fibrepulse-official-status.service -n 100 --no-pager
```

## Nginx

After building the console:

```bash
sudo cp infra/nginx/fibrepulse-operations.conf /etc/nginx/sites-available/fibrepulse-operations
sudo ln -s /etc/nginx/sites-available/fibrepulse-operations /etc/nginx/sites-enabled/fibrepulse-operations
sudo nginx -t
sudo systemctl reload nginx
```

Open:

```text
http://SERVER_IP:8081
```

## Safety rules

1. A provider footprint is not a live status.
2. One evidence event is not an outage conclusion.
3. Disabled sources must remain visible in the source registry.
4. Official polling configurations must begin disabled.
5. Unknown is preferable to an unsupported claim.
