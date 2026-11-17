/**
 * 端對端測試（Playwright + Chrome，SwiftShader 軟體 WebGL）。
 * 使用方式：先 `npm run build && npm run preview`，再執行 `npm run test:e2e`
 * 環境變數：URL（預設 http://localhost:4173/）、CHROME（Chrome 執行檔路徑，未設定則用 Playwright 內建 Chromium）
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const BASE = process.env.URL || 'http://localhost:4173/';
const OUT = process.env.SCREENSHOTS_DIR ? resolve(process.env.SCREENSHOTS_DIR) + sep : fileURLToPath(new URL('../screenshots/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const results = [];
const consoleErrors = [];
const record = (name, pass, evidence) => {
  results.push({ name, pass, evidence });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  —  ${typeof evidence === 'string' ? evidence : JSON.stringify(evidence)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[${label}] console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${label}] pageerror: ${e.message}`));
}

const dbg = (page, expr) => page.evaluate(expr);
async function waitFor(page, fn, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn)) return true;
    await sleep(200);
  }
  return false;
}
/** 等待 CSS 動畫結束（軟體繪圖時主執行緒很忙，動畫會延後開始） */
async function settle(page, sel) {
  await page.waitForFunction((s) => { const e = document.querySelector(s); return !e || e.getAnimations({ subtree: true }).every((a) => a.playState !== 'running'); }, sel, { timeout: 8000 }).catch(() => {});
}
async function holdKey(page, key, ms) {
  await page.keyboard.down(key);
  await sleep(ms);
  await page.keyboard.up(key);
}
async function completeConservationSites(page, mobile = false) {
  const sites = [
    { id: 'ghost-net', name: '廢棄漁網' },
    { id: 'coral-survey', name: '珊瑚觀測點', wrong: 1, right: 0 },
    { id: 'seagrass-bed', name: '海草床', wrong: 0, right: 1 },
  ];
  for (const [index, site] of sites.entries()) {
    await page.evaluate((id) => window.__oceanDebug.teleport(id), site.id);
    await page.waitForFunction((id) => window.__oceanDebug.currentTarget() === id, site.id);
    if (mobile) await page.tap('#btn-interact');
    else await page.keyboard.press('f');
    await page.locator('#card-name').getByText(site.name, { exact: true }).waitFor();
    const action = page.locator('#card-action');
    const press = async (locator) => mobile ? locator.tap() : locator.click();
    let retryVerified = true;
    if (site.wrong !== undefined) {
      await press(page.locator(`[data-choice="${site.wrong}"]`));
      retryVerified = await action.isDisabled() && !!(await page.textContent('#card-feedback'));
      await press(page.locator(`[data-choice="${site.right}"]`));
    }
    await press(action);
    const progress = await page.textContent('#mission-progress');
    const recorded = await page.evaluate(() => window.__oceanDebug.recordedSites());
    record(`${mobile ? '手機' : '桌機'}：${site.name}`, retryVerified && recorded.includes(site.id) && progress === `任務進度：${index + 3}/5`, { progress, recorded });
  }
}
async function measureFps(page, seconds = 5) {
  return page.evaluate(
    (sec) =>
      new Promise((resolve) => {
        let n = 0;
        const times = [];
        let last = performance.now();
        const t0 = last;
        const step = (t) => {
          n++;
          times.push(t - last);
          last = t;
          if (t - t0 < sec * 1000) requestAnimationFrame(step);
          else {
            times.sort((a, b) => a - b);
            resolve({
              fps: +(n / ((t - t0) / 1000)).toFixed(1),
              p50ms: +times[Math.floor(times.length * 0.5)].toFixed(1),
              p95ms: +times[Math.floor(times.length * 0.95)].toFixed(1),
            });
          }
        };
        requestAnimationFrame(step);
      }),
    seconds,
  );
}

const browser = await chromium.launch({ executablePath: CHROME, args: GL_ARGS });

