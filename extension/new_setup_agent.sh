#!/bin/bash

# ==============================================================================
# Agent Browser Monitor - Zorin OS Auto-Setup Script (v4.0)
#
# FEATURES:
# ✅ Force-installs extension for ALL Chrome/Chromium profiles
# ✅ Injects machine hostname into managed policy
# ✅ Supports local .crx deployment via embedded HTTP server
# ✅ System-wide installation
# ✅ Immutable file locks (chattr +i) to block deletion
# ✅ Systemd watchdog that auto-restores removed extension files
# ✅ ExtensionInstallForcelist + ExtensionSettings — Remove button DISABLED
# ✅ Writes policies to ALL known Chrome/Chromium policy directories
#
# WHY MULTIPLE POLICY DIRS?
# Each Chrome build reads from a different path:
#   Google Chrome (deb)  → /etc/opt/chrome/policies/managed/
#   Chromium (apt/snap)  → /etc/chromium/policies/managed/
#   Chromium (old apt)   → /etc/chromium-browser/policies/managed/
# Writing to all paths guarantees the right one is hit regardless of
# which Chrome variant is installed.
#
# WHY AN HTTP SERVER?
# Chrome 91+ blocks file:// URLs in ExtensionInstallForcelist.
# Only HTTP/HTTPS update URLs cause Chrome to recognise the extension as
# policy-managed (Remove button grayed out). A Python HTTP server on
# loopback solves this with no external dependency.
# ==============================================================================

set -euo pipefail

# ==============================================================================
# CONFIGURATION
# ==============================================================================

EXTENSION_ID="depibabflipmjimimdboikfhgdelcdnp"
EXTENSION_VERSION="1.1.8"
CRX_FILE="/opt/chrome-extensions/extension.crx"

# Path where the CRX and manifest will live permanently
CRX_INSTALL_DIR="/opt/chrome-extensions"

# Port for the local HTTP update server (loopback only)
EXT_SERVER_PORT=8765

# All known Chrome / Chromium managed-policy directories
POLICY_DIRS=(
    "/etc/opt/chrome/policies/managed"           # Google Chrome stable (deb)
    "/etc/opt/chrome-unstable/policies/managed"  # Google Chrome dev/unstable
    "/etc/chromium/policies/managed"             # Chromium (snap / newer apt)
    "/etc/chromium-browser/policies/managed"     # Chromium (older Ubuntu/Zorin)
)

# External-extension sideload dirs (belt-and-suspenders install trigger)
EXTERNAL_EXT_DIRS=(
    "/opt/google/chrome/extensions"             # Google Chrome
    "/usr/share/chromium/extensions"            # Chromium
)

# Derived values
UPDATE_MANIFEST="$CRX_INSTALL_DIR/update_manifest.xml"
UPDATE_URL="http://127.0.0.1:$EXT_SERVER_PORT/update_manifest.xml"

# ==============================================================================
# PRE-FLIGHT CHECKS
# ==============================================================================

if [ ! -f "$CRX_FILE" ]; then
    echo "❌ ERROR: CRX file not found: $CRX_FILE"
    exit 1
fi

if [ "$EXTENSION_ID" = "YOUR_EXTENSION_ID" ]; then
    echo "❌ ERROR: Please edit the script and set EXTENSION_ID"
    exit 1
fi

HOSTNAME_VAL=$(hostname)

echo "🛠️  Starting Agent Setup for Machine: $HOSTNAME_VAL"
echo ""

# ==============================================================================
# DETECT CHROME BINARY
# ==============================================================================

echo "🔍 Detecting Chrome installation..."

CHROME_BINARY=""
for bin in google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$bin" &>/dev/null; then
        CHROME_BINARY="$bin"
        CHROME_VERSION=$("$bin" --version 2>/dev/null || echo "unknown")
        break
    fi
done

if [ -z "$CHROME_BINARY" ]; then
    echo "⚠️  WARNING: No Chrome/Chromium binary found in PATH."
    echo "   Policies will still be written — install Chrome before running."
else
    echo "   Binary : $CHROME_BINARY"
    echo "   Version: $CHROME_VERSION"
