<#
.SYNOPSIS
    Agent Browser Monitor - Windows Agent Rollback

.DESCRIPTION
    Removes everything installed by setup_agent.ps1:
      Stops and deletes the ChromeExtServer and ChromeExtWatchdog scheduled tasks
      Removes Chrome Group Policy registry keys
      Deletes C:\chrome-extensions
      Restarts Chrome

    Run as Administrator.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'

# Edit to match setup_agent.ps1 if you changed these
$EXTENSION_ID = "depibabflipmjimimdboikfhgdelcdnp"
$INSTALL_DIR  = "C:\chrome-extensions"

function Write-Step { param($msg) Write-Host "`n$msg" -ForegroundColor Cyan }
function Write-OK   { param($msg) Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  --  $msg" -ForegroundColor Yellow }

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Must be run as Administrator." -ForegroundColor Red; exit 1
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor DarkRed
Write-Host "  Agent Browser Monitor -- Rollback" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor DarkRed
Write-Host ""

Write-Step "Stopping scheduled tasks..."
foreach ($name in @("ChromeExtServer", "ChromeExtWatchdog")) {
    Stop-ScheduledTask  -TaskName $name -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    Write-OK "Removed task: $name"
}

Write-Step "Removing Chrome policy registry keys..."
$paths = @(
    "HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist",
    "HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionSettings\$EXTENSION_ID",
    "HKLM:\SOFTWARE\Policies\Google\Chrome\3rdparty\Extensions\$EXTENSION_ID"
)
foreach ($p in $paths) {
    if (Test-Path $p) {
        Remove-Item -Path $p -Recurse -Force -ErrorAction SilentlyContinue
        Write-OK "Removed: $p"
    } else {
        Write-Warn "Not found (already removed?): $p"
    }
}

Write-Step "Removing install directory..."
if (Test-Path $INSTALL_DIR) {
    # Strip deny ACLs so we can delete the files
    Get-ChildItem -Path $INSTALL_DIR -File | ForEach-Object {
        try {
            $acl = Get-Acl $_.FullName
            $acl.SetAccessRuleProtection($false, $true)
            Set-Acl -Path $_.FullName -AclObject $acl
        } catch {}
    }
    Remove-Item -Path $INSTALL_DIR -Recurse -Force -ErrorAction SilentlyContinue
    Write-OK "Removed $INSTALL_DIR"
} else {
    Write-Warn "$INSTALL_DIR not found"
}

Write-Step "Restarting Chrome..."
Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
$chromeBin = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chromeBin) { Start-Process -FilePath $chromeBin; Write-OK "Chrome relaunched" }

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  Rollback complete. Extension will be gone after Chrome restarts." -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
