import { describe, expect, it } from '@jest/globals';

import { buildConfiguration } from './configuration';

const productionEnvironment = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  DB_PASSWORD: 'a-production-database-password',
  JWT_SECRET: 'access-secret-that-is-longer-than-thirty-two-characters',
  JWT_REFRESH_SECRET:
    'refresh-secret-that-is-different-and-longer-than-thirty-two',
  CORS_ORIGIN: 'https://patient-book.example.test',
});

describe('buildConfiguration', () => {
  it('accepts an explicit safe production configuration', () => {
    expect(() => buildConfiguration(productionEnvironment())).not.toThrow();
  });

  it('refuses development secrets in production', () => {
    const env = productionEnvironment();
    delete env.JWT_SECRET;

    expect(() => buildConfiguration(env)).toThrow('JWT_SECRET');
  });

  it('refuses long placeholder secrets copied from the example environment', () => {
    const env = productionEnvironment();
    env.JWT_SECRET = 'change-me-in-production-use-openssl-rand-base64-48';

    expect(() => buildConfiguration(env)).toThrow('JWT_SECRET');
  });

  it('requires different access and refresh secrets', () => {
    const env = productionEnvironment();
    env.JWT_REFRESH_SECRET = env.JWT_SECRET;

    expect(() => buildConfiguration(env)).toThrow('must be different');
  });

  it('rejects clear-text production browser origins', () => {
    const env = productionEnvironment();
    env.CORS_ORIGIN = 'http://office.example.test';

    expect(() => buildConfiguration(env)).toThrow('must use HTTPS');
  });

  it('requires a production browser origin', () => {
    const env = productionEnvironment();
    delete env.CORS_ORIGIN;

    expect(() => buildConfiguration(env)).toThrow('at least one');
  });

  it('trusts one reverse-proxy hop in production by default', () => {
    expect(buildConfiguration(productionEnvironment()).trustProxy).toBe(1);
  });

  it('trusts no proxy in development, where the API is reached directly', () => {
    expect(buildConfiguration({}).trustProxy).toBe(0);
  });

  it('accepts an explicit hop count for a deeper proxy chain', () => {
    const env = productionEnvironment();
    env.TRUST_PROXY = '2';

    expect(buildConfiguration(env).trustProxy).toBe(2);
  });

  it('refuses a hop count that is not a whole number of proxies', () => {
    const env = productionEnvironment();
    env.TRUST_PROXY = '-1';

    expect(() => buildConfiguration(env)).toThrow('TRUST_PROXY');
  });
});
