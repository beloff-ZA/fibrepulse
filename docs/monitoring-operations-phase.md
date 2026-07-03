# FibrePulse continuous monitoring operations

## What this phase adds

- BGP and RPKI collection every 15 minutes through systemd.
- Fresh, stale and never-checked routing states.
- Collector health summary at `/api/evidence/routing/collector`.
- FNO detail at `/api/evidence/routing/fnos/:fnoId`.
- Prefix-level expected and observed ASN comparison.
- Seven-day BGP/RPKI check history.
- Recent open and resolved routing incidents.
- Official status page ingestion through the existing controlled poller.

Routing state is evidence about route visibility and origin validity. It is not a last-mile customer availability verdict.

## Deploy

```bash
cd /home/belof/fibrepulse
chmod +x scripts/deployOperationsPhase.sh
./scripts/deployOperationsPhase.sh
```

## BGP timer

```bash
systemctl status fibrepulse-bgp-monitor.timer --no-pager
systemctl list-timers fibrepulse-bgp-monitor.timer --all
journalctl -u fibrepulse-bgp-monitor.service -n 100 --no-pager
```

Run a collection immediately:

```bash
sudo systemctl start fibrepulse-bgp-monitor.service
```

The dashboard treats observations older than 30 minutes as stale by default. Override this for the API service with:

```ini
Environment=ROUTING_STALE_MINUTES=45
```

Then reload and restart systemd.

## Official sources

Copy the example configuration and edit it deliberately:

```bash
cp config/status-sources.example.json config/status-sources.json
nano config/status-sources.json
```

Each source remains disabled until its URL, target FNO or ISP, matching rules and fallback behaviour have been verified. FibrePulse does not infer an outage simply because a page contains an ambiguous word.

Validate manually:

```bash
npm run evidence:poll-official
curl http://127.0.0.1:3031/api/evidence/events?active_only=true
```

Enable scheduled polling only after successful validation:

```bash
sudo systemctl enable --now fibrepulse-official-status.timer
systemctl list-timers fibrepulse-official-status.timer --all
```

## API checks

```bash
curl http://127.0.0.1:3031/health
curl http://127.0.0.1:3031/api/evidence/routing/collector
curl http://127.0.0.1:3031/api/evidence/routing/fnos
curl http://127.0.0.1:3031/api/evidence/routing/fnos/1
curl http://127.0.0.1:3031/api/evidence/routing/prefixes
```

## Dashboard behaviour

- Select an FNO row to open its detail panel.
- Freshness is based on the latest check for each monitored prefix.
- A stale FNO is not automatically marked offline.
- Invalid routing is highlighted independently from official or imported outage evidence.
- The dashboard refreshes its summary data every 60 seconds.
