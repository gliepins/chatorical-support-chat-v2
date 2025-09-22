import pino from 'pino';
import { CONFIG } from '../config/env';

function getPrettyTransport(): any | undefined {
  if (!(CONFIG.logPretty && CONFIG.nodeEnv !== 'production')) return undefined;
  try {
    // Only enable pretty transport if module is present
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require.resolve('pino-pretty');
    return { target: 'pino-pretty' } as any;
  } catch {
    return undefined;
  }
}

export const logger = pino({
  level: CONFIG.logLevel,
  transport: getPrettyTransport(),
  base: undefined,
});


