param(
  [Parameter(Mandatory = $true)][string]$InstallDir,
  [Parameter(Mandatory = $true)][string]$DataDir,
  [switch]$SkipRunningServerCheck
)

$ErrorActionPreference = 'Stop'
if (-not $SkipRunningServerCheck) {
  $deadline = (Get-Date).AddSeconds(30)
  while (Get-Process -Name 'restaurante' -ErrorAction SilentlyContinue) {
    if ((Get-Date) -ge $deadline) {
      throw 'Restaurante sigue en ejecución. No se copiará SQLite mientras el servidor pueda escribir en la base.'
    }
    Start-Sleep -Milliseconds 250
  }
}

$updateRoot = Join-Path $DataDir 'backups\updates'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$point = Join-Path $updateRoot $stamp
New-Item -ItemType Directory -Force -Path $point | Out-Null

if (Test-Path -LiteralPath $InstallDir) {
  New-Item -ItemType Directory -Force -Path (Join-Path $point 'app') | Out-Null
  Copy-Item -Path (Join-Path $InstallDir '*') -Destination (Join-Path $point 'app') -Recurse -Force -ErrorAction Stop
}

$database = Join-Path $DataDir 'data\salon.sqlite'
if (Test-Path -LiteralPath $database) {
  New-Item -ItemType Directory -Force -Path (Join-Path $point 'data') | Out-Null
  Copy-Item -LiteralPath $database -Destination (Join-Path $point 'data\salon.sqlite') -Force
  foreach ($suffix in @('-wal', '-shm')) {
    if (Test-Path -LiteralPath ($database + $suffix)) {
      Copy-Item -LiteralPath ($database + $suffix) -Destination (Join-Path $point ('data\salon.sqlite' + $suffix)) -Force
    }
  }
}

Set-Content -LiteralPath (Join-Path $updateRoot 'active-backup.txt') -Value $point -Encoding UTF8

$points = Get-ChildItem -LiteralPath $updateRoot -Directory | Sort-Object Name -Descending
$points | Select-Object -Skip 3 | Remove-Item -Recurse -Force
Write-Output $point
