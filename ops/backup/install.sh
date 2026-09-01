#!/bin/bash
#
# Install (or refresh) the nightly backup schedule.
#
# Safe to re-run: it reloads the agent in place. Prints what it did rather
# than assuming, so a failed install is visible instead of silent.

set -euo pipefail

readonly HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LABEL="com.patientbook.backup"
readonly AGENTS_DIR="$HOME/Library/LaunchAgents"
readonly TARGET="$AGENTS_DIR/$LABEL.plist"
readonly BACKUP_DIR="${PB_BACKUP_DIR:-$HOME/PatientBookBackups}"

mkdir -p "$AGENTS_DIR" "$BACKUP_DIR"

sed -e "s|__SCRIPT_PATH__|$HERE/pb-backup.sh|g" \
    -e "s|__BACKUP_DIR__|$BACKUP_DIR|g" \
    "$HERE/com.patientbook.backup.plist" >"$TARGET"

# Unload first so a changed schedule actually takes effect on re-run.
launchctl unload "$TARGET" 2>/dev/null || true
launchctl load "$TARGET"

echo "Installed $LABEL"
echo "  schedule : daily at 21:00"
echo "  script   : $HERE/pb-backup.sh"
echo "  backups  : $BACKUP_DIR"
echo
launchctl list | grep "$LABEL" >/dev/null \
  && echo "Agent is registered with launchd." \
  || { echo "WARNING: agent did not register." >&2; exit 1; }
echo
echo "To remove:  launchctl unload $TARGET && rm $TARGET"
