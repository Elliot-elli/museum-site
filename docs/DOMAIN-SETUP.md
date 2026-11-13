# 自有域名 · 采购与凭据准备指南

> 面向：准备第一次买域名并把它绑到博雅博物馆站的用户。
> 价格与政策核对日期：**2026-11-13**。下单前请以注册商订单页实际报价为准。

---

## 一、买域名：具体怎么买

### 1.1 后缀选 `.com`，价格与政策（2026-11 核对）

| 后缀 | 阿里云万网双11价（11.1–11.30） | 常规价（2026-11-01 起） | 续费价 | 实名认证 | 建议 |
|---|---|---|---|---|---|
| **`.com`** | **新购 76 元 / 转入 76 元** | 首年 90 元 | **85 元**（常规 99 元） | 不强制（建议做） | ✅ **首选** |
| `.cn` | 活动价 30 元 | 首年 ~38 元 | 38 元（常规 42 元） | **强制**（身份证，免费几分钟） | 可作备份 |
| `.net` | 85 元 | 首年 95 元 | 95 元 | 不强制 | 不建议 |
| 新顶级域 `.top`/`.xyz` 等 | 1–6 元 | 几元 | **30–60 元** | 不强制 | ⚠️ 首年诱饵，续费贵，不建议 |

> 🔴 **只看首年价是买域名最大的坑。** 行业惯例是首年打骨折、续费回原价。
> `.com` 首年 76 元 → 续费 85 元，看起来温和；但 `.top` 首年 1 元 → 续费 30 元就是陷阱。
> → **本项目只需 `.com` 一个**，不要为了"凑单"多买后缀。

### 1.2 注册商选哪家

| 注册商 | 优势 | 注意 |
|---|---|---|
| **阿里云万网** | `.com` 双11价 76 元最低；DNS 解析 + 域名一体；日后走 EdgeOne/阿里云 CDN 做境内加速顺路 | 大促价有期限（11.1–11.30） |
| 腾讯云 DNSPod | 解析稳定；如果你其他服务都在腾讯云，省事 | 价格通常略高 |
| 华为云 | 偶尔有低价 | 活动不稳定 |

**→ 建议：阿里云万网。** 理由：① `.com` 活动价最低；② 后面若要做 ICP 备案 + 国内 CDN，
阿里云是接入商，链路最短；③ DNS 控制台成熟。

### 1.3 域名名字怎么起

给站点起域名，优先级：

1. **短**（越短越好念、好记）—— 微信里发链接，别人可能手打
2. **和"博雅博物馆 / 优秀案例解读"沾边**，但不要把中文硬译拼音（`boya-museum.com` 就比 `boya-museumguan.com` 好）
3. **别用生僻词/多音字**（电话口述场景容易出错）
4. **.com 优先**，`.cn` 可以顺手加一个做保护

形态参考：`boya-museum.com`、`muse-cases.com`、`boya-examples.com`、`bowen-museum.cn`

> 💡 **买之前先查一下**：在注册商标局（sbj.cnipa.gov.cn）搜一下你的候选词有没有被注册为商标。
> 站是给博雅用的，别撞上别人的品牌。

### 1.4 买完之后

| 事项 | 要做 | 备注 |
|---|---|---|
| **实名认证** | `.cn` **必须**；`.com` 建议做 | 身份证认证，免费，几分钟 |
| **ICP 备案** | 现在**不需要** | 只有用中国大陆服务器/国内 CDN 才需要备案；CF Pages 境外回源不需要 |
| **续费提醒** | 记下续费价 | `.com` 续费 85 元，别忘了 |
| **到期赎回** | 知道有 30 天赎回期，费用数百元 | 别让它过期 |

---

## 二、三条路线到底选哪条

你买的是**全新、专属**的域名，所以答案很清楚。

### ✅ 路线 A（推荐）：NS 托管到 Cloudflare

**做法**：域名在 CF 建区域 → CF 给你两个 NS → 到注册商把 NS 改成那两个 → 等生效。

