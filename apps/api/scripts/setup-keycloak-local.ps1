$ErrorActionPreference = 'Stop'

$apiRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $apiRoot 'docker-compose.keycloak.local.yml'
$realmFile = Join-Path $apiRoot 'src\modules\auth\platform-keycloak.local-realm.json'
$localEnvFile = Join-Path $apiRoot '.env.keycloak.local'
$issuer = 'http://localhost:8180/realms/erp-platform-dev'
$clientId = 'erp-platform-api-local'
$callbackUrl = 'http://localhost:9867/auth/platform/oidc/callback'
$frontendCallbackUrl = 'http://localhost:3001/platform/auth/callback'
$acr = 'urn:erp-multi-business:acr:phishing-resistant-webauthn'

function New-LocalSecret {
  return [Convert]::ToHexString(
    [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
  )
}

function Get-LocalSettings {
  $settings = @{}
  if (Test-Path -LiteralPath $localEnvFile) {
    foreach ($line in Get-Content -LiteralPath $localEnvFile) {
      if ($line -match '^([A-Z0-9_]+)=(.*)$') {
        $settings[$matches[1]] = $matches[2]
      }
    }
  }
  return $settings
}

function Save-LocalSettings([hashtable]$settings) {
  $lines = foreach ($key in $settings.Keys | Sort-Object) {
    "$key=$($settings[$key])"
  }
  Set-Content -LiteralPath $localEnvFile -Value $lines -Encoding ascii
}

function Invoke-KeycloakAdmin(
  [string]$method,
  [string]$path,
  [object]$body = $null
) {
  $params = @{
    Method      = $method
    Uri         = "http://localhost:8180/admin/$path"
    Headers     = $script:adminHeaders
    ErrorAction = 'Stop'
  }
  if ($null -ne $body) {
    $params.ContentType = 'application/json'
    $params.Body = $body | ConvertTo-Json -Depth 20
  }
  $response = Invoke-RestMethod @params
  if ($null -eq $response) {
    return $null
  }
  return ConvertTo-Json -InputObject $response -Depth 20 |
    ConvertFrom-Json -AsHashtable
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker CLI is required to configure local Keycloak.'
}
docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Engine is unavailable.'
}
$legacyContainer = docker ps --filter 'name=^/erp-sec004-keycloak-local$' --format '{{.Names}}'
if ($legacyContainer) {
  throw 'A prior local Keycloak container is using port 8180. Stop it with "docker stop erp-sec004-keycloak-local" first; this preserves its container and data.'
}

$settings = Get-LocalSettings
foreach ($key in @(
  'KC_BOOTSTRAP_ADMIN_USERNAME',
  'KC_BOOTSTRAP_ADMIN_PASSWORD',
  'PLATFORM_OIDC_CLIENT_SECRET',
  'PLATFORM_OIDC_STATE_HMAC_SECRET',
  'SEC004_LOCAL_TEST_PASSWORD'
)) {
  if (-not $settings.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($settings[$key])) {
    $settings[$key] = New-LocalSecret
  }
}
$settings['KC_BOOTSTRAP_ADMIN_USERNAME'] = 'admin'
$settings['PLATFORM_OIDC_ISSUER'] = $issuer
$settings['PLATFORM_OIDC_CLIENT_ID'] = $clientId
$settings['PLATFORM_OIDC_CALLBACK_URL'] = $callbackUrl
$settings['PLATFORM_OIDC_FRONTEND_CALLBACK_URL'] = $frontendCallbackUrl
$settings['PLATFORM_OIDC_ALLOWED_ACR_VALUES'] = $acr
$settings['KEYCLOAK_TEST_ISSUER'] = $issuer
$settings['KEYCLOAK_TEST_ADMIN_USERNAME'] = $settings['KC_BOOTSTRAP_ADMIN_USERNAME']
$settings['KEYCLOAK_TEST_ADMIN_PASSWORD'] = $settings['KC_BOOTSTRAP_ADMIN_PASSWORD']
Save-LocalSettings $settings

docker compose --env-file $localEnvFile -f $composeFile up -d
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Compose failed to start local Keycloak.'
}

$deadline = (Get-Date).AddMinutes(4)
$ready = $false
do {
  try {
    $metadata = Invoke-RestMethod `
      -Uri "$issuer/.well-known/openid-configuration" `
      -TimeoutSec 5
    if ($metadata.issuer -ne $issuer) {
      throw "Unexpected local Keycloak issuer: $($metadata.issuer)"
    }
    $ready = $true
  }
  catch {
    Start-Sleep -Seconds 3
  }
} while (-not $ready -and (Get-Date) -lt $deadline)
if (-not $ready) {
  docker compose --env-file $localEnvFile -f $composeFile logs --tail 80
  throw 'Local Keycloak did not become ready within four minutes.'
}

