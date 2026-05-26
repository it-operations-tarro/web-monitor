#!/bin/bash

# ==============================================================================
# Agent Browser Monitor - Zorin OS Auto-Setup Script (v1.1)
# 
# 🛠️ TESTING MODE: 
# This version focuses on capturing the HOSTNAME. 
# It DOES NOT force-install the extension (which requires a .crx file/server).
# ==============================================================================

# 1. REPLACE THIS with your Extension ID from chrome://extensions
EXTENSION_ID="[PASTE_YOUR_EXTENSION_ID_HERE]"

if [ "$EXTENSION_ID" == "[PASTE_YOUR_EXTENSION_ID_HERE]" ]; then
    echo "❌ ERROR: You must edit this script and set your EXTENSION_ID first."
    exit 1
fi

HOSTNAME=$(hostname)
POLICY_DIR="/etc/opt/chrome/policies/managed"

echo "🛠️ Starting Agent Setup for Machine: $HOSTNAME"

# Create Policy Directory
sudo mkdir -p "$POLICY_DIR"

# Generate Policy JSON
# NOTE: We have removed 'ExtensionInstallForcelist' for TESTING.
# This allows you to load the extension manually while still injecting the Hostname.
echo "✍️ Writing Managed Policy..."

POLICY_CONTENT="{
  \"3rdparty\": {
    \"extensions\": {
      \"$EXTENSION_ID\": {
        \"machineId\": \"$HOSTNAME\"
      }
    }
  }
}"

echo "$POLICY_CONTENT" | sudo tee "$POLICY_DIR/agent_monitor.json" > /dev/null

echo "✅ Setup Complete!"
echo "🔄 Please RESTART Google Chrome."
echo "ℹ️  Load your extension manually in 'Load Unpacked' mode."
echo "ℹ️  Once loaded, it will automatically detect the Machine ID: $HOSTNAME"

# ==============================================================================
# PRO-TIP FOR PRODUCTION:
# When you are ready to "Force-Install" so agents cannot remove it:
# 1. Pack your extension into a .crx file.
# 2. Host it on an internal server or Chrome Web Store.
# 3. Add \"ExtensionInstallForcelist\": [ \"$EXTENSION_ID;https://...\" ] to the JSON above.
# ==============================================================================
