import { ConfigService } from '@nestjs/config';

import { AutopayTokenCryptoService } from './autopay-token-crypto.service';

describe('AutopayTokenCryptoService', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const config = {
    get: (name: string) =>
      ({
        XENDIT_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ v1: key, v2: key }),
        XENDIT_TOKEN_ENCRYPTION_ACTIVE_KEY_VERSION: 'v2',
      })[name],
  } as unknown as ConfigService;

  it('encrypts tokens with AES-GCM and decrypts with the persisted key version', () => {
    const crypto = new AutopayTokenCryptoService(config);
    const encrypted = crypto.encrypt('pt-private-id');

    expect(encrypted.keyVersion).toBe('v2');
    expect(typeof encrypted.fingerprint).toBe('string');
    expect(encrypted.ciphertext).not.toContain('pt-private-id');
    expect(crypto.decrypt(encrypted)).toBe('pt-private-id');
  });

  it('rejects tampered ciphertext', () => {
    const crypto = new AutopayTokenCryptoService(config);
    const encrypted = crypto.encrypt('pt-private-id');

    expect(() =>
      crypto.decrypt({
        ...encrypted,
        authTag: Buffer.alloc(16).toString('base64'),
      }),
    ).toThrow('Stored Xendit payment token could not be decrypted');
  });

  it('reports missing encryption configuration as service unavailable', () => {
    const missingConfig = {
      get: () => undefined,
    } as unknown as ConfigService;
    const crypto = new AutopayTokenCryptoService(missingConfig);

    expect(() => crypto.assertConfigured()).toThrow(
      'Autopay is unavailable: configure XENDIT_TOKEN_ENCRYPTION_KEYS and XENDIT_TOKEN_ENCRYPTION_ACTIVE_KEY_VERSION.',
    );
    expect(() => crypto.encrypt('pt-private-id')).toThrow(
      'Autopay is unavailable: configure XENDIT_TOKEN_ENCRYPTION_KEYS and XENDIT_TOKEN_ENCRYPTION_ACTIVE_KEY_VERSION.',
    );
  });
});
