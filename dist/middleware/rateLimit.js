"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ipRateLimit = ipRateLimit;
exports.dynamicIpRateLimit = dynamicIpRateLimit;
const env_1 = require("../config/env");
const kv_1 = require("../redis/kv");
const metrics_1 = require("../telemetry/metrics");
const settings_1 = require("../services/settings");
const redis = (0, kv_1.getRedis)();
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
                try {
                    (0, metrics_1.incRateLimitHit)(bucketName);
                }
                catch { }
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
function dynamicIpRateLimit(bucketName, defaultPoints, defaultDurationSeconds) {
    return async (req, res, next) => {
        try {
            const tenantId = req.tenant?.tenantId || 'default';
            const pointsStr = await (0, settings_1.getSetting)(tenantId, `rl.${bucketName}.points`);
            const durationStr = await (0, settings_1.getSetting)(tenantId, `rl.${bucketName}.durationSec`);
            const p = pointsStr ? Number(pointsStr) : defaultPoints;
            const d = durationStr ? Number(durationStr) : defaultDurationSeconds;
            const limiter = ipRateLimit(Number.isFinite(p) && p > 0 ? p : defaultPoints, Number.isFinite(d) && d > 0 ? d : defaultDurationSeconds, bucketName);
            // Wrap to record per-tenant hit metric
            return limiter(req, {
                ...res,
                status: (code) => {
                    if (code === 429) {
                        try {
                            (0, metrics_1.incRateLimitHitForTenant)(bucketName, tenantId);
                        }
                        catch { }
                    }
                    return res.status(code);
                },
            }, next);
        }
        catch {
            return ipRateLimit(defaultPoints, defaultDurationSeconds, bucketName)(req, res, next);
        }
    };
}
