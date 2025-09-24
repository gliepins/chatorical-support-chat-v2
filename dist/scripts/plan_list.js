"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/env");
const billingRepo_1 = require("../repositories/billingRepo");
async function main() {
    const plans = await (0, billingRepo_1.listPlansWithPricesAndFeatures)();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(plans, null, 2));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