$adminToken = Invoke-RestMethod `
  -Method Post `
  -Uri 'http://localhost:8180/realms/master/protocol/openid-connect/token' `
  -ContentType 'application/x-www-form-urlencoded' `
  -Body @{
    grant_type = 'password'
    client_id  = 'admin-cli'
    username   = $settings['KC_BOOTSTRAP_ADMIN_USERNAME']
    password   = $settings['KC_BOOTSTRAP_ADMIN_PASSWORD']
  }
$script:adminHeaders = @{ Authorization = "Bearer $($adminToken.access_token)" }
$realmPath = 'realms/erp-platform-dev'
$localBrowserFlowAlias = 'ERP Platform Browser Local SEC-004'
$loaFlowSuffix = 'Browser - Conditional 2FA'
$loaMapping = "{`"$acr`":`"2`"}"
$realm = $null
try {
  $realm = Invoke-KeycloakAdmin 'GET' $realmPath
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -ne 404) {
    throw
  }
}
if (-not $realm) {
  Invoke-KeycloakAdmin 'POST' 'realms' (Get-Content -Raw -LiteralPath $realmFile | ConvertFrom-Json)
  $realm = Invoke-KeycloakAdmin 'GET' $realmPath
}

$clientCollection = Invoke-KeycloakAdmin 'GET' "$realmPath/clients?clientId=$clientId"
$client = @($clientCollection | Where-Object { $_.clientId -eq $clientId }) | Select-Object -First 1
if (-not $client) {
  $client = @{
    clientId                  = $clientId
    name                      = 'ERP platform local development'
    enabled                   = $true
    protocol                  = 'openid-connect'
    publicClient              = $false
    secret                    = $settings['PLATFORM_OIDC_CLIENT_SECRET']
    standardFlowEnabled       = $true
    directAccessGrantsEnabled = $false
    serviceAccountsEnabled    = $false
    redirectUris              = @($callbackUrl)
    webOrigins                = @('http://localhost:3001')
    attributes                = @{ 'pkce.code.challenge.method' = 'S256' }
  }
  Invoke-KeycloakAdmin 'POST' $realmPath/clients $client
}
else {
  if (-not $client.attributes) {
    $client.attributes = @{}
  }
  $client.secret = $settings['PLATFORM_OIDC_CLIENT_SECRET']
  $client.standardFlowEnabled = $true
  $client.directAccessGrantsEnabled = $false
  $client.serviceAccountsEnabled = $false
  $client.redirectUris = @($callbackUrl)
  $client.webOrigins = @('http://localhost:3001')
  $client.attributes['pkce.code.challenge.method'] = 'S256'
  Invoke-KeycloakAdmin 'PUT' "$realmPath/clients/$($client.id)" $client
}

$flowCollection = Invoke-KeycloakAdmin 'GET' "$realmPath/authentication/flows"
$localBrowserFlow = @($flowCollection | Where-Object {
  $_.alias -eq $localBrowserFlowAlias
}) | Select-Object -First 1
if (-not $localBrowserFlow) {
  Invoke-KeycloakAdmin 'POST' "$realmPath/authentication/flows/browser/copy" @{
    newName = $localBrowserFlowAlias
  }
  $flowCollection = Invoke-KeycloakAdmin 'GET' "$realmPath/authentication/flows"
  $localBrowserFlow = @($flowCollection | Where-Object {
    $_.alias -eq $localBrowserFlowAlias
  }) | Select-Object -First 1
}
if (-not $localBrowserFlow) {
  throw 'The editable local browser authentication flow could not be created.'
}

$browserExecutions = Invoke-KeycloakAdmin 'GET' "$realmPath/authentication/flows/$([uri]::EscapeDataString($localBrowserFlowAlias))/executions"
$loaSubflowExecution = @($browserExecutions | Where-Object {
  $_.flowId -and $_.displayName -like "*$loaFlowSuffix"
}) | Select-Object -First 1
if (-not $loaSubflowExecution) {
  throw 'The copied browser flow does not contain its conditional 2FA subflow.'
}
$loaFlow = Invoke-KeycloakAdmin 'GET' "$realmPath/authentication/flows/$($loaSubflowExecution.flowId)"
$loaFlowAlias = $loaFlow.alias
$loaFlowPath = "$realmPath/authentication/flows/$([uri]::EscapeDataString($loaFlowAlias))"

