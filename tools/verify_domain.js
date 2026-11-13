/**
 * verify_domain.js — 自有域名就绪验收（绑完域名后跑这个）
 *
 * 用法：
 *   node tools/verify_domain.js museum.example.com
 *   node tools/verify_domain.js museum.example.com --no-www
 *   node tools/verify_domain.js museum.example.com https://museum-site-cwb.pages.dev
 *
 * 参数：
 *   ARGV[0]  要验收的域名（必填）。子域名或根域名都行
 *   ARGV[1]  基线地址（默认 https://museum-site-cwb.pages.dev），用来比对内容是否逐字节一致
 *   --no-www  声明「不打算配 www」，此时 www 跳转检查记为 SKIP 而非 FAIL
 *
 * 验证项：
 *   D1  境内 DNS 双解析器（阿里 alidns / 腾讯 doh.pub）都能解析
 *   D2  解析链正确：CNAME→pages.dev（外部 DNS 路线）或 A∈Cloudflare（NS 托管路线）
 *   D3  HTTPS 200，TLS 证书有效且覆盖该主机名
 *   D4  响应体与 pages.dev 基线逐字节一致（md5 相同）
 *   D5  微信 UA（iOS + Android 双 UA）返回与普通浏览器完全相同的字节 → 无拦截页
 *   D6  www → apex 301/308 跳转且保留路径
 *   D7  真实浏览器渲染：JS 无错误、3 个 tab、图片加载、无横向溢出
 *
 * 判定原则：每条判据都必须能 FAIL。
 *   D5 用「微信 UA 的 md5 与普通 UA 的 md5 完全相等」，而不是「正文够长」——
 *   后者在拦截页本身够长时会误判为通过。
 *   D2 的两条路线分支由 tools/verify_domain.selftest.js 覆盖，不靠真实域名碰运气。
 */
const https = require('https');
const tls = require('tls');
const crypto = require('crypto');

const ARGV = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const FLAGS = process.argv.slice(2).filter((a) => a.startsWith('--'));
const DOMAIN = (ARGV[0] || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const BASE = ARGV[1] || 'https://museum-site-cwb.pages.dev';
const NO_WWW = FLAGS.includes('--no-www');
const PW_CHROME_CANDIDATES = [
  'C:/Users/EDY/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
  'C:/Users/EDY/AppData/Local/ms-playwright/chromium-1234/chrome.exe',
];
// 显式路径不存在时退回 Playwright 自带浏览器，不要因为路径变动直接判 FAIL
function chromePath() {
  for (const p of PW_CHROME_CANDIDATES) {
    if (require('fs').existsSync(p)) return p;
  }
  return undefined;
}

const UA_IOS_WX = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.42(0x18002a2b) NetType/WIFI Language/zh_CN';
const UA_AND_WX = 'Mozilla/5.0 (Linux; Android 13; 2201122C Build/SKQ1.220303.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/107.0.5304.91 Mobile Safari/537.36 MicroMessenger/8.0.42.2460(0x28002A37) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const PAGES_HOST = new URL(BASE).hostname;

// ── 纯函数（供 selftest 覆盖） ───────────────────────────────────
const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

// Cloudflare 官方 IP 段
const CF_RANGES = [
  ['173.245.48.0', '20'], ['103.21.244.0', '22'], ['103.22.200.0', '22'], ['103.31.4.0', '22'],
  ['141.101.64.0', '18'], ['108.162.192.0', '18'], ['190.93.240.0', '20'], ['188.114.96.0', '20'],
  ['197.234.240.0', '22'], ['198.41.128.0', '17'], ['162.158.0.0', '15'],
  ['104.16.0.0', '13'], ['104.24.0.0', '14'], ['172.64.0.0', '13'], ['131.0.72.0', '22'],
];
function ipToInt(ip) { return ip.split('.').reduce((a, b) => (a * 256 + (+b)) >>> 0, 0); }
function isCloudflareIP(ip) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
  const n = ipToInt(ip);
  return CF_RANGES.some(([base, bits]) => {
    const b = ipToInt(base);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((n & mask) >>> 0) === ((b & mask) >>> 0);
  });
}

/**
 * 判断解析链属于哪条路线。
 * @param {string[]} cnames  CNAME 记录值（可带尾点）
 * @param {string[]} aVals   A 记录值
 * @returns {{ok:boolean, route:string, detail:string}}
 */
