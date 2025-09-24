import { processOnce } from './outboxWorker';
import { logger } from '../telemetry/logger';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  logger.info({ event: 'outbox_worker_start' });
  const idleMs = Math.max(50, Number(process.env.OUTBOX_IDLE_MS || 200));
  let stopping = false;
  const handleStop = async () => {
    if (stopping) return;
    stopping = true;
    try { logger.info({ event: 'outbox_worker_stop_signal' }); } catch {}
    // Allow graceful exit window
    await sleep(200);
    process.exit(0);
  };
  try { process.on('SIGINT', handleStop); } catch {}
  try { process.on('SIGTERM', handleStop); } catch {}
  while (!stopping) {
    try {
      const didWork = await processOnce();
      if (!didWork) await sleep(idleMs);
    } catch (e) {
      try { logger.warn({ event: 'outbox_worker_iteration_error', err: e }); } catch {}
      await sleep(Math.min(2000, idleMs * 5));
    }
  }
}

main().catch((e) => {
  try { logger.error({ event: 'outbox_worker_fatal', err: e }); } catch {}
  process.exit(1);
});


