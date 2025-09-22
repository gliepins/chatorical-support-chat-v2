"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ipRateLimit = ipRateLimit;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("../config/env");
const redis = new ioredis_1.default(env_1.CONFIG.redisUrl);
function ipRateLimit(points, durationSeconds, bucketName) {
    return async (req, res, next) => {
        const key = `${env_1.CONFIG.redisKeyPrefix}rl:${bucketName}:ip:${(req.ip || 'unknown').toString()}`;
        const now = Date.now();
        const windowKey = `${key}:${Math.floor(now / (durationSeconds * 1000))}`;
        try {
            const current = await redis.incr(windowKey);
            if (current === 1) {
                await redis.expire(windowKey, durationSeconds);
            }
            if (current > points) {
                return res.status(429).json({ error: 'rate_limited' });
            }
            return next();
        }
        catch {
            // Fail-open
            return next();
        }
    };
}
