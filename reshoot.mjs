import { chromium } from 'playwright-core';
const ids = ['mj_guangdong','mj_changsha','mj_guobiao','ludo','liar','battle','checkers','mines','snake'];
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [];
for (const id of ids) {
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
  page.on('pageerror', e => errors.push(id + ': ' + e.message));
  await page.goto(`http://localhost:5173/#/play/${id}`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(4400);
  await page.screenshot({ path: `/tmp/shots/after-${id}.png` });
  console.log(id, 'ok');
  await page.close();
}
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
