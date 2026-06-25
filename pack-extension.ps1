# Packs the Chrome extension into a .crx for self-hosted distribution.
#
# Packs from a CLEAN staging copy that contains ONLY real extension files.
# The setup scripts (.sh/.ps1), docs (.md), the signing key (.pem) and any old
# .crx sitting in extension/ are excluded, so they never get bundled into the
# extension shipped to browsers (that bloat was also masking version mismatches).
#
# One-time bootstrap (do this on your machine, not the server):
#   1. Load extension/ as "Unpacked" in chrome://extensions to see the ID.
#   2. Click "Pack extension", select extension/ as the root, leave key blank.
#      Chrome generates extension.crx and extension.pem next to the folder.
#   3. Move extension.pem to a SAFE place - losing it means a new extension ID
#      and every agent has to reinstall. Back it up off the build machine.
#
# Ongoing repack (run this script):
#   .\pack-extension.ps1 -KeyFile C:\path\to\extension.pem
#
# Output (both are the same bytes, different names):
#   collector\updates\extension.crx     <- name the Ansible/loopback deploy uses
#   collector\updates\agent-monitor.crx <- name the HTTPS updates.xml references
#
# The extension ID is fixed by the .pem, so it never changes regardless of what
# is packed. After packing, copy extension.crx to your Jenkins assets path and
# bump the version='' in collector/updates/updates.xml to match manifest.json.

param(
  [Parameter(Mandatory=$true)][string]$KeyFile,
  [string]$ChromeExe = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
  [string]$ExtensionDir = "$PSScriptRoot\extension",
  [string]$OutDir = "$PSScriptRoot\collector\updates"
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $ChromeExe))    { throw "Chrome not found at $ChromeExe. Pass -ChromeExe with the correct path." }
if (-not (Test-Path $KeyFile))      { throw "Key file not found at $KeyFile." }
if (-not (Test-Path $ExtensionDir)) { throw "Extension directory not found at $ExtensionDir." }

# Non-extension artifacts that must never be packed into the CRX.
$excludeExtensions = @('.crx', '.pem', '.ps1', '.sh', '.md')

# --- Build a clean staging copy ---
$staging = Join-Path $env:TEMP 'webmon-ext-pack'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

Write-Host "Staging clean extension files (excluding $($excludeExtensions -join ', '))..."
Get-ChildItem -Path $ExtensionDir -Recurse -File | ForEach-Object {
  if ($excludeExtensions -contains $_.Extension.ToLower()) { return }
  $rel     = $_.FullName.Substring($ExtensionDir.Length).TrimStart('\', '/')
  $dest    = Join-Path $staging $rel
  $destDir = Split-Path $dest -Parent
  if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
  Copy-Item $_.FullName -Destination $dest -Force
}

if (-not (Test-Path (Join-Path $staging 'manifest.json'))) {
  throw "manifest.json missing from staging - nothing to pack."
}

Write-Host "Files staged for packing:"
Get-ChildItem -Path $staging -Recurse -File | ForEach-Object {
  Write-Host "   $($_.FullName.Substring($staging.Length).TrimStart('\', '/'))"
}

# --- Pack the staging dir (Chrome writes <staging>.crx next to it) ---
$producedCrx = "$staging.crx"
if (Test-Path $producedCrx) { Remove-Item $producedCrx -Force }

Write-Host ""
Write-Host "Packing with key $KeyFile..."
$proc = Start-Process -FilePath $ChromeExe `
  -ArgumentList "--pack-extension=`"$staging`"", "--pack-extension-key=`"$KeyFile`"" `
  -Wait -PassThru -NoNewWindow

if (-not (Test-Path $producedCrx)) {
  throw "Pack failed - no .crx produced at $producedCrx (Chrome exit code $($proc.ExitCode))."
}

# --- Place outputs under both expected names ---
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$primary = Join-Path $OutDir 'extension.crx'
$alias   = Join-Path $OutDir 'agent-monitor.crx'
Copy-Item -Path $producedCrx -Destination $primary -Force
Copy-Item -Path $producedCrx -Destination $alias   -Force
Remove-Item $producedCrx -Force

# --- Cleanup staging ---
Remove-Item $staging -Recurse -Force

$manifest = Get-Content -Path "$ExtensionDir\manifest.json" -Raw | ConvertFrom-Json
$sizeKB   = [math]::Round((Get-Item $primary).Length / 1KB)
Write-Host ""
Write-Host "Packed extension v$($manifest.version) ($sizeKB KB)"
Write-Host "  -> $primary"
Write-Host "  -> $alias"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Copy extension.crx to your Jenkins assets path:"
Write-Host "       <jenkins>\web-monitor\extension\extension.crx"
Write-Host "  2. Ensure collector/updates/updates.xml version='' matches $($manifest.version)."
Write-Host "  3. Run the Ansible playbook, then verify an agent's popup shows v$($manifest.version)."
