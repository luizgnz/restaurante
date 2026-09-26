param(
  [Parameter(Mandatory = $true)][string]$InstallDir,
  [Parameter(Mandatory = $true)][string]$DataDir,
  [switch]$SkipTaskStart
)

$ErrorActionPreference = 'Stop'
$installPath = [System.IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
$dataPath = [System.IO.Path]::GetFullPath($DataDir).TrimEnd('\')
$updateRoot = Join-Path $dataPath 'backups\updates'
$marker = Join-Path $updateRoot 'active-backup.txt'
if (-not (Test-Path -LiteralPath $marker)) {
  throw 'No existe un punto de recuperación activo.'
}
$point = [System.IO.Path]::GetFullPath((Get-Content -LiteralPath $marker -Raw).Trim())
if (-not $point.StartsWith(($updateRoot.TrimEnd('\') + '\'), [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'El punto de recuperación está fuera del directorio de respaldos.'
}
if (-not (Test-Path -LiteralPath $point)) {
  throw 'El punto de recuperación no está disponible.'
}
if ($installPath -eq [System.IO.Path]::GetPathRoot($installPath).TrimEnd('\')) {
  throw 'La carpeta de instalación no puede ser la raíz de una unidad.'
}

foreach ($path in @($installPath, $updateRoot, $point)) {
  $current = $path
  while ($current) {
    if ((Test-Path -LiteralPath $current) -and
        ((Get-Item -LiteralPath $current -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
      throw "La ruta contiene un enlace o punto de análisis: $current"
    }
    $parent = [System.IO.Directory]::GetParent($current)
    if ($null -eq $parent) { break }
    $current = $parent.FullName
  }
}

$appBackup = Join-Path $point 'app'
if (-not (Test-Path -LiteralPath (Join-Path $appBackup 'restaurante.exe'))) {
  throw 'El respaldo del programa no contiene el ejecutable.'
}

$databaseBackup = Join-Path $point 'data\salon.sqlite'
if (-not (Test-Path -LiteralPath $databaseBackup)) {
  throw 'El respaldo no contiene la base de datos.'
}

if (-not $SkipTaskStart) {
  $task = Get-ScheduledTask -TaskName 'Restaurante POS' -ErrorAction SilentlyContinue
  if (-not $task) {
    throw 'La tarea Restaurante POS no está disponible para detener y recuperar la instalación.'
  }
  if ($task.State -eq 'Running') {
    Stop-ScheduledTask -TaskName 'Restaurante POS' -ErrorAction Stop
  }
  $deadline = (Get-Date).AddSeconds(30)
  while (Get-Process -Name 'restaurante' -ErrorAction SilentlyContinue) {
    if ((Get-Date) -ge $deadline) {
      throw 'Restaurante sigue en ejecución. No se restaurará SQLite mientras el servidor pueda escribir en la base.'
    }
    Start-Sleep -Milliseconds 250
  }
}

# La copia debe reflejar exactamente la versión anterior. Un archivo nuevo,
# como una migración fallida, impediría que el servidor restaurado arrancara.
# /IS fuerza la copia incluso si tamaño y fecha coinciden pero el contenido no.
New-Item -ItemType Directory -Force -Path $installPath | Out-Null
$null = & robocopy.exe $appBackup $installPath /MIR /IS /XJ /R:1 /W:1 /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -ge 8) {
  throw "No se pudo restaurar el programa (Robocopy: $LASTEXITCODE)."
}

$database = Join-Path $dataPath 'data\salon.sqlite'
New-Item -ItemType Directory -Force -Path (Split-Path $database) | Out-Null
foreach ($suffix in @('-wal', '-shm')) {
  $sidecar = $database + $suffix
  if (Test-Path -LiteralPath $sidecar) {
    Remove-Item -LiteralPath $sidecar -Force
  }
}
Copy-Item -LiteralPath $databaseBackup -Destination $database -Force
foreach ($suffix in @('-wal', '-shm')) {
  $source = $databaseBackup + $suffix
  if (Test-Path -LiteralPath $source) {
    Copy-Item -LiteralPath $source -Destination ($database + $suffix) -Force
  }
}

if (-not $SkipTaskStart) {
  Start-ScheduledTask -TaskName 'Restaurante POS'
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 1
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/salud' -TimeoutSec 2
      if ($health.ok -eq $true -and $health.runtime -eq 'go') {
        $ready = $true
        break
      }
    } catch {
      # La versión restaurada puede estar iniciando.
    }
  }
  if (-not $ready) {
    throw 'La versión restaurada no volvió a responder en 127.0.0.1:8080.'
  }
}

Write-Output $point
