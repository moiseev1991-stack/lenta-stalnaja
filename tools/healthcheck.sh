#!/bin/sh
# Safety net for the recurring "503 — Node.js недоступен" incident.
# Runs from cron every few minutes: asks the PHP proxy for live state and, if
# the Unix socket is not ready, triggers the built-in recovery (kills zombie
# node processes with SIGKILL, clears the stale socket, starts a fresh node).
# Recovery no longer depends on a real visitor hitting a 503 page.
#
# Install (crontab -e on the server, user infogkmeta):
#   */5 * * * * /bin/sh /home/i/infogkmeta/lenta-stalnaja/tools/healthcheck.sh >> /home/i/infogkmeta/healthcheck.log 2>&1

BASE="https://lenta-stalnaja.ru"
DEBUG_URL="$BASE/__debug__"

state=$(curl -s --max-time 20 "$DEBUG_URL")
ready=$(printf '%s' "$state" | grep -c '"socket_ready": *true')

if [ "$ready" = "1" ]; then
  exit 0
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] socket not ready — triggering restart"
# First request may block ~60-90s while PHP starts node; that is expected.
curl -s --max-time 120 "$DEBUG_URL?start=1" >/dev/null 2>&1

# Verify recovery
state=$(curl -s --max-time 20 "$DEBUG_URL")
ready=$(printf '%s' "$state" | grep -c '"socket_ready": *true')
echo "[$(date '+%Y-%m-%d %H:%M:%S')] after restart: socket_ready=$ready"