fi
echo ""

# ==============================================================================
# CREATE REQUIRED DIRECTORIES
# ==============================================================================

echo "📁 Creating directories..."

sudo mkdir -p "$CRX_INSTALL_DIR"
for dir in "${POLICY_DIRS[@]}"; do
    sudo mkdir -p "$dir"
done
for dir in "${EXTERNAL_EXT_DIRS[@]}"; do
    sudo mkdir -p "$dir"
done

# ==============================================================================
# COPY CRX FILE
# ==============================================================================

# Unlock any files that may have been locked by a previous run
echo "🔓 Unlocking previously locked files (if any)..."
sudo chattr -i "$CRX_INSTALL_DIR/extension.crx"  2>/dev/null || true
sudo chattr -i "$UPDATE_MANIFEST"                  2>/dev/null || true
for dir in "${POLICY_DIRS[@]}"; do
    sudo chattr -i "$dir/agent_monitor.json"       2>/dev/null || true
done
for dir in "${EXTERNAL_EXT_DIRS[@]}"; do
    sudo chattr -i "$dir/$EXTENSION_ID.json"       2>/dev/null || true
done

echo "📦 Installing extension CRX..."
if [ "$(realpath "$CRX_FILE")" != "$(realpath "$CRX_INSTALL_DIR/extension.crx" 2>/dev/null || echo "")" ]; then
    sudo cp "$CRX_FILE" "$CRX_INSTALL_DIR/extension.crx"
else
    echo "   CRX already in place at $CRX_INSTALL_DIR/extension.crx — skipping copy"
fi

# ==============================================================================
# CREATE LOCAL UPDATE MANIFEST
# Uses HTTP URL because Chrome 91+ ignores file:// in policy update URLs.
# ==============================================================================

echo "📄 Writing local update manifest..."

sudo tee "$UPDATE_MANIFEST" > /dev/null << XML_EOF
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='$EXTENSION_ID'>
    <updatecheck codebase='http://127.0.0.1:$EXT_SERVER_PORT/extension.crx'
                 version='$EXTENSION_VERSION' />
  </app>
</gupdate>
XML_EOF

# ==============================================================================
# INSTALL LOCAL HTTP UPDATE SERVER (systemd)
# Serves the CRX + manifest on loopback so Chrome's update mechanism can
# fetch them. Auto-starts at boot, restarts on failure.
# ==============================================================================

echo "🌐 Installing local HTTP update server..."

EXT_SERVER_SERVICE="/etc/systemd/system/chrome-ext-server.service"

sudo tee "$EXT_SERVER_SERVICE" > /dev/null << SERVER_EOF
[Unit]
Description=Chrome Extension Local Update Server
Documentation=man:python3(1)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$CRX_INSTALL_DIR
ExecStart=/usr/bin/python3 -m http.server $EXT_SERVER_PORT --bind 127.0.0.1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
SERVER_EOF

sudo systemctl daemon-reload
sudo systemctl enable --now chrome-ext-server.service
sleep 2  # give the server a moment before Chrome tries to reach it

# Verify server is actually reachable
if curl -sf "http://127.0.0.1:$EXT_SERVER_PORT/update_manifest.xml" > /dev/null; then
    echo "   ✅ HTTP server is reachable on port $EXT_SERVER_PORT"
else
    echo "   ⚠️  HTTP server not reachable yet — will retry at next Chrome launch"
fi

# ==============================================================================
# BUILD POLICY JSON
# ExtensionInstallForcelist → Chrome force-installs + disables Remove button
# ExtensionSettings         → redundant second lock
# ==============================================================================

POLICY_JSON=$(cat << POLICY_TEMPLATE
{
  "ExtensionInstallForcelist": [
    "${EXTENSION_ID};${UPDATE_URL}"
  ],
  "ExtensionSettings": {
    "${EXTENSION_ID}": {
      "installation_mode": "force_installed",
      "update_url": "${UPDATE_URL}"
    }
  },
  "3rdparty": {
    "extensions": {
      "${EXTENSION_ID}": {
        "machineId": "${HOSTNAME_VAL}"
      }
    }
  }
}
POLICY_TEMPLATE
)

