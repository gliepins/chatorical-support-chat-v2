import '../config/env';
import { listPlansWithPricesAndFeatures } from '../repositories/billingRepo';

async function main() {
  const plans = await listPlansWithPricesAndFeatures();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(plans, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });


