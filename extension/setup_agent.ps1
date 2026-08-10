<#
.SYNOPSIS
    Agent Browser Monitor - Windows Agent Setup (v1.0)

.DESCRIPTION
    Force-installs the Agent Browser Monitor Chrome extension on this machine.

    FEATURES:
      Force-installs extension and disables the Remove button
      Injects machine hostname as managed machineId
      Runs a local loopback HTTP server so Chrome policy update URLs work
        (Chrome 91+ blocks file:// in ExtensionInstallForcelist)
      Installs a watchdog scheduled task that restores registry keys every 5 min
      Locks install files against standard-user modification (ACLs)
      Restarts Chrome automatically to apply policies

    REQUIREMENTS:
      Run as Administrator
      Place extension.crx next to this script before running
        OR pass -CrxPath to a network/USB path

.PARAMETER CrxPath
    Path to extension.crx. Defaults to extension.crx beside this script.

.EXAMPLE
    .\setup_agent.ps1
    .\setup_agent.ps1 -CrxPath "\\server\share\extension.crx"
#>

param(
    [string]$CrxPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ==============================================================================
#  CONFIGURATION  -  edit these before distributing the script
# ==============================================================================

$EXTENSION_ID      = "depibabflipmjimimdboikfhgdelcdnp"   # 32-char ID from chrome://extensions
$EXTENSION_VERSION = "1.1.5"                               # must match manifest.json version
$INSTALL_DIR       = "C:\chrome-extensions"                # permanent home for the CRX + server
$SERVER_PORT       = 8765                                  # loopback port for the update server

# ==============================================================================

$UPDATE_URL = "http://127.0.0.1:$SERVER_PORT/update_manifest.xml"
$MACHINE_ID = $env:COMPUTERNAME

# ── helpers ───────────────────────────────────────────────────────────────────
function Write-Step { param($msg) Write-Host "`n$msg" -ForegroundColor Cyan }
function Write-OK   { param($msg) Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  !!  $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "  XX  $msg" -ForegroundColor Red; exit 1 }

# ── banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "================================================================" -ForegroundColor DarkMagenta
Write-Host "  Agent Browser Monitor -- Windows Agent Setup" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor DarkMagenta
Write-Host "  Machine : $MACHINE_ID"
Write-Host "  Ext ID  : $EXTENSION_ID"
Write-Host "  Version : $EXTENSION_VERSION"
Write-Host ""

# ==============================================================================
#  PRE-FLIGHT CHECKS
# ==============================================================================
Write-Step "[ 1/7 ] Pre-flight checks..."

# Must be Administrator
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Fail "Script must be run as Administrator. Right-click -> Run as Administrator."
}

# Validate extension ID is not the placeholder
if ($EXTENSION_ID -eq "YOUR_EXTENSION_ID") {
    Write-Fail "Edit the script and set EXTENSION_ID before running."
}

# Locate CRX
if (-not $CrxPath) { $CrxPath = Join-Path $PSScriptRoot "extension.crx" }
if (-not (Test-Path $CrxPath -PathType Leaf)) {
    Write-Fail "extension.crx not found at: $CrxPath`n  Place it next to the script, or use -CrxPath <path>."
}
Write-OK "CRX found: $CrxPath"

# Locate Chrome (optional -- only needed for auto-restart)
# Build candidate list: system-wide paths + registry + every user profile
# (running as Admin makes $env:LocalAppData point to the Admin profile, not the
#  logged-in user, so per-user Chrome installs would be missed without the scan.)
$chromeCandidates = [System.Collections.Generic.List[string]]@(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
)

# Registry App Paths (covers both machine-wide and per-user installs)
# Wrapped in try/catch because Set-StrictMode -Version Latest turns a missing
# property into a terminating error rather than returning $null.
foreach ($regHive in @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
)) {
    try {
        $val = (Get-ItemProperty -Path $regHive -ErrorAction Stop).'(default)'
        if ($val) { $chromeCandidates.Add($val) }
    } catch {}
}

