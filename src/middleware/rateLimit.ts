import { Request, Response, NextFunction } from 'express';
import { CONFIG } from '../config/env';
import { getRedis } from '../redis/kv';
import { incRateLimitHit } from '../telemetry/metrics';
import { getSetting } from '../services/settings';

const redis = getRedis();

export function ipRateLimit(points: number, durationSeconds: number, bucketName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `${CONFIG.redisKeyPrefix}rl:${bucketName}:ip:${(req.ip || 'unknown').toString()}`;
    const now = Date.now();
    const windowKey = `${key}:${Math.floor(now / (durationSeconds * 1000))}`;
    try {
      const current = await redis.incr(windowKey);
      if (current === 1) {
        await redis.expire(windowKey, durationSeconds);
      }
      if (current > points) {
        try { incRateLimitHit(bucketName); } catch {}
        return res.status(429).json({ error: 'rate_limited' });
      }
      return next();
    } catch {
      // Fail-open
      return next();
    }
  };
}

export function dynamicIpRateLimit(bucketName: string, defaultPoints: number, defaultDurationSeconds: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId: string = (req as any).tenant?.tenantId || 'default';
      const pointsStr = await getSetting(tenantId, `rl.${bucketName}.points`);
      const durationStr = await getSetting(tenantId, `rl.${bucketName}.durationSec`);
      const p = pointsStr ? Number(pointsStr) : defaultPoints;
      const d = durationStr ? Number(durationStr) : defaultDurationSeconds;
      return ipRateLimit(Number.isFinite(p) && p > 0 ? p : defaultPoints, Number.isFinite(d) && d > 0 ? d : defaultDurationSeconds, bucketName)(req, res, next);
    } catch {
      return ipRateLimit(defaultPoints, defaultDurationSeconds, bucketName)(req, res, next);
    }
  };
}