| 好处 | 说明 |
|---|---|
| ✅ 能用**根域名** | `example.com` 而不是 `museum.example.com`，品牌观感差很多 |
| ✅ 能用**后台 Redirect Rules** | www → apex 干净 301，不会有两个地址各存一份内容 |
| ✅ 解锁全套 CF 能力 | WAF、缓存规则、Bot 管理、Zone Transform |
| ✅ 站点 DNS 全在 CF | 以后加子域名、加记录都在一个控制台 |

**代价（唯一）**：注册商那里改一次 NS（填两个 NS，点保存，5 分钟），然后等解析传播
（通常 10 分钟–1 小时，极端情况 24 小时）。**这是一次性成本。**

> ⚠️ **前提：这个域名是专用的。** 如果域名下还挂着企业邮箱（MX 记录）或其他子域站点，
> 改 NS 会让那些服务全部改走 Cloudflare 的解析 —— 邮件还能收，但管理界面变了。
> → 这种情况改走路线 B。

### ⚠️ 路线 B：DNS 留在阿里云，用子域名

**做法**：CF Pages 后台登记 `museum.example.com` → 阿里云加一条 CNAME → `museum-site-cwb.pages.dev`。

| 好处 | 说明 |
|---|---|
| ✅ 不碰现有 NS | 对域名下的其他服务零影响 |
| ✅ 操作最少 | 加 1 条 CNAME 记录就完事 |

| 代价 | 说明 |
|---|---|
| ❌ **不能用根域名** | 官方硬性要求：根域名必须 NS 托管到 CF |
| ❌ **Redirect Rules 失效** | 官方原文：外部 DNS 下请求不经过你的区域，区域级规则配了也不生效 → www 跳转得改用「www 也加为第二个自定义域名」的双域名方案（两个地址内容一样，SEO 上加 canonical 指定唯一版本） |
| ❌ 没有 WAF / 缓存规则 | 同上 |

### ⚠️ 路线 C：只配一个子域名，不配 www

路线 B 的最简版：只做 `museum.example.com`，不管 www。
别人手输 `www.` 会 DNS 失败 —— 但**你发出去的链接不受影响**。

### 🎯 结论

> **你的情况（全新专属域名）→ 直接走路线 A。**
> 一次性改 NS 的成本，换来根域名 + 全部 CF 能力 + 干净的 www 301。不划算的只有 B/C。

---

## 三、凭据准备（你要给我的东西）

### 3.1 Cloudflare API Token（必需）

**创建位置**：Cloudflare 后台 → 右上角头像 → **My Profile** → **API Tokens** → **Create Token**

**模板**：选 **Edit Cloudflare Workers** 不对，要用 **Create Custom Token**。

**权限**（四个都要勾）：

| 权限 | 级别 | 干什么用 |
|---|---|---|
| **Zone** | Edit | 建区域、读区域 |
| **Zone → DNS** | Edit | 建 CNAME 记录 |
| **Account → Pages** | Edit | 把域名加为 Pages 自定义域名 |
| **Zone → Dynamic URL Redirects** | Edit | 建 www→apex 的 301 规则 |

**Zone Resources**：选 **All zones**（或你的账号下全部），**Account Resources**：选你的账号。

**IP 地址限制**：本地开发可以先留空（不限制 IP）。安全起见可以填你当前公网 IP。

> 🔴 **别给我 Global API Key。** 那是账号级万能密钥，泄漏等于账号失守。
> API Token 可以随时单独吊销，粒度也细。

### 3.2 Cloudflare Account ID

CF 后台 → 右侧栏 → **Account ID**（一串 32 位十六进制）。脚本也支持自动获取，但直接给更省事。

### 3.3 环境变量（不要把 token 写进仓库）

```bash
export CF_API_TOKEN="你的 token"
export CF_ACCOUNT_ID="你的 account id"
```

Windows PowerShell：

```powershell
$env:CF_API_TOKEN="你的 token"
$env:CF_ACCOUNT_ID="你的 account id"
```

> ⚠️ **不要把 token 写进 `bind_domain.py` 或任何提交到 Git 的文件。**
> 脚本只从环境变量读。

