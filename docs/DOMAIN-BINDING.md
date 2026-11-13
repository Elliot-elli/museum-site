# 绑自有域名 · 运行手册

> 面向：已上线的博雅博物馆站（<https://museum-site-cwb.pages.dev>）。
> 目标：把 `*.pages.dev` 换成自己的域名，**消除微信「按域名维度连坐」的风险**。
> 本文所有 Cloudflare 机制描述于 2026-11-13 对照官方文档逐条核实，非记忆转述。

---

## 0. 先看这一段（省一天）

**「绑域名」不是加一条 DNS 记录就完事。** 你必须先决定一件事：**这个域名的 NS（nameserver）托管给谁。**
这个选择决定了后面所有步骤，也决定了**能不能做 www 跳转**。

| | 路线 1 · NS 托管 Cloudflare | 路线 2 · DNS 留在原服务商 | 路线 3 · 只用子域名 |
|---|---|---|---|
| NS 在哪 | Cloudflare | 阿里云/腾讯云（不变） | 阿里云/腾讯云（不变） |
| 能用根域名 `example.com` | ✅ 可以 | ❌ **不行** | ❌ 不行 |
| DNS 要做的操作 | 改 NS（注册商处）+ CF 自动建 CNAME | 加 1 条 CNAME | 加 1 条 CNAME |
| **能用后台 Redirect Rules** | ✅ 可以 | ❌ **不行** | ❌ 不行 |
| 有 WAF / 缓存规则 / 机器人管理 | ✅ 全部可用 | ❌ 无 | ❌ 无 |
| www 跳转怎么做 | 后台 Redirect Rules 301 | 两个域名都加为自定义域名（内容相同） | 不配 www |
| 对该域名下其他服务的影响 | ⚠️ **全部受影响**（邮箱、其他子域） | 无影响 | 无影响 |
| 操作量 | 中（改 NS 要等传播） | 最小 | 最小 |

> 🔴 **两个最容易踩的认知坑**
>
> **坑 1 · 根域名必须把 NS 托管到 Cloudflare。**
> 官方原文：*「If you are deploying to an apex domain (for example, example.com), then you will need
> to add your site as a Cloudflare zone and configure your nameservers.」*
> 换句话说：**「DNS 留在原服务商 + 一条 CNAME」只对子域名成立**。
> 想用 `example.com` 这种根域名，NS 必须改到 Cloudflare。
>
> **坑 2 · Redirect Rules 是「区域级」功能，域名不在你的 Cloudflare 账号里就用不了。**
> 官方原文：*「With a DNS-only record or an external DNS provider, requests do not pass through
> your zone's HTTP settings.」*
> 所以走路线 2（外部 DNS）时，后台的 www 跳转规则**配了也不生效**。
>
> 💡 **建议：既然要买域名，就买一个专门给这个站的独立域名，走路线 1。**
> 独立域名没有「改 NS 会影响邮箱/其他子域」的顾虑，一次到位拿到全部 Cloudflare 能力。

---

## 1. 为什么必须做

微信是**按域名维度**风控的，不是按页面维度：

- 共享的 `*.pages.dev` 下只要有**任意一个**页面违规，**整个域名段**都可能被拦截
- 你点开链接看到「已停止访问该网页」，但完全查不出原因
- 自有域名 + 完整备案是降低被拦截概率**最有效**的手段

> 现状实测（2026-11-13 复测）：`museum-site-cwb.pages.dev` 在 iOS 微信 UA 与 Android 微信 UA 下
> 返回的字节与普通浏览器**完全相同**（三者 md5 均为 `770aefac5f11a473d959df9c18e00a9c`），
> **当前没有被拦截**。但这是「今天没被拦」，不是「结构上不会连坐」——风险依然在。

---

## 2. 买域名

阿里云 / 腾讯云 / 华为云都行。

|  | `.com` | `.cn` |
|---|---|---|
| 价格 | 几十~一百多/年（首年常有大促） | 几十/年 |
| 实名认证 | 不强制，建议做 | **强制**（身份证，免费，几分钟） |
| ICP 备案 | 可以做 | 可以做 |
| 建议 | ✅ 首选（便宜、无强制实名、出口灵活） | 可以 |

**买一个独立的、专门给这个站的域名**，别用你已有的主域名。
理由：走路线 1 要改 NS，改 NS 会连带影响该域名下的**所有**服务（企业邮箱 MX、其他子域）。

---

## 3. 路线 1 · NS 托管到 Cloudflare（推荐）

### 3.1 把域名加进 Cloudflare 账号

1. Cloudflare 后台 → 左侧 **Websites** → **Add a site**
2. 填你的域名（如 `example.com`）→ 选 **Free** 套餐
3. Cloudflare 会扫描现有 DNS 记录 —— **务必把记录全部勾上导入**
   （尤其 MX / TXT / CAA，跳过会导致邮箱停摆、证书签发失败）