// ======================= 桌機 =======================
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  watch(page, 'desktop');
  await page.goto(BASE + '?debug=1&quality=medium');
  const homeOk = await page.waitForSelector('#home:not(.hidden)', { timeout: 60000 }).then(() => true).catch(() => false);
  const title = await page.textContent('#home-title');
  const kicker = await page.textContent('.home-kicker');
  const en = await page.textContent('.home-en');
  const btns = await page.$$eval('.home-buttons button', (b) => b.map((x) => x.textContent.trim()));
  record('首頁載入與文字', homeOk && title === '瑞秋卡森：海洋環境守護行動' && kicker === '《麥塊 AI 科學實驗王 2》補充單元' && en === 'Rachel Carson: Ocean Conservation Mission',
    { title, kicker, en });
  record('首頁按鈕', JSON.stringify(btns) === JSON.stringify(['開始探索', '操作教學', '畫質設定', '配樂｜開啟']), btns);
  await sleep(2500);
  await page.screenshot({ path: OUT + 'home.png' });

  // 操作教學 / 畫質設定視窗
  await page.click('#btn-help');
  const helpVisible = await page.isVisible('#help-modal');
  await page.screenshot({ path: OUT + 'help.png' });
  await page.click('#help-modal [data-close]');
  await page.click('#btn-quality');
  const qOpts = await page.$$eval('.quality-option strong', (e) => e.map((x) => x.textContent));
  await page.screenshot({ path: OUT + 'quality.png' });
  await page.click('#quality-modal [data-close]');
  record('操作教學與畫質設定視窗', helpVisible && qOpts.length === 3, { helpVisible, qOpts });

  // 開始探索
  await page.click('#btn-start');
  await sleep(600);
  const intro = await page.textContent('#guide-dialog .guide-text');
  record('瑞秋卡森開場對話', intro.includes('你好！我是瑞秋卡森。') && intro.includes('今天，我們一起探索海底世界，找出需要守護的地方！'), intro.replace(/\n/g, ' / '));
  await sleep(1800);
  await page.screenshot({ path: OUT + 'intro-dialog.png' });
  await page.click('#guide-dialog .btn-primary');
  const playing = await waitFor(page, () => window.__oceanDebug.state() === 'playing');
  const panel = await page.innerText('#mission-panel');
  record('進入遊戲狀態與任務面板 0/5', playing && panel.includes('海洋守護任務') && panel.includes('[ ]') && panel.includes('任務進度：0/5'), panel.replace(/\n/g, ' | '));
  await page.evaluate(() => document.querySelector('#guide-dialog').classList.add('hidden'));
  await sleep(3000);
  await page.screenshot({ path: OUT + 'explore.png' });
  const r = await dbg(page, () => window.__oceanDebug.renderer());
  record('3D 場景渲染（draw calls / 三角形）', r.calls > 10 && r.triangles > 100000, r);

  // 鍵盤移動（軟體繪圖 FPS 很低，先切到 Low 畫質讓輸入測試更穩定）
  await page.evaluate(() => window.__oceanDebug.setQuality('low'));
  await sleep(1500);
  const p0 = await dbg(page, () => window.__oceanDebug.playerPosition());
  await holdKey(page, 'w', 2500);
  await sleep(300);
  const p1 = await dbg(page, () => window.__oceanDebug.playerPosition());
  record('W 前進（往 -Z）', p1[2] < p0[2] - 0.3, { before: p0, after: p1 });
  await holdKey(page, 'd', 1500);
  const p2 = await dbg(page, () => window.__oceanDebug.playerPosition());
  record('D 右移（往 +X）', p2[0] > p1[0] + 0.2, { before: p1, after: p2 });
  await holdKey(page, 'a', 1500);
  const p2b = await dbg(page, () => window.__oceanDebug.playerPosition());
  record('A 左移（往 -X）', p2b[0] < p2[0] - 0.2, { before: p2, after: p2b });
  await holdKey(page, 's', 1500);
  const p2c = await dbg(page, () => window.__oceanDebug.playerPosition());
  record('S 後退（往 +Z）', p2c[2] > p2b[2] + 0.2, { before: p2b, after: p2c });
  await holdKey(page, 'e', 1500);
  const p3 = await dbg(page, () => window.__oceanDebug.playerPosition());
  record('E 上升', p3[1] > p2c[1] + 0.2, { before: p2c, after: p3 });
  await holdKey(page, 'q', 1500);
  const p4 = await dbg(page, () => window.__oceanDebug.playerPosition());
  record('Q 下降', p4[1] < p3[1] - 0.2, { before: p3, after: p4 });
  // Shift 加速：比較相同時間的位移
  const a0 = await dbg(page, () => window.__oceanDebug.playerPosition());
  await holdKey(page, 'w', 1500);
  await sleep(600);
  const a1 = await dbg(page, () => window.__oceanDebug.playerPosition());
  await page.keyboard.down('Shift');
  await holdKey(page, 'w', 1500);
  await page.keyboard.up('Shift');
  await sleep(600);
  const a2 = await dbg(page, () => window.__oceanDebug.playerPosition());
  const dNormal = Math.hypot(a1[0] - a0[0], a1[2] - a0[2]);
  const dSprint = Math.hypot(a2[0] - a1[0], a2[2] - a1[2]);
  record('Shift 加速', dSprint > dNormal * 1.3, { normal: +dNormal.toFixed(2), sprint: +dSprint.toFixed(2) });

  // 滑鼠轉視角（無 Pointer Lock 時以拖曳）
  const lockState = await page.evaluate(() => !!document.pointerLockElement);
  const rot0 = await page.evaluate(() => window.__oceanDebug.view());
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(800, 300, { steps: 8 });
  await page.mouse.up();
  await sleep(300);
  const rot1 = await page.evaluate(() => window.__oceanDebug.view());
  record('滑鼠轉動視角', Math.abs(rot1.yaw - rot0.yaw) > 0.1 || lockState, { pointerLocked: lockState, before: rot0, after: rot1 });

  // 碰撞：往海底下潛不會穿過地形
  await page.evaluate(() => window.__oceanDebug.look(0, -1.3));
  await holdKey(page, 'q', 2500);
  await holdKey(page, 'w', 1500);
  const ground = await page.evaluate(() => window.__oceanDebug.groundClearance());
  record('海底碰撞（不穿過地形）', ground >= 1.2, { clearanceAboveSeabed: ground });
  await page.evaluate(() => window.__oceanDebug.teleportRaw(140, -10, 0));
  const bounds = await page.evaluate(() => window.__oceanDebug.playerPosition());
  record('可游動邊界限制', Math.hypot(bounds[0], bounds[2]) <= 100.01, { requested: [140, -10, 0], clampedTo: bounds });
  await page.evaluate(() => window.__oceanDebug.teleportRaw(0, 5, 30));
  const ceil = await page.evaluate(() => window.__oceanDebug.playerPosition());
  record('海面上限（不會游出海面）', ceil[1] <= -1.59, { requestedY: 5, clampedY: ceil[1] });

  await page.evaluate(() => window.__oceanDebug.setQuality('medium'));
  await sleep(1500);
  // ESC 選單
  await page.evaluate(() => window.__oceanDebug.teleport('start'));
  await page.keyboard.press('Escape');
  await sleep(300);
  const paused = await dbg(page, () => window.__oceanDebug.state());
  const menuVisible = await page.isVisible('#pause-menu');
  await page.screenshot({ path: OUT + 'pause-menu.png' });
  await page.click('#btn-resume');
  await sleep(300);
  const resumed = await dbg(page, () => window.__oceanDebug.state());
  record('ESC 開啟選單 / 繼續探索', paused === 'paused' && menuVisible && resumed === 'playing', { paused, menuVisible, resumed });

  // 任務 1：海龜
  await page.evaluate(() => window.__oceanDebug.teleport('turtle'));
  await sleep(1500);
  await page.evaluate(() => window.__oceanDebug.teleport('turtle'));
  const tgt = await waitFor(page, () => window.__oceanDebug.currentTarget() === 'turtle', 8000);
  const prompt = await page.textContent('#interact-prompt .ip-text').catch(() => '');
  await page.screenshot({ path: OUT + 'turtle-near.png' });
  record('靠近海龜時準星射線偵測與提示', tgt && prompt.includes('觀察海龜'), { target: await dbg(page, () => window.__oceanDebug.currentTarget()), prompt });
  await page.keyboard.press('f');
  await sleep(1200);
  const card1 = {
    visible: await page.isVisible('#card-overlay'),
    name: await page.textContent('#card-name'),
    intro: await page.textContent('.card-intro'),
    science: await page.textContent('.card-science-text'),
    action: await page.textContent('#card-action'),
  };
  await settle(page, '#card-overlay');
  await page.screenshot({ path: OUT + 'turtle-card.png' });
  record('按 F 開啟海龜知識卡', card1.visible && card1.name === '海龜' &&
    card1.intro === '海龜是重要的海洋生物，牠們需要健康的海洋環境才能生存。' &&
    card1.science === '海龜可能誤食塑膠垃圾，也可能被廢棄漁網纏住。' && card1.action === '完成觀察', card1);
  await page.click('#card-action');
  await sleep(500);
  const prog1 = await page.textContent('#mission-progress');
  const panel1 = await page.innerText('#mission-list');
  record('完成觀察 → 任務進度 1/5', prog1 === '任務進度：1/5' && panel1.includes('[✓]') && (await dbg(page, () => window.__oceanDebug.progress())) === '1/5', { prog1, panel: panel1.replace(/\n/g, ' | ') });
  await page.screenshot({ path: OUT + 'progress-1of2.png' });

  // 任務 2：塑膠瓶
  await page.evaluate(() => window.__oceanDebug.teleport('bottle'));
  const tgt2 = await waitFor(page, () => window.__oceanDebug.currentTarget() === 'plastic-bottle', 8000);
  await sleep(800);
  await page.evaluate(() => document.querySelector('#guide-dialog').classList.add('hidden'));
  await page.screenshot({ path: OUT + 'bottle-near.png' });
  record('靠近塑膠瓶時偵測', tgt2, { target: await dbg(page, () => window.__oceanDebug.currentTarget()) });
  await page.keyboard.press('f');
  await sleep(1200);
  const card2 = {
    visible: await page.isVisible('#card-overlay'),
    name: await page.textContent('#card-name'),
    intro: await page.textContent('.card-intro'),
    science: await page.textContent('.card-science-text'),
    action: await page.textContent('#card-action'),
  };
  await settle(page, '#card-overlay');
  await page.screenshot({ path: OUT + 'bottle-card.png' });
  record('按 F 開啟海洋塑膠垃圾知識卡', card2.visible && card2.name === '海洋塑膠垃圾' &&
    card2.intro === '塑膠垃圾進入海洋後，可能長時間留在環境中。' &&
    card2.science === '海洋動物可能誤食塑膠碎片，或被塑膠垃圾纏住。' && card2.action === '清理垃圾', card2);
  await page.click('#card-action');
  await sleep(250);
  const toast = await page.textContent('#toast');
  await sleep(350);
  await page.screenshot({ path: OUT + 'cleanup-effect.png' });
  const prog2 = await page.textContent('#mission-progress');
  await sleep(900);
  const bottleGone = !(await dbg(page, () => window.__oceanDebug.bottleVisible()));
  const panel2 = await page.innerText('#mission-list');
  record('清理垃圾 → 瓶子消失、清理特效、2/5', bottleGone && prog2 === '任務進度：2/5' && (panel2.match(/\[✓\]/g) || []).length === 2 && toast.includes('清理完成'),
    { bottleGone, prog2, toast, panel: panel2.replace(/\n/g, ' | ') });
  await completeConservationSites(page);
  const celebrate = await waitFor(page, () => document.querySelector('#toast')?.textContent.includes('恭喜'), 4000);
  record('恭喜完成提示', celebrate, await page.textContent('#toast'));
  const ended = await waitFor(page, () => !document.querySelector('#end-screen').classList.contains('hidden'), 8000);
  await sleep(800);
  const endText = await page.innerText('#end-screen');
  await settle(page, '#end-screen');
  await page.screenshot({ path: OUT + 'complete.png' });
  record('結束畫面', ended && endText.includes('恭喜完成海洋守護任務！') &&
    endText.includes('今天我們觀察了海洋生命，也發現了污染問題。真正的海洋守護，要從了解環境與日常行動開始。') &&
    endText.includes('回到 Minecraft Education，試著完成：') && endText.includes('建造一座海洋研究站') &&
    endText.includes('設計一個海洋垃圾回收區') && endText.includes('使用程式建立海洋生物展示區') &&
    endText.includes('重新探索') && endText.includes('繼續自由探索'), endText.replace(/\n+/g, ' | '));

  await page.click('#btn-free');
  await sleep(400);
  const freeState = await dbg(page, () => window.__oceanDebug.state());
  record('繼續自由探索', freeState === 'playing' && !(await page.isVisible('#end-screen')), { state: freeState });
  // 滑鼠鎖定時按 ESC 開啟選單（鎖定狀態下無法點擊介面按鈕，這是瀏覽器的正常行為）
  await page.keyboard.press('Escape');
  await sleep(400);
  await page.click('#btn-restart-2');
  await sleep(500);
  const resetProg = await page.textContent('#mission-progress');
  const bottleBack = await dbg(page, () => window.__oceanDebug.bottleVisible());
  const st = await dbg(page, () => window.__oceanDebug.state());
  record('重新探索（重置任務與塑膠瓶）', resetProg === '任務進度：0/5' && bottleBack && st === 'intro', { resetProg, bottleBack, state: st });
  // 結束畫面的「重新探索」按鈕
  await page.click('#guide-dialog .btn-primary');
  await page.evaluate(() => { const d = window.__oceanDebug; d.completeAll(); });
  const ended2 = await waitFor(page, () => !document.querySelector('#end-screen').classList.contains('hidden'), 8000);
  await page.click('#btn-restart');
  await sleep(500);
  record('結束畫面「重新探索」按鈕', ended2 && (await page.textContent('#mission-progress')) === '任務進度：0/5', { ended2 });

  // 畫質切換
  await page.click('#guide-dialog .btn-primary');
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.click('#btn-quality-2');
  await page.click('.quality-option[data-quality="low"]');
  await sleep(1500);
  const ql = await dbg(page, () => ({ q: window.__oceanDebug.quality(), r: window.__oceanDebug.renderer() }));
  await page.click('.quality-option[data-quality="high"]');
  await sleep(2000);
  const qh = await dbg(page, () => ({ q: window.__oceanDebug.quality(), r: window.__oceanDebug.renderer() }));
  await page.click('#quality-modal [data-close]');
  record('畫質切換 Low / High（即時重建場景）', ql.q === 'low' && qh.q === 'high' && qh.r.triangles > ql.r.triangles, { low: ql, high: qh });
  await ctx.close();
}