# Validate JSON before writing anything
echo "🔎 Validating policy JSON..."
if echo "$POLICY_JSON" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
    echo "   ✅ JSON is valid"
else
    echo "   ❌ JSON is invalid — aborting"
    exit 1
fi

# ==============================================================================
# WRITE POLICY TO ALL KNOWN CHROME / CHROMIUM DIRECTORIES
# The correct directory depends on which Chrome build is installed.
# Writing to all of them is safe — Chrome ignores directories that don't
# match its build. This ensures the right one is always hit.
# ==============================================================================

echo "✍️  Writing managed Chrome policy to all policy directories..."

for dir in "${POLICY_DIRS[@]}"; do
    echo "$POLICY_JSON" | sudo tee "$dir/agent_monitor.json" > /dev/null
    echo "   Written → $dir/agent_monitor.json"
done

# ==============================================================================
# WRITE EXTERNAL EXTENSION JSON (sideload trigger — belt-and-suspenders)
# ==============================================================================

echo "✍️  Writing external extension sideload configs..."

EXT_JSON=$(cat << EXT_TEMPLATE
{
  "external_crx": "${CRX_INSTALL_DIR}/extension.crx",
  "external_version": "${EXTENSION_VERSION}"
}
EXT_TEMPLATE
)

for dir in "${EXTERNAL_EXT_DIRS[@]}"; do
    echo "$EXT_JSON" | sudo tee "$dir/$EXTENSION_ID.json" > /dev/null
    echo "   Written → $dir/$EXTENSION_ID.json"
done

# ==============================================================================
# FIX PERMISSIONS
# ==============================================================================

echo "🔒 Setting permissions..."

sudo chmod 644 "$CRX_INSTALL_DIR/extension.crx" "$UPDATE_MANIFEST"
sudo chmod 755 "$CRX_INSTALL_DIR"
sudo chown root:root "$CRX_INSTALL_DIR"

for dir in "${POLICY_DIRS[@]}"; do
    sudo chmod 644 "$dir/agent_monitor.json" 2>/dev/null || true
    sudo chmod 755 "$dir"
    sudo chown root:root "$dir"
done

for dir in "${EXTERNAL_EXT_DIRS[@]}"; do
    sudo chmod 644 "$dir/$EXTENSION_ID.json" 2>/dev/null || true
done

# ==============================================================================
# LOCK FILES WITH IMMUTABLE FLAG
# chattr +i prevents deletion/modification even by root until explicitly
# removed with: sudo chattr -i <file>
# ==============================================================================

echo "🔐 Locking files with immutable flag..."

sudo chattr +i "$CRX_INSTALL_DIR/extension.crx"
sudo chattr +i "$UPDATE_MANIFEST"

for dir in "${POLICY_DIRS[@]}"; do
    [ -f "$dir/agent_monitor.json" ] && sudo chattr +i "$dir/agent_monitor.json"
done

for dir in "${EXTERNAL_EXT_DIRS[@]}"; do
    [ -f "$dir/$EXTENSION_ID.json" ] && sudo chattr +i "$dir/$EXTENSION_ID.json"
done

# ==============================================================================
# INSTALL WATCHDOG SERVICE
# Systemd timer fires every 60 s and:
#   1. Restores any missing/deleted policy or config files
#   2. Ensures the HTTP update server is running
#   3. Detects if extension was removed from Chrome profiles → restarts Chrome
#   4. Clears any 'user removed' state from Chrome Preferences files
# ==============================================================================

echo "🛡️  Installing watchdog systemd service..."

WATCHDOG_SCRIPT="/usr/local/bin/chrome-ext-watchdog.sh"
WATCHDOG_SERVICE="/etc/systemd/system/chrome-ext-watchdog.service"
WATCHDOG_TIMER="/etc/systemd/system/chrome-ext-watchdog.timer"

