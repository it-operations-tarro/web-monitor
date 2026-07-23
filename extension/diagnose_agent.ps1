<#
.SYNOPSIS
    Agent Browser Monitor - Installation Diagnostics

.DESCRIPTION
    Checks every component of the extension installation and reports
    exactly what is working and what is not.
    Run as Administrator on the agent machine.
#>

# ── Match these to setup_agent.ps1 ───────────────────────────────────────────
$EXTENSION_ID = "depibabflipmjimimdboikfhgdelcdnp"
$INSTALL_DIR  = "C:\chrome-extensions"
$SERVER_PORT  = 8765
# ─────────────────────────────────────────────────────────────────────────────

$UPDATE_URL   = "http://127.0.0.1:$SERVER_PORT/update_manifest.xml"
$CRX_URL      = "http://127.0.0.1:$SERVER_PORT/extension.crx"
$PASS  = "[PASS]"
$FAIL  = "[FAIL]"
$WARN  = "[WARN]"

function Show-Result {
    param($status, $label, $detail = "")
    $color = switch ($status) {
        $PASS { "Green"  }
        $FAIL { "Red"    }
        $WARN { "Yellow" }
    }
    Write-Host ("  {0,-6} {1}" -f $status, $label) -ForegroundColor $color
    if ($detail) { Write-Host "         $detail" -ForegroundColor DarkGray }
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Agent Browser Monitor -- Diagnostics" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Machine : $env:COMPUTERNAME"
Write-Host "  Ext ID  : $EXTENSION_ID"
Write-Host ""

# ── 1. Install directory & files ─────────────────────────────────────────────
Write-Host "[ 1 ] Install files" -ForegroundColor Cyan

$crxFile      = Join-Path $INSTALL_DIR "extension.crx"
$manifestFile = Join-Path $INSTALL_DIR "update_manifest.xml"
$serverFile   = Join-Path $INSTALL_DIR "chrome-ext-server.ps1"
$watchdogFile = Join-Path $INSTALL_DIR "chrome-ext-watchdog.ps1"

foreach ($f in @($crxFile, $manifestFile, $serverFile, $watchdogFile)) {
    if (Test-Path $f -PathType Leaf) {
        $size = (Get-Item $f).Length
        Show-Result $PASS (Split-Path $f -Leaf) "($size bytes)"
    } else {
        Show-Result $FAIL (Split-Path $f -Leaf) "NOT FOUND at $f"
    }
}

# ── 2. Scheduled tasks ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ 2 ] Scheduled tasks" -ForegroundColor Cyan

foreach ($taskName in @("ChromeExtServer", "ChromeExtWatchdog")) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $task) {
        Show-Result $FAIL $taskName "Task does not exist -- re-run setup_agent.ps1"
    } elseif ($task.State -eq "Running") {
        Show-Result $PASS "$taskName (Running)"
    } elseif ($task.State -eq "Ready") {
        Show-Result $WARN "$taskName (Ready but not Running)" "Try: Start-ScheduledTask -TaskName '$taskName'"
    } else {
        Show-Result $FAIL "$taskName (State: $($task.State))"
    }
}

# ── 3. HTTP server reachability ──────────────────────────────────────────────
Write-Host ""
Write-Host "[ 3 ] Local HTTP server (port $SERVER_PORT)" -ForegroundColor Cyan

