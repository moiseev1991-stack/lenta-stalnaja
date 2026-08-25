#!/bin/sh
# Safety net for the recurring "503 — Node.js недоступен" incident.
# Runs from cron every few minutes: asks the PHP proxy for live state and, if
# the Unix socket is not ready, triggers the built-in recovery (kills zombie
# node processes with SIGKILL, clears the stale socket, starts a fresh node).
# Recovery no longer depends on a real visitor hitting a 503 page.
#
# On an outage it also pings a Telegram bot so the incident lands on the phone
# without waiting for a visitor or an email. Credentials can be overridden from
# the environment (or tools/healthcheck.env, sourced below) if the repo ever
# needs to keep them out of git — otherwise regenerate the token in @BotFather.
#
# Install (crontab -e on the server, user infogkmeta):
#   */5 * * * * /bin/sh /home/i/infogkmeta/lenta-stalnaja/tools/healthcheck.sh >> /home/i/infogkmeta/healthcheck.log 2>&1

BASE="https://lenta-stalnaja.ru"
DEBUG_URL="$BASE/__debug__"

# Optional override file (gitignored) sitting next to this script.
ENV_FILE="$(dirname "$0")/healthcheck.env"
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

TG_BOT_TOKEN="${TG_BOT_TOKEN:-8853408571:AAFqHcGiEnEXgQGy5Ms2560R2aRWyM_m07k}"
TG_CHAT_ID="${TG_CHAT_ID:-90186966}"

tg_notify() {
  [ -z "$TG_BOT_TOKEN" ] && return 0
  [ -z "$TG_CHAT_ID" ] && return 0
  curl -s --max-time 15 \
    "https://api.telegram.org/bot$TG_BOT_TOKEN/sendMessage" \
    --data-urlencode "chat_id=$TG_CHAT_ID" \
    --data-urlencode "text=$1" \
    -o /dev/null 2>&1
}

state=$(curl -s --max-time 20 "$DEBUG_URL")
ready=$(printf '%s' "$state" | grep -c '"socket_ready": *true')

if [ "$ready" = "1" ]; then
  exit 0
fi

ts=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$ts] socket not ready — triggering restart"
tg_notify "🔴 lenta-stalnaja.ru недоступен ($ts). Пытаюсь перезапустить node…"

# First request may block ~60-90s while PHP starts node; that is expected.
curl -s --max-time 120 "$DEBUG_URL?start=1" >/dev/null 2>&1

# Verify recovery
state=$(curl -s --max-time 20 "$DEBUG_URL")
ready=$(printf '%s' "$state" | grep -c '"socket_ready": *true')
ts=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$ts] after restart: socket_ready=$ready"

if [ "$ready" = "1" ]; then
  tg_notify "🟢 lenta-stalnaja.ru снова работает ($ts). Node перезапущен автоматически."
else
  tg_notify "⚠️ lenta-stalnaja.ru всё ещё лежит после авто-перезапуска ($ts). Нужна ручная проверка сервера."
fi
