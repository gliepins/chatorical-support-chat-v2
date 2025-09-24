import '../config/env';
import { deactivatePlan } from '../repositories/billingRepo';

async function main() {
  const key = process.argv[2];
  if (!key) throw new Error('Usage: ts-node src/scripts/plan_deactivate.ts <plan_key>');
  await deactivatePlan(key);
  // eslint-disable-next-line no-console
  console.log('Deactivated plan', key);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });


