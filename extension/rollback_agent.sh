#!/bin/bash

# ==============================================================================
# Agent Browser Monitor - Rollback Script
# 
# This script:
# 1. Removes the Chrome Enterprise Policy for the Agent Browser Monitor.
# 2. Restores the browser to its original state (allowing extension removal).
# ==============================================================================

POLICY_FILE="/etc/opt/chrome/policies/managed/agent_monitor.json"

echo "🔄 Starting Rollback process..."

if [ -f "$POLICY_FILE" ]; then
    echo "🗑️  Removing policy file: $POLICY_FILE"
    sudo rm "$POLICY_FILE"
    echo "✅ Policy file removed."
else
    echo "ℹ️  No policy file found at $POLICY_FILE. Nothing to remove."
fi

echo ""
echo "✅ Rollback Complete!"
echo "🔄 Please RESTART Google Chrome to apply the changes."
echo "ℹ️  After restart, the 'Force-Install' will be lifted, and you can manually remove the extension if desired."
