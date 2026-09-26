param(
  [Parameter(Mandatory = $true)][ValidateSet('Install', 'Remove')][string]$Mode,
  [string]$InstallDir
)

$ErrorActionPreference = 'Stop'
$ruleName = 'Restaurante-POS-LAN-TCP-8080-7BB84683'

if ($Mode -eq 'Remove') {
  $rule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
  if ($rule) { $rule | Remove-NetFirewallRule -ErrorAction Stop }
  exit 0
}

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
  throw 'Indique la carpeta de instalación de Restaurante.'
}
$executable = Join-Path ([System.IO.Path]::GetFullPath($InstallDir)) 'restaurante.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  throw "No se encontró el servidor instalado: $executable"
}

# El puerto local no depende de la dirección DHCP del servidor. La regla solo
# permite clientes en la subred local mientras el perfil de Windows sea Privado.
$rule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if ($rule) { $rule | Remove-NetFirewallRule -ErrorAction Stop }
New-NetFirewallRule -Name $ruleName -DisplayName 'Restaurante POS (LAN, TCP 8080)' `
  -Description 'Permite Restaurante solo desde la subred local en redes privadas.' `
  -Direction Inbound -Action Allow -Enabled True -Profile Private `
  -Protocol TCP -LocalPort 8080 -RemoteAddress LocalSubnet -Program $executable `
  -EdgeTraversalPolicy Block -ErrorAction Stop | Out-Null
