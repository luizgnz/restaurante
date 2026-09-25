param(
  [Parameter(Mandatory = $true)][string]$InstallDir,
  [Parameter(Mandatory = $true)][string]$DataDir
)

$ErrorActionPreference = 'Stop'
$executable = Join-Path $InstallDir 'restaurante.exe'
$logDir = Join-Path $DataDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir 'server.log'
$taskLog = Join-Path $logDir 'install-task.log'
$arguments = '-no-browser -listen 0.0.0.0:8080 -ui-dir "{0}" -migrations-dir "{1}" -data-dir "{2}" -log-file "{3}"' -f (Join-Path $InstallDir 'ui'), (Join-Path $InstallDir 'migrations'), $DataDir, $logPath
try {
  $action = New-ScheduledTaskAction -Execute $executable -Argument $arguments
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName 'Restaurante POS' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Start-ScheduledTask -TaskName 'Restaurante POS'

  $url = 'http://127.0.0.1:8080/api/salud'
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 1
    try {
      $response = Invoke-RestMethod -Uri $url -TimeoutSec 2 -UseBasicParsing
      if ($response.ok -eq $true -and $response.runtime -eq 'go') {
        exit 0
      }
    } catch {
      # El servicio aún puede estar iniciando o aplicando migraciones.
    }
  }
  $taskInfo = Get-ScheduledTaskInfo -TaskName 'Restaurante POS' -ErrorAction SilentlyContinue
  $lastResult = if ($taskInfo) { $taskInfo.LastTaskResult } else { 'sin información' }
  throw "El servidor no respondió en $url. Resultado de la tarea: $lastResult. Revise $logPath"
} catch {
  Add-Content -LiteralPath $taskLog -Value ((Get-Date -Format s) + ' ' + $_.Exception.Message)
  throw
}
