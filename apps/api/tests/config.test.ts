/**
 * Configuration guards (BRD §12.3, NFR-C-01). These are the checks that make an
 * unsafe deployment impossible rather than merely discouraged.
 */
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://localhost:5432/fi',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_PEPPER: 'b'.repeat(32),
  CORS_ORIGINS: 'http://localhost:8081, http://localhost:19006',
};

describe('loadConfig', () => {
  it('parses a valid environment and derives its flags', () => {
    const config = loadConfig(valid);
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:8081', 'http://localhost:19006']);
    expect(config.isDevelopment).toBe(true);
    expect(config.r2Configured).toBe(false);
  });

  it('turns durations into seconds', () => {
    const config = loadConfig({ ...valid, ACCESS_TOKEN_TTL: '15m', REFRESH_TOKEN_TTL: '30d' });
    expect(config.ACCESS_TOKEN_TTL).toBe(900);
    expect(config.REFRESH_TOKEN_TTL).toBe(2_592_000);
  });

  it('rejects a wildcard CORS origin outside development (NFR-C-01)', () => {
    expect(() =>
      loadConfig({
        ...valid,
        NODE_ENV: 'production',
        COMMIT_SHA: 'abc123',
        CORS_ORIGINS: 'https://app.example.com,*',
      }),
    ).toThrow(ConfigError);
  });

  it('allows a wildcard in development, where it is only ever local', () => {
    expect(() => loadConfig({ ...valid, CORS_ORIGINS: '*' })).not.toThrow();
  });

  it('requires a commit SHA in production (NFR-D-05)', () => {
    expect(() =>
      loadConfig({ ...valid, NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com' }),
    ).toThrow(ConfigError);
  });

  it('rejects short signing secrets', () => {
    expect(() => loadConfig({ ...valid, JWT_ACCESS_SECRET: 'too-short' })).toThrow(ConfigError);
  });

  it('requires at least one CORS origin', () => {
    expect(() => loadConfig({ ...valid, CORS_ORIGINS: '' })).toThrow(ConfigError);
  });

  it('reports every problem at once, so a broken deploy is fixed in one pass', () => {
    try {
      loadConfig({ NODE_ENV: 'development' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).toContain('DATABASE_URL');
      expect((error as Error).message).toContain('JWT_ACCESS_SECRET');
    }
  });

  it('reports R2 as configured only when the whole set is present', () => {
    const config = loadConfig({
      ...valid,
      R2_ACCOUNT_ID: 'acct',
      R2_ACCESS_KEY_ID: 'key',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET: 'bucket',
    });
    expect(config.r2Configured).toBe(true);
  });
});