# Scan every user profile for a per-user Chrome install
Get-ChildItem "C:\Users" -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $chromeCandidates.Add("$($_.FullName)\AppData\Local\Google\Chrome\Application\chrome.exe")
}

$chromeBin = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($chromeBin) { Write-OK "Chrome found: $chromeBin" }
else            { Write-Warn "Chrome not found -- policy will apply when Chrome is installed." }

# ==============================================================================
#  INSTALL DIRECTORY + CRX
# ==============================================================================
Write-Step "[ 2/7 ] Setting up install directory..."

New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null

# Unlock files locked by a previous run. The step-7 ACL applies a Deny
# Write/Delete for 'Users', and because an admin account is also a member of
# 'Users', that Deny blocks the overwrite below (Access denied). Resetting the
# ACL restores inherited permissions so the copy succeeds. Owner/Administrator
# can always change an ACL, so this works even while the Deny is in effect.
# Mirrors the 'chattr -i' unlock preflight in the Linux setup script.
if (Test-Path $INSTALL_DIR) {
    icacls "$INSTALL_DIR" /reset /T /C /Q 2>&1 | Out-Null
    Write-OK "Reset ACLs on $INSTALL_DIR (unlocked prior-run files)"
}

$crxDest = Join-Path $INSTALL_DIR "extension.crx"
Copy-Item -Path $CrxPath -Destination $crxDest -Force
Write-OK "CRX copied to $crxDest"

# ==============================================================================
#  UPDATE MANIFEST
# ==============================================================================
Write-Step "[ 3/7 ] Writing update manifest..."

$manifestPath = Join-Path $INSTALL_DIR "update_manifest.xml"
@"
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='$EXTENSION_ID'>
    <updatecheck codebase='http://127.0.0.1:$SERVER_PORT/extension.crx'
                 version='$EXTENSION_VERSION' />
  </app>
</gupdate>
"@ | Set-Content -Path $manifestPath -Encoding UTF8
Write-OK "Manifest written: $manifestPath"

# ==============================================================================
#  LOCAL HTTP UPDATE SERVER  (loopback, no external dependency)
#
#  WHY: Chrome 91+ refuses file:// URLs in ExtensionInstallForcelist.
#       The Remove button is only grayed out when the update URL is HTTP/HTTPS.
#       A PowerShell HttpListener on loopback satisfies this with zero extra
#       software -- no Python, no IIS, no Node.
# ==============================================================================
Write-Step "[ 4/7 ] Installing local HTTP update server..."

$serverScriptPath = Join-Path $INSTALL_DIR "chrome-ext-server.ps1"

# Write the server script to disk (parameterised so watchdog can restart it)
@'
# Chrome Extension Local Update Server
# Serves files from the install directory on loopback.
# Registered as a scheduled task by setup_agent.ps1 -- do not edit manually.
param(
    [int]   $Port = 8765,
    [string]$Root = "C:\chrome-extensions"
)

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
try {
    $listener.Start()
    while ($listener.IsListening) {
        $ctx   = $listener.GetContext()
        $local = $ctx.Request.Url.LocalPath.TrimStart('/')

        # Block path traversal attempts
        if ($local -match '\.\.') {
            $ctx.Response.StatusCode = 400
        } else {
            $file = Join-Path $Root $local
            if (Test-Path $file -PathType Leaf) {
                $bytes = [System.IO.File]::ReadAllBytes($file)
                $ctx.Response.ContentLength64 = $bytes.Length
                $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $ctx.Response.StatusCode = 404
            }
        }
        $ctx.Response.Close()
    }
} finally {
    $listener.Stop()
}
'@ | Set-Content -Path $serverScriptPath -Encoding UTF8

# Register as a scheduled task that starts at boot and never stops
$serverTask = "ChromeExtServer"
Unregister-ScheduledTask -TaskName $serverTask -Confirm:$false -ErrorAction SilentlyContinue

$serverAction   = New-ScheduledTaskAction `
    -Execute  "powershell.exe" `
    -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$serverScriptPath`" -Port $SERVER_PORT -Root `"$INSTALL_DIR`""