### 3.4 域名注册商那边

- **改 NS**：这步只能在注册商后台做（脚本做不了）—— 到「域名管理 → DNS 修改 → DNS 服务器」，
  把服务器改成 CF 给的两个 NS
- **（若走路线 B）加 CNAME**：这步可以用阿里云 API 脚本化，但需要你另外提供
  AccessKey（建议只给 `AliyunDNSFullAccess` 之外的最小权限，或干脆手工点一下）

---

## 四、自动化脚本怎么用

`tools/bind_domain.py` 已经写好并验证过（只用 Python 标准库，不用装任何包）。

### 4.1 看现状（只读，随便跑）

```bash
cd C:/Users/EDY/WorkBuddy/boya-museum-site
python tools/bind_domain.py status --domain example.com
```

会列出：CF 区域是否存在、Pages 已绑哪些自定义域名、各自状态、DNS 记录、Redirect Rules。

### 4.2 建区域，拿 NS

```bash
python tools/bind_domain.py zone --domain example.com --apply
```

输出两个 NS → **到注册商后台改成这两个** → 等生效。

### 4.3 一键完成剩下的配置

```bash
python tools/bind_domain.py bind --domain example.com --apply
```

依次做三件事：
1. 把域名加为 Pages 项目的自定义域名
2. 在 CF zone 里建 proxied CNAME → `museum-site-cwb.pages.dev`
3. 建 www → apex 的 301 Redirect Rule

### 4.4 验收

```bash
python tools/bind_domain.py verify --domain example.com
# 等价的：
node tools/verify_domain.js example.com
```

7 项全 PASS 才算成功。

> **不加 `--apply` 是演练模式**，只打印将要做什么，不改云端任何东西。
> 这是刻意的 —— 写操作必须显式确认。

---

## 五、完整执行清单（路线 A）

| # | 谁 | 做什么 | 怎么确认 |
|---|---|---|---|
| 1 | 你 | 买 `.com` 域名 + 实名认证 | 注册商后台显示「正常」 |
| 2 | 你 | 把域名告诉我 | 我拿到域名 |
| 3 | 你 | 给我 CF API Token + Account ID | `export` 好两个变量 |
| 4 | 我 | `bind_domain.py zone --apply` | 拿到两个 NS |
| 5 | **你** | **注册商后台改 NS** | 填上那两个 NS 并保存 |
| 6 | 等 | NS 传播（10 分钟–24 小时） | `nslookup -type=NS example.com 223.5.5.5` 返回 `*.ns.cloudflare.com` |
| 7 | 我 | `bind_domain.py bind --apply` | Pages 域名状态变 `active` |
| 8 | 我 | `bind_domain.py verify` | 7/7 PASS |
| 9 | **你** | **微信真机发一次链接** | 不出现「已停止访问该网页」 |
| 10 | 我 | 更新 README / 交接卡 / 站点 canonical | — |

> 第 5 步是唯一必须你动手的云端操作（NS 只能在注册商改）。
> 其余的都可以交给我。

---

## 六、常见问题

| 问题 | 答案 |
|---|---|
| 域名买完多久能用？ | 实名认证通过后即可开始配 DNS；解析传播另算 |
| 一定要实名认证吗？ | `.cn` 必须；`.com` 不强制，但建议做（否则可能被注册商要求补） |
| 需要 ICP 备案吗？ | **现在不需要**。CF Pages 境外回源不要求备案。以后要用国内 CDN 才需要 |
| 改 NS 会影响网站吗？ | 不会 —— 这是首次绑定，改完才第一次有流量 |
| 绑完还能改配置吗？ | 能。自定义域名可在 Pages 与 Workers 之间自由解绑重绑，长期链接不受影响 |
| 万一绑错了？ | `bind_domain.py` 的每个动作都能单独重跑；Pages 后台也可 Remove domain |
| 续费怎么办？ | `.com` 续费 85 元/年。设个日历提醒 |
| 微信还是打不开怎么办？ | 去 <https://safety.weixin.qq.com/> 域名查询看具体原因；备案 + 国内 CDN 是终极解法 |
