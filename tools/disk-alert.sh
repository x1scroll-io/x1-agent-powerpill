#!/usr/bin/env bash
# disk-alert.sh
# Monitor disk usage for a specified path and alert when threshold is exceeded.
# Configurable threshold and notification method (Telegram, log, or both).
#
# Usage:
#   bash disk-alert.sh
#   MONITOR_PATH=/data/ledger THRESHOLD=90 bash disk-alert.sh
#
# Cron example (every 6 hours):
#   0 */6 * * * /path/to/disk-alert.sh >> /var/log/disk-alert.log 2>&1
#
# Environment variables:
#   MONITOR_PATH       — Path to monitor (default: current directory)
#   THRESHOLD          — Alert when usage >= this % (default: 85)
#   TELEGRAM_BOT_TOKEN — Telegram bot token (optional)
#   TELEGRAM_CHAT_ID   — Telegram chat ID (optional)
#   LOG_FILE           — Log file path (default: disk_alert.log)
#   ALERT_LABEL        — Label shown in alerts (default: "Disk")

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
MONITOR_PATH="${MONITOR_PATH:-/}"
THRESHOLD="${THRESHOLD:-85}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
LOG_FILE="${LOG_FILE:-/tmp/disk_alert.log}"
ALERT_LABEL="${ALERT_LABEL:-Disk}"

# ─── Get Disk Usage ───────────────────────────────────────────────────────────
if ! USAGE=$(df "$MONITOR_PATH" 2>/dev/null | tail -1 | awk '{print $5}' | tr -d '%'); then
  echo "$(date -u) ERROR: Could not read disk usage for $MONITOR_PATH" | tee -a "$LOG_FILE"
  exit 1
fi

if [ -z "$USAGE" ]; then
  echo "$(date -u) ERROR: Empty disk usage result for $MONITOR_PATH" | tee -a "$LOG_FILE"
  exit 1
fi

TOTAL=$(df -h "$MONITOR_PATH" 2>/dev/null | tail -1 | awk '{print $2}')
USED=$(df -h  "$MONITOR_PATH" 2>/dev/null | tail -1 | awk '{print $3}')
FREE=$(df -h  "$MONITOR_PATH" 2>/dev/null | tail -1 | awk '{print $4}')

echo "$(date -u) ${ALERT_LABEL} usage: ${USAGE}% (${USED} / ${TOTAL}, ${FREE} free) at ${MONITOR_PATH}" | tee -a "$LOG_FILE"

# ─── Check Threshold ─────────────────────────────────────────────────────────
if [ "$USAGE" -lt "$THRESHOLD" ]; then
  exit 0
fi

# ─── Build Alert Message ─────────────────────────────────────────────────────
ALERT_MSG="⚠️ ${ALERT_LABEL} DISK ALERT

Path: ${MONITOR_PATH}
Usage: ${USAGE}% (threshold: ${THRESHOLD}%)

Total: ${TOTAL}
Used:  ${USED}
Free:  ${FREE}

Action required: free disk space or expand storage."

echo "$(date -u) ALERT: ${ALERT_LABEL} disk at ${USAGE}% (threshold ${THRESHOLD}%)" | tee -a "$LOG_FILE"

# ─── Telegram Notification ───────────────────────────────────────────────────
if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
  # URL-encode newlines for Telegram
  ENCODED_MSG=$(echo "$ALERT_MSG" | python3 -c "
import sys, urllib.parse
print(urllib.parse.quote(sys.stdin.read()))
" 2>/dev/null || echo "$ALERT_MSG" | sed 's/ /%20/g; s/\n/%0A/g')

  TELEGRAM_URL="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage"

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 10 \
    -X POST "$TELEGRAM_URL" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\": \"${TELEGRAM_CHAT_ID}\", \"text\": $(echo "$ALERT_MSG" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo "\"$ALERT_MSG\"")}" \
    2>/dev/null)

  if [ "$HTTP_CODE" = "200" ]; then
    echo "$(date -u) Telegram alert sent successfully." | tee -a "$LOG_FILE"
  else
    echo "$(date -u) Telegram alert FAILED (HTTP $HTTP_CODE)." | tee -a "$LOG_FILE"
  fi
else
  echo "$(date -u) Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID." | tee -a "$LOG_FILE"
fi

# ─── Optional: Additional notification methods ────────────────────────────────
# Uncomment to enable email (requires mail/sendmail configured):
# echo "$ALERT_MSG" | mail -s "⚠️ Disk Alert: ${USAGE}%" "your@email.com"

# Uncomment to enable desktop notification (Linux with notify-send):
# notify-send "⚠️ Disk Alert" "${ALERT_LABEL} at ${USAGE}%" 2>/dev/null || true

# Uncomment to run a custom command on alert:
# bash /path/to/your/custom-alert.sh "${USAGE}" "${MONITOR_PATH}"

exit 0

# ---
# Donations accepted in XNT: A1TRS3i2g62Zf6K4vybsW4JLx8wifqSoThyTQqXNaLDK
# Built by ArnettX1 · x1scroll.io
