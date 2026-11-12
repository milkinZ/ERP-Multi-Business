import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

export type EncryptedPaymentToken = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: string;
  fingerprint: string;
};

@Injectable()
export class AutopayTokenCryptoService {
  constructor(private readonly config: ConfigService) {}

  assertConfigured(): void {
    this.getActiveKey();
  }

  encrypt(tokenId: string): EncryptedPaymentToken {
    if (!tokenId.trim()) {
      throw new InternalServerErrorException(
        'Xendit returned an empty payment token',
      );
    }

    const { keyVersion, key } = this.getActiveKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(tokenId, 'utf8'),
      cipher.final(),
    ]);

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      keyVersion,
      fingerprint: createHash('sha256').update(tokenId).digest('hex'),
    };
  }

  decrypt(input: {
    ciphertext: string;
    iv: string;
    authTag: string;
    keyVersion: string;
  }): string {
    const key = this.getKey(input.keyVersion);
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(input.iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(input.authTag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(input.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new InternalServerErrorException(
        'Stored Xendit payment token could not be decrypted',
      );
    }
  }

  private getKey(version: string | undefined): Buffer {
    const keyRingValue = this.config.get<string>(
      'XENDIT_TOKEN_ENCRYPTION_KEYS',
    );
    const activeVersion = this.config.get<string>(
      'XENDIT_TOKEN_ENCRYPTION_ACTIVE_KEY_VERSION',
    );
    if (!version || !keyRingValue || !activeVersion) {
      throw new ServiceUnavailableException(
        'Autopay is unavailable: configure XENDIT_TOKEN_ENCRYPTION_KEYS and XENDIT_TOKEN_ENCRYPTION_ACTIVE_KEY_VERSION.',
      );
    }

    let keyRing: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(keyRingValue);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid key ring');
      }
      keyRing = parsed as Record<string, unknown>;
    } catch {
      throw new ServiceUnavailableException(
        'Autopay is unavailable: XENDIT_TOKEN_ENCRYPTION_KEYS must contain a valid key map.',
      );
    }

    const encodedKey = keyRing[version];
    if (typeof encodedKey !== 'string') {
      throw new ServiceUnavailableException(
        'Autopay is unavailable: the configured Xendit payment-token encryption key version is unavailable.',
      );
    }
    const key = Buffer.from(encodedKey, 'base64');
    if (
      key.length !== 32 ||
      key.toString('base64').replace(/=+$/, '') !==
        encodedKey.replace(/=+$/, '')
    ) {
      throw new ServiceUnavailableException(
        'Autopay is unavailable: each Xendit payment-token encryption key must be 32-byte base64.',
      );
    }
    return key;
  }

  private getActiveKey(): { keyVersion: string; key: Buffer } {
    const keyVersion = this.config.get<string>(
      'XENDIT_TOKEN_ENCRYPTION_ACTIVE_KEY_VERSION',
    );
    if (!keyVersion) {
      throw new ServiceUnavailableException(
        'Autopay is unavailable: configure XENDIT_TOKEN_ENCRYPTION_KEYS and XENDIT_TOKEN_ENCRYPTION_ACTIVE_KEY_VERSION.',
      );
    }
    return { keyVersion, key: this.getKey(keyVersion) };
  }
}