function detectRoute(cnames, aVals) {
  // DNS 名大小写不敏感（RFC 4343），比较前统一小写
  const target = PAGES_HOST.toLowerCase();
  const cnAll = [...new Set(cnames.map((v) => v.replace(/\.$/, '').toLowerCase()))];
  const uniqA = [...new Set(aVals)];

  // 🔴 CNAME 一旦存在就决定了路由，不能再看 A 记录：
  // 任何 *.pages.dev 的 A 记录都是 Cloudflare IP，若允许「有 CNAME 也走 A 分支」，
  // 「CNAME 指向别人的 Pages 项目」会被误判为通过。
  if (cnAll.length) {
    if (cnAll.includes(target)) {
      return {
        ok: true, route: '外部 DNS 路线',
        detail: `CNAME → ${target}（DNS 留在原服务商，一条 CNAME 即可）`,
      };
    }
    const otherPages = cnAll.filter((v) => v.endsWith('.pages.dev'));
    return {
      ok: false, route: '异常',
      detail: `CNAME → ${cnAll.join(',')}` +
        (otherPages.length ? `；⚠️ 指向了别的 Pages 项目，本站应为 ${target}` : '') +
        '；有 CNAME 时以 CNAME 为准，不能用 A 记录判定',
    };
  }

  if (uniqA.length && uniqA.every((ip) => isCloudflareIP(ip))) {
    return {
      ok: true, route: 'NS 托管 Cloudflare 路线',
      detail: `A → ${uniqA.join(',')}（全部属 AS13335，流量经过 Cloudflare 区域，可挂 Redirect Rules）`,
    };
  }
  const bad = uniqA.filter((ip) => !isCloudflareIP(ip));
  return {
    ok: false, route: '异常',
    detail: `CNAME=(无)；A=${uniqA.join(',') || '(无)'}` +
      (bad.length ? `；其中 ${bad.join(',')} 不属 Cloudflare → 疑似 DNS 污染或指向错误` : '') +
      `（正确应为 CNAME→${target} 或 A 全属 Cloudflare）`,
  };
}

// ── 网络原语 ─────────────────────────────────────────────────────
const DOH = { aliyun: 'https://dns.alidns.com/resolve', tencent: 'https://doh.pub/resolve' };
function doh(provider, name, type) {
  return new Promise((resolve) => {
    const url = `${DOH[provider]}?name=${encodeURIComponent(name)}&type=${type}`;
    const req = https.get(url, { timeout: 15000 }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { resolve({ Status: -1, err: 'bad json: ' + d.slice(0, 80) }); }
      });
    });
    req.on('error', (e) => resolve({ Status: -1, err: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ Status: -1, err: 'timeout' }); });
  });
}
const answersOf = (r, type) => (r.Answer || []).filter((a) => a.type === type).map((a) => a.data);

// 取数（可选择不跟随跳转，便于检查 Location）
function fetchRaw(url, ua, followRedirect = false, depth = 0) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      timeout: 25000,
      headers: { 'User-Agent': ua, 'Accept-Language': 'zh-CN,zh;q=0.9' },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', async () => {
        const body = Buffer.concat(chunks);
        const loc = res.headers.location || null;
        if (followRedirect && res.statusCode >= 300 && res.statusCode < 400 && loc && depth < 5) {
          const next = new URL(loc, url).toString();
          const r = await fetchRaw(next, ua, true, depth + 1);
          return resolve({ status: res.statusCode, headers: res.headers, body, location: loc, final: r.final || next, finalStatus: r.status });
        }
        resolve({ status: res.statusCode, headers: res.headers, body, location: loc, final: url, finalStatus: res.statusCode });
      });
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
  });
}

// TLS 证书
function checkTls(host) {
  return new Promise((resolve) => {
    const sock = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 15000 }, () => {
      const c = sock.getPeerCertificate();
      resolve({
        authorized: sock.authorized,
        authError: sock.authorizationError || null,
        subject: c.subject ? (c.subject.CN || JSON.stringify(c.subject)) : null,
        issuer: c.issuer ? (c.issuer.O || c.issuer.CN || '?') : null,
        validTo: c.valid_to,
        san: c.subjectaltname || '',
        protocol: sock.getProtocol(),
      });
    });
    sock.on('error', (e) => resolve({ error: e.message }));
    sock.on('timeout', () => { sock.destroy(); resolve({ error: 'timeout' }); });
  });
}

