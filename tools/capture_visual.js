/**
 * capture_visual.js — 抓取页面状态矩阵的整页截图，供改动前后做像素比对。
 *
 * 用法：
 *   node tools/capture_visual.js <输出目录>
 *   node tools/capture_visual.js <输出目录> --url <地址>
 *
 * 抓 4 个视口 × 4 个状态，另加 1 个打印态。状态矩阵用来捕捉「只在一处出现」的层叠与布局回归：
 *   default=案例 01，case03=切到案例 03，dialog=展板局部放大弹层，
 *   edit-mode=编辑抽屉展开并进入编辑模式，print=打印媒体模拟。
 *
 * 配 tools/compare_visual.py 使用：
 *   node tools/capture_visual.js .snap/before
 *   # 改 CSS → 重新构建 → node tools/capture_visual.js .snap/after
 *   python tools/compare_visual.py .snap/before .snap/after
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const PW_CHROME = 'C:/Users/EDY/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
};

const VIEWPORTS = [
  { name: 'w320', width: 320, height: 800 },
  { name: 'w375', width: 375, height: 800 },
  { name: 'w768', width: 768, height: 900 },
  { name: 'w1440', width: 1440, height: 900 },
];

function serve(dir) {
  return new Promise((res) => {
    const srv = http.createServer((req, rq) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const fp = path.join(dir, p);
      if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rq.writeHead(404); rq.end('404'); return; }
      rq.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      fs.createReadStream(fp).pipe(rq);
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

async function settle(page) {
  await page.waitForTimeout(350);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/* 整页截图前必须等所有图片就位：
   懒加载图（展板图）若在截图时尚未解码，两次抓取会出现随机差异。
   先滚到底触发懒加载 → 等全部 img complete → 滚回顶部。
   注意：站点开了 scroll-behavior:smooth，scrollTo 必须显式指定
   behavior:'instant'，否则滚动是动画，循环跑完时页面还没到底，
   懒加载图永不触发，Promise 一直挂着。 */
async function settleImages(page) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 80));
    }
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 400));
    window.scrollTo({ top: 0, behavior: 'instant' });
    const pending = [...document.images].filter((i) => !i.complete);
    await Promise.race([
      Promise.all(pending.map((i) => new Promise((r) => {
        i.addEventListener('load', r, { once: true });
        i.addEventListener('error', r, { once: true });
      }))),
      new Promise((r) => setTimeout(r, 8000)),
    ]);
  });
  await settle(page);
}

(async () => {
  const outDir = path.resolve(process.argv[2] || path.join(ROOT, '.snap'));
  const urlArg = process.argv.indexOf('--url');
  let base, srv = null;
  if (urlArg > -1) {
    base = process.argv[urlArg + 1];
  } else {
    const s = await serve(SITE);
    srv = s.srv; base = `http://127.0.0.1:${s.port}`;
  }
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ executablePath: PW_CHROME });
  let n = 0;

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();

    // 首屏：案例 01 渲染完成后的整页
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await settleImages(page);
    await page.screenshot({ path: path.join(outDir, `${vp.name}_default.png`), fullPage: true });
    n++;

    // case03
    await page.locator('#tab2').click();
    await settleImages(page);
    await page.screenshot({ path: path.join(outDir, `${vp.name}_case03.png`), fullPage: true });
    n++;

    // dialog：展板局部放大（走 canvas 裁剪，异步）
    await page.locator('.map-hotspot').first().click({ force: true });
    await page.waitForTimeout(1200);
    await settleImages(page);
    await page.screenshot({ path: path.join(outDir, `${vp.name}_dialog.png`), fullPage: true });
    n++;
    await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); });
    await settle(page);

    // edit-mode
    await page.evaluate(() => {
      const d = document.getElementById('editorDrawer');
      if (d) d.open = true;
      const t = document.getElementById('editToggle');
      if (t && t.getAttribute('aria-pressed') === 'false') t.click();
    });
    await settleImages(page);
    await page.screenshot({ path: path.join(outDir, `${vp.name}_edit-mode.png`), fullPage: true });
    n++;

    await ctx.close();
  }

  // 打印媒体模拟，只在桌面宽度下截一次
  const pctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ppage = await pctx.newPage();
  await ppage.goto(base + '/', { waitUntil: 'networkidle' });
  await ppage.emulateMedia({ media: 'print' });
  await settleImages(ppage);
  await ppage.screenshot({ path: path.join(outDir, 'w1440_print.png'), fullPage: true });
  n++;
  await pctx.close();

  await browser.close();
  if (srv) srv.close();
  console.log(`已抓取 ${n} 张截图 → ${outDir}`);
})().catch((e) => { console.error(e); process.exit(2); });
