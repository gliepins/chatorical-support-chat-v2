// Smoke test WS local hub broadcast without Redis
import { WebSocket } from 'ws';
import http from 'http';
import { attachWsServer } from '../src/ws/server';
import { broadcastToConversation } from '../src/ws/hub';

const server = http.createServer((_, res) => res.end('ok'));
attachWsServer(server, '/v1/ws');
server.listen(0, '127.0.0.1', async () => {
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const url = `ws://127.0.0.1:${port}/v1/ws?token=dummy`;

  // We bypass token verification by directly invoking connection handler is non-trivial;
  // Instead, this test focuses on broadcast path by simulating a local client set.
  // Add a fake client to conversation and send a message.
  const convId = 'test-conv';

  // Create a dummy WebSocket-like object
  const messages: string[] = [];
  const dummy: any = { send: (data: string) => { messages.push(data); } };
  const { addClientToConversation, removeClientFromConversation } = await import('../src/ws/hub');
  addClientToConversation(convId, dummy as unknown as WebSocket);
  broadcastToConversation(convId, { ping: true });
  removeClientFromConversation(convId, dummy as unknown as WebSocket);
  await new Promise((r) => server.close(() => r(null)));
  if (messages.length !== 1) {
    console.error('ws local hub: expected one message');
    process.exit(1);
  }
  console.log('OK ws local hub');
  process.exit(0);
});


