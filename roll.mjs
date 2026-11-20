import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
await page.goto('http://localhost:5173/#/play/ludo', { waitUntil: 'networkidle' });
await page.waitForTimeout(4400);
// 掷骰→AI 轮流走，走几步让棋子上跑道
for (let r = 0; r < 6; r++) {
  const btn = page.getByRole('button', { name: '掷骰' });
  if (await btn.count() && await btn.isEnabled().catch(() => false)) {
    await btn.click().catch(() => {});
  }
  await page.waitForTimeout(700);
  const go = page.getByRole('button', { name: '走这枚' });
  if (await go.count() && await go.isEnabled().catch(() => false)) await go.click().catch(() => {});
  await page.waitForTimeout(700);
}
await page.screenshot({ path: '/tmp/shots/after-ludo-rolled.png' });
console.log('done');
await browser.close();
