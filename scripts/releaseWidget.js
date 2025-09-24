#!/usr/bin/env node
const { execSync } = require('child_process');

function timestampVersion() {
  const d = new Date();
  const ts = d.toISOString().slice(0, 16).replace(/[-:T]/g, ''); // YYYYMMDDHHMM
  let sha = '';
  try { sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
  return sha ? `${ts}-${sha}` : ts;
}

const v = timestampVersion();
const origin = process.env.WIDGET_ORIGIN || 'https://YOUR_DOMAIN';

const snippet = `\nPaste this into your site (set WIDGET_ORIGIN to override):\n\n<script src="${origin}/widget.js?v=${v}"></script>\n<script>window.SupportChatV2&&SupportChatV2.init({ origin: '${origin}', position: 'right' });</script>\n`;

process.stdout.write(snippet);


