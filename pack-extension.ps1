# Packs the Chrome extension into a .crx for self-hosted distribution.
#
# One-time bootstrap (do this on your machine, not the server):
#   1. Load extension/ as "Unpacked" in chrome://extensions to see the ID.
#   2. Click "Pack extension", select extension/ as the root, leave key blank.
#      Chrome generates extension.crx and extension.pem next to the folder.
#   3. Move extension.pem to a SAFE place — losing it means a new extension ID
#      and every agent has to reinstall. Back it up off the build machine.
#   4. Note the extension ID (32 lowercase letters) and put it in
#      collector/updates/updates.xml under appid=''.
#
# Ongoing repack (run this script):
#   .\pack-extension.ps1 -KeyFile C:\path\to\extension.pem
#
# Then bump the version='' attribute in collector/updates/updates.xml to match
# manifest.json and copy the produced .crx to the production server.

param(
  [Parameter(Mandatory=$true)][string]$KeyFile,
  [string]$ChromeExe = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
  [string]$ExtensionDir = "$PSScriptRoot\extension",
  [string]$OutDir = "$PSScriptRoot\collector\updates"
)

if (-not (Test-Path $ChromeExe)) {
  throw "Chrome not found at $ChromeExe. Pass -ChromeExe with the correct path."
}
if (-not (Test-Path $KeyFile)) {
  throw "Key file not found at $KeyFile."
}
if (-not (Test-Path $ExtensionDir)) {
  throw "Extension directory not found at $ExtensionDir."
}

Write-Host "Packing $ExtensionDir with key $KeyFile..."
$proc = Start-Process -FilePath $ChromeExe `
  -ArgumentList "--pack-extension=`"$ExtensionDir`"", "--pack-extension-key=`"$KeyFile`"" `
  -Wait -PassThru -NoNewWindow

$producedCrx = "$ExtensionDir.crx"
if (-not (Test-Path $producedCrx)) {
  throw "Pack failed - no .crx produced at $producedCrx (Chrome exit code $($proc.ExitCode))."
}

if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}
$target = Join-Path $OutDir 'agent-monitor.crx'
Move-Item -Path $producedCrx -Destination $target -Force

$manifest = Get-Content -Path "$ExtensionDir\manifest.json" -Raw | ConvertFrom-Json
Write-Host ""
Write-Host "Packed extension v$($manifest.version) -> $target"
Write-Host "Next: update collector/updates/updates.xml version='$($manifest.version)' to match,"
Write-Host "      then deploy the updates/ folder to the production server."
