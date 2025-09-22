import { createApiKey, verifyApiKey, hashApiKey } from '../src/services/apiKeys';

async function main() {
  // This is a pure hash/verify test without DB create (since Prisma may not be migrated in CI).
  const plain = 'scv2_test_token_value';
  const hashed = hashApiKey(plain);
  if (hashed.length !== 64) {
    console.error('hash length not 64 hex chars');
    process.exit(1);
  }
  // DB-dependent verify requires existing record; skip full roundtrip here.
  console.log('OK api key hash');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });


