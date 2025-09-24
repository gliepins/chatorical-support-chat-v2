"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const outboxWorker_1 = require("./outboxWorker");
const logger_1 = require("../telemetry/logger");
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function main() {
    logger_1.logger.info({ event: 'outbox_worker_start' });
    const idleMs = Math.max(50, Number(process.env.OUTBOX_IDLE_MS || 200));
    let stopping = false;
    const handleStop = async () => {
        if (stopping)
            return;
        stopping = true;
        try {
            logger_1.logger.info({ event: 'outbox_worker_stop_signal' });
        }
        catch { }
        // Allow graceful exit window
        await sleep(200);
        process.exit(0);
    };
    try {
        process.on('SIGINT', handleStop);
    }
    catch { }
    try {
        process.on('SIGTERM', handleStop);
    }
    catch { }
    while (!stopping) {
        try {
            const didWork = await (0, outboxWorker_1.processOnce)();
            if (!didWork)
                await sleep(idleMs);
        }
        catch (e) {
            try {
                logger_1.logger.warn({ event: 'outbox_worker_iteration_error', err: e });
            }
            catch { }
            await sleep(Math.min(2000, idleMs * 5));
        }
    }
}
main().catch((e) => {
    try {
        logger_1.logger.error({ event: 'outbox_worker_fatal', err: e });
    }
    catch { }
    process.exit(1);
});
