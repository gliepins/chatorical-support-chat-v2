"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueOutbox = enqueueOutbox;
exports.claimNextOutbox = claimNextOutbox;
exports.markDone = markDone;
exports.markFailed = markFailed;
const client_1 = require("../db/client");
async function enqueueOutbox(tenantId, type, payload, idempotencyKey) {
    const prisma = (0, client_1.getPrisma)();
    const row = await prisma.outbox.upsert({
        where: idempotencyKey ? { tenantId_idempotencyKey: { tenantId, idempotencyKey } } : { id: '___never___' },
        update: {},
        create: { tenantId, type, payload, idempotencyKey: idempotencyKey || null },
    });
    return row;
}
async function claimNextOutbox(now = new Date()) {
    const prisma = (0, client_1.getPrisma)();
    const row = await prisma.outbox.findFirst({ where: { status: 'PENDING', nextAttemptAt: { lte: now } }, orderBy: { createdAt: 'asc' } });
    if (!row)
        return null;
    try {
        await prisma.$transaction([
            prisma.outbox.update({ where: { id: row.id }, data: { status: 'PROCESSING' } }),
        ]);
        return row;
    }
    catch {
        return null;
    }
}
async function markDone(id) {
    const prisma = (0, client_1.getPrisma)();
    await prisma.outbox.update({ where: { id }, data: { status: 'DONE' } });
}
async function markFailed(id, error, backoffSeconds) {
    const prisma = (0, client_1.getPrisma)();
    await prisma.outbox.update({ where: { id }, data: { status: 'PENDING', attempts: { increment: 1 }, lastError: error, nextAttemptAt: new Date(Date.now() + backoffSeconds * 1000) } });
}