// ── 主流程 ───────────────────────────────────────────────────────
async function main() {
  const { chromium } = require('playwright');
  const results = [];
  function record(id, name, pass, detail) {
    results.push({ id, name, pass, detail });
    console.log(`${pass === 'skip' ? 'SKIP' : (pass ? 'PASS' : 'FAIL')}  ${id}  ${name}${detail ? '  — ' + detail : ''}`);
  }

  if (!DOMAIN) {
    console.error('用法: node tools/verify_domain.js <域名> [基线URL] [--no-www]');
    process.exit(2);
  }
  console.log(`===== 自有域名验收：${DOMAIN} =====`);
  console.log(`基线：${BASE}\n`);

  // ── D1 境内 DNS 双解析器
  const dnsRows = [];
  let d1pass = true;
  for (const p of ['aliyun', 'tencent']) {
    const r = await doh(p, DOMAIN, 'A');
    const a = answersOf(r, 1);
    dnsRows.push({ p, status: r.Status, a });
    if (r.Status !== 0 || a.length === 0) d1pass = false;
  }
  record('D1', '境内 DNS 双解析器可解析', d1pass,
    dnsRows.map((r) => `${r.p}=${r.status === 0 ? r.a.join(',') : (r.err || 'Status ' + r.status)}`).join(' | '));

  // ── D2 解析链正确
  let d2pass = false;
  let d2detail = '';
  if (d1pass) {
    const cn = [];
    for (const p of ['aliyun', 'tencent']) {
      const r = await doh(p, DOMAIN, 'CNAME');
      cn.push(...answersOf(r, 5));
    }
    const route = detectRoute(cn, dnsRows.flatMap((r) => r.a));
    d2pass = route.ok;
    d2detail = route.detail;
  } else {
    d2detail = 'D1 未通过，无法判断解析链';
  }
  record('D2', '解析链指向本项目', d2pass, d2detail);

  // ── D3 HTTPS 200 + 证书有效
  const target = 'https://' + DOMAIN + '/';
  const t0 = await fetchRaw(target, UA_DESKTOP);
  const tlsInfo = await checkTls(DOMAIN);
  const certCovers = !tlsInfo.error && (String(tlsInfo.san || '').includes(DOMAIN) || String(tlsInfo.subject || '').includes(DOMAIN));
  const d3pass = t0.status === 200 && !tlsInfo.error && tlsInfo.authorized === true && certCovers;
  record('D3', 'HTTPS 200 且证书有效', d3pass,
    `HTTP ${t0.status || t0.error}；证书 ${tlsInfo.error ? '读取失败:' + tlsInfo.error : `${tlsInfo.subject} / ${tlsInfo.issuer} / 到期 ${tlsInfo.validTo} / ${tlsInfo.protocol}`}；SAN 覆盖 ${certCovers ? '是' : '否'}`);

  // ── D4 内容与基线逐字节一致
  const base = await fetchRaw(BASE + '/', UA_DESKTOP);
  let d4pass = false;
  let d4detail = '';
  if (t0.status === 200 && base.status === 200) {
    const m1 = md5(t0.body), m2 = md5(base.body);
    d4pass = m1 === m2;
    d4detail = `${DOMAIN} md5=${m1} / ${BASE} md5=${m2}（${t0.body.length} vs ${base.body.length} 字节）${d4pass ? '' : ' → 内容不一致'}`;
  } else {
    d4detail = `域名取页 ${t0.status || t0.error}，基线取页 ${base.status || base.error}`;
  }
  record('D4', '内容与基线逐字节一致', d4pass, d4detail);

  // ── D5 微信 UA 无拦截（判据：微信 UA 与普通 UA 的字节完全相同）
  const [wx1, wx2] = await Promise.all([
    fetchRaw(target, UA_IOS_WX),
    fetchRaw(target, UA_AND_WX),
  ]);
  const baseMd5 = base.status === 200 ? md5(base.body) : null;
  const mWx1 = wx1.status ? md5(wx1.body) : null;
  const mWx2 = wx2.status ? md5(wx2.body) : null;
  const wxOk = (mWx1 === baseMd5) && (mWx2 === baseMd5) && wx1.status === 200 && wx2.status === 200;
  const BLOCK_RE = /已停止访问|无法访问此网站|该内容已被发布者删除|环境异常|完成验证后即可继续访问/;
  const wxText1 = (wx1.body || Buffer.alloc(0)).toString('utf8');
  const wxText2 = (wx2.body || Buffer.alloc(0)).toString('utf8');
  const blocked = wx1.status === 403 || wx2.status === 403
    || BLOCK_RE.test(wxText1) || BLOCK_RE.test(wxText2);
  record('D5', '微信 UA 无拦截（双 UA 字节比对）', wxOk,
    `iOS微信 ${wx1.status || wx1.error} md5=${mWx1 || '-'}` +
    `；Android微信 ${wx2.status || wx2.error} md5=${mWx2 || '-'}` +
    `；普通UA md5=${baseMd5 || '-'}` +
    (wxOk ? ' → 三者完全一致，无拦截页' : (blocked ? ' → 🔴 检出拦截页特征' : ' → 与普通 UA 不一致')));

  // ── D6 www → apex 跳转
  const WWW = 'www.' + DOMAIN;
  const wwwA = await doh('aliyun', WWW, 'A');
  const wwwHas = wwwA.Status === 0 && answersOf(wwwA, 1).length > 0;
  if (!wwwHas) {
    if (NO_WWW) {
      record('D6', 'www → apex 跳转', 'skip', `www.${DOMAIN} 未解析（已声明 --no-www，跳过）`);
    } else {
      record('D6', 'www → apex 跳转', false,
        `www.${DOMAIN} 解析不到。要么加 DNS 记录 + 在 Pages 后台把 www 也加为自定义域名，要么加 --no-www 声明不配 www`);
    }
  } else {
    const r = await fetchRaw('https://' + WWW + '/some/path?q=1', UA_DESKTOP, false);
    const loc = r.location || '';
    const isRedirect = r.status === 301 || r.status === 308;
    const toApex = loc.startsWith('https://' + DOMAIN + '/');
    const keepsPath = loc.includes('/some/path');
    const d6pass = isRedirect && toApex && keepsPath;
    record('D6', 'www → apex 301/308 且保留路径', d6pass,
      `https://${WWW}/some/path?q=1 → HTTP ${r.status || r.error} Location=${loc || '(无)'}` +
      (d6pass ? '' : ' → 期望 301/308 且 Location=https://' + DOMAIN + '/some/path?q=1'));
  }

  // ── D7 真实浏览器渲染
  try {
    const browser = await chromium.launch(chromePath() ? { executablePath: chromePath() } : {});
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(target, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    // 图片判据：只有「已带 src 的 img」才该加载成功。
    // #full / #zoomPosterCrop 初始没有 src，要等用户点放大/热点才注入 → 不能算失败。
    const info = await page.evaluate(() => {
      const withSrc = Array.from(document.querySelectorAll('img[src]')).filter((i) => (i.getAttribute('src') || '').trim());
      return {
        tabs: document.querySelectorAll('.tabs button').length,
        imgsWithSrc: withSrc.length,
        imgsOk: withSrc.filter((i) => i.naturalWidth > 0).length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bodyLen: document.body ? document.body.innerText.trim().length : 0,
        title: document.title,
      };
    });
    // 切 tab：每个案例的主图都必须能加载
    const tabImgs = [];
    for (const t of ['#tab1', '#tab2']) {
      await page.click(t);
      await page.waitForTimeout(800);
      const r = await page.evaluate(() => {
        const im = Array.from(document.querySelectorAll('img[src*="case-"]'));
        const last = im[im.length - 1];
        return last ? { src: last.getAttribute('src'), nw: last.naturalWidth } : null;
      });
      tabImgs.push(`${t}→${r ? r.src + '(' + r.nw + 'px)' : 'no-img'}`);
    }
    await browser.close();
    const tabOk = tabImgs.every((s) => !/no-img|\(0px\)/.test(s));
    const ok = errs.length === 0 && info.tabs >= 3 && info.imgsWithSrc > 0
      && info.imgsOk === info.imgsWithSrc && tabOk && info.overflow <= 2 && info.bodyLen > 500;
    record('D7', '真实浏览器渲染正常', ok,
      `标题「${info.title}」；正文 ${info.bodyLen} 字符；tab ${info.tabs} 个；` +
      `初始带 src 的图片 ${info.imgsOk}/${info.imgsWithSrc} 加载成功；` +
      `切 tab 后主图 ${tabImgs.join(' ')}；横向溢出 ${info.overflow}px；` +
      `JS 错误 ${errs.length}${errs.length ? '：' + errs.slice(0, 2).join(' | ') : ''}`);
  } catch (e) {
    record('D7', '真实浏览器渲染正常', false, e.message.split('\n')[0]);
  }

  const pass = results.filter((r) => r.pass === true).length;
  const fail = results.filter((r) => r.pass === false).length;
  const skip = results.filter((r) => r.pass === 'skip').length;
  console.log(`\n===== 域名验收 ${DOMAIN} =====`);
  console.log(`PASS ${pass} / FAIL ${fail} / SKIP ${skip} / 共 ${results.length}`);
  process.exit(fail === 0 ? 0 : 1);
}

if (require.main === module) {
  main().catch((e) => { console.error('FATAL', e); process.exit(2); });
}

module.exports = { detectRoute, isCloudflareIP, md5 };
