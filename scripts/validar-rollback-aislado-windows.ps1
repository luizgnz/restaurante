param(
  [string]$StageDir = (Join-Path $PSScriptRoot '..\installer\windows\stage')
)

$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stage = [System.IO.Path]::GetFullPath($StageDir)
$exeSource = Join-Path $stage 'restaurante.exe'
if (-not (Test-Path -LiteralPath $exeSource)) {
  throw "Compile primero el paquete Windows: falta $exeSource"
}

$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
$root = Join-Path $tempBase ('Restaurante-Rollback-Aislado-' + [guid]::NewGuid().ToString('N'))
$root = [System.IO.Path]::GetFullPath($root)
if (-not $root.StartsWith(($tempBase + '\'), [System.StringComparison]::OrdinalIgnoreCase) -or
    -not ([System.IO.Path]::GetFileName($root) -like 'Restaurante-Rollback-Aislado-*')) {
  throw 'La carpeta temporal calculada no es segura.'
}

$app = Join-Path $root 'app'
$data = Join-Path $root 'data'
$log = Join-Path $root 'verify.log'
$database = Join-Path $data 'data\salon.sqlite'
$migrationApplied = '030_ci_rollback_probe.sql'
$migrationFault = '031_fault_probe.sql'
$probePath = Join-Path $root 'check-rollback.go'

try {
  New-Item -ItemType Directory -Path $app, $data -Force | Out-Null
  Copy-Item -Path (Join-Path $stage '*') -Destination $app -Recurse -Force
  $exe = Join-Path $app 'restaurante.exe'
  $ui = Join-Path $app 'ui'
  $migrations = Join-Path $app 'migrations'
  $index = Join-Path $ui 'index.html'

  & $exe -verify-install -ui-dir $ui -migrations-dir $migrations -data-dir $data -log-file $log
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $database)) {
    throw 'La instalación aislada inicial no pasó la validación.'
  }
  $databaseHash = (Get-FileHash -LiteralPath $database -Algorithm SHA256).Hash
  $indexHash = (Get-FileHash -LiteralPath $index -Algorithm SHA256).Hash

  $prepare = Join-Path $repo 'installer\windows\prepare-update.ps1'
  # El servidor instalado puede estar activo; el respaldo aislado usa otra base.
  & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $prepare -InstallDir $app -DataDir $data -SkipRunningServerCheck | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el respaldo aislado.' }

  Set-Content -LiteralPath (Join-Path $migrations $migrationApplied) -Value 'CREATE TABLE ci_rollback_probe (id INTEGER PRIMARY KEY);' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $migrations $migrationFault) -Value 'SQL ERROR FOR ROLLBACK PROBE;' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $app 'update-only.txt') -Value 'archivo exclusivo de la actualización fallida' -Encoding utf8
  Set-Content -LiteralPath $index -Value 'interfaz alterada para la prueba' -Encoding utf8

  & $exe -verify-install -ui-dir $ui -migrations-dir $migrations -data-dir $data -log-file $log
  if ($LASTEXITCODE -eq 0) { throw 'La migración inválida no provocó el fallo esperado.' }

  $probeSource = @'
package main

import (
  "database/sql"
  "fmt"
  "net/url"
  "os"
  "path/filepath"
  _ "modernc.org/sqlite"
)

func main() {
  path := filepath.ToSlash(os.Args[1])
  if len(path) > 1 && path[1] == ':' { path = "/" + path }
  dsn := (&url.URL{Scheme: "file", Path: path, RawQuery: "mode=ro"}).String()
  db, err := sql.Open("sqlite", dsn)
  if err != nil { panic(err) }
  defer db.Close()
  expected := 0
  if os.Args[2] == "present" { expected = 1 }
  checks := []string{
    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='ci_rollback_probe'",
    "SELECT count(*) FROM schema_migrations WHERE id='030_ci_rollback_probe'",
  }
  for _, query := range checks {
    var count int
    if err := db.QueryRow(query).Scan(&count); err != nil { panic(err) }
    if count != expected { panic(fmt.Sprintf("resultado %d; se esperaba %d para %s", count, expected, query)) }
  }
}
'@
  Set-Content -LiteralPath $probePath -Value $probeSource -Encoding utf8
  & go run $probePath $database 'present'
  if ($LASTEXITCODE -ne 0) { throw 'La migración válida no quedó aplicada antes de restaurar.' }

  $rollback = Join-Path $repo 'installer\windows\rollback-update.ps1'
  & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $rollback -InstallDir $app -DataDir $data -SkipTaskStart | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'El script de restauración aislada falló.' }
  if ((Get-FileHash -LiteralPath $database -Algorithm SHA256).Hash -ne $databaseHash) {
    throw 'La restauración no recuperó la base SQLite original.'
  }
  if ((Get-FileHash -LiteralPath $index -Algorithm SHA256).Hash -ne $indexHash) {
    throw 'La restauración no recuperó la interfaz original.'
  }
  if (Test-Path -LiteralPath (Join-Path $app 'update-only.txt')) {
    throw 'La restauración dejó un archivo de la actualización fallida.'
  }
  if ((Test-Path -LiteralPath (Join-Path $migrations $migrationApplied)) -or
      (Test-Path -LiteralPath (Join-Path $migrations $migrationFault))) {
    throw 'La restauración dejó migraciones de la actualización fallida.'
  }
  & go run $probePath $database 'absent'
  if ($LASTEXITCODE -ne 0) { throw 'La base SQLite conserva la migración de prueba.' }
  & $exe -verify-install -ui-dir $ui -migrations-dir $migrations -data-dir $data -log-file $log
  if ($LASTEXITCODE -ne 0) { throw 'La instalación restaurada no pasó la validación final.' }

  Write-Output 'Rollback aislado correcto: migración parcial eliminada, SQLite e interfaz restauradas y validación final exitosa.'
} finally {
  if (Test-Path -LiteralPath $root) {
    $resolved = [System.IO.Path]::GetFullPath($root)
    if ($resolved.StartsWith(($tempBase + '\'), [System.StringComparison]::OrdinalIgnoreCase) -and
        ([System.IO.Path]::GetFileName($resolved) -like 'Restaurante-Rollback-Aislado-*')) {
      Remove-Item -LiteralPath $resolved -Recurse -Force
    }
  }
}
