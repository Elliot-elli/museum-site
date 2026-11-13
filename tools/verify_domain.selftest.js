/**
 * verify_domain.selftest.js — verify_domain.js 的纯逻辑自检
 *
 * 用法：node tools/verify_domain.selftest.js
 *
 * 为什么需要它：D2「解析链」有两条分支（外部 DNS 的 CNAME 路线 / NS 托管的 A 路线）。
 * 真实公网上很难稳定找到一个 CNAME→*.pages.dev 的域名来碰运气，
 * 所以把判定逻辑抽成纯函数，在这里用构造性输入把每条分支都跑一遍。
 *
 * 反向验证：每条用例都同时给出「应当通过」和「应当拒绝」的输入，
 * 断言若写成永真（例如只判 ok===true 而不构造反例），这里就会红。
 */
const assert = require('assert');
const { detectRoute, isCloudflareIP } = require('./verify_domain.js');

let n = 0;
function t(name, fn) {
  n++;
  try {
    fn();
    console.log(`PASS  S${n}  ${name}`);
  } catch (e) {
    console.log(`FAIL  S${n}  ${name}  — ${e.message}`);
    process.exitCode = 1;
  }
}

// ── isCloudflareIP ───────────────────────────────────────────────
t('Cloudflare 真实 IP 段识别', () => {
  ['172.66.44.164', '172.66.47.92', '104.16.0.1', '104.24.1.1',
    '162.158.0.1', '188.114.96.1', '198.41.128.1', '131.0.72.1',
    '173.245.48.1', '103.21.244.1', '141.101.64.1', '190.93.240.1',
  ].forEach((ip) => assert.strictEqual(isCloudflareIP(ip), true, `${ip} 应判为 Cloudflare`));
});

t('非 Cloudflare IP 必须判为 false（含阿里/腾讯 DNS 与常见公共 DNS）', () => {
  // 注意：104.16.0.0/13 覆盖到 104.23.255.255、172.64.0.0/13 覆盖到 172.71.255.255，
  // 所以 104.18.x / 172.65.x 反而是 Cloudflare 段内地址，反例必须取段外。
  ['223.5.5.5', '119.29.29.29', '8.8.8.8', '1.1.1.1', '114.114.114.114',
    '202.96.128.86', '180.76.76.76', '104.28.0.1', '172.72.0.1',
  ].forEach((ip) => assert.strictEqual(isCloudflareIP(ip), false, `${ip} 不应判为 Cloudflare`));
});

t('Cloudflare 段边界：/13 与 /14 相邻段内的地址必须判为 true', () => {
  ['104.18.0.1', '104.23.255.255', '104.25.0.1', '172.65.0.1', '172.71.255.255']
    .forEach((ip) => assert.strictEqual(isCloudflareIP(ip), true, `${ip} 应判为 Cloudflare`));
});

t('非法 IP 字符串不得抛异常', () => {
  ['', 'abc', '1.2.3', '999.1.1.1', '::1'].forEach((ip) =>
    assert.strictEqual(isCloudflareIP(ip), false, `${ip} 应为 false`));
});

// ── detectRoute · 分支 1：外部 DNS（CNAME → *.pages.dev） ────────
t('外部 DNS 路线：CNAME 指向 pages.dev → 判为 OK', () => {
  const r = detectRoute(['museum-site-cwb.pages.dev.'], ['172.66.44.164']);
  assert.strictEqual(r.ok, true, '应判为 OK');
  assert.strictEqual(r.route, '外部 DNS 路线');
  assert.ok(/CNAME/.test(r.detail), `detail 应说明 CNAME，实际：${r.detail}`);
});