# Write watchdog using placeholders so heredoc doesn't expand them at
# install time (they are baked in via sed right after).
sudo tee "$WATCHDOG_SCRIPT" > /dev/null << 'WATCHDOG_BODY'
#!/bin/bash
# Chrome extension watchdog — runs every 60 s via systemd timer

EXTENSION_ID="__EXT_ID__"
EXTENSION_VERSION="__EXT_VER__"
CRX_INSTALL_DIR="__CRX_DIR__"
UPDATE_MANIFEST="__MANIFEST__"
EXT_SERVER_PORT="__PORT__"
UPDATE_URL="http://127.0.0.1:${EXT_SERVER_PORT}/update_manifest.xml"
HOSTNAME_VAL=$(hostname)

POLICY_DIRS=(__POLICY_DIRS_ARRAY__)
EXTERNAL_EXT_DIRS=(__EXTERNAL_EXT_DIRS_ARRAY__)

CRX_PATH="${CRX_INSTALL_DIR}/extension.crx"

POLICY_JSON="{
  \"ExtensionInstallForcelist\": [
    \"${EXTENSION_ID};${UPDATE_URL}\"
  ],
  \"ExtensionSettings\": {
    \"${EXTENSION_ID}\": {
      \"installation_mode\": \"force_installed\",
      \"update_url\": \"${UPDATE_URL}\"
    }
  },
  \"3rdparty\": {
    \"extensions\": {
      \"${EXTENSION_ID}\": {
        \"machineId\": \"${HOSTNAME_VAL}\"
      }
    }
  }
}"

EXT_JSON="{
  \"external_crx\": \"${CRX_PATH}\",
  \"external_version\": \"${EXTENSION_VERSION}\"
}"

MANIFEST_XML="<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${EXTENSION_ID}'>
    <updatecheck codebase='http://127.0.0.1:${EXT_SERVER_PORT}/extension.crx'
                 version='${EXTENSION_VERSION}' />
  </app>
</gupdate>"

# ── helper: unlock → overwrite → relock ────────────────────────────────────
restore_file() {
    local file="$1" content="$2"
    mkdir -p "$(dirname "$file")"
    chattr -i "$file" 2>/dev/null
    printf '%s' "$content" > "$file"
    chmod 644 "$file"
    chattr +i "$file"
    logger -t chrome-ext-watchdog "Restored: $file"
}

# ── 1. Restore CRX / manifest ───────────────────────────────────────────────
[ ! -f "$CRX_PATH" ] && \
    logger -t chrome-ext-watchdog "ALERT: CRX missing at $CRX_PATH — manual restore required"

[ ! -f "$UPDATE_MANIFEST" ] && \
    restore_file "$UPDATE_MANIFEST" "$MANIFEST_XML"

# ── 2. Restore policy files in all directories ──────────────────────────────
for dir in "${POLICY_DIRS[@]}"; do
    policy_file="$dir/agent_monitor.json"
    [ ! -f "$policy_file" ] && restore_file "$policy_file" "$POLICY_JSON"
done

# ── 3. Restore external extension sideload files ────────────────────────────
for dir in "${EXTERNAL_EXT_DIRS[@]}"; do
    ext_file="$dir/${EXTENSION_ID}.json"
    [ ! -f "$ext_file" ] && restore_file "$ext_file" "$EXT_JSON"
done

# ── 4. Ensure the HTTP update server is running ─────────────────────────────
if ! systemctl is-active --quiet chrome-ext-server.service; then
    systemctl restart chrome-ext-server.service
    logger -t chrome-ext-watchdog "Restarted chrome-ext-server.service"
fi

