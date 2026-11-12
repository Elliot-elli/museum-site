/**
 * verify_live.js — 公网验收：直接加载线上 pages.dev 地址，逐项核对。
 *
 * 用法：
 *   node tools/verify_live.js https://museum-site-cwb.pages.dev
 *
 * 验证项（按站点真实 DOM 结构编写，结构探针见 docs 里的探测记录）：
 *   L1  控制台无错误（含沙箱层残留 TypeError 检测）
 *   L2  三个案例 tab 可切换，onclick=render(N) 生效，active 类跟随
 *   L3  图片放大层（img#full）可打开、可关闭
 *   L4  热点裁剪（img#zoomPosterCrop）在点击热点后有内容
 *   L5  自查清单 13 项可勾选，localStorage 持久化
 *   L6  编辑模式可进入、可改，「恢复原文」回位正确
 *   L7  资源加载无 404
 *   L8  「导出新版 HTML」产出可独立打开的完整页面（真实浏览器渲染验证）
 *   L9  无横向溢出（桌面 + 移动）
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'https://museum-site-cwb.pages.dev';
const PW_CHROME = 'C:/Users/EDY/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

const results = [];
function record(id, name, pass, detail) {
  results.push({ id, name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? '  — ' + detail : ''}`);
}

(async () => {
  const browser = await chromium.launch({ executablePath: PW_CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const failedReqs = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400) failedReqs.push(`${r.status()} ${r.url()}`); });

  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);

  // ── L1 控制台无错误
  const sandboxErr = consoleErrors.filter((e) => /openai|callTool|globalThis/i.test(e));
  record('L1', '控制台无错误', consoleErrors.length === 0,
    consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : `0 个错误, 沙箱残留 ${sandboxErr.length}`);

  // ── L2 案例 tab 切换（onclick=render(N)）
  try {
    const t0 = await page.evaluate(() => {
      const a = document.querySelector('#tab0');
      return {
        active: a ? a.className : null,
        img: (document.querySelector('img[src*="case-"]') || {}).getAttribute
          ? document.querySelector('img[src*="case-"]').getAttribute('src') : null,
        heading: (document.querySelector('.overview') || {}).innerText?.slice(0, 60),
      };
    });
    await page.click('#tab1');
    await page.waitForTimeout(700);
    const t1 = await page.evaluate(() => ({
      active: document.querySelector('#tab1').className,
      active0: document.querySelector('#tab0').className,
      img: document.querySelector('img[src*="case-"]')?.getAttribute('src'),
      heading: document.querySelector('.overview')?.innerText?.slice(0, 60),
    }));
    await page.click('#tab2');
    await page.waitForTimeout(700);
    const t2 = await page.evaluate(() => ({
      active: document.querySelector('#tab2').className,
      img: document.querySelector('img[src*="case-"]')?.getAttribute('src'),
      heading: document.querySelector('.overview')?.innerText?.slice(0, 60),
    }));
    const ok = /active/.test(t1.active) && /active/.test(t2.active)
      && !/active/.test(t1.active0) && t1.img !== t2.img
      && t1.heading !== t2.heading;
    record('L2', '三个案例 tab 可切换', ok,
      `图 ${t0.img}→${t1.img}→${t2.img}；active 转移 ${t0.active}→${t1.active}→${t2.active}；概览文案${t1.heading !== t2.heading ? '已变化' : '未变'}`);
  } catch (e) { record('L2', '三个案例 tab 可切换', false, e.message); }

  // ── L3 放大层 <dialog id="viewer"> 可打开可关闭
  try {
    const opened = await page.evaluate(() => {
      // 站点实现：按钮 onclick="zoom()" → viewer.showModal()
      const btn = Array.from(document.querySelectorAll('button')).find((b) => /查看作品原图/.test(b.textContent));
      if (!btn) return { ok: false, why: '未找到「查看作品原图」按钮' };
      btn.click();
      return { ok: true };
    });
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => {
      const dlg = document.getElementById('viewer');
      if (!dlg) return { found: false };
      const f = document.getElementById('full');
      return {
        found: true,
        open: dlg.open === true,
        dlgDisp: getComputedStyle(dlg).display,
        fullSrc: f ? f.getAttribute('src') : null,
        fullW: f ? f.naturalWidth : 0,
        fullVisible: f ? (getComputedStyle(f).display !== 'none' && f.getBoundingClientRect().width > 0) : false,
      };
    });
    // 关闭：dialog 的关闭按钮
    const closed = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('#viewer button, #viewer a')).find((b) => /关闭\s*[×✕]/.test(b.textContent));
      if (btn) { btn.click(); return 'button'; }
      const dlg = document.getElementById('viewer');
      if (dlg && dlg.close) { dlg.close(); return 'dlg.close()'; }
      return 'none';
    });
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => {
      const dlg = document.getElementById('viewer');
      return { open: dlg ? dlg.open : null };
    });
    record('L3', '放大层可打开可关闭', opened.ok && st.found && st.open && st.fullVisible && st.fullW > 0 && after.open === false,
      `点击「查看作品原图」→ dialog[open]=${st.open} display=${st.dlgDisp}；#full src=${st.fullSrc} 宽=${st.fullW}px 可见=${st.fullVisible}；关闭方式=${closed}，关闭后 open=${after.open}`);
  } catch (e) { record('L3', '放大层可打开可关闭', false, e.message); }

  // ── L4 热点裁剪 .map-hotspot → #zoomPosterCrop
  try {
    const r = await page.evaluate(async () => {
      const c = document.querySelector('#zoomPosterCrop');
      if (!c) return { ok: false, why: '无 #zoomPosterCrop' };
      const before = { src: (c.getAttribute('src') || '').slice(0, 30), nw: c.naturalWidth };
      // 站点实现：.map-hotspot 有 onclick="selectAnalysis(N)"
      const hots = Array.from(document.querySelectorAll('.map-hotspot'));
      if (!hots.length) return { ok: false, why: '无 .map-hotspot', hotCount: 0 };
      hots[0].click();
      await new Promise((r2) => setTimeout(r2, 600));
      const dlg = document.getElementById('analysisZoomDialog');
      const after = { src: (c.getAttribute('src') || '').slice(0, 30), nw: c.naturalWidth, isDataUrl: /^data:image/.test(c.getAttribute('src') || '') };
      return {
        ok: true, hotCount: hots.length, before, after,
        dialogOpen: dlg ? dlg.open : false,
        title: document.getElementById('zoomAnalysisTitle')?.textContent?.slice(0, 30),
        target: document.getElementById('zoomTarget')?.textContent?.slice(0, 30),
      };
    });
    record('L4', '热点裁剪图可加载', r.ok && r.after.isDataUrl && r.after.nw > 0,
      r.ok ? `热点 ${r.hotCount} 个；裁剪图 ${r.before.src || '(空)'} → ${r.after.src || '(空)'}，解码宽度 ${r.after.nw}px，dialog 打开=${r.dialogOpen}，标题「${r.title}」对应「${r.target}」` : r.why);
  } catch (e) { record('L4', '热点裁剪图可加载', false, e.message); }

  // ── L5 自查清单 + localStorage
  try {
    const r = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll('input[type=checkbox]'));
      if (!boxes.length) return { ok: false, why: '无复选框' };
      boxes[0].click();
      return { ok: true, n: boxes.length, checked: boxes[0].checked };
    });
    await page.waitForTimeout(400);
    const persisted = await page.evaluate(() => ({
      keys: Object.keys(localStorage),
      vals: Object.keys(localStorage).map((k) => localStorage.getItem(k)),
    }));
    const hasVal = persisted.vals.some((v) => v && v !== '[]' && v !== '{}');
    record('L5', '自查清单可勾选且持久化', r.ok && r.checked && persisted.keys.length > 0 && hasVal,
      `复选框 ${r.n} 个，键 [${persisted.keys.join(', ')}]，值非空=${hasVal}`);
  } catch (e) { record('L5', '自查清单可勾选且持久化', false, e.message); }

  // ── L6 编辑模式 + 恢复原文
  // 站点实现：抽屉里的「恢复原文」→ openReset() 打开确认弹层 → 弹层里 .danger 按钮 → resetOriginal()
  //           resetOriginal() 会 render(current) 重建 #content，所以旧 DOM 节点上的覆盖文本必然消失。
  // 正确判据 = 覆盖后「有残留」，点确认后「无残留」。
  try {
    const entered = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => /编辑文字/.test(b.textContent));
      if (!btn) return { ok: false, why: '未找到「编辑文字」' };
      btn.click();
      return { ok: true };
    });
    await page.waitForTimeout(700);
    const editable = await page.evaluate(() => {
      const es = Array.from(document.querySelectorAll('[contenteditable=true]'));
      // 只取带 data-edit-key 的（这才是编辑器真正管理的叶子节点）
      const keyed = es.filter((e) => e.dataset.editKey);
      return { n: es.length, keyed: keyed.length, sample: keyed[0] ? keyed[0].textContent.slice(0, 30) : null, key: keyed[0]?.dataset.editKey };
    });
    let restored = null;
    if (editable.keyed > 0) {
      const target = await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('[contenteditable=true][data-edit-key]'))
          .find((e) => e.textContent && e.textContent.trim().length > 3);
        if (!el) return { ok: false };
        el.focus();
        el.textContent = 'ZZZ_TEST_OVERWRITE_ZZZ';
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        return { ok: true, key: el.dataset.editKey };
      });
      await page.waitForTimeout(400);
      const mid = await page.evaluate(() => ({
        bad: Array.from(document.querySelectorAll('[data-edit-key]')).filter((e) => e.textContent.includes('ZZZ_TEST_OVERWRITE_ZZZ')).length,
      }));
      // 第一步：点抽屉里的「恢复原文」→ 打开确认弹层
      const openedDlg = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find((b) => /恢复原文/.test(b.textContent) && !b.closest('#resetEditor'));
        if (!btn) return false;
        btn.click();
        return true;
      });
      await page.waitForTimeout(500);
      const dlgOpen = await page.evaluate(() => {
        const d = document.getElementById('resetEditor');
        return d ? d.open : false;
      });
      // 第二步：点确认弹层里的 .danger 按钮
      const confirmed = await page.evaluate(() => {
        const btn = document.querySelector('#resetEditor button.danger');
        if (!btn) return false;
        btn.click();
        return true;
      });
      await page.waitForTimeout(900);
      const after = await page.evaluate(() => ({
        bad: Array.from(document.querySelectorAll('[data-edit-key]')).filter((e) => e.textContent.includes('ZZZ_TEST_OVERWRITE_ZZZ')).length,
        dlgOpen: document.getElementById('resetEditor')?.open,
        sample: Array.from(document.querySelectorAll('[data-edit-key]'))[0]?.textContent?.slice(0, 30),
      }));
      restored = { openedDlg, dlgOpen, confirmed, after };
      record('L6', '编辑模式可进入且恢复原文正确',
        entered.ok && editable.keyed > 0 && target.ok && mid.bad > 0
        && openedDlg && dlgOpen && confirmed && after.bad === 0,
        `可编辑 ${editable.n} 个（其中带 editKey ${editable.keyed} 个，例 ${editable.key}）；覆盖后残留 ${mid.bad} 处；确认弹层打开=${dlgOpen}；确认后残留 ${after.bad} 处，样本=${after.sample}`);
    } else {
      record('L6', '编辑模式可进入且恢复原文正确', false, `进入编辑但无带 editKey 的可编辑元素`);
    }
  } catch (e) { record('L6', '编辑模式可进入且恢复原文正确', false, e.message); }

  // ── L7 资源加载无 404
  const real404 = failedReqs.filter((u) => !/favicon\.ico/.test(u));
  record('L7', '资源加载无 404', real404.length === 0,
    real404.length ? real404.slice(0, 3).join(' | ') : `${failedReqs.length} 个失败请求（含 favicon ${failedReqs.length - real404.length} 个）`);

  // ── L8 导出新版 HTML —— 捕获 blob 并用真实浏览器渲染
  try {
    const r = await page.evaluate(async () => {
      const captured = [];
      const origCreate = URL.createObjectURL;
      URL.createObjectURL = function (blob) {
        if (blob instanceof Blob) captured.push(blob);
        return origCreate.call(URL, blob);
      };
      const origDl = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { /* 阻止下载 */ };
      const btn = Array.from(document.querySelectorAll('button')).find((b) => /导出新版|导出\s*HTML|导出/.test(b.textContent));
      if (!btn) { URL.createObjectURL = origCreate; HTMLAnchorElement.prototype.click = origDl; return { ok: false, why: '未找到导出按钮' }; }
      btn.click();
      await new Promise((res) => setTimeout(res, 2000));
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origDl;
      if (!captured.length) return { ok: false, why: '未捕获到 Blob' };
      const text = await captured[0].text();
      return { ok: true, size: captured[0].size, len: text.length, html: text };
    });
    if (!r.ok) {
      record('L8', '导出 HTML 可独立打开', false, r.why);
    } else {
      const tmp = path.join(process.env.TEMP || '.', 'export_check.html');
      fs.writeFileSync(tmp, r.html, 'utf8');
      const p2 = await ctx.newPage();
      const perrs = [];
      p2.on('pageerror', (e) => perrs.push(e.message));
      await p2.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'load', timeout: 30000 });
      await p2.waitForTimeout(1800);
      const info = await p2.evaluate(() => ({
        bodyLen: document.body ? document.body.innerText.trim().length : 0,
        h: document.body ? document.body.scrollHeight : 0,
        imgs: document.querySelectorAll('img').length,
        imgsOk: Array.from(document.querySelectorAll('img')).filter((i) => i.naturalWidth > 0).length,
        tabs: document.querySelectorAll('.tabs button').length,
        checks: document.querySelectorAll('input[type=checkbox]').length,
      }));
      await p2.close();
      fs.unlinkSync(tmp);
      const ok = info.bodyLen > 200 && info.imgsOk > 0 && info.tabs >= 3;
      record('L8', '导出 HTML 可独立打开', ok,
        `导出 ${r.size} 字节(${r.len} 字符)；独立打开后正文 ${info.bodyLen} 字符、高 ${info.h}px、图片 ${info.imgsOk}/${info.imgs}、tab ${info.tabs} 个、复选框 ${info.checks} 个、JS错误 ${perrs.length}`);
    }
  } catch (e) { record('L8', '导出 HTML 可独立打开', false, e.message); }

  // ── L9 无横向溢出（桌面 + 移动）
  try {
    const d = await page.evaluate(() => ({
      ow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      oh: document.documentElement.scrollHeight,
      ch: document.documentElement.clientHeight,
    }));
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mp = await mctx.newPage();
    const merr = [];
    mp.on('pageerror', (e) => merr.push(e.message));
    await mp.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 });
    await mp.waitForTimeout(1000);
    const mi = await mp.evaluate(() => ({
      ow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      h: document.documentElement.scrollHeight,
    }));
    await mctx.close();
    record('L9', '无横向溢出（桌面+移动）', d.ow <= 2 && mi.ow <= 2 && merr.length === 0,
      `桌面溢出 ${d.ow}px（内容高 ${d.oh}px，长页面属正常）；移动 390px 溢出 ${mi.ow}px，内容高 ${mi.h}px，JS错误 ${merr.length}`);
  } catch (e) { record('L9', '无横向溢出（桌面+移动）', false, e.message); }

  await browser.close();

  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  console.log(`\n===== 公网验收 ${BASE} =====`);
  console.log(`PASS ${pass} / FAIL ${fail} / 共 ${results.length}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