$serverTrigger  = New-ScheduledTaskTrigger -AtStartup
$serverSettings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit          0 `
    -RestartCount                10 `
    -RestartInterval             (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable

# Run as SYSTEM. A standard-user account cannot bind the HttpListener port
# (HttpListener.Start throws 'Access is denied'), so the task would launch and
# immediately crash back to 'Ready' -- the loopback server never comes up and
# Chrome has nothing to fetch the CRX from. SYSTEM can always bind loopback and
# runs at boot before any user logs in; loopback is machine-wide, so the user's
# Chrome still reaches it. -RunLevel now lives on the principal, not Register.
$serverPrincipal = New-ScheduledTaskPrincipal `
    -UserId    "NT AUTHORITY\SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel  Highest

Register-ScheduledTask `
    -TaskName  $serverTask `
    -Action    $serverAction `
    -Trigger   $serverTrigger `
    -Settings  $serverSettings `
    -Principal $serverPrincipal `
    -Force | Out-Null

# Reserve the loopback URL so the HttpListener can bind regardless of the
# account the task runs under. Belt-and-suspenders alongside the SYSTEM
# principal above. Delete any prior reservation first so re-runs stay
# idempotent (netsh is a native command; a non-zero exit won't throw here).
netsh http delete urlacl url=http://127.0.0.1:$SERVER_PORT/ 2>&1 | Out-Null
netsh http add urlacl url=http://127.0.0.1:$SERVER_PORT/ user=Everyone 2>&1 | Out-Null
Write-OK "URL reservation set for http://127.0.0.1:$SERVER_PORT/"

Start-ScheduledTask -TaskName $serverTask
Start-Sleep -Seconds 3   # give the listener time to bind

# Verify
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$SERVER_PORT/update_manifest.xml" `
                              -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) { Write-OK "HTTP server reachable on port $SERVER_PORT" }
    else                          { Write-Warn "Server responded: HTTP $($resp.StatusCode)" }
} catch {
    Write-Warn "HTTP server not yet reachable (will start on next boot if the task failed to launch now)."
}

# ==============================================================================
#  CHROME GROUP POLICY  (registry)
# ==============================================================================
Write-Step "[ 5/7 ] Writing Chrome policy registry keys..."

# Force-install list  (grays out the Remove button in chrome://extensions)
$forcelistPath = "HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist"
New-Item -Path $forcelistPath -Force | Out-Null
New-ItemProperty -Path $forcelistPath `
    -Name "1" -Value "$EXTENSION_ID;$UPDATE_URL" -PropertyType String -Force | Out-Null
Write-OK "ExtensionInstallForcelist set"

# ExtensionSettings  (second lock, redundant but belt-and-suspenders)
$esPath = "HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionSettings\$EXTENSION_ID"
New-Item -Path $esPath -Force | Out-Null
New-ItemProperty -Path $esPath -Name "installation_mode" -Value "force_installed" `
    -PropertyType String -Force | Out-Null
New-ItemProperty -Path $esPath -Name "update_url" -Value $UPDATE_URL `
    -PropertyType String -Force | Out-Null
Write-OK "ExtensionSettings set"

# Machine ID via managed storage  (read by background.js as chrome.storage.managed)
$policyPath = "HKLM:\SOFTWARE\Policies\Google\Chrome\3rdparty\Extensions\$EXTENSION_ID\policy"
New-Item -Path $policyPath -Force | Out-Null
New-ItemProperty -Path $policyPath -Name "machineId" -Value $MACHINE_ID `
    -PropertyType String -Force | Out-Null
Write-OK "machineId = '$MACHINE_ID' injected via managed storage"

# ==============================================================================
#  WATCHDOG SCHEDULED TASK
#  Runs every 5 minutes + at startup.
#  Restores any registry keys that were deleted and ensures the server is running.
# ==============================================================================
Write-Step "[ 6/7 ] Installing watchdog..."

$watchdogScriptPath = Join-Path $INSTALL_DIR "chrome-ext-watchdog.ps1"

