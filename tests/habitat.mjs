import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const url = new URL(process.env.URL || 'http://127.0.0.1:4183/');
url.searchParams.set('debug', '1');
url.searchParams.set('quality', 'low');
const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--enable-unsafe-swiftshader'],
});
const output = process.env.SCREENSHOTS_DIR;
if (output) await mkdir(output, { recursive: true });

try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 320, height: 568 } : { width: 1280, height: 720 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const press = async (selector) => mobile ? page.locator(selector).tap() : page.locator(selector).click();
    const counts = () => page.evaluate(() => window.__oceanDebug.habitat());
    assert.equal((await page.goto(url.href)).status(), 200);
    await press('#btn-start');
    await press('#guide-dialog .btn-primary');
    assert(await page.locator('#btn-habitat').isHidden());
    await page.evaluate(() => document.querySelector('#btn-habitat').click());
    assert(await page.locator('#habitat-overlay').isHidden());
    assert.deepEqual(await counts(), { fish: 0, rays: 0, groupers: 0, catches: 0 });

    // Complete the existing mission state to isolate the new reward flow.
    await page.evaluate(() => window.__oceanDebug.completeAll());
    await page.locator('#end-screen:not(.hidden)').waitFor();
    await press('#btn-habitat-end');
    await page.locator('#habitat-overlay:not(.hidden)').waitFor();
    await press('[data-add-life="reef-fish"]');
    await press('[data-add-life="silver-fish"]');
    assert.equal((await counts()).fish, 24);
    for (let i = 0; i < 3; i++) await press('[data-add-life="ray"]');
    assert(await page.locator('[data-add-life="ray"]').isDisabled());
    for (let i = 0; i < 4; i++) await press('[data-add-life="reef-fish"]');
    assert.equal((await counts()).fish, 72);
    assert(await page.locator('[data-add-life="silver-fish"]').isDisabled());
    for (let i = 0; i < 2; i++) await press('[data-add-life="grouper"]');
    assert(await page.locator('[data-add-life="grouper"]').isDisabled());
    if (output) await page.screenshot({ path: join(output, mobile ? 'habitat-mobile.png' : 'habitat-panel.png') });
    await press('#btn-habitat-close');
    await page.waitForFunction(() => window.__oceanDebug.habitat().catches > 0, null, { timeout: 35000 });
    const hunted = await counts();
    assert.equal(hunted.fish + hunted.catches, 72);
    assert.equal(hunted.rays, 3);
    assert.equal(hunted.groupers, 2);
    if (output) await page.screenshot({ path: join(output, mobile ? 'habitat-mobile-ocean.png' : 'habitat-ocean.png') });

    if (mobile) await press('#btn-menu');
    else await page.keyboard.press('Escape');
    await page.locator('#pause-menu:not(.hidden)').waitFor();
    const paused = await counts();
    await page.waitForTimeout(500);
    assert.deepEqual(await counts(), paused);
    await page.evaluate(() => window.__oceanDebug.setQuality('medium'));
    assert.deepEqual(await counts(), paused);
    await page.evaluate(() => window.__oceanDebug.setQuality('low'));
    await press('#btn-resume');
    if (mobile) await press('#btn-habitat');
    else await page.keyboard.press('b');
    await page.locator('#habitat-overlay:not(.hidden)').waitFor();
    await press('[data-add-life="silver-fish"]');
    const replenished = await counts();
    assert(replenished.fish <= 72 && replenished.fish > paused.fish);
    await press('#btn-habitat-close');
    if (mobile) await press('#btn-menu');
    else await page.keyboard.press('Escape');
    await press('#btn-restart-2');
    assert.deepEqual(await counts(), { fish: 0, rays: 0, groupers: 0, catches: 0 });
    assert(await page.locator('#btn-habitat').isHidden());
    assert.deepEqual(errors, []);
    console.log(mobile ? 'Mobile' : 'Desktop', 'unlock, additions, limits, predation, replenishment, pause, quality and reset passed', hunted);
    await context.close();
  }
} finally {
  await browser.close();
}
