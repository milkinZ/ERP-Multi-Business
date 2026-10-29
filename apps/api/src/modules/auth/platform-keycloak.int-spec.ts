const issuer = process.env.KEYCLOAK_TEST_ISSUER;
const keycloakDescribe = issuer ? describe : describe.skip;
const adminUsername = process.env.KEYCLOAK_TEST_ADMIN_USERNAME;
const adminPassword = process.env.KEYCLOAK_TEST_ADMIN_PASSWORD;
const keycloakPolicyDescribe =
  issuer && adminUsername && adminPassword ? describe : describe.skip;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordArray(
  value: unknown,
  errorMessage: string,
): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new Error(errorMessage);
  }
  return value.filter(isRecord);
}

keycloakDescribe('Keycloak OIDC provider integration', () => {
  it('serves authorization-code and S256 PKCE metadata for its realm', async () => {
    const issuerUrl = new URL(issuer!);
    const loopbackHosts = ['localhost', '127.0.0.1', '[::1]'];
    if (
      issuerUrl.username ||
      issuerUrl.password ||
      issuerUrl.search ||
      issuerUrl.hash
    ) {
      throw new Error(
        'Keycloak test issuer must not contain credentials or query',
      );
    }
    if (
      issuerUrl.protocol === 'http:' &&
      !loopbackHosts.includes(issuerUrl.hostname)
    ) {
      throw new Error('Insecure Keycloak test issuer must use a loopback host');
    }

    const discoveryUrl = new URL(
      `${issuerUrl.pathname.replace(/\/+$/, '')}/.well-known/openid-configuration`,
      issuerUrl.origin,
    );
    const response = await fetch(discoveryUrl, {
      signal: AbortSignal.timeout(10_000),
    });
    expect(response.status).toBe(200);

    const metadata: unknown = await response.json();
    if (!isRecord(metadata)) {
      throw new Error('Keycloak discovery response must be an object');
    }

    expect(metadata.issuer).toBe(issuer);
    for (const endpoint of [
      'authorization_endpoint',
      'token_endpoint',
      'jwks_uri',
    ]) {
      expect(typeof metadata[endpoint]).toBe('string');
    }

    const responseTypes = metadata.response_types_supported;
    const challengeMethods = metadata.code_challenge_methods_supported;
    if (!Array.isArray(responseTypes) || !Array.isArray(challengeMethods)) {
      throw new Error('Keycloak discovery metadata is missing protocol arrays');
    }
    expect(responseTypes).toContain('code');
    expect(challengeMethods).toContain('S256');
  });
});

