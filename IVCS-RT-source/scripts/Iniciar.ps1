$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$nodePath = Join-Path $appRoot 'runtime\node.exe'
$serverPath = Join-Path $appRoot 'server.cjs'
$pidFile = Join-Path $appRoot 'runtime\server.pid'
$env:PORT = '3210'
if (Test-Path -LiteralPath $pidFile) {
  $serverProcess = Get-Process -Id ([int](Get-Content -LiteralPath $pidFile)) -ErrorAction SilentlyContinue
  if ($serverProcess -and $serverProcess.Path -eq $nodePath) { Start-Process 'http://127.0.0.1:3210/'; exit }
}
$listener = Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue
if ($listener) { throw 'El puerto 3210 está ocupado. Cierre la otra copia de IVCS RT antes de iniciar.' }
$process = Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverPath + '"') -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $appRoot 'runtime\server.log') -RedirectStandardError (Join-Path $appRoot 'runtime\error.log')
Set-Content -LiteralPath $pidFile -Value $process.Id
for ($attempt=0; $attempt -lt 40; $attempt++) {
  try { $null = Invoke-WebRequest 'http://127.0.0.1:3210/api/library' -UseBasicParsing; Start-Process 'http://127.0.0.1:3210/'; exit } catch { Start-Sleep -Milliseconds 250 }
}
throw 'No se pudo iniciar. Revise runtime\error.log.'