// ======================= 效能量測（1920x1080，軟體繪圖） =======================
const perf = {};
{
  for (const q of ['low', 'medium', 'high']) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    watch(page, `perf-${q}`);
    await page.goto(BASE + `?debug=1&quality=${q}`);
    await page.waitForSelector('#home:not(.hidden)', { timeout: 60000 });
    await page.click('#btn-start');
    await sleep(500);
    await page.click('#guide-dialog .btn-primary');
    await sleep(3000);
    perf[q] = { ...(await measureFps(page, 6)), renderer: await dbg(page, () => window.__oceanDebug.renderer()) };
    if (q === 'high') await page.screenshot({ path: OUT + 'explore-high-1080p.png' });
    await ctx.close();
  }
  record('FPS 量測（SwiftShader CPU 軟體繪圖，1920x1080）', true, perf);
}

// ======================= 手機 =======================
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  watch(page, 'mobile');
  await page.goto(BASE + '?debug=1');
  await page.waitForSelector('#home:not(.hidden)', { timeout: 60000 });
  await sleep(2000);
  await page.screenshot({ path: OUT + 'mobile-home.png' });
  const isTouch = await dbg(page, () => window.__oceanDebug.isTouch());
  const q = await dbg(page, () => window.__oceanDebug.quality());
  await page.tap('#btn-start');
  await sleep(1500);
  await page.screenshot({ path: OUT + 'mobile-intro.png' });
  await page.tap('#guide-dialog .btn-primary');
  await sleep(2500);
  const touchVisible = await page.isVisible('#touch-controls');
  await page.screenshot({ path: OUT + 'mobile.png' });
  const box = async (s) => page.$eval(s, (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const panelB = await box('#mission-panel');
  const joyB = await box('#joystick');
  const btnB = await box('#touch-buttons');
  const dlgB = await box('#guide-dialog');
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  record('手機：觸控介面與排版不遮住任務面板', isTouch && touchVisible && !overlap(panelB, joyB) && !overlap(panelB, btnB) && !overlap(panelB, dlgB) && panelB.x >= 0 && panelB.y >= 0,
    { isTouch, defaultQuality: q, touchVisible, panel: panelB, joystick: joyB, buttons: btnB, dialog: dlgB });

  const cdp = await ctx.newCDPSession(page);
  const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  // 左側搖桿：向上推 = 前進
  const m0 = await dbg(page, () => window.__oceanDebug.playerPosition());
  const jx = joyB.x + joyB.w / 2, jy = joyB.y + joyB.h / 2;
  await touch('touchStart', [{ x: jx, y: jy, id: 1 }]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: jx, y: jy - i * 8, id: 1 }]); await sleep(30); }
  await sleep(2500);
  await touch('touchEnd', []);
  await sleep(300);
  const m1 = await dbg(page, () => window.__oceanDebug.playerPosition());
  record('手機：左側虛擬搖桿移動', Math.hypot(m1[0] - m0[0], m1[2] - m0[2]) > 0.3, { before: m0, after: m1 });
  // 右側滑動轉視角
  const v0 = await dbg(page, () => window.__oceanDebug.view());
  await touch('touchStart', [{ x: 300, y: 400, id: 2 }]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [{ x: 300 - i * 10, y: 400, id: 2 }]); await sleep(30); }
  await touch('touchEnd', []);
  await sleep(300);
  const v1 = await dbg(page, () => window.__oceanDebug.view());
  record('手機：右側滑動轉視角', Math.abs(v1.yaw - v0.yaw) > 0.05, { before: v0, after: v1 });
  // 上升按鈕
  const u0 = await dbg(page, () => window.__oceanDebug.playerPosition());
  const upB = await box('#btn-up');
  await touch('touchStart', [{ x: upB.x + upB.w / 2, y: upB.y + upB.h / 2, id: 3 }]);
  await sleep(2000);
  await touch('touchEnd', []);
  await sleep(300);
  const u1 = await dbg(page, () => window.__oceanDebug.playerPosition());
  const dnB = await box('#btn-down');
  await touch('touchStart', [{ x: dnB.x + dnB.w / 2, y: dnB.y + dnB.h / 2, id: 4 }]);
  await sleep(2000);
  await touch('touchEnd', []);
  await sleep(300);
  const u2 = await dbg(page, () => window.__oceanDebug.playerPosition());
  record('手機：上升 / 下降按鈕', u1[1] > u0[1] + 0.2 && u2[1] < u1[1] - 0.2, { start: u0[1], afterUp: u1[1], afterDown: u2[1] });
  // 互動按鈕
  await page.evaluate(() => window.__oceanDebug.teleport('turtle'));
  await sleep(1200);
  await page.evaluate(() => window.__oceanDebug.teleport('turtle'));
  await sleep(600);
  await page.screenshot({ path: OUT + 'mobile-turtle.png' });
  await page.tap('#btn-interact');
  await sleep(1200);
  const mcard = await page.isVisible('#card-overlay');
  await settle(page, '#card-overlay');
  await page.screenshot({ path: OUT + 'mobile-card.png' });
  await page.tap('#card-action');
  await sleep(500);
  record('手機：互動按鈕開啟知識卡並完成任務', mcard && (await page.textContent('#mission-progress')) === '任務進度：1/5', { cardOpened: mcard, progress: await page.textContent('#mission-progress') });
  await page.evaluate(() => window.__oceanDebug.teleport('bottle'));
  await sleep(800);
  await page.tap('#btn-interact');
  await sleep(600);
  await page.tap('#card-action');
  await completeConservationSites(page, true);
  await waitFor(page, () => !document.querySelector('#end-screen').classList.contains('hidden'), 8000);
  await sleep(800);
  await page.screenshot({ path: OUT + 'mobile-complete.png' });
  record('手機：完成五項任務與結束畫面', await page.isVisible('#end-screen'), { progress: await page.textContent('#mission-progress') });
  perf.mobile_low_390x844_dpr2 = await (async () => {
    await page.tap('#btn-free');
    await sleep(1500);
    return measureFps(page, 5);
  })();
  await ctx.close();
}

