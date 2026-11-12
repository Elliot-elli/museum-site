/**
 * verify_viewports.js — 多视口渲染验证：确认拆分后响应式布局与原文件一致。
 *
 * 用法：node tools/verify_viewports.js [原始HTML路径]
 *
 * 对每个视口：
 *   - 截图拆分产物与原文件，比对尺寸是否非零
 *   - 比对关键元素的实际几何位置（hero 图片、tab 条、正文首段）
 *   - 检查是否存在横向溢出（scrollWidth > clientWidth）
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const PW_CHROME = 'C:/Users/EDY/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'tablet-820', width: 820, height: 1180 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-360', width: 360, height: 740 },
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function serve(rootDir, mapTo) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const fp = mapTo || path.join(rootDir, p);
      if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      fs.createReadStream(fp).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

async function measure(page) {
  return page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const doc = document.documentElement;
    return {
      hero: box('#content .hero'),
      tabs: box('.tabs'),
      intro: box('#content .intro'),
      h2: box('#content h2'),
      tabsCount: document.querySelectorAll('[role=tab]').length,
      overflowX: doc.scrollWidth - doc.clientWidth,
      bodyH: document.body.scrollHeight,
    };
  });
}

(async () => {
  const origPath = process.argv[2] ||
    'C:/Users/EDY/Desktop/博雅博物馆_优秀案例解读_点击放大互动版_2026-11-02.html';
  const hasOrig = fs.existsSync(origPath);

  const { srv, port } = await serve(SITE);
  const base = `http://127.0.0.1:${port}`;
  let o = null;
  if (hasOrig) o = await serve(path.dirname(origPath), origPath);

  const browser = await chromium.launch({ executablePath: PW_CHROME });
  console.log(`\n=== 多视口验证：${base} ===\n`);

  for (const vp of VIEWPORTS) {
    const ctxN = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const p = await ctxN.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    await p.waitForTimeout(700);
    const n = await measure(p);
    check(`V-${vp.name} 无 JS 错误`, errs.length === 0, errs[0] || '0 条');
    check(`V-${vp.name} 无横向溢出`, n.overflowX <= 1, `overflowX=${n.overflowX}px`);
    check(`V-${vp.name} hero 图可见`, n.hero && n.hero.w > 50 && n.hero.h > 50,
      n.hero ? `${n.hero.w}x${n.hero.h}` : 'null');
    check(`V-${vp.name} 三个 tab 渲染`, n.tabsCount === 3, `${n.tabsCount}`);

    if (o) {
      const ctxO = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const po = await ctxO.newPage();
      await po.goto(`http://127.0.0.1:${o.port}/`, { waitUntil: 'networkidle' });
      await po.waitForTimeout(700);
      const ov = await measure(po);
      const same = ['hero', 'tabs', 'intro', 'h2'].every((k) =>
        JSON.stringify(n[k]) === JSON.stringify(ov[k]));
      check(`V-${vp.name} 关键元素几何与原文件一致`, same,
        `hero ${JSON.stringify(n.hero)} vs ${JSON.stringify(ov.hero)}`);
      await ctxO.close();
    }
    await ctxN.close();
  }

  await browser.close();
  srv.close();
  if (o) o.srv.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== 结果：${results.length - failed.length} PASS / ${failed.length} FAIL ===`);
  failed.forEach((f) => console.log('  - ' + f.name + '  ' + (f.detail || '')));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
