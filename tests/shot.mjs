// 快速截圖（開發時檢視畫面用）：node tests/shot.mjs [quality] [outPrefix]
import { chromium } from 'playwright';
const q = process.argv[2] || 'medium';
const out = process.argv[3] || '/tmp/shot';
const url = (process.env.URL || 'http://localhost:4173/') + `?debug=1&quality=${q}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForSelector('#home:not(.hidden)', { timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}-home.png` });
await page.click('#btn-start');
await page.waitForTimeout(2500);
await page.click('#guide-dialog .btn-primary');
await page.evaluate(() => document.querySelector('#guide-dialog')?.classList.add('hidden'));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}-explore.png` });
for (const [yaw, pitch, name] of (process.env.VIEWS || '').split(';').filter(Boolean).map((s) => s.split(','))) {
  await page.evaluate(([y, p]) => window.__oceanDebug.look(+y, +p), [yaw, pitch]);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}-${name}.png` });
}
console.log(JSON.stringify(await page.evaluate(() => ({ fps: window.__oceanDebug.fps(), r: window.__oceanDebug.renderer() }))));
await browser.close();
