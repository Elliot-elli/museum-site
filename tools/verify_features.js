/**
 * verify_features.js — P1 轮新增交互的回归门。
 *
 * 用法：
 *   node tools/verify_features.js               # 验证 site/
 *   node tools/verify_features.js --url <地址>  # 验证任意部署地址
 *
 * 覆盖：
 *   N1-N6   案例标签的键盘操作（←→ / Home / End / 焦点跟随）
 *   N7-N10  URL 同步 ?case=N、tabpanel aria-labelledby、切换后回到内容起点
 *   N11-N12 ?case=N 直达与非法参数回落
 *   N13     skip-link 是首个可聚焦元素且聚焦后可见
 *   N14     #checklist 锚点仍可达
 *   N15     无 JS 运行时错误
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
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
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

(async () => {
  const urlArg = process.argv.indexOf('--url');
  let base, srv = null;
  if (urlArg > -1) {
    base = process.argv[urlArg + 1];
  } else {
    const s = await serve(SITE);
    srv = s.srv; base = `http://127.0.0.1:${s.port}`;
  }
  console.log(`\n=== 新增交互验证：${base} ===\n`);

  const browser = await chromium.launch({ executablePath: PW_CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const h2of = async (pg) => (await pg.locator('#content h2').first().textContent()).trim();

  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  let h2 = await h2of(page);
  check('N1 默认渲染案例 01', h2.includes('小习惯'), h2);

  await page.locator('#tab0').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  h2 = await h2of(page);
  const aria1 = await page.locator('#tab1').getAttribute('aria-selected');
  check('N2 ArrowRight 切到案例 02', h2.includes('AI') && aria1 === 'true', `${h2} aria=${aria1}`);

  const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
  check('N3 焦点跟随到新标签', focused === 'tab1', `activeElement=${focused}`);

  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(500);
  h2 = await h2of(page);
  check('N4 ArrowLeft 回到案例 01', h2.includes('小习惯'), h2);

  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(600);
  h2 = await h2of(page);
  check('N5 ArrowLeft 从首项回绕到案例 03', h2.includes('最后一次看见'), h2);

  await page.keyboard.press('Home');
  await page.waitForTimeout(500);
  h2 = await h2of(page);
  check('N6 Home 回到案例 01', h2.includes('小习惯'), h2);

  check('N7 URL 带 ?case=1', /[?&]case=1(&|$)/.test(page.url()), page.url());

  await page.locator('#tab2').click();
  await page.waitForTimeout(700);
  h2 = await h2of(page);
  check('N8 点击标签同步 URL 为 ?case=3',
    /[?&]case=3(&|$)/.test(page.url()) && h2.includes('最后一次看见'), `${page.url()} | ${h2}`);

  const labelled = await page.locator('#content').getAttribute('aria-labelledby');
  check('N9 tabpanel 的 aria-labelledby 跟随', labelled === 'tab2', `aria-labelledby=${labelled}`);

  const scrollInfo = await page.evaluate(() => {
    const el = document.getElementById('content');
    return { y: Math.round(window.scrollY), top: Math.round(el.getBoundingClientRect().top) };
  });
  check('N10 切换后内容起点进入视口',
    scrollInfo.top > -40 && scrollInfo.top < 160, JSON.stringify(scrollInfo));

  const p2 = await ctx.newPage();
  await p2.goto(base + '/?case=3', { waitUntil: 'networkidle' });
  await p2.waitForTimeout(600);
  h2 = await h2of(p2);
  const sel2 = await p2.locator('#tab2').getAttribute('aria-selected');
  check('N11 ?case=3 直达案例 03', h2.includes('最后一次看见') && sel2 === 'true', `${h2} aria=${sel2}`);

  const p3 = await ctx.newPage();
  await p3.goto(base + '/?case=9', { waitUntil: 'networkidle' });
  await p3.waitForTimeout(500);
  h2 = await h2of(p3);
  check('N12 非法 case 参数回落案例 01', h2.includes('小习惯'), h2);

  const p4 = await ctx.newPage();
  await p4.goto(base + '/', { waitUntil: 'networkidle' });
  await p4.keyboard.press('Tab');
  await p4.waitForTimeout(200);
  const sl = await p4.evaluate(() => {
    const a = document.querySelector('.skip-link');
    const r = a.getBoundingClientRect();
    return { active: document.activeElement === a, x: Math.round(r.left), w: Math.round(r.width) };
  });
  check('N13 skip-link 首个可聚焦且聚焦后可见', sl.active && sl.w > 40 && sl.x >= 0, JSON.stringify(sl));

  const p5 = await ctx.newPage();
  await p5.goto(base + '/', { waitUntil: 'networkidle' });
  await p5.locator('.nav a[href="#checklist"]').click();
  await p5.waitForTimeout(900);
  const chk = await p5.evaluate(() => Math.round(document.getElementById('checklist').getBoundingClientRect().top));
  check('N14 #checklist 锚点仍可达', chk > -200 && chk < 300, `top=${chk}`);

  check('N15 无 JS 运行时错误', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || '0 条');

  await browser.close();
  if (srv) srv.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== 结果：${results.length - failed.length} PASS / ${failed.length} FAIL ===`);
  if (failed.length) {
    console.log('失败项：');
    failed.forEach((f) => console.log('  - ' + f.name + '  ' + (f.detail || '')));
  }
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
