/**
 * Sensitive-field masking utility for observability.
 *
 * Masks PII / secrets in logs, error payloads, and event payloads
 * before they are emitted to any external sink (Sentry, logs, metrics).
 */

const DEFAULT_SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'oldPassword',
  'newPassword',
  'confirmPassword',
  'secret',
  'clientSecret',
  'apiKey',
  'apiSecret',
  'accessToken',
  'refreshToken',
  'token',
  'authorization',
  'cookie',
  'setCookie',
  'card',
  'cardNumber',
  'ccNumber',
  'cvv',
  'cvc',
  'pan',
  'pin',
  'otp',
  'oneTimePassword',
  'refreshTokenHash',
  'sessionToken',
  'jwt',
  'privateKey',
];

const MASK = '********';

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    DEFAULT_SENSITIVE_KEYS.includes(key.toLowerCase()) ||
    DEFAULT_SENSITIVE_KEYS.some(
      (sensitive) =>
        normalized.includes(sensitive.replace(/[^a-z0-9]/g, '')) &&
        normalized.length >= 4,
    )
  );
}

/**
 * Recursively mask sensitive fields in a value.
 */
export function maskSensitiveFields<T>(value: T, depth = 0): unknown {
  if (depth > 10) return value;

  if (Array.isArray(value)) {
    return value.map((item) => maskSensitiveFields(item, depth + 1));
  }

  if (value !== null && typeof value === 'object') {
    const plain = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(plain)) {
      if (isSensitiveKey(key)) {
        result[key] = MASK;
      } else {
        result[key] = maskSensitiveFields(plain[key], depth + 1);
      }
    }
    return result;
  }

  return value;
}

/**
 * Convenience wrapper to mask an object for logging.
 */
export function maskForLogging<T>(value: T): unknown {
  return maskSensitiveFields(value);
}

export const SecurityMasking = {
  mask: maskSensitiveFields,
  forLogging: maskForLogging,
};
