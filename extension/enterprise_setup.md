# Enterprise Admin Setup Guide

This guide covers two modes: **Testing (Development)** and **Production**.

---

## 🧪 Testing Mode (Manual Load)
Use this mode while you are still editing the code and loading the extension via "Load unpacked".

### 1. Identify your Extension ID
Load the extension once in `chrome://extensions` to see its ID.

### 2. Run the Setup Script
I have provided [setup_agent.sh](file:///d:/vibe-code/web-monitor/extension/setup_agent.sh). 
- Open it and paste your `EXTENSION_ID`.
- Run it on the machine: `sudo ./setup_agent.sh`.
- **Note**: In this mode, the script ONLY injects the **Machine ID (Hostname)**. It does NOT force the install, so it won't block your local code.

### 3. Restart Chrome
Restart the browser and you will see "Managed by IT" in the extension popup with the correct hostname.

---

## 🚀 Production Mode (Force-Install)
Use this mode once you are ready to deploy to the call center and want to **prevent agents from removing the extension**.

### 1. Pack the Extension
Go to `chrome://extensions` and click **Pack Extension**. This creates a `.crx` file.

### 2. Upload to Web Store or Internal Host
- **Option A (Web Store)**: Upload to the Google Chrome Web Store.
- **Option B (Self-Host)**: Host the `.crx` and an XML update manifest on your own server.

### 3. Update Policy
Update the policy JSON in `/etc/opt/chrome/policies/managed/agent_monitor.json` to include the `ExtensionInstallForcelist`:

```json
{
  "ExtensionInstallForcelist": [
    "YOUR_EXTENSION_ID;https://clients2.google.com/service/update2/crx"
  ],
  "3rdparty": {
    "extensions": {
      "YOUR_EXTENSION_ID": {
        "machineId": "YOUR_PC_NAME"
      }
    }
  }
}
```

---

## 🔄 Rollback
If you ever get "Blocked" or want to clear all settings:
```bash
sudo ./rollback_agent.sh
```
*(Restart Chrome after running)*.