t('外部 DNS 路线：CNAME 带尾点 / 大小写 / 多个 CNAME 都能识别', () => {
  assert.strictEqual(detectRoute(['museum-site-cwb.pages.dev.'], []).ok, true, '尾点应被剥掉');
  assert.strictEqual(detectRoute(['MUSEUM-SITE-CWB.PAGES.DEV'], []).ok, true, '大小写应被忽略');
  const multi = detectRoute(['a.pages.dev.', 'museum-site-cwb.pages.dev.'], []);
  assert.strictEqual(multi.ok, true, '多个 CNAME 里含目标应识别');
  assert.ok(/museum-site-cwb\.pages\.dev/.test(multi.detail), 'detail 应列出目标域名');
});

t('反向验证：CNAME 指向别人的 pages.dev 项目 → 必须判为 FAIL', () => {
  // 解析到了别的 Pages 项目 = 绑错站了，绝不能判 OK
  const r = detectRoute(['somebody-else.pages.dev.'], ['172.66.44.164']);
  assert.strictEqual(r.ok, false, '指向别的 pages.dev 项目必须 FAIL');
  assert.ok(/museum-site-cwb\.pages\.dev/.test(r.detail), 'detail 应提示期望的目标域名');
  assert.ok(/别的 Pages 项目/.test(r.detail), `detail 应点名绑错项目，实际：${r.detail}`);
});

// ── detectRoute · 分支 2：NS 托管 Cloudflare（A 记录） ───────────
t('NS 托管路线：全部 A 属 Cloudflare → 判为 OK', () => {
  const r = detectRoute([], ['172.66.47.92', '172.66.44.164']);
  assert.strictEqual(r.ok, true, '应判为 OK');
  assert.strictEqual(r.route, 'NS 托管 Cloudflare 路线');
  assert.ok(/AS13335/.test(r.detail), `detail 应说明归属，实际：${r.detail}`);
});

t('反向验证：A 里混进非 Cloudflare IP → 必须 FAIL 且点名污染嫌疑', () => {
  const r = detectRoute([], ['172.66.47.92', '223.5.5.5']);
  assert.strictEqual(r.ok, false, '混入非 CF IP 必须 FAIL');
  assert.ok(/污染/.test(r.detail), `detail 应提示污染嫌疑，实际：${r.detail}`);
  assert.ok(/223\.5\.5\.5/.test(r.detail), 'detail 应点名可疑 IP');
});
t('反向验证：全是污染 IP（无一条 Cloudflare）→ 必须 FAIL', () => {
  const r = detectRoute([], ['223.5.5.5', '119.29.29.29']);
  assert.strictEqual(r.ok, false, '应 FAIL');
  assert.strictEqual(r.route, '异常');
});

// ── detectRoute · 分支 3：其他 CNAME ─────────────────────────────
t('反向验证：CNAME 指向非 pages.dev（如 akamai）→ 必须 FAIL', () => {
  const r = detectRoute(['www.microsoft.com-c-3.edgekey.net.'], []);
  assert.strictEqual(r.ok, false, '非 pages.dev 的 CNAME 必须 FAIL');
  assert.ok(/edgekey/.test(r.detail), 'detail 应列出实际 CNAME');
});

t('反向验证：空输入（无任何解析结果）→ 必须 FAIL', () => {
  assert.strictEqual(detectRoute([], []).ok, false, '空解析结果必须 FAIL');
});

// ── 断言自反性检查 ───────────────────────────────────────────────
t('判据不是永真：构造一组必 FAIL 的输入，确认全部被判 FAIL', () => {
  const badInputs = [
    [[], []],
    [['other.pages.dev.'], ['172.66.44.164']],
    [[], ['8.8.8.8']],
    [['foo.example.com.'], []],
    [[], ['172.66.44.164', '1.2.3.4']],
  ];
  badInputs.forEach(([c, a], i) => {
    assert.strictEqual(detectRoute(c, a).ok, false, `第 ${i + 1} 组应 FAIL`);
  });
});

console.log(`\n===== 自检 ${n} 项 =====`);
console.log(process.exitCode ? '结果：存在失败用例' : '结果：全部通过');
