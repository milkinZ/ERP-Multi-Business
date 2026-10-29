$ErrorActionPreference = 'Stop'

$apiRoot = Split-Path -Parent $PSScriptRoot
$localEnvFile = Join-Path $apiRoot '.env.keycloak.local'
$appEnvFile = Join-Path $apiRoot '.env'
if (-not (Test-Path -LiteralPath $localEnvFile)) {
  throw 'Run scripts/setup-keycloak-local.ps1 before provisioning the local identity.'
}
if (-not (Test-Path -LiteralPath $appEnvFile)) {
  throw 'apps/api/.env is required for local development identity provisioning.'
}

$localSettings = @{}
foreach ($line in Get-Content -LiteralPath $localEnvFile) {
  if ($line -match '^([A-Z0-9_]+)=(.*)$') {
    $localSettings[$matches[1]] = $matches[2]
  }
}
$databaseLine = Get-Content -LiteralPath $appEnvFile |
  Where-Object { $_ -match '^DATABASE_URL=' } |
  Select-Object -First 1
if (-not $databaseLine) {
  throw 'apps/api/.env must define DATABASE_URL.'
}
$databaseUrl = $databaseLine.Substring('DATABASE_URL='.Length).Trim().Trim('"').Trim("'")
try {
  $database = [Uri]$databaseUrl
}
catch {
  throw 'The local DATABASE_URL is invalid.'
}
if (
  $database.Scheme -notin @('postgres', 'postgresql') -or
  $database.Host -notin @('localhost', '127.0.0.1', '::1') -or
  $database.AbsolutePath.Trim('/') -ne 'cafe_os'
) {
  throw 'Refusing identity provisioning unless DATABASE_URL targets local PostgreSQL cafe_os.'
}

$issuer = $localSettings['PLATFORM_OIDC_ISSUER']
$adminToken = Invoke-RestMethod `
  -Method Post `
  -Uri 'http://localhost:8180/realms/master/protocol/openid-connect/token' `
  -ContentType 'application/x-www-form-urlencoded' `
  -Body @{
    grant_type = 'password'
    client_id  = 'admin-cli'
    username   = $localSettings['KC_BOOTSTRAP_ADMIN_USERNAME']
    password   = $localSettings['KC_BOOTSTRAP_ADMIN_PASSWORD']
  }
$headers = @{ Authorization = "Bearer $($adminToken.access_token)" }
$users = Invoke-RestMethod `
  -Uri 'http://localhost:8180/admin/realms/erp-platform-dev/users?username=sec004-local-test&exact=true' `
  -Headers $headers
$user = @($users | Where-Object { $_.username -eq 'sec004-local-test' }) |
  Select-Object -First 1
if (-not $user -or -not $user.enabled -or -not $user.id) {
  throw 'The enabled local Keycloak test identity could not be verified.'
}

$env:NODE_ENV = 'development'
$env:SEC004_LOCAL_ISSUER = $issuer
$env:SEC004_LOCAL_SUBJECT = $user.id
Push-Location $apiRoot
try {
  @'
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env' });
const database = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) || database.pathname !== '/cafe_os') {
  throw new Error('Refusing to provision a non-local cafe_os database');
}
const issuer = process.env.SEC004_LOCAL_ISSUER;
const subject = process.env.SEC004_LOCAL_SUBJECT;
if (issuer !== 'http://localhost:8180/realms/erp-platform-dev' || !subject) {
  throw new Error('The local Keycloak issuer and subject must be verified');
}

const prisma = new PrismaClient();
try {
  const identity = await prisma.platformIdentity.findUnique({
    where: { issuer_subject: { issuer, subject } },
    select: { id: true, role: true, disabledAt: true },
  });
  if (identity) {
    if (identity.role !== 'READ_ONLY' || identity.disabledAt) {
      throw new Error('Existing local test identity is not active READ_ONLY; refusing to change it');
    }
    console.log('LOCAL_PLATFORM_IDENTITY=EXISTS_READ_ONLY');
  } else {
    await prisma.platformIdentity.create({
      data: {
        issuer,
        subject,
        role: 'READ_ONLY',
        email: 'sec004-local-test@localhost',
      },
    });
    console.log('LOCAL_PLATFORM_IDENTITY=CREATED_READ_ONLY');
  }
} finally {
  await prisma.$disconnect();
}
'@ | node --input-type=module
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to provision the verified local READ_ONLY platform identity.'
  }
}
finally {
  Pop-Location
}
