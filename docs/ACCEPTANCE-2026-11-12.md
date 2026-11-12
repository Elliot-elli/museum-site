# 公网验收报告 · 2026-11-12

**线上地址**：<https://museum-site-cwb.pages.dev>
**平台**：Cloudflare Pages（项目名 `museum-site-cwb`，仓库 `Elliot-elli/museum-site`）
**结论**：✅ **9 / 9 项通过，0 失败。**

---

## 一、验收项结果

用 `tools/verify_live.js` 跑真实 Chromium（1440×900 桌面 + 390×844 移动）加载线上地址：

| # | 验证项 | 结果 | 实测数据 |
|---|---|---|---|
| L1 | 控制台无错误 | ✅ PASS | 0 个错误；沙箱层残留（`openai.callTool`）0 个 |
| L2 | 三个案例 tab 可切换 | ✅ PASS | 图 `case-01.jpg`→`case-02.jpg`→`case-03.jpg`；`active` 类正确转移；概览文案随切换变化 |
| L3 | 放大层可打开可关闭 | ✅ PASS | 点「查看作品原图」→ `<dialog id=viewer>` open=true、display=block；`#full` src=`img/case-03.jpg`、宽 1620px、可见；关闭后 open=false |
| L4 | 热点裁剪图可加载 | ✅ PASS | 4 个 `.map-hotspot`；`#zoomPosterCrop` 由空 → data URL，解码宽 454px；弹窗打开，标题与「对应展板内容」正确匹配 |
| L5 | 自查清单可勾选且持久化 | ✅ PASS | 13 个复选框；localStorage 键 `museum-checks-v2` 值非空 |
| L6 | 编辑模式 + 恢复原文 | ✅ PASS | 131 个可编辑元素（全部带 `data-edit-key`）；覆盖后残留 1 处 → 确认弹层打开 → 确认后残留 **0 处**，样本回位为「MUSEUM OF LIBERAL ARTS · LEARN」 |
| L7 | 资源加载无 404 | ✅ PASS | 0 个失败请求 |
| L8 | 导出 HTML 可独立打开 | ✅ PASS | 导出 4209404 字节；落盘后用 file:// 独立打开：正文 4317 字符、高 7299px、**图片 4/4 加载成功**、tab 3 个、复选框 13 个、JS 错误 0 |
| L9 | 无横向溢出 | ✅ PASS | 桌面溢出 0px；移动 390px 溢出 0px，JS 错误 0 |

> L9 说明：页面高 7734px（桌面）/ 11955px（移动）是**长文档设计**，不是 bug。判据是「无横向溢出」。

---

## 二、HTTP 层实测

| 检查 | 结果 |
|---|---|
| 首页 | `200`，**58770 字节**（与本地 `site/index.html` 逐字节一致） |
| base64 内联残留 | **0**（3MB 大图已正确拆成独立文件） |
| `/js/data.js` | 200，29991 B |
| `/js/app.js` | 200，17210 B |
| `/css/main.css` | 200，16173 B |
| `/img/case-01.jpg` | 200，704252 B |
| `/img/case-02.jpg` | 200，655536 B |
| `/img/case-03.jpg` | 200，414856 B |
| `/robots.txt` | 200，143 B |
| `/favicon.svg` | 200，394 B |
| 不存在的路径 | **404**（自定义 404 页生效） |
| `/_headers`、`/_redirects` | 404 —— **正确**，这两个是 Cloudflare 指令文件，不对外暴露 |

### `_headers` 缓存分层全部生效

| 路径 | Cache-Control | 预期 |
|---|---|---|
| `/` | `public, max-age=0, must-revalidate` | ✅ HTML 不缓存 |
| `/css/main.css` | `public, max-age=604800` | ✅ 7 天 |
| `/js/data.js` | `public, max-age=604800` | ✅ 7 天 |
| `/img/case-01.jpg` | `public, max-age=2592000` | ✅ 30 天 |

### 安全响应头

`x-content-type-options: nosniff`、`referrer-policy: strict-origin-when-cross-origin`、
`x-frame-options: SAMEORIGIN`、`permissions-policy: geolocation=(), microphone=(), camera=()`
—— 全部按 `_headers` 生效。