// 橫向手機
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  watch(page, 'mobile-landscape');
  await page.goto(BASE + '?debug=1');
  await page.waitForSelector('#home:not(.hidden)', { timeout: 60000 });
  await page.tap('#btn-start');
  await sleep(800);
  await page.tap('#guide-dialog .btn-primary');
  await sleep(2000);
  await page.screenshot({ path: OUT + 'mobile-landscape.png' });
  await ctx.close();
}
await browser.close();

// ======================= WebGL 無法使用時的錯誤提示 =======================
{
  const b2 = await chromium.launch({ executablePath: CHROME, args: ['--disable-webgl', '--disable-3d-apis', '--disable-gpu'] });
  const page = await b2.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(BASE);
  const shown = await page.waitForSelector('#webgl-error:not(.hidden)', { timeout: 15000 }).then(() => true).catch(() => false);
  await page.screenshot({ path: OUT + 'webgl-error.png' });
  record('WebGL 無法啟動時顯示易懂的錯誤提示', shown, shown ? await page.textContent('#webgl-error h2') : 'not shown');
  await b2.close();
}

record('瀏覽器 Console 錯誤', consoleErrors.length === 0, consoleErrors.length ? consoleErrors : '0 個錯誤');
const passed = results.filter((r) => r.pass).length;
writeFileSync(OUT + 'test-results.json', JSON.stringify({ date: new Date().toISOString(), passed, total: results.length, results, perf, consoleErrors }, null, 2));
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
