#!/bin/bash

# ==============================================================================
# Agent Browser Monitor - Rollback Script (v3.0)
#
# Reverses everything created by new_setup_agent.sh:
#   ✅ Stops and disables the watchdog timer and HTTP server service
#   ✅ Removes immutable (chattr +i) locks from all managed files
#   ✅ Deletes policy JSON from all Chrome / Chromium policy directories
#   ✅ Deletes external extension sideload JSON files
#   ✅ Deletes the update manifest XML
#   ✅ Removes the watchdog script and all systemd unit files
#   ✅ Clears cached policy state from Chrome profile Preferences
#   ✅ Removes the extension from all Chrome profile directories
#   ✅ Reloads systemd and restarts Chrome so removed policies take effect
#
# NOTE: The original CRX file and /opt/chrome-extensions/ directory are
#       intentionally left intact — they pre-existed the setup script.
#
# USAGE:
#   sudo bash rollback_agent.sh            # interactive confirmation
#   sudo bash rollback_agent.sh --force    # skip confirmation (for Ansible)
# ==============================================================================

set -euo pipefail

# ==============================================================================
# CONFIGURATION  (must mirror new_setup_agent.sh exactly)
# ==============================================================================

EXTENSION_ID="depibabflipmjimimdboikfhgdelcdnp"
CRX_INSTALL_DIR="/opt/chrome-extensions"
EXT_SERVER_PORT=8765

POLICY_DIRS=(
    "/etc/opt/chrome/policies/managed"
    "/etc/opt/chrome-unstable/policies/managed"
    "/etc/chromium/policies/managed"
    "/etc/chromium-browser/policies/managed"
)

EXTERNAL_EXT_DIRS=(
    "/opt/google/chrome/extensions"
    "/usr/share/chromium/extensions"
)

UPDATE_MANIFEST="$CRX_INSTALL_DIR/update_manifest.xml"
WATCHDOG_SCRIPT="/usr/local/bin/chrome-ext-watchdog.sh"
WATCHDOG_SERVICE="/etc/systemd/system/chrome-ext-watchdog.service"
WATCHDOG_TIMER="/etc/systemd/system/chrome-ext-watchdog.timer"
EXT_SERVER_SERVICE="/etc/systemd/system/chrome-ext-server.service"

# ==============================================================================
# HELPERS
# ==============================================================================

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "   ${GRN}✅${NC}  $*"; }
warn() { echo -e "   ${YLW}⚠️ ${NC}  $*"; }
skip() { echo -e "   ──   $* (not found — skipping)"; }

# Strip immutable flag then delete; silently skip if file does not exist
remove_file() {
    local f="$1"
    if [ -e "$f" ]; then
        sudo chattr -i "$f" 2>/dev/null || true
        sudo rm -f "$f"
        ok "Removed $f"
    else
        skip "$f"
    fi
}

# ==============================================================================
# CONFIRMATION
# ==============================================================================

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║       Agent Browser Monitor — ROLLBACK / UNINSTALL              ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "  This will remove:"
echo "    • Watchdog timer      (chrome-ext-watchdog.timer)"
echo "    • Watchdog service    (chrome-ext-watchdog.service)"
echo "    • HTTP update server  (chrome-ext-server.service)"
echo "    • All Chrome / Chromium managed policy files"
echo "    • All extension sideload JSON files"
echo "    • The local update manifest XML"
echo "    • The watchdog shell script"
echo "    • The extension from ALL Chrome profile directories"
echo ""
echo "  This will NOT remove:"
echo "    • The original CRX file ($CRX_INSTALL_DIR/extension.crx)"
echo "    • The $CRX_INSTALL_DIR directory"
echo "    • The Chrome browser itself"
echo ""

if [[ "${1:-}" == "--force" ]]; then
    echo "  Running in non-interactive mode (--force)."
elif [ ! -t 0 ]; then
    # No interactive terminal (e.g. Ansible, cron, SSH pipe) — proceed automatically
    echo "  No interactive terminal detected — proceeding automatically."
    echo "  Tip: pass --force to silence this notice."
else
    read -r -p "  Continue? [y/N] " CONFIRM
    echo ""
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        echo "  Aborted."
        exit 0
    fi
fi

# ==============================================================================
# STEP 1 — Stop and disable systemd services
# ==============================================================================

