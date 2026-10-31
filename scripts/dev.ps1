# Start Dish-Wish locally on Windows: checks tools, env files and the database, then runs the API and web app.
#   powershell -ExecutionPolicy Bypass -File scripts\dev.ps1
# It never changes the database: migrations and seeds are applied in Supabase SQL Editor (see docs/SETUP.md).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Fail($msg) { Write-Host "X $msg" -ForegroundColor Red; exit 1 }
function Ok($msg) { Write-Host "OK $msg" -ForegroundColor Green }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js 22+ is not installed (https://nodejs.org).' }
if (-not (Test-Path 'api\venv\Scripts\python.exe')) { Fail 'Python venv missing. Run: python -m venv api\venv; api\venv\Scripts\pip install -r api\requirements.txt' }
Ok "Node $(node --version) and the API virtualenv"

function Read-Env($path) {
  $vals = @{}
  if (-not (Test-Path $path)) { return $vals }
  foreach ($line in Get-Content $path) {
    if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*)$') { $vals[$Matches[1]] = $Matches[2].Trim('"', "'", ' ') }
  }
  return $vals
}
$web = Read-Env 'web\.env'; $api = Read-Env 'api\.env'
foreach ($k in 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_API_URL') {
  if (-not $web[$k] -or $web[$k] -match 'YOUR_') { Fail "web\.env: set $k (copy web\.env.example)." }
}
foreach ($k in 'SUPABASE_URL', 'SUPABASE_ANON_KEY') {
  if (-not $api[$k] -or $api[$k] -match 'YOUR_') { Fail "api\.env: set $k (copy api\.env.example)." }
}
Ok 'Environment files (values not shown)'

try {
  $headers = @{ apikey = $api['SUPABASE_ANON_KEY']; Authorization = "Bearer $($api['SUPABASE_ANON_KEY'])" }
  $cats = Invoke-RestMethod -Uri "$($api['SUPABASE_URL'])/rest/v1/categories?select=id" -Headers $headers -TimeoutSec 10
  $recipes = Invoke-RestMethod -Uri "$($api['SUPABASE_URL'])/rest/v1/curated_recipes?select=id&status=eq.published" -Headers $headers -TimeoutSec 10
  Ok "Database reachable: $($cats.Count) categories, $($recipes.Count) published recipes"
  if ($cats.Count -eq 0) { Write-Host '! No catalog rows: run seed/seed.sql in SQL Editor.' -ForegroundColor Yellow }
} catch {
  Write-Host "! Could not query Supabase ($($_.Exception.Message)). If curated_recipes is missing, run migrations/0005_admin_recipes.sql and seed/recipes.sql." -ForegroundColor Yellow
}

if (-not (Test-Path 'web\node_modules')) { Push-Location web; npm install; Pop-Location }

Start-Process -FilePath 'api\venv\Scripts\uvicorn.exe' -ArgumentList 'api.index:app', '--port', '8000' -WorkingDirectory "$root\api" -NoNewWindow
Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev' -WorkingDirectory "$root\web" -NoNewWindow
Write-Host ''
Write-Host 'Web app:  http://localhost:5173'
Write-Host 'API:      http://localhost:8000  (docs: http://localhost:8000/docs)'
Write-Host 'Press Ctrl+C in this window to stop both.'
Wait-Process -Name node -ErrorAction SilentlyContinue
