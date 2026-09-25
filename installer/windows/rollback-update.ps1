param(
  [Parameter(Mandatory = $true)][string]$InstallDir,
  [Parameter(Mandatory = $true)][string]$DataDir
)

$ErrorActionPreference = 'Stop'
$marker = Join-Path $DataDir 'backups\updates\active-backup.txt'
if (-not (Test-Path -LiteralPath $marker)) {
  throw 'No existe un punto de recuperación activo.'
}
$point = (Get-Content -LiteralPath $marker -Raw).Trim()
if (-not (Test-Path -LiteralPath $point)) {
  throw 'El punto de recuperación no está disponible.'
}

$appBackup = Join-Path $point 'app'
if (Test-Path -LiteralPath $appBackup) {
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  Copy-Item -Path (Join-Path $appBackup '*') -Destination $InstallDir -Recurse -Force
}

$databaseBackup = Join-Path $point 'data\salon.sqlite'
$database = Join-Path $DataDir 'data\salon.sqlite'
if (Test-Path -LiteralPath $databaseBackup) {
  New-Item -ItemType Directory -Force -Path (Split-Path $database) | Out-Null
  Copy-Item -LiteralPath $databaseBackup -Destination $database -Force
  foreach ($suffix in @('-wal', '-shm')) {
    $source = $databaseBackup + $suffix
    if (Test-Path -LiteralPath $source) {
      Copy-Item -LiteralPath $source -Destination ($database + $suffix) -Force
    }
  }
}

if (Get-ScheduledTask -TaskName 'Restaurante POS' -ErrorAction SilentlyContinue) {
  Start-ScheduledTask -TaskName 'Restaurante POS'
}

Write-Output $point
