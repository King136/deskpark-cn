import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
await page.goto('http://localhost:5173/#/play/mines', { waitUntil: 'networkidle' });
await page.waitForTimeout(4400);
// 点开几个格子
const cells = page.locator('.ms__cell');
for (let i = 0; i < 14; i++) { await cells.nth(i).click({ force: true }).catch(()=>{}); await page.waitForTimeout(120); }
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/shots/after-mines-open.png' });
console.log('done');
await browser.close();