# ── 5. Detect extension removed from Chrome profiles ────────────────────────
# Uses only a fast directory-existence check (no file reads) on every tick.
check_profile_dirs() {
    local found=0
    for ext_dir in /home/*/.config/google-chrome/*/Extensions/"${EXTENSION_ID}"/ \
                   /home/*/.config/chromium/*/Extensions/"${EXTENSION_ID}"/ \
                   /root/.config/google-chrome/*/Extensions/"${EXTENSION_ID}"/; do
        [ -d "$ext_dir" ] && found=1 && break
    done
    echo $found
}

EXTENSION_MISSING=0
if pgrep -x "chrome\|google-chrome\|chromium\|chromium-browser" > /dev/null 2>&1; then
    if [ "$(check_profile_dirs)" -eq 0 ]; then
        EXTENSION_MISSING=1
        logger -t chrome-ext-watchdog "Extension missing from all profiles — restarting Chrome"
        pkill -f "google-chrome\|chromium" 2>/dev/null || true
        sleep 3
        LOGGED_USER=$(loginctl list-sessions --no-legend 2>/dev/null | awk '{print $3}' | head -1)
        if [ -n "$LOGGED_USER" ]; then
            CHROME_BIN=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
            [ -n "$CHROME_BIN" ] && \
                sudo -u "$LOGGED_USER" \
                    DISPLAY=:0 XAUTHORITY="/home/${LOGGED_USER}/.Xauthority" \
                    "$CHROME_BIN" --no-first-run &>/dev/null &
            logger -t chrome-ext-watchdog "Relaunched Chrome as ${LOGGED_USER}"
        fi
    fi
fi

# ── 6. Clear 'user removed' state from Chrome Preferences ───────────────────
# Only runs when the extension was detected as missing — avoids reading and
# JSON-parsing multi-MB Preferences files on every 60-second tick.
if [ "$EXTENSION_MISSING" -eq 1 ]; then
    python3 - "$EXTENSION_ID" << 'PYEOF'
import json, glob, sys, syslog

ext_id = sys.argv[1]
patterns = (
    '/home/*/.config/google-chrome/*/Preferences',
    '/home/*/.config/chromium/*/Preferences',
    '/root/.config/google-chrome/*/Preferences',
)
for pat in patterns:
    for path in glob.glob(pat):
        try:
            with open(path) as f:
                prefs = json.load(f)
            entry = prefs.get('extensions', {}).get('settings', {}).get(ext_id)
            if entry is None:
                continue
            changed = False
            if entry.get('state', 1) != 1:        # 1=enabled, 3=removed
                entry['state'] = 1
                changed = True
            if entry.get('blacklisted', False):
                entry['blacklisted'] = False
                changed = True
            if changed:
                with open(path, 'w') as f:
                    json.dump(prefs, f, separators=(',', ':'))
                syslog.syslog(syslog.LOG_INFO,
                    f'chrome-ext-watchdog: cleared removed state in {path}')
        except Exception:
            pass
PYEOF
fi
WATCHDOG_BODY

# Bake runtime values into the watchdog script (sed replaces placeholders)
POLICY_DIRS_ARRAY=$(printf '"%s" ' "${POLICY_DIRS[@]}")
EXTERNAL_EXT_DIRS_ARRAY=$(printf '"%s" ' "${EXTERNAL_EXT_DIRS[@]}")

sudo sed -i \
    -e "s|__EXT_ID__|${EXTENSION_ID}|g" \
    -e "s|__EXT_VER__|${EXTENSION_VERSION}|g" \
    -e "s|__CRX_DIR__|${CRX_INSTALL_DIR}|g" \
    -e "s|__MANIFEST__|${UPDATE_MANIFEST}|g" \
    -e "s|__PORT__|${EXT_SERVER_PORT}|g" \
    -e "s|__POLICY_DIRS_ARRAY__|${POLICY_DIRS_ARRAY}|g" \
    -e "s|__EXTERNAL_EXT_DIRS_ARRAY__|${EXTERNAL_EXT_DIRS_ARRAY}|g" \
    "$WATCHDOG_SCRIPT"

sudo chmod 755 "$WATCHDOG_SCRIPT"

# --- systemd service unit ---
sudo tee "$WATCHDOG_SERVICE" > /dev/null << SERVICE_EOF
[Unit]
Description=Chrome Extension Watchdog
After=chrome-ext-server.service

[Service]
Type=oneshot
ExecStart=${WATCHDOG_SCRIPT}
StandardOutput=journal
StandardError=journal
SERVICE_EOF

