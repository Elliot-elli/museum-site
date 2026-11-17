/**
 * verify_images.js — 响应式图片与导出件的回归门。
 *
 * 用法：
 *   node tools/verify_images.js                # 验证 site/
 *   node tools/verify_images.js --url <地址>   # 验证任意部署地址
 *
 * 覆盖：
 *   R1-R4  各视口下浏览器实际选中的变体、体积降幅、width/height、fetchpriority
 *   R5-R10 导出件：资源已内联、无真实 srcset、无外部图片引用
 *   R11-R14 导出件独立打开：图片显示、切案例、热点裁剪、无 JS 错误
 *
 * 断言只在 DOM 层做（DOMParser），不扫源码文本 ——
 * app.js 的 render() 模板里必然含 srcset="${c.imageSrcset}" 字样，
 * 按字符串判会把正常模板当成残留。
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
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
};

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

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const VIEWPORTS = [
  { label: '手机 375@2x', width: 375, height: 800, dpr: 2 },
  { label: '手机 414@3x', width: 414, height: 900, dpr: 3 },
  { label: '桌面 1440@1x', width: 1440, height: 900, dpr: 1 },
  { label: '桌面 1440@2x', width: 1440, height: 900, dpr: 2 },
];
const JPEG_BYTES = 704252; // img/case-01.jpg 的实际体积，作为降幅基准

(async () => {
  const urlArg = process.argv.indexOf('--url');
  let base, srv = null;
  if (urlArg > -1) {
    base = process.argv[urlArg + 1];
  } else {
    const s = await serve(SITE);
    srv = s.srv; base = `http://127.0.0.1:${s.port}`;
  }
  console.log(`\n=== 图片与导出验证：${base} ===\n`);

  const browser = await chromium.launch({ executablePath: PW_CHROME });

  for (const cfg of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: cfg.width, height: cfg.height }, deviceScaleFactor: cfg.dpr,
    });
    const page = await ctx.newPage();
    const bytes = {};
    page.on('response', async (r) => {
      if (!/\.(webp|jpe?g|png)$/i.test(r.url())) return;
      try { bytes[path.basename(r.url())] = (await r.body()).length; } catch (e) { /* 已释放 */ }
    });
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const hero = await page.evaluate(() => {
      const i = document.querySelector('.photo img');
      if (!i) return null;
      return {
        currentSrc: i.currentSrc, src: i.getAttribute('src'),
        srcset: i.getAttribute('srcset'), w: i.getAttribute('width'), h: i.getAttribute('height'),
        fp: i.getAttribute('fetchpriority'), loading: i.getAttribute('loading'),
      };
    });
    if (!hero) {
      check(`R1 ${cfg.label} 找到 hero 图`, false, '页面无 .photo img');
      await ctx.close();
      continue;
    }
    const file = path.basename(hero.currentSrc);
    const size = bytes[file] || 0;
    check(`R1 ${cfg.label} 选中 WebP 变体`, /\.webp$/.test(hero.currentSrc), `${file}  ${Math.round(size / 1024)}KB`);
    check(`R2 ${cfg.label} 体积小于原 JPEG`,
      size > 0 && size < JPEG_BYTES,
      `${Math.round(size / 1024)}KB / 原 ${Math.round(JPEG_BYTES / 1024)}KB  省 ${Math.round((1 - size / JPEG_BYTES) * 100)}%`);
    check(`R3 ${cfg.label} width/height 属性就位`, hero.w === '1900' && hero.h === '1604', `w=${hero.w} h=${hero.h}`);
    check(`R4 ${cfg.label} hero 带 fetchpriority=high`, hero.fp === 'high', `fetchpriority=${hero.fp}`);
    await ctx.close();
  }

  // ---- 导出件 ----
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { const d = document.getElementById('editorDrawer'); if (d) d.open = true; });
  await page.waitForTimeout(300);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 90000 }),
    page.locator('#editorDrawer button:has-text("导出新版 HTML")').click(),
  ]);
  const out = path.join(SITE, '..', '.verify-export.html');
  await download.saveAs(out);
  const html = fs.readFileSync(out, 'utf-8');
  check('R5 导出件已生成', html.length > 0, `${download.suggestedFilename()}  ${Math.round(html.length / 1024)}KB`);

  const dom = await page.evaluate((src) => {
    const doc = new DOMParser().parseFromString(src, 'text/html');
    const imgs = [...doc.querySelectorAll('img')];
    return {
      total: imgs.length,
      inlined: imgs.filter((i) => (i.getAttribute('src') || '').startsWith('data:')).length,
      externalSrc: imgs.map((i) => i.getAttribute('src')).filter((s) => s && !s.startsWith('data:')),
      srcsets: imgs.map((i) => i.getAttribute('srcset')).filter(Boolean),
      styles: doc.querySelectorAll('style').length,
    };
  }, html);
  check('R6 导出件已内联 CSS', dom.styles >= 1, `${dom.styles} 个 <style>`);
  check('R7 导出件图片已内联为 data URI', dom.inlined >= 1, `${dom.inlined}/${dom.total} 张已内联`);
  check('R8 导出件无残留 srcset 属性', dom.srcsets.length === 0, dom.srcsets.slice(0, 2).join(' | ') || '0 个');
  check('R9 导出件无外部图片引用', dom.externalSrc.length === 0, dom.externalSrc.slice(0, 3).join(' | ') || '0 个');

  const p2 = await ctx.newPage();
  const errs = [];
  p2.on('pageerror', (e) => errs.push(e.message));
  await p2.goto('file:///' + out.replace(/\\/g, '/'), { waitUntil: 'load' });
  await p2.waitForTimeout(2500);
  const st = await p2.evaluate(() => {
    const im = document.querySelector('.photo img');
    return { natW: im ? im.naturalWidth : -1 };
  });
  check('R10 导出件图片可显示', st.natW > 0, `naturalWidth=${st.natW}`);
  await p2.locator('#tab1').click();
  await p2.waitForTimeout(900);
  const h2 = (await p2.locator('#content h2').first().textContent()).trim();
  check('R11 导出件可切换案例', h2.includes('AI'), h2);
  await p2.locator('.map-hotspot').first().click({ force: true });
  await p2.waitForTimeout(3000);
  const crop = await p2.evaluate(() => (document.getElementById('zoomPosterCrop').getAttribute('src') || '').slice(0, 22));
  check('R12 导出件热点裁剪可用', crop.startsWith('data:image/'), crop);
  check('R13 导出件无 JS 运行时错误', errs.length === 0, errs.slice(0, 2).join(' | ') || '0 条');

  console.log('');
  const failed = results.filter((r) => !r.pass);
  console.log(`=== 结果：${results.length - failed.length} PASS / ${failed.length} FAIL ===`);
  if (failed.length) {
    console.log('失败项：');
    failed.forEach((f) => console.log('  - ' + f.name + '  ' + (f.detail || '')));
  }
  await browser.close();
  if (srv) srv.close();
  fs.unlinkSync(out);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
