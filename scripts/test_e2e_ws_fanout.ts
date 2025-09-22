import express from 'express';

async function main() {
  process.env.CONVERSATION_JWT_SECRET = 'test_jwt_secret_abcdefghijklmnopqrstuvwxyz';
  process.env.UNBIND_JWT_FROM_IP = 'true';
  process.env.FEATURE_REDIS_PUBSUB = 'true';
  const { attachWsServer } = await import('../src/ws/server');
  const { signConversationToken } = await import('../src/services/auth');
  const { startRedisHub, publishToConversation } = await import('../src/ws/redisHub');
  const http = await import('http');

  // Start server A (subscriber)
  const appA = express();
  const serverA = http.createServer(appA);
  attachWsServer(serverA, '/v1/ws');
  await new Promise<void>((r)=>serverA.listen(0, ()=>r()));
  startRedisHub();
  const addrA: any = serverA.address();
  const baseA = `http://127.0.0.1:${addrA.port}`;

  // Start server B (publisher)
  const appB = express();
  const serverB = http.createServer(appB);
  attachWsServer(serverB, '/v1/ws');
  await new Promise<void>((r)=>serverB.listen(0, ()=>r()));
  startRedisHub();

  const convId = 'conv1';
  const tenantId = 'default';
  const token = signConversationToken(tenantId, convId, 'iphash');

  const WebSocket = (await import('ws')).WebSocket;
  const ws = new WebSocket(`${baseA.replace('http','ws')}/v1/ws?token=${token}`);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout_open')), 5000);
    ws.on('message', (data: any) => { try { const msg = JSON.parse(String(data)); if (msg && msg.ok) { clearTimeout(timer); resolve(); } } catch {} });
    ws.on('error', reject);
  });

  // Publish from server B via Redis and expect to receive on ws connected to server A
  const payload = { direction: 'OUTBOUND', text: 'hello' };
  await publishToConversation(convId, payload);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout_broadcast')), 5000);
    ws.once('message', (data: any) => { try { const msg = JSON.parse(String(data)); if (msg && msg.text === 'hello') { clearTimeout(timer); resolve(); } } catch (e) { reject(e); } });
  });

  ws.close();
  await Promise.all([new Promise<void>((r)=>serverA.close(()=>r())), new Promise<void>((r)=>serverB.close(()=>r()))]);
  console.log('OK e2e ws fanout');
  process.exit(0);
}

main().catch((e)=>{ console.error(e); process.exit(1); });


