"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/env");
const client_1 = require("../db/client");
const kv_1 = require("../redis/kv");
const env_1 = require("../config/env");
function today() {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}
async function main() {
    const prisma = (0, client_1.getPrisma)();
    const redis = (0, kv_1.getRedis)();
    const date = today();
    // naive: scan usage keys for today
    const pattern = `${env_1.CONFIG.redisKeyPrefix}usage:*:tenant:messages:${date}`;
    const stream = redis.scanStream({ match: pattern, count: 100 });
    const keys = await new Promise((resolve, reject) => {
        const out = [];
        stream.on('data', (arr) => { out.push(...arr); });
        stream.on('end', () => resolve(out));
        stream.on('error', reject);
    });
    for (const k of keys) {
        const parts = k.split(':');
        // scv2:usage:<tenantId>:tenant:messages:YYYY-MM-DD
        const tenantId = parts[2];
        const v = await redis.get(k);
        const c = v ? Number(v) : 0;
        if (c > 0 && tenantId) {
            await prisma.usageEvent.create({ data: { tenantId, type: 'messages_daily', subjectId: date, count: c, occurredAt: new Date() } });
        }
    }
    // eslint-disable-next-line no-console
    console.log('Usage summary created for', date);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
