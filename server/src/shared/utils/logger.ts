const SENSITIVE_KEYS = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'confirmPassword',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'refreshTokenHash',
  'authorization',
  'cookie',
  'secret',
]);

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k) || k.toLowerCase().includes('secret') || k.toLowerCase().includes('password')) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'test') return;
    console.log(
      JSON.stringify({
        level: 'info',
        timestamp: new Date().toISOString(),
        message,
        ...(meta ? { meta: redact(meta) } : {}),
      }),
    );
  },
  warn(message: string, meta?: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'test') return;
    console.warn(
      JSON.stringify({
        level: 'warn',
        timestamp: new Date().toISOString(),
        message,
        ...(meta ? { meta: redact(meta) } : {}),
      }),
    );
  },
  error(message: string, meta?: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'test') return;
    console.error(
      JSON.stringify({
        level: 'error',
        timestamp: new Date().toISOString(),
        message,
        ...(meta ? { meta: redact(meta) } : {}),
      }),
    );
  },
  audit(action: string, meta: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'test') return;
    console.log(
      JSON.stringify({
        level: 'audit',
        timestamp: new Date().toISOString(),
        action,
        meta: redact(meta),
      }),
    );
  },
};
