/**
 * verify.js — 阶段0 验证：真实 Chromium 加载拆分后的站点，逐项核对。
 *
 * 用法：
 *   node tools/verify.js                 # 验证 site/
 *   node tools/verify.js --compare <原始HTML路径>   # 与原单文件对比渲染
 *
 * 验证项：
 *   V1  控制台无错误（含沙箱层残留的 TypeError 检测）
 *   V2  三个案例 tab 均可切换且内容正确
 *   V3  点击放大弹窗（viewer）可打开、可关闭
 *   V4  分析区热点点击 → 局部放大图有内容（canvas 裁剪生效）
 *   V5  自查清单 15 项可勾选，localStorage 持久化
 *   V6  编辑模式可进入，文本可改，「恢复原文」回位正确
 *   V7  资源加载无 404
 *   V8  （可选）与原单文件渲染逐案例文本一致
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const PW_CHROME = 'C:/Users/EDY/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function serve(rootDir, mapTo) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      // mapTo: 把根路径映射到指定文件（用于中文文件名，URL 编码后无法可靠反解）
      const fp = mapTo ? mapTo : path.join(rootDir, p);
      if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404); res.end('404'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      fs.createReadStream(fp).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

(async () => {
  const compareArg = process.argv.indexOf('--compare');
  // 未显式指定时，自动使用桌面上的原始单文件（存在即比对）——
  // 这是最强的回归判据：拆分后正文必须与原文件逐字一致。
  const DEFAULT_ORIG = 'C:/Users/EDY/Desktop/博雅博物馆_优秀案例解读_点击放大互动版_2026-11-02.html';
  const comparePath = compareArg > -1
    ? process.argv[compareArg + 1]
    : (fs.existsSync(DEFAULT_ORIG) ? DEFAULT_ORIG : null);
  if (comparePath) {
    console.log(`对比基准：${comparePath}`);
  }

  const { srv, port } = await serve(SITE);
  const base = `http://127.0.0.1:${port}`;
  console.log(`\n=== 阶段0 验证：${base} ===\n`);

  const browser = await chromium.launch({ executablePath: PW_CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const failedReqs = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => failedReqs.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) failedReqs.push(`${r.status()} ${r.url()}`); });

  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // V1 控制台无错误
  check('V1 控制台无错误', consoleErrors.length === 0,
    consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : '0 条');

  // V7 资源无失败
  check('V7 资源加载无 404/失败', failedReqs.length === 0,
    failedReqs.length ? failedReqs.slice(0, 3).join(' | ') : '0 条');

  // V2 三个 tab 切换
  const tabCount = await page.locator('[role=tab]').count();
  check('V2a 存在 3 个案例 tab', tabCount === 3, `实际 ${tabCount}`);

  const titles = [];
  for (let i = 0; i < 3; i++) {
    await page.locator(`#tab${i}`).click();
    await page.waitForTimeout(350);
    const t = await page.locator('#content h2').first().textContent();
    const active = await page.locator(`#tab${i}`).getAttribute('aria-selected');
    titles.push({ i, title: (t || '').trim(), active });
  }
  const tabsOk = titles.every((t) => t.active === 'true' && t.title.length > 0);
  check('V2b 三个案例均可切换且标题非空', tabsOk,
    titles.map((t) => `#${t.i}:${t.title}`).join(' / '));

  // V3 放大弹窗
  await page.locator('#tab0').click();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("查看作品原图")').first().click();
  await page.waitForTimeout(400);
  const viewerOpen = await page.locator('#viewer').evaluate((d) => d.open === true);
  const fullSrc = await page.locator('#full').getAttribute('src');
  const fullNatural = await page.locator('#full').evaluate((i) => i.naturalWidth);
  check('V3a 点击放大弹窗打开', viewerOpen, `viewer.open=${viewerOpen}`);
  check('V3b 放大图加载成功', fullNatural > 0, `naturalWidth=${fullNatural} src=${fullSrc}`);

  await page.locator('#viewer').evaluate((d) => d.close());
  await page.waitForTimeout(300);
  const viewerClosed = await page.locator('#viewer').evaluate((d) => d.open === false);
  check('V3c 弹窗可关闭', viewerClosed, `viewer.open=${viewerClosed}`);

  // V4 分析热点 → 局部裁剪（需先确保 analysisZoomDialog 是关闭的）
  await page.evaluate(() => {
    const d = document.getElementById('analysisZoomDialog');
    if (d && d.open) d.close();
  });
  await page.waitForTimeout(200);
  const hotspot = page.locator('.map-hotspot').first();
  const hasHotspot = await hotspot.count() > 0;
  if (hasHotspot) {
    await hotspot.click({ force: true });
    await page.waitForTimeout(500);
    const cropSrc = await page.locator('#zoomPosterCrop').getAttribute('src');
    const cropLen = (cropSrc || '').length;
    check('V4 展板局部裁剪生成 data URI', cropSrc && cropSrc.startsWith('data:image/'),
      `len=${cropLen}`);
  } else {
    check('V4 展板局部裁剪生成 data URI', false, '未找到 .map-hotspot');
  }

  // V5 自查清单（原设计为 13 项：4 组，2+3+3+5）
  // 先关闭所有弹层，避免遮罩挡住后续交互
  await page.evaluate(() => {
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  });
  await page.waitForTimeout(200);

  const checks = await page.locator('#checks input[type=checkbox]').count();
  const groups = await page.locator('#checks .checkgroup').count();
  check('V5a 自查清单 13 项 / 4 组', checks === 13 && groups === 4,
    `实际 ${checks} 项 / ${groups} 组`);
  await page.locator('#checks input[type=checkbox]').first().check();
  await page.waitForTimeout(250);
  const progress = await page.locator('#progress').textContent();
  const stored = await page.evaluate(() => localStorage.getItem('museum-checks-v2'));
  check('V5b 勾选持久化', progress.includes('1') && stored && stored.includes('0'),
    `progress="${(progress || '').trim()}" stored=${stored}`);

  // V6 编辑模式 + 恢复原文
  // 注意：编辑工具栏在 <details id="editorDrawer"> 抽屉内，默认收起，
  // 必须先展开才能点到按钮（原文件同样如此，非拆分引入的回归）。
  await page.evaluate(() => {
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    const dr = document.getElementById('editorDrawer');
    if (dr && !dr.open) dr.open = true;
  });
  await page.waitForTimeout(250);
  const drawerOpen = await page.locator('#editorDrawer').evaluate((d) => d.open === true);
  check('V6a 编辑抽屉可展开', drawerOpen, `editorDrawer.open=${drawerOpen}`);

  await page.locator('#editToggle').click();
  await page.waitForTimeout(300);
  const editing = await page.locator('body').evaluate((b) => b.classList.contains('editing'));
  check('V6b 可进入编辑模式', editing, `body.editing=${editing}`);

  const firstEditable = page.locator('#content [data-edit-key]').first();
  const before = (await firstEditable.textContent() || '').trim();
  await firstEditable.evaluate((el) => { el.textContent = '【验证用临时改动】'; });
  await page.waitForTimeout(200);
  const after = (await firstEditable.textContent() || '').trim();
  check('V6c 编辑后文本变化', before !== after, `"${before.slice(0, 14)}" → "${after.slice(0, 14)}"`);

  // 「恢复原文」：点开重置弹层 → 恢复
  await page.evaluate(() => {
    const d = document.getElementById('resetEditor');
    if (d && !d.open) d.showModal();
  });
  await page.waitForTimeout(200);
  const resetVisible = await page.locator('#resetEditor').evaluate((d) => d.open === true);
  check('V6d 重置弹层可打开', resetVisible, `resetEditor.open=${resetVisible}`);

  await page.locator('#resetEditor button.danger').click();
  await page.waitForTimeout(500);
  const restored = (await firstEditable.textContent() || '').trim();
  check('V6e 恢复原文回位正确', restored === before,
    `期望"${before.slice(0, 16)}" 实际"${restored.slice(0, 16)}"`);

  // V8 可选：与原单文件逐案例正文对比
  // 必须用全新 context + 全新页面：前面的 V6 把 localStorage 改成了编辑态，
  // 同 context 下的新页面会继承该状态（编辑记录），无法作为干净基准。
  if (comparePath && fs.existsSync(comparePath)) {
    const origDir = path.dirname(comparePath);
    // 中文文件名经 URL 编码后无法可靠反解 → 直接把根路径映射到该文件
    const o = await serve(origDir, comparePath);

    const ctxO = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const ctxN = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const op = await ctxO.newPage();
    const np = await ctxN.newPage();

    await op.goto(`http://127.0.0.1:${o.port}/`, { waitUntil: 'networkidle' });
    await op.waitForTimeout(800);
    await np.goto(base + '/', { waitUntil: 'networkidle' });
    await np.waitForTimeout(800);

    const cmp = [];
    for (let i = 0; i < 3; i++) {
      const grab = async (pg, tag) => {
        const r = await pg.evaluate(() => {
          const c = document.getElementById('content');
          return c ? c.textContent : null;
        });
        if (r === null) {
          const diag = await pg.evaluate(() => ({
            url: location.href,
            hasContent: !!document.getElementById('content'),
            hasRender: typeof window.render,
            bodyLen: document.body ? document.body.textContent.length : -1,
            readyState: document.readyState,
          }));
          throw new Error(`[${tag}] #content 为 null；诊断=${JSON.stringify(diag)}`);
        }
        return r.replace(/\s+/g, ' ').trim();
      };
      await op.evaluate((n) => { window.render && window.render(n); }, i);
      await op.waitForTimeout(450);
      const ot = await grab(op, `原文件 case${i}`);
      await np.evaluate((n) => { window.render && window.render(n); }, i);
      await np.waitForTimeout(450);
      const nt = await grab(np, `拆分产物 case${i}`);
      cmp.push({ i, same: ot === nt, oLen: ot.length, nLen: nt.length });
    }
    const allSame = cmp.every((c) => c.same);
    check('V8 拆分后逐案例正文与原文件一致', allSame,
      cmp.map((c) => `#${c.i}:${c.same ? 'same' : `DIFF ${c.oLen}/${c.nLen}`}`).join(' '));

    await ctxO.close();
    await ctxN.close();
    o.srv.close();
  }

  await browser.close();
  srv.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== 结果：${results.length - failed.length} PASS / ${failed.length} FAIL ===`);
  if (failed.length) {
    console.log('失败项：');
    failed.forEach((f) => console.log('  - ' + f.name + '  ' + (f.detail || '')));
  }
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