echo "🛑 Stopping and disabling systemd services..."

for unit in \
    "chrome-ext-watchdog.timer" \
    "chrome-ext-watchdog.service" \
    "chrome-ext-server.service"; do

    if systemctl list-unit-files --no-legend 2>/dev/null | grep -q "^${unit}"; then
        sudo systemctl stop    "$unit" 2>/dev/null || true
        sudo systemctl disable "$unit" 2>/dev/null || true
        ok "Stopped & disabled $unit"
    else
        skip "$unit"
    fi
done

# ==============================================================================
# STEP 2 — Remove policy JSON files (all Chrome / Chromium directories)
# ==============================================================================

echo ""
echo "🗑️  Removing Chrome / Chromium managed policy files..."

for dir in "${POLICY_DIRS[@]}"; do
    remove_file "$dir/agent_monitor.json"
done

# ==============================================================================
# STEP 3 — Remove external extension sideload JSON files
# ==============================================================================

echo ""
echo "🗑️  Removing extension sideload configs..."

for dir in "${EXTERNAL_EXT_DIRS[@]}"; do
    remove_file "$dir/$EXTENSION_ID.json"
done

# ==============================================================================
# STEP 4 — Remove the update manifest XML
# ==============================================================================

echo ""
echo "🗑️  Removing update manifest..."

remove_file "$UPDATE_MANIFEST"

# ==============================================================================
# STEP 5 — Remove the watchdog script and systemd unit files
# ==============================================================================

echo ""
echo "🗑️  Removing watchdog script and systemd unit files..."

remove_file "$WATCHDOG_SCRIPT"
remove_file "$WATCHDOG_SERVICE"
remove_file "$WATCHDOG_TIMER"
remove_file "$EXT_SERVER_SERVICE"

# ==============================================================================
# STEP 6 — Reload systemd so removed units disappear from the unit list
# ==============================================================================

echo ""
echo "🔄 Reloading systemd daemon..."

sudo systemctl daemon-reload
sudo systemctl reset-failed 2>/dev/null || true
ok "systemd reloaded"

# ==============================================================================
# STEP 7 — Clear cached policy state from Chrome profile Preferences
#
# Chrome caches force-install markers inside each profile's Preferences JSON.
# Removing policy files alone is not enough on some Chrome versions — the
# cached state causes the managed UI to persist until the cache is cleared.
# ==============================================================================

echo ""
echo "🧹 Clearing cached policy state from Chrome profile Preferences..."

python3 - "$EXTENSION_ID" << 'PYEOF'
import json, glob, sys

ext_id = sys.argv[1]
patterns = (
    '/home/*/.config/google-chrome/*/Preferences',
    '/home/*/.config/chromium/*/Preferences',
    '/root/.config/google-chrome/*/Preferences',
)

cleaned = 0
for pat in patterns:
    for path in glob.glob(pat):
        try:
            with open(path) as f:
                prefs = json.load(f)

            settings = prefs.get('extensions', {}).get('settings', {})
            if ext_id not in settings:
                continue

            entry = settings[ext_id]
            changed = False

            # Remove force-install / managed markers Chrome caches locally
            for key in ('managed_install', 'install_parameter',
                        'was_installed_by_default', 'from_bookmark',
                        'from_webstore'):
                if key in entry:
                    del entry[key]
                    changed = True

            # Restore state to enabled (1) in case it was policy-forced
            if entry.get('state', 1) != 1:
                entry['state'] = 1
                changed = True

            if changed:
                with open(path, 'w') as f:
                    json.dump(prefs, f, separators=(',', ':'))
                cleaned += 1
                print(f'   \033[0;32m✅\033[0m  Cleaned: {path}')

        except Exception as e:
            print(f'   \033[1;33m⚠️ \033[0m  Could not process {path}: {e}')

if cleaned == 0:
    print('   ──   No profile Preferences needed updating')
PYEOF

# ==============================================================================
# STEP 8 — Remove extension from all Chrome / Chromium profile directories
#
# Chrome stores each installed extension under:
#   ~/.config/google-chrome/<Profile>/Extensions/<extension_id>/
#   ~/.config/chromium/<Profile>/Extensions/<extension_id>/
#
# Deleting these directories uninstalls the extension from every profile.
# Chrome must be stopped first (done in step 1 via pkill in step 9) —
# here we kill it early so the directories are not locked during deletion.
# ==============================================================================