# --- systemd timer unit (runs every 60 seconds) ---
sudo tee "$WATCHDOG_TIMER" > /dev/null << TIMER_EOF
[Unit]
Description=Chrome Extension Watchdog Timer
Requires=chrome-ext-watchdog.service

[Timer]
OnBootSec=30
OnUnitActiveSec=60
AccuracySec=10
Unit=chrome-ext-watchdog.service

[Install]
WantedBy=timers.target
TIMER_EOF

sudo systemctl daemon-reload
sudo systemctl enable --now chrome-ext-watchdog.timer
echo "   ✅ Watchdog timer enabled (checks every 60 s)"

# ==============================================================================
# RESTART CHROME
# Policy is only read at Chrome startup — must fully restart.
# ==============================================================================

echo ""
echo "🔄 Restarting Chrome to apply new policies..."

pkill -f "google-chrome\|chromium" 2>/dev/null || true
sleep 2

# ------------------------------------------------------------------------------
# FULL PROFILE WIPE  (runs on EVERY deploy)
# ⚠️  Destroys ALL Chrome profile data on the machine — bookmarks, saved
# passwords, sessions, autofill — for every user. Fresh profiles are created
# on next launch and the forcelist installs the current extension cleanly.
# This guarantees old profiles can never pin a stale extension version.
# ------------------------------------------------------------------------------
echo "⚠️  Deleting ALL Chrome/Chromium profiles on this machine..."
sudo rm -rf /home/*/.config/google-chrome \
            /home/*/.config/chromium \
            /home/*/.config/chromium-browser \
            /home/*/snap/chromium/common/chromium \
            /root/.config/google-chrome
echo "   💥 Profiles removed — fresh profiles will be created on next Chrome launch"

# ------------------------------------------------------------------------------
# EVICT STALE PROFILE COPIES
# A profile that already holds an older build keeps running it until Chrome's
# periodic (~5 h) update check — and some old profiles pin a stale update URL
# and never move at all. Chrome caches each installed build in a
# "<version>_0" subfolder; while Chrome is stopped, delete any profile copy
# that is NOT the current version. On relaunch the forcelist policy makes
# Chrome re-fetch the CRX from the local update server, cleanly installing
# the new build in every profile.
# ------------------------------------------------------------------------------
echo "🧹 Evicting stale extension copies from existing Chrome profiles..."

EVICTED=0
for ext_dir in /home/*/.config/google-chrome/*/Extensions/"$EXTENSION_ID" \
               /home/*/.config/chromium/*/Extensions/"$EXTENSION_ID" \
               /home/*/.config/chromium-browser/*/Extensions/"$EXTENSION_ID" \
               /home/*/snap/chromium/common/chromium/*/Extensions/"$EXTENSION_ID" \
               /root/.config/google-chrome/*/Extensions/"$EXTENSION_ID"; do
    [ -d "$ext_dir" ] || continue
    if [ -d "$ext_dir/${EXTENSION_VERSION}_0" ]; then
        echo "   ✅ Already current: $ext_dir"
        continue
    fi
    sudo rm -rf "$ext_dir"
    echo "   ♻️  Evicted stale copy: $ext_dir"
    EVICTED=$((EVICTED + 1))
done
[ "$EVICTED" -eq 0 ] && echo "   (no stale copies found)"

# ------------------------------------------------------------------------------
# PURGE THE EXTENSION'S RECORDED STATE FROM PROFILE PREFERENCES
# Evicting the cached copy is not always enough: the profile's Preferences /
# Secure Preferences remember the extension's install metadata — including the
# update URL it was ORIGINALLY installed from. A profile installed in the old
# on-prem era keeps checking that stale URL and never picks up the new build.
# Removing the extension's settings entry makes Chrome treat it as
# never-installed, so the forcelist performs a clean install from the current
# local update server. Extension-scoped only — user data is untouched.
# ------------------------------------------------------------------------------
echo "🧽 Purging stale extension state from profile Preferences..."
sudo python3 - "$EXTENSION_ID" << 'PURGE_EOF'
import json, glob, sys
ext_id = sys.argv[1]
patterns = (
    '/home/*/.config/google-chrome/*/Preferences',
    '/home/*/.config/google-chrome/*/Secure Preferences',
    '/home/*/.config/chromium/*/Preferences',
    '/home/*/.config/chromium/*/Secure Preferences',
    '/home/*/snap/chromium/common/chromium/*/Preferences',
    '/home/*/snap/chromium/common/chromium/*/Secure Preferences',
    '/root/.config/google-chrome/*/Preferences',
    '/root/.config/google-chrome/*/Secure Preferences',
)
for pat in patterns:
    for path in glob.glob(pat):
        try:
            with open(path) as f:
                prefs = json.load(f)
            changed = False
            settings = prefs.get('extensions', {}).get('settings', {})
            if ext_id in settings:
                del settings[ext_id]
                changed = True
            macs = prefs.get('protection', {}).get('macs', {}) \
                        .get('extensions', {}).get('settings', {})
            if ext_id in macs:
                del macs[ext_id]
                changed = True
            if changed:
                with open(path, 'w') as f:
                    json.dump(prefs, f, separators=(',', ':'))
                print(f'   \U0001f9fd Purged stale state: {path}')
        except Exception:
            pass
