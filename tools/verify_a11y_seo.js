/**
 * verify_a11y_seo.js — 无障碍与 SEO 的回归门。
 *
 * 用法：
 *   node tools/verify_a11y_seo.js                # 验证 site/
 *   node tools/verify_a11y_seo.js --url <地址>   # 验证任意部署地址
 *
 * 覆盖：
 *   A1-A10  对比度、标题层级、图片 alt、可访问名、tab 语义、skip-link、
 *           表单 label、焦点样式、六视口横向溢出
 *   S1-S11  title、description、canonical、og、JSON-LD、lang、viewport、
 *           theme-color、sitemap、robots、唯一 h1
 *
 * 对比度判据在真实 Chromium 里取计算后的颜色与实际生效背景，
 * 不靠源码里的字面色值推断 —— 变量覆盖与继承会让字面判据失效。
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
  '.webp': 'image/webp', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
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

/* 在页面里跑：取每个可见文本节点的实际前景色与实际生效背景，算 WCAG 对比度 */
const CONTRAST_PROBE = () => {
  const lum = (rgb) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  };
  const parse = (s) => {
    const m = (s || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(Number);
    return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]];
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const p = parse(getComputedStyle(n).backgroundColor);
      if (p && p[3] > 0.05) return p;
      n = n.parentElement;
    }
    return [255, 255, 255, 1];
  };
  const bad = [];
  const sel = 'p,span,a,li,h1,h2,h3,h4,h5,h6,strong,b,label,button,td,th,div,dt,dd';
  for (const el of document.querySelectorAll(sel)) {
    if (!el.textContent.trim() || el.children.length > 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.1) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (ratio < need) {
      bad.push({ text: el.textContent.trim().slice(0, 30), fg: cs.color, ratio: Number(ratio.toFixed(2)), need, size });
    }
  }
  const seen = new Set();
  return bad.filter((x) => {
    const k = x.text + x.ratio;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
};

(async () => {
  const urlArg = process.argv.indexOf('--url');
  let base, srv = null;
  if (urlArg > -1) {
    base = process.argv[urlArg + 1];
  } else {
    const s = await serve(SITE);
    srv = s.srv; base = `http://127.0.0.1:${s.port}`;
  }
  console.log(`\n=== 无障碍与 SEO 验证：${base} ===\n`);

  const browser = await chromium.launch({ executablePath: PW_CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // ---------- 无障碍 ----------
  const bad = await page.evaluate(CONTRAST_PROBE);
  check('A1 可见文本对比度达 WCAG AA', bad.length === 0,
    bad.length ? bad.slice(0, 4).map((b) => `${b.text}(${b.ratio}<${b.need})`).join(' | ') : '0 处违规');

  const a11y = await page.evaluate(() => {
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => +h.tagName[1]);
    const jumps = [];
    for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) jumps.push(`${hs[i - 1]}->${hs[i]}`);
    const tl = document.querySelector('[role=tablist]');
    const tabs = [...document.querySelectorAll('[role=tab]')];
    const panel = document.querySelector('[role=tabpanel]');
    const named = (el) => (el.textContent || '').trim() || el.getAttribute('aria-label') || el.getAttribute('title');
    return {
      jumps,
      h1Count: document.querySelectorAll('h1').length,
      imgNoAlt: [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length,
      btnNoName: [...document.querySelectorAll('button')].filter((b) => !named(b)).length,
      linkNoName: [...document.querySelectorAll('a')].filter((a) => !named(a)).length,
      inputNoLabel: [...document.querySelectorAll('input')].filter((i) => !i.closest('label') && !i.getAttribute('aria-label')).length,
      tabCount: tabs.length,
      tabHasAriaControls: tabs.length > 0 && tabs.every((t) => t.hasAttribute('aria-controls')),
      tabRoving: tabs.map((t) => t.getAttribute('tabindex')),
      panelRole: panel ? panel.getAttribute('role') : null,
      panelLabelled: panel ? panel.getAttribute('aria-labelledby') : null,
      hasSkip: !!document.querySelector('a.skip-link[href="#main"]'),
      mainId: !!document.getElementById('main'),
    };
  });

  check('A2 标题层级无跳级', a11y.jumps.length === 0, a11y.jumps.join(' | ') || '0 处');
  check('A3 全文仅一个 h1', a11y.h1Count === 1, `h1 数量 ${a11y.h1Count}`);
  check('A4 图片均有 alt', a11y.imgNoAlt === 0, `${a11y.imgNoAlt} 张缺 alt`);
  check('A5 按钮均有可访问名', a11y.btnNoName === 0, `${a11y.btnNoName} 个缺名`);
  check('A6 链接均有可访问名', a11y.linkNoName === 0, `${a11y.linkNoName} 个缺名`);
  check('A7 表单控件均有关联 label', a11y.inputNoLabel === 0, `${a11y.inputNoLabel} 个缺 label`);
  check('A8 tab 有 aria-controls 与 roving tabindex',
    a11y.tabHasAriaControls && a11y.tabRoving.filter((v) => v === '0').length === 1,
    `aria-controls=${a11y.tabHasAriaControls} tabindex=${a11y.tabRoving.join(',')}`);
  check('A9 tabpanel 语义完整',
    a11y.panelRole === 'tabpanel' && !!a11y.panelLabelled,
    `role=${a11y.panelRole} aria-labelledby=${a11y.panelLabelled}`);
  check('A10 skip-link 与 main 地标就位', a11y.hasSkip && a11y.mainId, `skip=${a11y.hasSkip} main#${a11y.mainId}`);

  const outline = await page.evaluate(() => {
    const b = document.querySelector('.tabs button');
    b.focus();
    const cs = getComputedStyle(b);
    return { width: cs.outlineWidth, style: cs.outlineStyle };
  });
  check('A11 焦点样式可见', outline.style !== 'none' && parseFloat(outline.width) >= 2,
    `outline ${outline.width} ${outline.style}`);

  const viewports = [];
  for (const w of [320, 375, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.waitForTimeout(350);
    const o = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    viewports.push({ w, ...o, over: o.sw > o.cw + 1 });
  }
  const over = viewports.filter((v) => v.over);
  check('A12 六视口无横向溢出', over.length === 0,
    over.length ? over.map((v) => `${v.w}px(${v.sw}>${v.cw})`).join(' | ') : '320/375/414/768/1024/1440 全通过');

  // ---------- SEO ----------
  const seo = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const metas = [...document.querySelectorAll('meta')];
    const get = (n) => { const m = metas.find((x) => x.getAttribute('name') === n || x.getAttribute('property') === n); return m ? m.getAttribute('content') : null; };
    let ld = null, ldErr = null;
    const s = q('script[type="application/ld+json"]');
    if (s) { try { ld = JSON.parse(s.textContent); } catch (e) { ldErr = String(e); } }
    return {
      title: document.title, lang: document.documentElement.lang,
      description: get('description'), canonical: q('link[rel=canonical]')?.href || null,
      ogType: get('og:type'), ogTitle: get('og:title'), ogDesc: get('og:description'), ogUrl: get('og:url'),
      themeColor: get('theme-color'), viewport: get('viewport'),
      ld, ldErr,
    };
  });

  check('S1 title 存在且非空', !!seo.title && seo.title.length > 5, seo.title);
  check('S2 meta description 存在', !!seo.description && seo.description.length > 20, `${(seo.description || '').length} 字符`);
  check('S3 canonical 存在', !!seo.canonical, seo.canonical || '缺失');
  check('S4 og:title/description/url/type 齐全',
    !!(seo.ogType && seo.ogTitle && seo.ogDesc && seo.ogUrl), `type=${seo.ogType}`);
  check('S5 theme-color 存在', !!seo.themeColor, seo.themeColor || '缺失');
  check('S6 lang 与 viewport 就位', seo.lang === 'zh-CN' && !!seo.viewport, `lang=${seo.lang}`);
  check('S7 JSON-LD 可解析且 context 正确',
    !!seo.ld && seo.ld['@context'] === 'https://schema.org' && !seo.ldErr,
    seo.ldErr || `@type=${seo.ld && seo.ld['@type']}`);

  const sitemap = await page.evaluate(async () => {
    const r = await fetch('/sitemap.xml');
    const t = await r.text();
    return { status: r.status, hasUrlset: t.includes('<urlset'), locs: (t.match(/<loc>/g) || []).length };
  });
  check('S8 sitemap.xml 可访问且含 urlset',
    sitemap.status === 200 && sitemap.hasUrlset && sitemap.locs >= 1,
    `HTTP ${sitemap.status}  ${sitemap.locs} 条 URL`);

  const robots = await page.evaluate(async () => {
    const r = await fetch('/robots.txt');
    const t = await r.text();
    return { status: r.status, hasSitemap: /Sitemap:/i.test(t) };
  });
  check('S9 robots.txt 声明 Sitemap', robots.status === 200 && robots.hasSitemap, `HTTP ${robots.status}`);

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