echo ""
echo "🗑️  Removing extension from all Chrome profile directories..."

# Kill Chrome now so its extension directories are not locked
pkill -f "google-chrome\|chromium" 2>/dev/null || true
sleep 1

EXT_REMOVED=0
for profile_dir in \
    /home/*/.config/google-chrome/*/Extensions/"$EXTENSION_ID" \
    /home/*/.config/chromium/*/Extensions/"$EXTENSION_ID" \
    /root/.config/google-chrome/*/Extensions/"$EXTENSION_ID"; do
    if [ -d "$profile_dir" ]; then
        sudo rm -rf "$profile_dir"
        ok "Removed extension dir: $profile_dir"
        EXT_REMOVED=$(( EXT_REMOVED + 1 ))
    fi
done

# Also remove the extension entry from each profile's Preferences and
# Local State so Chrome does not attempt to re-download it on next start.
python3 - "$EXTENSION_ID" << 'PYEOF'
import json, glob, sys, os

ext_id = sys.argv[1]
prefs_patterns = (
    '/home/*/.config/google-chrome/*/Preferences',
    '/home/*/.config/chromium/*/Preferences',
    '/root/.config/google-chrome/*/Preferences',
)

removed = 0
for pat in prefs_patterns:
    for path in glob.glob(pat):
        try:
            with open(path) as f:
                prefs = json.load(f)

            settings = prefs.get('extensions', {}).get('settings', {})
            if ext_id not in settings:
                continue

            # Remove the extension entry entirely so Chrome treats it as
            # never installed rather than "installed but missing files".
            del settings[ext_id]

            with open(path, 'w') as f:
                json.dump(prefs, f, separators=(',', ':'))

            removed += 1
            print(f'   \033[0;32m✅\033[0m  Removed entry from: {path}')

        except Exception as e:
            print(f'   \033[1;33m⚠️ \033[0m  Could not process {path}: {e}')

if removed == 0:
    print('   ──   No Preferences entries found for this extension')
PYEOF

if [ "$EXT_REMOVED" -eq 0 ]; then
    echo "   ──   No extension profile directories found — already removed"
fi

# ==============================================================================
# STEP 9 — Restart Chrome so all removed policies take effect immediately
# ==============================================================================

echo ""
echo "🔄 Relaunching Chrome..."

CHROME_BINARY=""
for bin in google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$bin" &>/dev/null; then
        CHROME_BINARY="$bin"
        break
    fi
done

pkill -f "google-chrome\|chromium" 2>/dev/null || true
sleep 2

LOGGED_USER=$(loginctl list-sessions --no-legend 2>/dev/null | awk '{print $3}' | head -1)
if [ -n "$LOGGED_USER" ] && [ -n "$CHROME_BINARY" ]; then
    sudo -u "$LOGGED_USER" \
        DISPLAY=:0 XAUTHORITY="/home/${LOGGED_USER}/.Xauthority" \
        "$CHROME_BINARY" --no-first-run &>/dev/null &
    ok "Chrome relaunched as $LOGGED_USER"
else
    warn "Could not auto-relaunch Chrome — please restart it manually"
fi

# ==============================================================================
# SUMMARY
# ==============================================================================

echo ""
echo "══════════════════════════════════════════════════════════════════"
echo -e "${GRN}✅  ROLLBACK COMPLETE${NC}"
echo "══════════════════════════════════════════════════════════════════"
echo ""
echo "  Extension ID : $EXTENSION_ID"
echo "  CRX preserved: $CRX_INSTALL_DIR/extension.crx"
echo ""
echo "📋 Verify rollback in Chrome:"
echo ""
echo "  1. chrome://extensions"
echo "     The extension should NO LONGER appear in the list."
echo ""
echo "  2. chrome://policy"
echo "     ExtensionInstallForcelist and ExtensionSettings should be GONE."
echo "     Click 'Reload policies' if they still appear."
echo ""
echo "  3. Confirm services are gone:"
echo "       systemctl status chrome-ext-watchdog.timer"
echo "       systemctl status chrome-ext-server.service"
echo ""
echo "📋 To re-install the agent later:"
echo "       sudo bash $CRX_INSTALL_DIR/new_setup_agent.sh"
echo ""
