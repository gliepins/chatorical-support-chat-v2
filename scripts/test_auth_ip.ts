// Set required env before loading auth
process.env.CONVERSATION_JWT_SECRET = process.env.CONVERSATION_JWT_SECRET || 'dev-test-secret-please-change';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signConversationToken, verifyConversationToken, hashIp } = require('../src/services/auth');

const tenant = 't1';
const conv = 'c1';
const ip = '127.0.0.1';
const ipHash = hashIp(ip);

const token = signConversationToken(tenant, conv, ipHash, 60);

// Correct IP should verify
verifyConversationToken(token, ipHash);

// Wrong IP should fail
let failed = false;
try {
  verifyConversationToken(token, hashIp('127.0.0.2'));
} catch {
  failed = true;
}
if (!failed) {
  console.error('Expected IP mismatch to fail verification');
  process.exit(1);
}
console.log('OK auth ip binding');
process.exit(0);