4. Cloudflare 给你两个 NS，例如 `emma.ns.cloudflare.com`、`rick.ns.cloudflare.com`

### 3.2 在注册商改 NS

到**买域名的地方**（阿里云/腾讯云域名控制台，不是 DNS 解析控制台）：

1. 域名列表 → 管理 → **DNS 修改 / 修改 DNS 服务器**
2. 把 NS 换成 Cloudflare 给的那两个
3. 保存

> ⚠️ 域名在 Cloudflare 时，**DNS 记录要在 Cloudflare 里改**，阿里云/腾讯云的解析控制台就失效了。
> 以后加子域名、加记录，都去 Cloudflare 的 **DNS → Records**。

### 3.3 等 NS 生效

一般 **10 分钟 ~ 24 小时**。检查：

```bash
# 查 NS 是否已切到 Cloudflare
nslookup -type=NS example.com 223.5.5.5
nslookup -type=NS example.com 119.29.29.29
```

两个解析器都返回 `*.ns.cloudflare.com` 就说明生效了。

### 3.4 在 Pages 后台加自定义域名

1. **Workers 和 Pages** → 项目 `museum-site-cwb` → **Custom domains**
2. **Set up a domain** → 填 `example.com`（或你要用的子域名）→ **Continue**
3. 因为域名已在 Cloudflare，**CF 会自动建好 CNAME**，你不用手动加 DNS 记录
4. 状态从 **Pending** 变 **Active**（约 1~2 分钟签发证书）

### 3.5 加 www（可选但推荐）

1. 同样在 **Custom domains** 里，再加一次 `www.example.com`
   （CF 会自动建 `www` 的 CNAME）
2. 建跳转规则：**Rules → Redirect Rules → Create rule**

| 字段 | 填什么 |
|---|---|
| Rule name | `www → apex` |
| Condition | **Custom filter** → `Hostname` **equals** `www.example.com` |
| Then | **Static redirect** |
| URL | `https://example.com` |
| Status code | **301** |

> 🔴 **不要用 `_redirects` 文件做 www 跳转。**
> 官方文档在「Advanced redirects」表格里明确把 **Domain-level redirects 标为 ❌ 不支持**。
> 而且 `_redirects` 的规则会**同时作用在 `*.pages.dev` 上** —— 写一条「全部跳转到主域」，
> 就会让 `museum-site-cwb.pages.dev` 也跳走，甚至造成**跳转死循环**。
>
> 项目里的 `tools/check_redirects.py` 校验的只是「跳转目标语法」，它**管不了主机名匹配**
> —— 因为 `_redirects` 本来就不支持主机名匹配。

---

## 4. 路线 2 · DNS 留在原服务商（只适用于子域名）

适合：域名已有其它服务在用，**不能改 NS**。

1. Cloudflare 后台 → Pages 项目 → **Custom domains** → **Set up a domain**
   → 填 `museum.example.com`（**必须是子域名**）→ Continue
2. Cloudflare 会提示你在 DNS 服务商加一条 CNAME
3. 在**阿里云**（云解析 DNS → 域名解析 → 添加记录）：

| 字段 | 值 |
|---|---|
| 主机记录 | `museum` |
| 记录类型 | **CNAME** |
| 记录值 | **`museum-site-cwb.pages.dev`** |
| TTL | 默认（600 秒） |

   在**腾讯云**（DNSPod → 域名管理 → DNS 解析 → 添加记录）：字段同上。

4. 🔴 **顺序不能反**：必须先在 Cloudflare 加自定义域名，再去 DNS 加记录。
   反过来会报 **522**（官方原文：手动加 CNAME 但没先在 Pages 后台登记，
   会导致域名在该 CNAME 地址上无法解析，显示 522）。
5. 等证书从 **Pending** 变 **Active**
6. **www 怎么办**：这条路线**没有 Redirect Rules**。可选：
   - **A（推荐）**：把 `www.example.com` 也加为第二个自定义域名 + 加一条同样的 CNAME。
     两个地址都能正常打开，内容完全一样。SEO 上在 HTML 里加
     `<link rel="canonical" href="https://museum.example.com/">` 指定唯一版本即可。
   - **B**：用 DNS 服务商自带的「域名重定向 / URL 转发」功能（各家支持程度不同）。
   - **C**：不配 www，别人输错域名会直接 DNS 失败 —— 最省事，链接发出去一般不会有人手打 www。

---

## 5. 验收（绑完必跑）

```bash
cd C:/Users/EDY/WorkBuddy/boya-museum-site
export NODE_PATH="C:/Users/EDY/.workbuddy/binaries/node/workspace/node_modules"

node tools/verify_domain.js museum.example.com
```

7 项检查，全过才算绑成功：

