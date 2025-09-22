"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startRedisHub = startRedisHub;
exports.publishToConversation = publishToConversation;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("../config/env");
const kv_1 = require("../redis/kv");
const logger_1 = require("../telemetry/logger");
const hub_1 = require("./hub");
let publisher = null;
let subscriber = null;
let started = false;
function channelForConversation(conversationId) {
    return `${env_1.CONFIG.redisKeyPrefix}ws:conv:${conversationId}`;
}
function startRedisHub() {
    if (!env_1.CONFIG.featureRedisPubSub)
        return;
    if (started)
        return;
    started = true;
    try {
        publisher = (0, kv_1.getRedis)();
        subscriber = (0, kv_1.getRedis)();
        const pattern = `${env_1.CONFIG.redisKeyPrefix}ws:conv:*`;
        subscriber.on('end', () => { try {
            logger_1.logger.warn({ event: 'redis_subscriber_end' });
        }
        catch { } });
        subscriber.on('error', (e) => { try {
            logger_1.logger.error({ event: 'redis_subscriber_error', err: e });
        }
        catch { } });
        subscriber.psubscribe(pattern).then(() => {
            try {
                logger_1.logger.info({ event: 'redis_hub_subscribed', pattern });
            }
            catch { }
        }).catch((e) => {
            try {
                logger_1.logger.error({ event: 'redis_hub_subscribe_error', err: e });
            }
            catch { }
        });
        subscriber.on('pmessage', (_pattern, channel, message) => {
            try {
                const conversationId = channel.split(':').pop();
                const payload = JSON.parse(message);
                (0, hub_1.broadcastToConversation)(conversationId, payload);
            }
            catch (e) {
                try {
                    logger_1.logger.warn({ event: 'redis_hub_pmessage_parse_error', err: e });
                }
                catch { }
            }
        });
    }
    catch (e) {
        try {
            logger_1.logger.error({ event: 'redis_hub_start_error', err: e });
        }
        catch { }
    }
}
async function publishToConversation(conversationId, payload) {
    if (!env_1.CONFIG.featureRedisPubSub) {
        try {
            (0, hub_1.broadcastToConversation)(conversationId, payload);
        }
        catch { }
        return;
    }
    try {
        if (!publisher)
            publisher = new ioredis_1.default(env_1.CONFIG.redisUrl);
        await publisher.publish(channelForConversation(conversationId), JSON.stringify(payload));
    }
    catch (e) {
        // Fallback to local broadcast if Redis publish fails
        try {
            logger_1.logger.warn({ event: 'redis_publish_failed', err: e });
        }
        catch { }
        try {
            (0, hub_1.broadcastToConversation)(conversationId, payload);
        }
        catch { }
    }
}
