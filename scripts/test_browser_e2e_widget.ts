import puppeteer from 'puppeteer';

async function main() {
  const origin = process.env.WIDGET_ORIGIN || 'https://stage.chatorical.com';
  const pageUrl = process.env.WIDGET_TEST_PAGE || `${origin}/`; // assumes widget on index
  const tenant = process.env.WIDGET_TENANT || 'default';
  const timeoutMs = Number(process.env.WIDGET_E2E_TIMEOUT || 20000);

  const browser = await puppeteer.launch({ headless: true as any, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(timeoutMs);

  // 1) Load page
  await page.goto(pageUrl, { waitUntil: 'networkidle2' });

  // 2) Ensure widget booted
  await page.waitForFunction(() => (window as any).SupportChatV2, { timeout: timeoutMs });

  // 3) Open widget via FAB
  await page.waitForSelector('#scv2_fab', { timeout: timeoutMs });
  await page.click('#scv2_fab');

  // 4) Type and send message
  await page.waitForSelector('#scv2_input', { timeout: timeoutMs });
  const text = `E2E from widget ${Date.now()}`;
  await page.type('#scv2_input', text);
  await page.click('#scv2_send');

  // 5) Expect echo in the UI as INBOUND (You)
  await page.waitForFunction((t) => {
    const msgs = document.querySelectorAll('#scv2_msgs div div');
    return Array.from(msgs).some((el:any)=> el.textContent === t);
  }, { timeout: timeoutMs }, text);

  console.log('OK browser widget basic send');
  await browser.close();
  process.exit(0);
}

main().catch(async (e) => { console.error(e); process.exit(1); });


