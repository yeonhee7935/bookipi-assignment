import { Redis, type RedisOptions } from 'ioredis';

/**
 * Fail fast instead of queueing: if Redis is unreachable, requests get a 503 within
 * ~1s rather than piling up in memory and timing out together when traffic spikes.
 */
export function createRedis(url: string, options: RedisOptions = {}): Redis {
  return new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    commandTimeout: 1000,
    ...options,
  });
}