try {
    $r = Invoke-WebRequest -Uri $UPDATE_URL -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($r.StatusCode -eq 200) {
        Show-Result $PASS "update_manifest.xml is served correctly"
    } else {
        Show-Result $WARN "update_manifest.xml returned HTTP $($r.StatusCode)"
    }
} catch {
    Show-Result $FAIL "Cannot reach http://127.0.0.1:$SERVER_PORT" `
        "Start the task manually: Start-ScheduledTask -TaskName 'ChromeExtServer'"
}

try {
    $r2 = Invoke-WebRequest -Uri $CRX_URL -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($r2.StatusCode -eq 200) {
        Show-Result $PASS "extension.crx is served correctly ($([int]$r2.RawContentLength) bytes)"
    } else {
        Show-Result $WARN "extension.crx returned HTTP $($r2.StatusCode)"
    }
} catch {
    Show-Result $FAIL "extension.crx not reachable at $CRX_URL"
}

# ── 4. Registry keys ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ 4 ] Chrome policy registry keys" -ForegroundColor Cyan

# ExtensionInstallForcelist
$flPath = "HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist"
$flVal  = (Get-ItemProperty -Path $flPath -ErrorAction SilentlyContinue).'1'
if ($flVal -and $flVal -like "*$EXTENSION_ID*") {
    Show-Result $PASS "ExtensionInstallForcelist" $flVal
} elseif ($flVal) {
    Show-Result $WARN "ExtensionInstallForcelist exists but does not contain the correct extension ID" $flVal
} else {
    Show-Result $FAIL "ExtensionInstallForcelist not set" "Path: $flPath  Value name: 1"
}

# ExtensionSettings
$esPath = "HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionSettings\$EXTENSION_ID"
$esMode = (Get-ItemProperty -Path $esPath -ErrorAction SilentlyContinue).installation_mode
if ($esMode -eq "force_installed") {
    Show-Result $PASS "ExtensionSettings.installation_mode = force_installed"
} else {
    Show-Result $WARN "ExtensionSettings not set (non-critical, forcelist alone is enough)"
}

# machineId
$mpPath = "HKLM:\SOFTWARE\Policies\Google\Chrome\3rdparty\Extensions\$EXTENSION_ID\policy"
$mid    = (Get-ItemProperty -Path $mpPath -ErrorAction SilentlyContinue).machineId
if ($mid) {
    Show-Result $PASS "machineId = '$mid'"
} else {
    Show-Result $FAIL "machineId not set" "Path: $mpPath"
}

# ── 5. Chrome installation ───────────────────────────────────────────────────
Write-Host ""
Write-Host "[ 5 ] Chrome" -ForegroundColor Cyan

$chromeBin = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

# Also scan user profiles
if (-not $chromeBin) {
    Get-ChildItem "C:\Users" -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $p = "$($_.FullName)\AppData\Local\Google\Chrome\Application\chrome.exe"
        if ((Test-Path $p) -and -not $chromeBin) { $chromeBin = $p }
    }
}

if ($chromeBin) {
    $ver = (Get-Item $chromeBin).VersionInfo.FileVersion
    Show-Result $PASS "Chrome found: $chromeBin  (v$ver)"
} else {
    Show-Result $FAIL "Chrome not found on this machine"
}

$running = Get-Process -Name "chrome" -ErrorAction SilentlyContinue
if ($running) {
    Show-Result $WARN "Chrome is currently running" `
        "For policies to fully apply, close ALL Chrome windows (including background) then reopen."
} else {
    Show-Result $PASS "Chrome is not currently running (good -- open it fresh to load policies)"
}

# ── Summary & next steps ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Next steps" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host @"

  1. Open Chrome and go to:   chrome://policy
     Click 'Reload policies'
     You must see 'ExtensionInstallForcelist' in the list.
     If it is NOT there -> the registry keys above are missing or Chrome
     is ignoring them. Re-run setup_agent.ps1 as Administrator.

  2. Go to:   chrome://extensions
     If the extension is listed but disabled, enable it.
     If it is not listed yet, Chrome is still fetching it from the
     local update server -- wait 30 seconds and click the refresh
     icon (or enable Developer mode and click 'Update').

  3. If chrome://policy shows the policy but the extension still
     doesn't appear, the most common cause is an Extension ID mismatch:
     the ID in the policy does not match the ID Chrome assigned to the
     packed CRX. Verify by loading the CRX unpacked first:
       chrome://extensions -> Developer mode ON -> Load unpacked
     Note the ID Chrome shows -- it must match EXTENSION_ID in the script.

  4. Force Chrome to re-check right now (run in PowerShell):
     Start-Process '$chromeBin' -ArgumentList '--check-for-update-interval=1'

"@
