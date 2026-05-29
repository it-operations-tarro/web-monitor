# Enterprise Admin Setup Guide

This guide covers two modes: **Testing (Development)** and **Production**.

---

## Testing Mode (Manual Load)
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

## Production Mode (Self-Hosted Force-Install)

The extension is distributed from your own server rather than the Chrome Web Store. Chrome polls a small `updates.xml` manifest on a schedule and downloads new `.crx` builds when the version changes.

### Prerequisite: HTTPS on the host serving updates

Chrome refuses HTTP URLs in `ExtensionInstallForcelist`. The collector currently runs on plain HTTP at port 4448 — you cannot use that URL directly. Pick one:

- **Caddy / nginx reverse proxy** in front of the collector with a valid TLS cert (Let's Encrypt if the host has public DNS + port 80, or your internal CA).
- **A separate HTTPS host** (IIS, S3 + CloudFront, internal static fileserver) that serves just `updates.xml` and the `.crx`. The collector itself can stay HTTP-only behind the firewall.

Once HTTPS is in place, fetching `https://your-host/updates/updates.xml` in a browser must return the XML, and `https://your-host/updates/agent-monitor.crx` must return the packed extension. Both URLs are served by the collector from [collector/updates/](../collector/updates/) once a CRX is placed there.

### 1. Bootstrap pack (one time on your build machine)

1. Open `chrome://extensions`, enable Developer mode, click **Load unpacked**, select [extension/](.) — note the 32-char extension ID Chrome assigns.
2. Click **Pack extension**, select [extension/](.) as the root, leave the key field blank. Chrome generates:
   - `extension.crx` — the packed bundle
   - `extension.pem` — the **private signing key**
3. **Back up `extension.pem` somewhere safe** (password manager, sealed vault). Losing it means a new extension ID and every agent has to reinstall.

### 2. Wire up `updates.xml`

Edit [collector/updates/updates.xml](../collector/updates/updates.xml) and substitute:
- `YOUR_EXTENSION_ID` — the 32-char ID from step 1
- `YOUR_HTTPS_HOST` — the HTTPS hostname from the prerequisite step
- `version='1.1.1'` — must match [manifest.json](manifest.json) `version`

### 3. Repack on every release

From the repo root:

```powershell
.\pack-extension.ps1 -KeyFile C:\path\to\extension.pem
```

This runs `chrome.exe --pack-extension` with the saved key and drops the new `.crx` into [collector/updates/agent-monitor.crx](../collector/updates/). Then bump the `version` attribute in `updates.xml` to match `manifest.json`.

### 4. Deploy to the server

Push [collector/updates/](../collector/updates/) to the production server alongside the collector. The Express app already serves the directory at `/updates/` ([collector/server.js](../collector/server.js)), so no further server changes needed.

### 5. Update the Group Policy on each managed Chrome

On Linux:

```json
// /etc/opt/chrome/policies/managed/agent_monitor.json
{
  "ExtensionInstallForcelist": [
    "YOUR_EXTENSION_ID;https://YOUR_HTTPS_HOST/updates/updates.xml"
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

On Windows, the same forcelist entry goes under
`HKLM\Software\Policies\Google\Chrome\ExtensionInstallForcelist` as a REG_SZ value.

Chrome checks the URL on startup and roughly every 5 hours, so once the policy and the manifest are both in place, agents pick up new builds within a few hours without any action on the workstation.

---

## Rollback
If you ever need to clear all settings:
```bash
sudo ./rollback_agent.sh
```
*(Restart Chrome after running)*.
