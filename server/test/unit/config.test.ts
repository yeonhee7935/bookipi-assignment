import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  it('uses defaults suited to local development', () => {
    expect(loadConfig({})).toMatchObject({ port: 3000, saleId: 'launch', redisUrl: 'redis://localhost:6379' });
  });

  it('reads overrides from env', () => {
    expect(loadConfig({ PORT: '4000', SALE_ID: 'summer' })).toMatchObject({ port: 4000, saleId: 'summer' });
  });

  it.each(['0', '-1', '1.5', 'abc'])('rejects invalid port %s', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(/PORT/);
  });
});
