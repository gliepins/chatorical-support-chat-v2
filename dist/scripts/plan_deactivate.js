"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/env");
const billingRepo_1 = require("../repositories/billingRepo");
async function main() {
    const key = process.argv[2];
    if (!key)
        throw new Error('Usage: ts-node src/scripts/plan_deactivate.ts <plan_key>');
    await (0, billingRepo_1.deactivatePlan)(key);
    // eslint-disable-next-line no-console
    console.log('Deactivated plan', key);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
