# Deployment script for Web Monitor Production Server

Write-Host "🚀 Preparing Web Monitor for Production Deployment..." -ForegroundColor Cyan

$serverIP = "10.201.8.184"
$deployFolder = "./dist"

# Create deployment folder
if (Test-Path $deployFolder) { Remove-Item $deployFolder -Recurse -Force }
New-Item -ItemType Directory -Path $deployFolder

# 1. Package Collector
Write-Host "📦 Packaging Collector..." -ForegroundColor Green
New-Item -ItemType Directory -Path "$deployFolder/collector"
Copy-Item "./collector/server.js" "$deployFolder/collector/"
Copy-Item "./collector/package.json" "$deployFolder/collector/"
Copy-Item "./collector/.env" "$deployFolder/collector/"

# 2. Package Dashboard
Write-Host "📦 Packaging Dashboard (this may take a moment)..." -ForegroundColor Green
Set-Location ./dashboard
npm run build
Set-Location ..
Copy-Item "./dashboard/.next" "$deployFolder/dashboard/.next" -Recurse
Copy-Item "./dashboard/public" "$deployFolder/dashboard/public" -Recurse
Copy-Item "./dashboard/package.json" "$deployFolder/dashboard/"
Copy-Item "./dashboard/next.config.ts" "$deployFolder/dashboard/"

Write-Host "`n✅ Production package ready in $deployFolder" -ForegroundColor Yellow
Write-Host "👉 Copy this folder to your server ($serverIP) and run 'npm install' in both subfolders." -ForegroundColor Gray
