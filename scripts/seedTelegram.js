#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');
const { upsertTelegramChannel } = require('../dist/channels/telegram/adapter');

async function main() {
  const prisma = new PrismaClient();
  const slug = process.env.TENANT_SLUG || 'motorical-smtp';
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const supportGroupId = process.env.SUPPORT_GROUP_ID;
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const headerSecret = process.env.TELEGRAM_HEADER_SECRET || undefined;
  if (!botToken || !supportGroupId || !webhookSecret) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN, SUPPORT_GROUP_ID, or WEBHOOK_SECRET');
  }
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error('Tenant not found: ' + slug);
  await upsertTelegramChannel(tenant.id, { botToken, supportGroupId, headerSecret }, webhookSecret);
  console.log('Seeded Telegram channel for', slug);
}

main().catch((e) => { console.error(e); process.exit(1); });