$loaExecutions = Invoke-KeycloakAdmin 'GET' "$loaFlowPath/executions"
$loaCondition = @($loaExecutions | Where-Object {
  $_.providerId -eq 'conditional-level-of-authentication'
}) | Select-Object -First 1
if (-not $loaCondition) {
  Invoke-KeycloakAdmin 'POST' "$loaFlowPath/executions/execution" @{
    provider = 'conditional-level-of-authentication'
    priority = 15
  }
  $loaExecutions = Invoke-KeycloakAdmin 'GET' "$loaFlowPath/executions"
  $loaCondition = @($loaExecutions | Where-Object {
    $_.providerId -eq 'conditional-level-of-authentication'
  }) | Select-Object -First 1
}
if (-not $loaCondition) {
  throw 'The LoA 2 condition execution could not be added.'
}
Invoke-KeycloakAdmin 'POST' "$realmPath/authentication/executions/$($loaCondition.id)/config" @{
  alias  = 'SEC004 local WebAuthn LoA 2'
  config = @{
    'loa-condition-level' = '2'
    'loa-max-age'         = '0'
  }
}
$loaExecutions = Invoke-KeycloakAdmin 'GET' "$loaFlowPath/executions"
foreach ($execution in $loaExecutions) {
  $requirement = switch ($execution.providerId) {
    'conditional-level-of-authentication' { 'REQUIRED' }
    'webauthn-authenticator' { 'REQUIRED' }
    'auth-otp-form' { 'DISABLED' }
    'auth-recovery-authn-code-form' { 'DISABLED' }
    default { $execution.requirement }
  }
  $priority = if ($execution.providerId -eq 'conditional-level-of-authentication') {
    15
  } else {
    $execution.priority
  }
  if ($execution.requirement -ne $requirement -or $execution.priority -ne $priority) {
    Invoke-KeycloakAdmin 'PUT' "$loaFlowPath/executions" @{
      id          = $execution.id
      requirement = $requirement
      priority    = $priority
    }
  }
}

$realm = Invoke-KeycloakAdmin 'GET' $realmPath
$realm.attributes['acr.loa.map'] = $loaMapping
$realm.browserFlow = $localBrowserFlowAlias
Invoke-KeycloakAdmin 'PUT' $realmPath $realm

$users = Invoke-KeycloakAdmin 'GET' "$realmPath/users?username=sec004-local-test&exact=true"
$user = @($users | Where-Object { $_.username -eq 'sec004-local-test' }) |
  Select-Object -First 1
if (-not $user) {
  Invoke-KeycloakAdmin 'POST' "$realmPath/users" @{
    username        = 'sec004-local-test'
    enabled         = $true
    email           = 'sec004-local-test@localhost'
    emailVerified   = $true
    firstName       = 'SEC004'
    lastName        = 'Local Test'
    requiredActions = @('webauthn-register')
  }
  $users = Invoke-KeycloakAdmin 'GET' "$realmPath/users?username=sec004-local-test&exact=true"
  $user = @($users | Where-Object { $_.username -eq 'sec004-local-test' }) |
    Select-Object -First 1
}
if (-not $user) {
  throw 'The local Keycloak test user could not be created.'
}
$credentials = Invoke-KeycloakAdmin 'GET' "$realmPath/users/$($user.id)/credentials"
if (@($credentials | Where-Object { $_.type -eq 'webauthn' }).Count -eq 0) {
  $user.requiredActions = @('webauthn-register')
  Invoke-KeycloakAdmin 'PUT' "$realmPath/users/$($user.id)" $user
}
Invoke-KeycloakAdmin 'PUT' "$realmPath/users/$($user.id)/reset-password" @{
  type      = 'password'
  value     = $settings['SEC004_LOCAL_TEST_PASSWORD']
  temporary = $false
}

$verifiedExecutions = Invoke-KeycloakAdmin 'GET' "$loaFlowPath/executions"
$verifiedWebAuthn = @($verifiedExecutions | Where-Object {
  $_.providerId -eq 'webauthn-authenticator'
}) | Select-Object -First 1
$verifiedLoaCondition = @($verifiedExecutions | Where-Object {
  $_.providerId -eq 'conditional-level-of-authentication'
}) | Select-Object -First 1
$verifiedRealm = Invoke-KeycloakAdmin 'GET' $realmPath
if (
  $verifiedWebAuthn.requirement -ne 'REQUIRED' -or
  $verifiedLoaCondition.requirement -ne 'REQUIRED' -or
  $verifiedRealm.browserFlow -ne $localBrowserFlowAlias -or
  $verifiedRealm.webAuthnPolicyUserVerificationRequirement -ne 'required' -or
  $verifiedRealm.attributes.'acr.loa.map' -ne $loaMapping
) {
  throw 'Local Keycloak WebAuthn/ACR policy verification failed.'
}

& (Join-Path $PSScriptRoot 'provision-keycloak-local-identity.ps1')

Write-Output "Local Keycloak ready: $issuer"
Write-Output "Client, test user and development credentials are stored in $localEnvFile (ignored by Git)."
Write-Output 'First sign-in requires registering a passkey for sec004-local-test.'