# Bake the current config values in at install time (no dependency on external vars at runtime)
@"
# Chrome Extension Watchdog
# Auto-generated by setup_agent.ps1 -- do not edit manually.
# Runs every 5 minutes via Task Scheduler to restore policy if removed.

`$EXTENSION_ID      = '$EXTENSION_ID'
`$EXTENSION_VERSION = '$EXTENSION_VERSION'
`$SERVER_PORT       = $SERVER_PORT
`$UPDATE_URL        = "http://127.0.0.1:`$SERVER_PORT/update_manifest.xml"
`$MACHINE_ID        = `$env:COMPUTERNAME   # always use current hostname

function Restore-RegValue {
    param(`$Path, `$Name, `$Value, `$Type = 'String')
    try {
        if (-not (Test-Path `$Path)) { New-Item -Path `$Path -Force | Out-Null }
        `$cur = (Get-ItemProperty -Path `$Path -Name `$Name -ErrorAction SilentlyContinue).`$Name
        if (`$cur -ne `$Value) {
            New-ItemProperty -Path `$Path -Name `$Name -Value `$Value ``
                -PropertyType `$Type -Force | Out-Null
        }
    } catch {}
}

# ExtensionInstallForcelist
`$fl = "HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist"
Restore-RegValue -Path `$fl -Name '1' -Value "`$EXTENSION_ID;`$UPDATE_URL"

# ExtensionSettings
`$es = "HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionSettings\`$EXTENSION_ID"
Restore-RegValue -Path `$es -Name 'installation_mode' -Value 'force_installed'
Restore-RegValue -Path `$es -Name 'update_url'         -Value `$UPDATE_URL

# Machine ID
`$mp = "HKLM:\SOFTWARE\Policies\Google\Chrome\3rdparty\Extensions\`$EXTENSION_ID\policy"
Restore-RegValue -Path `$mp -Name 'machineId' -Value `$MACHINE_ID

# Ensure HTTP server task is running
try {
    `$task = Get-ScheduledTask -TaskName 'ChromeExtServer' -ErrorAction SilentlyContinue
    if (`$task -and `$task.State -ne 'Running') {
        Start-ScheduledTask -TaskName 'ChromeExtServer' -ErrorAction SilentlyContinue
    }
} catch {}
"@ | Set-Content -Path $watchdogScriptPath -Encoding UTF8

$watchdogTask = "ChromeExtWatchdog"
Unregister-ScheduledTask -TaskName $watchdogTask -Confirm:$false -ErrorAction SilentlyContinue

$wdAction   = New-ScheduledTaskAction `
    -Execute  "powershell.exe" `
    -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchdogScriptPath`""
$wdTriggers = @(
    (New-ScheduledTaskTrigger -AtStartup),
    (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) `
        -RepetitionInterval (New-TimeSpan -Minutes 5) `
        -RepetitionDuration (New-TimeSpan -Days 3650))
)
$wdSettings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
    -StartWhenAvailable

# Run as SYSTEM. The watchdog restores keys under HKLM\SOFTWARE\Policies, which
# a standard-user account cannot write -- under the interactive user the restore
# would silently fail on those machines. SYSTEM has full HKLM write and can
# start the server task. -RunLevel now lives on the principal, not Register.
$wdPrincipal = New-ScheduledTaskPrincipal `
    -UserId    "NT AUTHORITY\SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel  Highest

Register-ScheduledTask `
    -TaskName  $watchdogTask `
    -Action    $wdAction `
    -Trigger   $wdTriggers `
    -Settings  $wdSettings `
    -Principal $wdPrincipal `
    -Force | Out-Null

Start-ScheduledTask -TaskName $watchdogTask
Write-OK "Watchdog registered (every 5 min + at startup)"

# ==============================================================================
#  FILE ACL PROTECTION
#  Deny write + delete for standard users on all installed files.
#  Administrators can still modify. Equivalent to chattr +i on Linux.
# ==============================================================================
Write-Step "[ 7/7 ] Locking install files against standard-user modification..."