| ID | 检查 | 判据 |
|---|---|---|
| D1 | 境内 DNS 双解析器可解析 | 阿里 alidns + 腾讯 doh.pub 都能解出 A 记录 |
| D2 | 解析链指向本项目 | CNAME→`museum-site-cwb.pages.dev`（路线 2）**或** A 全属 Cloudflare（路线 1） |
| D3 | HTTPS 200 且证书有效 | 证书 SAN 覆盖该主机名、Let's Encrypt 已签发 |
| D4 | 内容与基线逐字节一致 | md5 必须等于 `770aefac5f11a473d959df9c18e00a9c` |
| D5 | 微信 UA 无拦截 | iOS + Android 双微信 UA 的 md5 **与普通 UA 完全相同** |
| D6 | www → apex 跳转 | 301/308 且保留路径与查询串 |
| D7 | 真实浏览器渲染正常 | JS 0 错误、3 个 tab、图片加载成功、无横向溢出 |

> **D6 不想配 www 时**，加 `--no-www`，该项记为 SKIP 而不是 FAIL：
> ```bash
> node tools/verify_domain.js museum.example.com --no-www
> ```

### 最后一步：微信里实测

D5 是「服务端按 UA 返回的字节」层面的检查，**不能替代真机微信**。

1. 把链接发到「文件传输助手」
2. 点开 → 应正常加载，**不显示「已停止访问该网页」**
3. 被拦了就去 <https://safety.weixin.qq.com/> → 域名查询，看具体原因

---

## 6. 故障排查

| 现象 | 真因 | 处理 |
|---|---|---|
| **522** | DNS 记录加了但没在 Pages 后台登记自定义域名（顺序反了），或 CNAME 目标写错 | 先去 Pages 后台 **Custom domains** 登记，再检查 DNS |
| **404** | 域名已加但证书还没签发 / 部署未生效 | 等 1~2 分钟；Pages 后台看域名状态是否 **Active** |
| **提示「已被他人占用」** | CF 的域名验证是**一次性快照检查**，加 CNAME 的瞬间它就检查了，必然失败 | **等 10 分钟再回来点验证**。首次报这个**不代表真被占用** |
| 证书签发失败 | 域名有 CAA 记录但不允许 Cloudflare 签发 | 检查 CAA，加 `0 issue "letsencrypt.org"` |
| 改了 DNS 后不生效 | TTL 还没过期 | 等 TTL（默认 600 秒）过期；本地可 `ipconfig /flushdns` |
| 解析到 IP 不是 Cloudflare | DNS 污染 / 记录配错 | 跑 `node tools/verify_domain.js <域名>`，D2 会点名可疑 IP |
| www 不跳转 | 走的是路线 2（外部 DNS），Redirect Rules 不生效 | 见 §4 第 6 步，改用双自定义域名方案 |
| `_redirects` 里的跳转规则完全没反应 | CF 不支持主机名匹配（官方标 ❌） | 用后台 Redirect Rules，且必须先有域名挂在 CF 区域里 |

---

## 7. 后续可做（不急）

| 事项 | 价值 | 门槛 |
|---|---|---|
| **ICP 备案** | 真正流畅的境内方案：EdgeOne / 阿里云 CDN 扛境内流量，CF 退为海外回源 | 域名 + 备案主体（个人也行），1~2 周 |
| 用 **Bulk Redirect** 把 `*.pages.dev` 也跳到自定义域名 | 旧链接不失效，链接统一 | 账号级功能，域名需在账号内 |
| 绑定 `pages.dev` 之外的第二个域名 | 多一条备用通道 | 同上 |

---

## 8. 关键提醒

1. **只改 `src/`，永远不要手改 `site/`** —— `site/` 不在 Git 里，手改既不会上线也会被下次构建覆盖
2. **绑域名不影响迭代** —— Pages 项目的 `pages.dev` 地址和自定义域名指向同一份产物，
   两者内容永远一致（D4 就是用来持续证明这一点的）
3. **回退两步走**：Cloudflare 后台一键回退止血（秒级）+ `git revert` 修代码（否则下次 push 又把坏版本推回来）
4. **改 NS 前先确认这个域名下没有别的服务**（企业邮箱 MX、其他子域站点）—— 路线 1 会全部改走 Cloudflare

---

## 9. 相关文档

| 文档 | 内容 |
|---|---|
| `docs/CLOUDFLARE-TUTORIAL.md` | 上线九步照做版（含第 7 步绑域名的初版步骤） |
| `docs/CLOUDFLARE-CONFIG.md` | 后台各项配置（响应头、缓存、跳转） |
| `docs/CLOUDFLARE-STEPS.md` | Pages vs Workers 选型依据 + 境内 DNS 污染实测证据 |
| `docs/ITERATION-GUIDE.md` | 迭代 / 部署 / 回退完整方案（416 行） |
| `docs/ACCEPTANCE-2026-11-12.md` | 上线验收报告 |
| `docs/HANDOFF-2026-11-13.md` | 当天交接卡 |