### TLS

- 证书签发者：Let's Encrypt `YE1`
- 有效期：2026-11-12 → 2027-02-10（90 天，Cloudflare 自动续期）
- `ssl_verify_result: 0`（验证通过）
- HTTP/3 已启用（`alt-svc: h3=":443"`）

---

## 三、境内可达性（选 Pages 的核心依据，实测）

### 大陆 DNS 解析

| 解析器 | 结果 |
|---|---|
| 阿里 DNS `dns.alidns.com` | `172.66.47.92`, `172.66.44.164` |
| 腾讯 DoH `doh.pub` | `172.66.44.164`, `172.66.47.92` |
| 阿里 DNS 连续 3 轮 | **完全一致，无漂移** |

**IP 归属**：`172.66.47.92` / `172.66.44.164` 均为 **AS13335 Cloudflare, Inc.** ✅

→ 线上域名在境内解析正常且稳定。**与选型阶段的预测完全一致**（`pages.dev` 正常、`workers.dev` 被污染）。

### 微信 UA 实测

两个真实 MicroMessenger UA（iOS / Android）请求首页：

| UA | HTTP | 字节 | 含站点标题 | 拦截特征 |
|---|---|---|---|---|
| iPhone MicroMessenger/8.0.30 | **200** | 58770 | ✅ | **0** |
| Android MicroMessenger/8.0.30 | **200** | 58770 | ✅ | **0** |

无「请在浏览器中打开」「已停止访问」「安全验证」等拦截特征。

> 📌 **与 WorkBuddy 自有域名的对比**：`*.app.workbuddy.*` 在 MicroMessenger UA 下会被服务端替换成 403 拦截页；
> 而 Cloudflare Pages 这条链路**无任何 UA 拦截**，微信里能直开。

---

## 四、遗留事项

| 事项 | 优先级 | 说明 |
|---|---|---|
| **绑自有域名** | 高（若要发微信） | 微信按**域名维度**风控。`pages.dev` 是共享域名段，任意一页违规可能连坐整段。自有域名 + 备案可根本解决 |
| ICP 备案 | 中 | 真正流畅的境内方案：EdgeOne / 阿里云 CDN 扛境内流量，CF 退为海外回源 |
| `wrangler.jsonc` 的 `name` | 低 | 仍是 `museum-site`，与 Pages 项目名 `museum-site-cwb` 不一致。**走 Pages 路线时该文件被忽略，无影响**；但若将来迁 Workers 需同步改名 |

---

## 五、复现方式

```bash
cd C:/Users/EDY/WorkBuddy/boya-museum-site

NODE_PATH="C:/Users/EDY/.workbuddy/binaries/node/workspace/node_modules" \
  "C:/Users/EDY/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" \
  tools/verify_live.js "https://museum-site-cwb.pages.dev"
```

退出码 0 = 全通过；非 0 = 有失败项。

### 脚本编写中踩的坑（已修正，记录备查）

第一版脚本报 6 项 FAIL，用**本地构建产物跑同一脚本得到完全相同的 6 项 FAIL** ——
证明是脚本假设错误而非站点缺陷。三处根因：

| 失败项 | 真实原因 | 修正 |
|---|---|---|
| L3 放大层 | 站点用 `<dialog id="viewer">` 的 `showModal()`，**不是** CSS 浮层 | 改判 `dialog.open` + `#full.naturalWidth` |
| L4 热点裁剪 | 热点类是 `.map-hotspot`（`onclick="selectAnalysis(N)"`），我漏了这个选择器 | 补选择器，判 `#zoomPosterCrop` 是否为 data URL |
| L6 恢复原文 | 页面有**两个**「恢复原文」：抽屉里的只调 `openReset()` 打开确认弹层，真正执行的是弹层内 `.danger` 按钮 | 两步点击 + 以「残留数」为判据 |

> 🔴 **通用教训**：判定前先探 DOM 结构（`document.querySelectorAll` 枚举 + 读源码），
> 别凭常见模式猜选择器。**用本地产物做对照组**是区分「脚本错」与「功能坏」最快的办法。
