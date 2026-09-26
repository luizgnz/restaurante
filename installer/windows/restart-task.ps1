$ErrorActionPreference = 'Stop'
$taskName = 'Restaurante POS'
$logPath = 'C:\ProgramData\Restaurante\logs\restart.log'

try {
  # Deja que la respuesta HTTP llegue al navegador antes de detener el servidor.
  Start-Sleep -Seconds 2
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
  if ($task.State -eq 'Running') {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop
  }
  Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
  Add-Content -LiteralPath $logPath -Value ((Get-Date -Format s) + ' Reinicio solicitado desde Opciones')
} catch {
  Add-Content -LiteralPath $logPath -Value ((Get-Date -Format s) + ' ERROR: ' + $_.Exception.Message)
  throw
}