PURGE_EOF

LOGGED_USER=$(loginctl list-sessions --no-legend 2>/dev/null | awk '{print $3}' | head -1)
if [ -n "$LOGGED_USER" ] && [ -n "$CHROME_BINARY" ]; then
    sudo -u "$LOGGED_USER" \
        DISPLAY=:0 XAUTHORITY="/home/${LOGGED_USER}/.Xauthority" \
        "$CHROME_BINARY" --no-first-run &>/dev/null &
    echo "   ✅ Chrome relaunched as $LOGGED_USER"
fi

# ==============================================================================
# POST-INSTALL DIAGNOSTIC SUMMARY
# ==============================================================================

echo ""
echo "══════════════════════════════════════════════════════════════════"
echo "✅  INSTALLATION COMPLETE"
echo "══════════════════════════════════════════════════════════════════"
echo ""
echo "  Machine ID  : $HOSTNAME_VAL"
echo "  Extension ID: $EXTENSION_ID"
echo "  Update URL  : $UPDATE_URL"
echo ""
echo "📋 Policy files written to:"
for dir in "${POLICY_DIRS[@]}"; do
    if [ -f "$dir/agent_monitor.json" ]; then
        echo "   ✅ $dir/agent_monitor.json"
    else
        echo "   ⚠️  $dir/agent_monitor.json  (dir not created — Chrome type may not need it)"
    fi
done
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 VERIFICATION STEPS (do these now in Chrome)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  1. Open Chrome → chrome://policy"
echo "     Click 'Reload policies'"
echo "     You MUST see 'ExtensionInstallForcelist' in the list."
echo "     If it is NOT there, run:"
echo "       ls -la /etc/opt/chrome/policies/managed/"
echo "       ls -la /etc/chromium/policies/managed/"
echo "     and confirm the correct directory for your Chrome build."
echo ""
echo "  2. Open Chrome → chrome://extensions"
echo "     The extension Remove button should be GRAYED OUT / missing."
echo ""
echo "  3. Test the HTTP server:"
echo "       curl http://127.0.0.1:$EXT_SERVER_PORT/update_manifest.xml"
echo "       sudo systemctl status chrome-ext-server.service"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🛠️  IF chrome://policy STILL SHOWS NOTHING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Run this to find the correct policy path for your Chrome:"
echo "    strace -e openat $CHROME_BINARY --headless --dump-dom about:blank \\"
echo "      2>&1 | grep 'policies/managed' | head -20"
echo ""
echo "  Then manually copy the policy file to that path and restart Chrome."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📌 To disable protection temporarily (for updates):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "   sudo systemctl stop chrome-ext-server.service chrome-ext-watchdog.timer"
for dir in "${POLICY_DIRS[@]}"; do
    echo "   sudo chattr -i $dir/agent_monitor.json 2>/dev/null"
done
echo "   sudo chattr -i $CRX_INSTALL_DIR/extension.crx"
echo "   sudo chattr -i $UPDATE_MANIFEST"
echo ""
