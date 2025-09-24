"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/env");
const billingRepo_1 = require("../repositories/billingRepo");
const billing_1 = require("../services/billing");
async function main() {
    const plans = await (0, billingRepo_1.listPlansWithPricesAndFeatures)();
    const specs = [];
    for (const p of plans) {
        for (const price of p.prices) {
            specs.push({
                productKey: p.key,
                productName: p.name,
                priceKey: `${p.key}_${price.interval}`,
                unitAmountUsd: price.currency.toLowerCase() === 'eur' ? (price.unitAmountCents / 100) : (price.unitAmountCents / 100),
                interval: price.interval,
                currency: price.currency.toLowerCase(),
            });
        }
    }
    const synced = await (0, billing_1.ensureStripeCatalog)(specs);
    // Write back stripePriceId for EUR prices
    for (const p of plans) {
        for (const price of p.prices) {
            const key = `${p.key}_${price.interval}`;
            const id = synced.prices[key];
            if (id)
                await (0, billingRepo_1.setStripePriceId)(p.key, price.interval, price.currency.toLowerCase(), id);
        }
    }
    // eslint-disable-next-line no-console
    console.log('Stripe catalog synced');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
