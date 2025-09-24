import Redis from 'ioredis';
import { CONFIG } from '../config/env';
import { getRedis } from '../redis/kv';
import { logger } from '../telemetry/logger';
import { broadcastToConversation } from './hub';

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
let started = false;

function channelForConversation(conversationId: string): string {
  return `${CONFIG.redisKeyPrefix}ws:conv:${conversationId}`;
}

export function startRedisHub(): void {
  if (!CONFIG.featureRedisPubSub) return;
  if (started) return;
  started = true;
  try {
    // Use separate Redis connections for pub and sub. A subscriber connection
    // cannot be used for publish commands.
    publisher = new Redis(CONFIG.redisUrl);
    subscriber = new Redis(CONFIG.redisUrl);
    const pattern = `${CONFIG.redisKeyPrefix}ws:conv:*`;
    subscriber.on('end', () => { try { logger.warn({ event: 'redis_subscriber_end' }); } catch {} });
    subscriber.on('error', (e) => { try { logger.error({ event: 'redis_subscriber_error', err: e }); } catch {} });
    subscriber.psubscribe(pattern).then(() => {
      try { logger.info({ event: 'redis_hub_subscribed', pattern }); } catch {}
    }).catch((e) => {
      try { logger.error({ event: 'redis_hub_subscribe_error', err: e }); } catch {}
    });
    subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
      try {
        const conversationId = channel.split(':').pop() as string;
        const payload = JSON.parse(message);
        broadcastToConversation(conversationId, payload);
      } catch (e) {
        try { logger.warn({ event: 'redis_hub_pmessage_parse_error', err: e }); } catch {}
      }
    });
  } catch (e) {
    try { logger.error({ event: 'redis_hub_start_error', err: e }); } catch {}
  }
}

export async function publishToConversation(conversationId: string, payload: unknown): Promise<void> {
  if (!CONFIG.featureRedisPubSub) {
    try { broadcastToConversation(conversationId, payload); } catch {}
    return;
  }
  try {
    if (!publisher) publisher = new Redis(CONFIG.redisUrl);
    await publisher.publish(channelForConversation(conversationId), JSON.stringify(payload));
  } catch (e) {
    // Fallback to local broadcast if Redis publish fails
    try { logger.warn({ event: 'redis_publish_failed', err: e }); } catch {}
    try { broadcastToConversation(conversationId, payload); } catch {}
  }
}


