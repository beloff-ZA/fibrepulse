#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/belof/fibrepulse}"
WEB_ROOT="${WEB_ROOT:-/var/www/fibrepulse-operations}"

cd "$REPO_DIR"

npm install
npm run check
npm run build:operations-web

sudo mkdir -p "$WEB_ROOT"
sudo rsync -a --delete apps/operations-web/dist/ "$WEB_ROOT/"
sudo chown -R root:root "$WEB_ROOT"
sudo find "$WEB_ROOT" -type d -exec chmod 755 {} \;
sudo find "$WEB_ROOT" -type f -exec chmod 644 {} \;

sudo cp infra/systemd/fibrepulse-operations-api.service /etc/systemd/system/
sudo cp infra/systemd/fibrepulse-bgp-monitor.service /etc/systemd/system/
sudo cp infra/systemd/fibrepulse-bgp-monitor.timer /etc/systemd/system/
sudo cp infra/systemd/fibrepulse-official-status.service /etc/systemd/system/
sudo cp infra/systemd/fibrepulse-official-status.timer /etc/systemd/system/
sudo cp infra/nginx/fibrepulse-operations.conf /etc/nginx/sites-available/fibrepulse-operations

sudo systemctl daemon-reload
sudo systemctl enable --now fibrepulse-operations-api
sudo systemctl enable --now fibrepulse-bgp-monitor.timer

if [[ -f config/status-sources.json ]]; then
  sudo systemctl enable --now fibrepulse-official-status.timer
else
  echo "Official status timer not enabled: config/status-sources.json is absent."
fi

sudo nginx -t
sudo systemctl reload nginx

curl --fail --silent http://127.0.0.1:3031/health
printf '\n'
curl --fail --silent http://127.0.0.1:3031/api/evidence/routing/collector
printf '\nDeployment complete.\n'
