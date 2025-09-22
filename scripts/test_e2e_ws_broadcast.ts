import express from 'express';

async function main() {
  process.env.CONVERSATION_JWT_SECRET = 'test_jwt_secret_abcdefghijklmnopqrstuvwxyz';
  process.env.UNBIND_JWT_FROM_IP = 'true';
  const { attachWsServer } = await import('../src/ws/server');
  const { signConversationToken } = await import('../src/services/auth');
  const http = await import('http');

  const app = express();
  const server = http.createServer(app);
  attachWsServer(server, '/v1/ws');
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const addr: any = server.address();
  const base = `http://127.0.0.1:${addr.port}`;

  const convId = 'conv1';
  const tenantId = 'default';
  const token = signConversationToken(tenantId, convId, 'iphash');

  const WebSocket = (await import('ws')).WebSocket;
  const url = `${base.replace('http', 'ws')}/v1/ws?token=${token}`;
  const ws = new WebSocket(url);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 5000);
    ws.on('message', (data: any) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg && msg.ok === true) {
          clearTimeout(timer);
          resolve();
        }
      } catch {}
    });
    ws.on('error', reject);
  });

  ws.close();
  await new Promise<void>((r) => server.close(() => r()));
  console.log('OK ws smoke');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });


