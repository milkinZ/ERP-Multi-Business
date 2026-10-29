$ErrorActionPreference = 'Stop'

$apiRoot = Split-Path -Parent $PSScriptRoot
$localEnvFile = Join-Path $apiRoot '.env.keycloak.local'
if (-not (Test-Path -LiteralPath $localEnvFile)) {
  throw 'Run scripts/setup-keycloak-local.ps1 before the Keycloak integration test.'
}

foreach ($line in Get-Content -LiteralPath $localEnvFile) {
  if ($line -match '^([A-Z0-9_]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
  }
}

Push-Location $apiRoot
try {
  npm run test:integration -- --runInBand src/modules/auth/platform-keycloak.int-spec.ts
  if ($LASTEXITCODE -ne 0) {
    throw 'The local Keycloak integration test failed.'
  }
}
finally {
  Pop-Location
}
