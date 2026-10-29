$ErrorActionPreference = 'Stop'

$apiRoot = Split-Path -Parent $PSScriptRoot
$localEnvFile = Join-Path $apiRoot '.env.keycloak.local'
if (-not (Test-Path -LiteralPath $localEnvFile)) {
  throw 'Run scripts/setup-keycloak-local.ps1 before starting the API.'
}

foreach ($line in Get-Content -LiteralPath $localEnvFile) {
  if ($line -match '^([A-Z0-9_]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
  }
}
$env:NODE_ENV = 'development'

Push-Location $apiRoot
try {
  npm run start:dev
  if ($LASTEXITCODE -ne 0) {
    throw 'The API did not start with the local Keycloak development configuration.'
  }
}
finally {
  Pop-Location
}
