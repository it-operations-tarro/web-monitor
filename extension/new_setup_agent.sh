#!/bin/bash

# ==============================================================================
# Agent Browser Monitor - Zorin OS Auto-Setup Script (v2.0)
#
# FEATURES:
# ✅ Force-installs extension for ALL Chrome profiles
# ✅ Injects machine hostname into managed policy
# ✅ Supports local .crx deployment
# ✅ System-wide installation
# ==============================================================================

# ==============================================================================
# CONFIGURATION
# ==============================================================================

EXTENSION_ID="depibabflipmjimimdboikfhgdelcdnp"
EXTENSION_VERSION="1.1.1"
CRX_FILE="/opt/chrome-extensions/extension.crx"

# Path where the CRX will live permanently
CRX_INSTALL_DIR="/opt/chrome-extensions"

# Chrome policy locations
POLICY_DIR="/etc/opt/chrome/policies/managed"
EXTERNAL_EXT_DIR="/opt/google/chrome/extensions"

# ==============================================================================

if [ ! -f "$CRX_FILE" ]; then
    echo "❌ ERROR: CRX file not found: $CRX_FILE"
    exit 1
fi

if [ "$EXTENSION_ID" == "YOUR_EXTENSION_ID" ]; then
    echo "❌ ERROR: Please edit the script and set EXTENSION_ID"
    exit 1
fi

HOSTNAME=$(hostname)

echo "🛠️ Starting Agent Setup for Machine: $HOSTNAME"

# ==============================================================================
# CREATE REQUIRED DIRECTORIES
# ==============================================================================

echo "📁 Creating directories..."

sudo mkdir -p "$CRX_INSTALL_DIR"
sudo mkdir -p "$POLICY_DIR"
sudo mkdir -p "$EXTERNAL_EXT_DIR"

# ==============================================================================
# COPY CRX FILE
# ==============================================================================

echo "📦 Installing extension CRX..."

sudo cp "$CRX_FILE" "$CRX_INSTALL_DIR/"

CRX_PATH="$CRX_FILE"

# ==============================================================================
# CREATE EXTERNAL EXTENSION JSON
# This force-installs the extension for all Chrome profiles
# ==============================================================================

echo "✍️ Writing external extension config..."

EXTERNAL_JSON="{
  \"external_crx\": \"$CRX_PATH\",
  \"external_version\": \"$EXTENSION_VERSION\"
}"

echo "$EXTERNAL_JSON" | sudo tee \
"$EXTERNAL_EXT_DIR/$EXTENSION_ID.json" > /dev/null

# ==============================================================================
# CREATE MANAGED POLICY
# Inject hostname into extension policy
# ==============================================================================

echo "✍️ Writing managed Chrome policy..."

POLICY_CONTENT="{
  \"3rdparty\": {
    \"extensions\": {
      \"$EXTENSION_ID\": {
        \"machineId\": \"$HOSTNAME\"
      }
    }
  }
}"

echo "$POLICY_CONTENT" | sudo tee \
"$POLICY_DIR/agent_monitor.json" > /dev/null

# ==============================================================================
# FIX PERMISSIONS
# ==============================================================================

echo "🔒 Setting permissions..."

sudo chmod 644 "$EXTERNAL_EXT_DIR/$EXTENSION_ID.json"
sudo chmod 644 "$POLICY_DIR/agent_monitor.json"
sudo chmod 644 "$CRX_FILE"

# ==============================================================================
# RESTART CHROME
# ==============================================================================

echo "🔄 Restarting Chrome..."

pkill chrome 2>/dev/null

# ==============================================================================
# COMPLETE
# ==============================================================================

echo ""
echo "✅ INSTALLATION COMPLETE!"
echo ""
echo "Machine ID: $HOSTNAME"
echo "Extension ID: $EXTENSION_ID"
echo ""
echo "📌 The extension should now auto-install on:"
echo "   • All existing Chrome profiles"
echo "   • Any new Chrome profiles"
echo "   • All users on this machine"
echo ""
echo "📌 Verify installation:"
echo "   chrome://extensions"
echo ""
echo "📌 Verify policies:"
echo "   chrome://policy"
echo ""
