// Simple smoke test for metrics module
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import { incWsConnections, incWsOutbound, incRateLimitHit, getMetricsText } from '../src/telemetry/metrics';

incWsConnections(1);
incWsOutbound(2);
incRateLimitHit('start');

const text = getMetricsText();
if (!/ws_connections\s+1/.test(text)) {
  console.error('metrics: ws_connections expected 1');
  process.exit(1);
}
if (!/ws_outbound_messages_total\s+2/.test(text)) {
  console.error('metrics: ws_outbound_messages_total expected 2');
  process.exit(1);
}
if (!/rate_limit_hits_total\s+1/.test(text)) {
  console.error('metrics: rate_limit_hits_total expected 1');
  process.exit(1);
}
if (!/rate_limit_hits_bucket\{bucket=\"start\"\}\s+1/.test(text)) {
  console.error('metrics: rate_limit_hits_bucket for start expected 1');
  process.exit(1);
}
console.log('OK metrics');
process.exit(0);


