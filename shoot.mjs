import { chromium } from 'playwright-core';
const ids = ['mj_guangdong','mj_changsha','mj_guobiao','sichuan','ludo','liar','battle','checkers','reversi','mines','g2048','snake','sudoku','xiangqi','chess','gomoku','doudizhu','guandan','texas','onecard','klondike','highcard','gemguild','spellstones','hexisle','blocks'];
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
for (const id of ids) {
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
  try {
    await page.goto(`http://localhost:5173/#/play/${id}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(4300); // 等开屏完全退场(2600+480+余量)
    await page.screenshot({ path: `/tmp/shots/${id}.png` });
    console.log(id, 'ok');
  } catch (e) { console.log(id, 'FAIL', e.message.slice(0,60)); }
  await page.close();
}
await browser.close();