$filesToLock = @($crxDest, $manifestPath, $serverScriptPath, $watchdogScriptPath)
foreach ($f in $filesToLock) {
    try {
        $acl = Get-Acl -Path $f
        $acl.SetAccessRuleProtection($true, $true)   # break inheritance, copy existing rules
        $deny = New-Object System.Security.AccessControl.FileSystemAccessRule(
            "Users",
            "Write,Delete,DeleteSubdirectoriesAndFiles",
            "Deny"
        )
        $acl.AddAccessRule($deny)
        Set-Acl -Path $f -AclObject $acl
        Write-OK "Locked: $(Split-Path $f -Leaf)"
    } catch {
        Write-Warn "Could not lock $(Split-Path $f -Leaf) -- $($_.Exception.Message)"
    }
}

# ==============================================================================
#  RESTART CHROME
# ==============================================================================
Write-Host ""
Write-Host "  Restarting Chrome to apply policies..." -ForegroundColor Cyan

$wasRunning = $false
foreach ($proc in @('chrome')) {
    if (Get-Process -Name $proc -ErrorAction SilentlyContinue) {
        $wasRunning = $true
        Stop-Process -Name $proc -Force -ErrorAction SilentlyContinue
    }
}

if ($wasRunning -and $chromeBin) {
    Start-Sleep -Seconds 2
    Start-Process -FilePath $chromeBin -ArgumentList "--no-first-run"
    Write-OK "Chrome relaunched"
} elseif (-not $wasRunning) {
    Write-OK "Chrome was not running -- policies will apply on next launch"
}

# ==============================================================================
#  SUMMARY
# ==============================================================================
Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  INSTALLATION COMPLETE" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Machine   : $MACHINE_ID"
Write-Host "  Ext ID    : $EXTENSION_ID"
Write-Host "  Update URL: $UPDATE_URL"
Write-Host ""
Write-Host "  Files installed to $INSTALL_DIR :"
Write-Host "    extension.crx         -- packed extension bundle"
Write-Host "    update_manifest.xml   -- Chrome update check response"
Write-Host "    chrome-ext-server.ps1 -- local HTTP server script"
Write-Host "    chrome-ext-watchdog.ps1 -- policy restore script"
Write-Host ""
Write-Host "  Scheduled tasks:"
Write-Host "    ChromeExtServer   -- HTTP server (starts at boot, restarts on crash)"
Write-Host "    ChromeExtWatchdog -- policy watchdog (every 5 min + at startup)"
Write-Host ""
Write-Host "  ── Verification ──────────────────────────────────────────────"
Write-Host ""
Write-Host "  1. chrome://policy  ->  Reload policies"
Write-Host "     ExtensionInstallForcelist must appear in the list."
Write-Host ""
Write-Host "  2. chrome://extensions"
Write-Host "     Extension should be present with Remove grayed out."
Write-Host ""
Write-Host "  3. Test the HTTP server (run in any PowerShell):"
Write-Host "     Invoke-WebRequest http://127.0.0.1:$SERVER_PORT/update_manifest.xml"
Write-Host ""
Write-Host "  ── To uninstall ──────────────────────────────────────────────"
Write-Host ""
Write-Host "  Run: .\rollback_agent.ps1"
Write-Host "  Or manually:"
Write-Host "    Unregister-ScheduledTask -TaskName ChromeExtServer  -Confirm:`$false"
Write-Host "    Unregister-ScheduledTask -TaskName ChromeExtWatchdog -Confirm:`$false"
Write-Host "    Remove-Item 'HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist' -Recurse -Force"
Write-Host "    Remove-Item 'HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionSettings\$EXTENSION_ID' -Recurse -Force"
Write-Host "    Remove-Item 'HKLM:\SOFTWARE\Policies\Google\Chrome\3rdparty\Extensions\$EXTENSION_ID' -Recurse -Force"
Write-Host "    Remove-Item '$INSTALL_DIR' -Recurse -Force"
Write-Host ""
