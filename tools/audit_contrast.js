/**
 * audit_contrast.js — 全状态对比度审计。
 *
 * 用法：
 *   node tools/audit_contrast.js                # 审计 site/
 *   node tools/audit_contrast.js --url <地址>    # 审计任意部署地址
 *
 * 与 verify_a11y_seo.js 的 A1 项区别：
 *   A1 只看首屏默认态（案例 01）的可见文本；
 *   本脚本遍历 3 个案例 × 5 种交互态（含弹层、编辑抽屉），
 *   并额外覆盖 ::before / ::after 生成的内容与伪元素前景色，
 *   最后把每个 accent / muted 前景色按选择器归组输出。
 *
 * 判据：WCAG 2.1 AA —— 正文 4.5:1，大字（≥24px，或 ≥18.66px 且粗体）3:1。
 * 取值方式：真实 Chromium 里取计算后的 color 与实际生效背景色。
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

/* 取每个可见文本节点的实际前景色与实际生效背景，算 WCAG 对比度 */
const PROBE = () => {
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
  const ratio = (fg, bg) => {
    const L1 = lum(fg), L2 = lum(bg);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  };
  const hidden = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return true;
    if (parseFloat(cs.opacity) < 0.1) return true;
    const r = el.getBoundingClientRect();
    return r.width < 1 || r.height < 1;
  };
  const selOf = (el) => {
    const s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      const c = el.className.trim().split(/\s+/).slice(0, 2).join('.');
      return s + '.' + c;
    }
    return s;
  };
  const out = [];
  const push = (el, text, cs, fg, bg) => {
    if (!text || !text.trim()) return;
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    const r = ratio(fg, bg);
    out.push({
      sel: selOf(el), text: text.trim().slice(0, 34),
      fg: cs.color, bg: `rgb(${bg.slice(0, 3).join(',')})`,
      ratio: Number(r.toFixed(2)), need, size,
      weight: cs.fontWeight, pseudo: false,
    });
  };
  // 元素文本
  const sel = 'p,span,a,li,h1,h2,h3,h4,h5,h6,strong,b,label,button,td,th,div,dt,dd,small';
  for (const el of document.querySelectorAll(sel)) {
    if (!el.textContent.trim() || el.children.length > 0) continue;
    if (hidden(el)) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg) continue;
    push(el, el.textContent, cs, fg, bgOf(el));
  }
  // 伪元素生成的内容
  for (const el of document.querySelectorAll('*')) {
    for (const pe of ['::before', '::after']) {
      const cs = getComputedStyle(el, pe);
      if (!cs || cs.content === 'none' || cs.content === 'normal') continue;
      const txt = cs.content.replace(/^["']|["']$/g, '');
      if (!txt || txt === '') continue;
      if (hidden(el)) continue;
      const fg = parse(cs.color);
      if (!fg) continue;
      push(el, txt, cs, fg, bgOf(el));
    }
  }
  // 变量解析值，用于归组
  const root = getComputedStyle(document.documentElement);
  const vars = {};
  for (const n of ['--accent', '--muted', '--ink', '--paper', '--line']) {
    vars[n] = root.getPropertyValue(n).trim();
  }
  const hexOf = (rgbStr) => {
    const p = parse(rgbStr);
    if (!p) return rgbStr;
    return '#' + p.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
  };
  vars['--accent'] = hexOf(root.getPropertyValue('--accent').trim().startsWith('#')
    ? (() => {
      const h = root.getPropertyValue('--accent').trim().slice(1);
      return `rgb(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)})`;
    })() : 'rgb(0,0,0)');
  vars['--muted'] = hexOf(root.getPropertyValue('--muted').trim().startsWith('#')
    ? (() => {
      const h = root.getPropertyValue('--muted').trim().slice(1);
      return `rgb(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)})`;
    })() : 'rgb(0,0,0)');
  vars['--ink'] = root.getPropertyValue('--ink').trim();
  vars['--paper'] = root.getPropertyValue('--paper').trim();
  vars['--line'] = root.getPropertyValue('--line').trim();
  return { items: out, vars };
};

/* 每个交互态：把页面推到该状态后立即探测 */
const STATES = [
  { id: 'case1-default', label: '案例 01 默认', async run() {} },
  {
    id: 'case1-analysis-zoom', label: '案例 01 展板放大弹层',
    async run(page) {
      await page.evaluate(() => {
        const b = document.querySelector('.analysis-card');
        if (b) b.click();
      });
      await page.waitForTimeout(600);
    },
  },
  {
    id: 'case1-fullview', label: '案例 01 原图查看弹层',
    async run(page) {
      await page.evaluate(() => { if (typeof zoom === 'function') zoom(); });
      await page.waitForTimeout(400);
    },
  },
  {
    id: 'case1-editor', label: '案例 01 编辑抽屉展开',
    async run(page) {
      await page.evaluate(() => {
        const d = document.querySelector('.editor-drawer');
        if (d) d.open = true;
      });
      await page.waitForTimeout(300);
    },
  },
  { id: 'case2-default', label: '案例 02 默认', async run(page) { await page.evaluate(() => render(1)); await page.waitForTimeout(500); } },
  { id: 'case2-analysis-zoom', label: '案例 02 展板放大弹层', async run(page) { await page.evaluate(() => render(1)); await page.waitForTimeout(400); await page.evaluate(() => { const b = document.querySelector('.analysis-card'); if (b) b.click(); }); await page.waitForTimeout(600); } },
  { id: 'case3-default', label: '案例 03 默认', async run(page) { await page.evaluate(() => render(2)); await page.waitForTimeout(500); } },
  { id: 'case3-analysis-zoom', label: '案例 03 展板放大弹层', async run(page) { await page.evaluate(() => render(2)); await page.waitForTimeout(400); await page.evaluate(() => { const b = document.querySelector('.analysis-card'); if (b) b.click(); }); await page.waitForTimeout(600); } },
  { id: 'checklist', label: '作品自查清单', async run(page) { await page.evaluate(() => { const el = document.getElementById('checklist'); if (el) el.scrollIntoView(); }); await page.waitForTimeout(300); } },
];

(async () => {
  const urlArg = process.argv.indexOf('--url');
  let base, srv = null;
  if (urlArg > -1) base = process.argv[urlArg + 1];
  else { const s = await serve(SITE); srv = s.srv; base = `http://127.0.0.1:${s.port}`; }
  console.log(`\n=== 全状态对比度审计：${base} ===\n`);

  const browser = await chromium.launch({ executablePath: PW_CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const all = [];
  let vars = null;
  for (const st of STATES) {
    await st.run(page);
    const r = await page.evaluate(PROBE);
    vars = vars || r.vars;
    for (const it of r.items) all.push(Object.assign({ state: st.label }, it));
  }
  await browser.close();
  if (srv) srv.close();

  console.log('CSS 变量实际值：' + JSON.stringify(vars, null, 0) + '\n');

  // 去重：同一选择器 + 前景色 + 背景色 + 比值 只留一条，标注出现在哪些状态
  const map = new Map();
  for (const it of all) {
    const k = [it.sel, it.fg, it.bg, it.ratio, it.need].join('|');
    if (!map.has(k)) map.set(k, { it, states: new Set() });
    map.get(k).states.add(it.state);
  }
  const rows = [...map.values()].sort((a, b) => a.it.ratio - b.it.ratio);

  const fails = rows.filter((r) => r.it.ratio < r.it.need);
  console.log('=== 全部文本前景色（按对比度升序）===');
  for (const { it, states } of rows) {
    const flag = it.ratio < it.need ? 'FAIL' : 'ok  ';
    const st = states.size > 2 ? `${states.size} 态` : [...states][0];
    console.log(`${flag} ${String(it.ratio).padStart(5)} (需 ${it.need})  ${it.sel.padEnd(26)} ${it.fg.padEnd(18)} on ${it.bg.padEnd(18)} ${String(it.size) + 'px/' + it.weight}  ${st}  ${it.text}`);
  }

  const accentHex = (vars['--accent'] || '').toLowerCase();
  const mutedHex = (vars['--muted'] || '').toLowerCase();
  const accentRows = rows.filter((r) => r.it.fg.toLowerCase().replace(/\s/g, '') === `rgb(${accentHex.slice(1, 3) ? parseInt(accentHex.slice(1, 3), 16) : 0},${parseInt(accentHex.slice(3, 5), 16)},${parseInt(accentHex.slice(5, 7), 16)})`);
  console.log(`\n=== accent（${accentHex}）作前景色的位置 ===`);
  for (const { it, states } of accentRows) {
    console.log(`  ${it.ratio >= it.need ? 'PASS' : 'FAIL'} ${String(it.ratio).padStart(5)} (需 ${it.need})  ${it.sel.padEnd(26)} on ${it.bg}  ${it.text}`);
  }
  console.log(`  合计 ${accentRows.length} 处，其中不达标 ${accentRows.filter((r) => r.it.ratio < r.it.need).length} 处`);

  console.log(`\n=== 结果：${rows.length} 条唯一前景色 / FAIL ${fails.length} 条 ===`);
  if (fails.length) {
    console.log('不达标明细：');
    for (const { it, states } of fails) console.log(`  ${it.sel}  ${it.fg} on ${it.bg}  ${it.ratio} < ${it.need}  「${it.text}」  [${[...states].join(', ')}]`);
  }
  process.exit(fails.length ? 1 : 0);
})();
