import type { Redis } from 'ioredis';
import { ORDER_CONSUMER_GROUP as CONSUMER_GROUP, saleKeys } from '../sale/sale.keys.js';
import type { OrderEvent, OrderRepository } from './order.repository.js';

type StreamEntry = [id: string, fields: string[]];

interface Deps {
  redis: Redis;
  orders: OrderRepository;
  saleId: string;
  consumer: string;
  batchSize?: number;
  blockMs?: number;
  /** Pending entries idle longer than this are assumed to belong to a crashed worker and are taken over. */
  claimIdleMs?: number;
  onError?: (error: unknown) => void;
}

function toEvent([, fields]: StreamEntry): OrderEvent {
  const map = new Map<string, string>();
  for (let i = 0; i < fields.length; i += 2) map.set(fields[i], fields[i + 1]);
  return { userId: map.get('userId')!, purchasedAt: Number(map.get('purchasedAt')) };
}

/**
 * Moves reservations from the Redis stream into Postgres with at-least-once delivery:
 * an entry is acknowledged only after it is committed, and the insert is idempotent,
 * so crashes and retries can never lose or duplicate an order.
 */
export function createOrderWorker({
  redis,
  orders,
  saleId,
  consumer,
  batchSize = 100,
  blockMs = 2000,
  claimIdleMs = 30_000,
  onError = console.error,
}: Deps) {
  const stream = saleKeys(saleId).events;

  async function readGroup(id: '0' | '>'): Promise<StreamEntry[]> {
    const res = (
      id === '>'
        ? await redis.xreadgroup('GROUP', CONSUMER_GROUP, consumer, 'COUNT', batchSize, 'BLOCK', blockMs, 'STREAMS', stream, id)
        : await redis.xreadgroup('GROUP', CONSUMER_GROUP, consumer, 'COUNT', batchSize, 'STREAMS', stream, id)
    ) as [string, StreamEntry[]][] | null;
    return res?.[0]?.[1] ?? [];
  }

  async function nextBatch(): Promise<StreamEntry[]> {
    // 1) our own unacknowledged entries (previous insert failed, or we restarted)
    const own = await readGroup('0');
    if (own.length > 0) return own;
    // 2) entries stuck with a consumer that died
    const [, claimed] = (await redis.xautoclaim(
      stream, CONSUMER_GROUP, consumer, claimIdleMs, '0-0', 'COUNT', batchSize,
    )) as [string, StreamEntry[]];
    if (claimed.length > 0) return claimed;
    // 3) new entries, waiting up to blockMs
    return readGroup('>');
  }

  return {
    async ensureGroup(): Promise<void> {
      try {
        await redis.xgroup('CREATE', stream, CONSUMER_GROUP, '0', 'MKSTREAM');
      } catch (error) {
        if (!String(error).includes('BUSYGROUP')) throw error;
      }
    },

    /** Processes at most one batch. Returns how many entries were persisted. */
    async processBatch(): Promise<number> {
      const entries = await nextBatch();
      if (entries.length === 0) return 0;
      await orders.insertMany(entries.map(toEvent));
      await redis.xack(stream, CONSUMER_GROUP, ...entries.map(([id]) => id));
      return entries.length;
    },

    async run(signal: AbortSignal): Promise<void> {
      await this.ensureGroup();
      while (!signal.aborted) {
        try {
          await this.processBatch();
        } catch (error) {
          onError(error);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    },
  };
}
