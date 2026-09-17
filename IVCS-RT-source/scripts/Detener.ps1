$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'runtime\server.pid'
$nodePath = Join-Path $PSScriptRoot 'runtime\node.exe'
if (Test-Path -LiteralPath $pidFile) {
  $serverProcess = Get-Process -Id ([int](Get-Content -LiteralPath $pidFile)) -ErrorAction SilentlyContinue
  if ($serverProcess -and $serverProcess.Path -eq $nodePath) { Stop-Process -Id $serverProcess.Id }
  Remove-Item -LiteralPath $pidFile
}