keycloakPolicyDescribe('Keycloak local phishing-resistant MFA policy', () => {
  it('requires verified WebAuthn and maps the development ACR to LoA 2', async () => {
    const issuerUrl = new URL(issuer!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(issuerUrl.hostname)) {
      throw new Error(
        'Keycloak policy tests may only access a loopback issuer',
      );
    }

    const tokenResponse = await fetch(
      new URL('/realms/master/protocol/openid-connect/token', issuerUrl.origin),
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: 'admin-cli',
          username: adminUsername!,
          password: adminPassword!,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    expect(tokenResponse.status).toBe(200);
    const tokenBody: unknown = await tokenResponse.json();
    if (!isRecord(tokenBody) || typeof tokenBody.access_token !== 'string') {
      throw new Error('Keycloak admin token response is invalid');
    }

    const adminHeaders = {
      authorization: `Bearer ${tokenBody.access_token}`,
    };
    const realmName = issuerUrl.pathname.split('/').filter(Boolean).at(-1);
    if (!realmName) {
      throw new Error('Keycloak issuer must include a realm name');
    }
    const adminRealmUrl = new URL(
      `/admin/realms/${encodeURIComponent(realmName)}`,
      issuerUrl.origin,
    );
    const realmResponse = await fetch(adminRealmUrl, {
      headers: adminHeaders,
      signal: AbortSignal.timeout(10_000),
    });
    expect(realmResponse.status).toBe(200);
    const realmBody: unknown = await realmResponse.json();
    if (!isRecord(realmBody) || typeof realmBody.browserFlow !== 'string') {
      throw new Error('Keycloak local MFA policy response is invalid');
    }

    const activeFlowResponse = await fetch(
      new URL(
        `/admin/realms/${encodeURIComponent(realmName)}/authentication/flows/${encodeURIComponent(realmBody.browserFlow)}/executions`,
        issuerUrl.origin,
      ),
      {
        headers: adminHeaders,
        signal: AbortSignal.timeout(10_000),
      },
    );
    expect(activeFlowResponse.status).toBe(200);
    const activeFlowExecutions = recordArray(
      await activeFlowResponse.json(),
      'Keycloak active browser flow response is invalid',
    );
    const loaSubflow = activeFlowExecutions.find(
      (execution) =>
        typeof execution.displayName === 'string' &&
        execution.displayName.endsWith('Browser - Conditional 2FA') &&
        typeof execution.flowId === 'string',
    );
    if (!isRecord(loaSubflow) || typeof loaSubflow.flowId !== 'string') {
      throw new Error(
        'Active browser flow has no conditional WebAuthn subflow',
      );
    }
    const loaFlowResponse = await fetch(
      new URL(
        `/admin/realms/${encodeURIComponent(realmName)}/authentication/flows/${encodeURIComponent(loaSubflow.flowId)}`,
        issuerUrl.origin,
      ),
      {
        headers: adminHeaders,
        signal: AbortSignal.timeout(10_000),
      },
    );
    expect(loaFlowResponse.status).toBe(200);
    const loaFlowBody: unknown = await loaFlowResponse.json();
    if (!isRecord(loaFlowBody) || typeof loaFlowBody.alias !== 'string') {
      throw new Error('Keycloak LoA flow response is invalid');
    }
    const loaExecutionsResponse = await fetch(
      new URL(
        `/admin/realms/${encodeURIComponent(realmName)}/authentication/flows/${encodeURIComponent(loaFlowBody.alias)}/executions`,
        issuerUrl.origin,
      ),
      {
        headers: adminHeaders,
        signal: AbortSignal.timeout(10_000),
      },
    );
    expect(loaExecutionsResponse.status).toBe(200);
    const loaExecutions = recordArray(
      await loaExecutionsResponse.json(),
      'Keycloak LoA flow executions are invalid',
    );

    const expectedAcr =
      'urn:erp-multi-business:acr:phishing-resistant-webauthn';
    const acrMappingValue = isRecord(realmBody.attributes)
      ? realmBody.attributes['acr.loa.map']
      : undefined;
    if (typeof acrMappingValue !== 'string') {
      throw new Error('Keycloak ACR mapping is missing');
    }
    const parsedAcrMapping: unknown = JSON.parse(acrMappingValue) as unknown;
    if (!isRecord(parsedAcrMapping)) {
      throw new Error('Keycloak ACR mapping must be an object');
    }
    const acrMapping = parsedAcrMapping;
    const webauthn = loaExecutions.find(
      (execution) => execution.providerId === 'webauthn-authenticator',
    );
    const otp = loaExecutions.find(
      (execution) => execution.providerId === 'auth-otp-form',
    );
    const loaCondition = loaExecutions.find(
      (execution) =>
        execution.providerId === 'conditional-level-of-authentication',
    );

    expect(realmBody.browserFlow).toBe('ERP Platform Browser Local SEC-004');
    expect(realmBody.webAuthnPolicyRpId).toBe('localhost');
    expect(realmBody.webAuthnPolicyAuthenticatorAttachment).toBe('platform');
    expect(realmBody.webAuthnPolicyUserVerificationRequirement).toBe(
      'required',
    );
    expect(acrMapping[expectedAcr]).toBe('2');
    expect(loaCondition).toEqual(
      expect.objectContaining({
        requirement: 'REQUIRED',
      }),
    );
    expect(webauthn).toEqual(
      expect.objectContaining({ requirement: 'REQUIRED' }),
    );
    expect(otp).toEqual(expect.objectContaining({ requirement: 'DISABLED' }));
    if (
      !isRecord(loaCondition) ||
      typeof loaCondition.authenticationConfig !== 'string'
    ) {
      throw new Error('Keycloak LoA condition is missing its configuration');
    }
    const configResponse = await fetch(
      new URL(
        `/admin/realms/${encodeURIComponent(realmName)}/authentication/executions/${encodeURIComponent(String(loaCondition.id))}/config/${encodeURIComponent(loaCondition.authenticationConfig)}`,
        issuerUrl.origin,
      ),
      {
        headers: adminHeaders,
        signal: AbortSignal.timeout(10_000),
      },
    );
    expect(configResponse.status).toBe(200);
    const configBody: unknown = (await configResponse.json()) as unknown;
    if (!isRecord(configBody) || !isRecord(configBody.config)) {
      throw new Error('Keycloak LoA condition configuration is invalid');
    }
    expect(configBody.config['loa-condition-level']).toBe('2');
    expect(configBody.config['loa-max-age']).toBe('0');
  });
});
