$ErrorActionPreference = 'Stop'
$taskName = 'Restaurante POS'
$logPath = 'C:\ProgramData\Restaurante\logs\restart.log'

try {
  # Deja que la respuesta HTTP llegue al navegador antes de detener el servidor.
  Start-Sleep -Seconds 2
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
  if ($task.State -eq 'Running') {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop
    $stopped = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      if ((Get-ScheduledTask -TaskName $taskName -ErrorAction Stop).State -ne 'Running') {
        $stopped = $true
        break
      }
      Start-Sleep -Milliseconds 500
    }
    if (-not $stopped) {
      throw 'La tarea del servidor no se detuvo dentro de 15 segundos'
    }
  }
  Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
  Add-Content -LiteralPath $logPath -Value ((Get-Date -Format s) + ' Reinicio solicitado desde Opciones')
} catch {
  Add-Content -LiteralPath $logPath -Value ((Get-Date -Format s) + ' ERROR: ' + $_.Exception.Message)
  throw
}
