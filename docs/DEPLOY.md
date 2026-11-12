# 部署手册（Cloudflare Pages）

> 目标：`https://<项目名>.pages.dev` 上线，日后改内容只需 `git push`，链接不变。

---

## 阶段总览

| 阶段 | 目标 | 前置条件 | 产出物 | 验收标准 |
|---|---|---|---|---|
| **0** 本地整理 | 单文件 → 多文件站点 | 桌面原文件 | `src/`（真源） | 16 项功能验证 + 5 视口验证全 PASS |
| **1** 版本管理 | 内容可追溯、可回滚 | Git | Git 仓库 + 首次提交 | 克隆后重建产物逐字节一致 |
| **2** 部署配置 | 产物可发布 | Node.js + Cloudflare 账号 | `site/` + `_headers` + `_redirects` + 部署脚本 | 部署检查全 OK、产物清单完整 |
| **3** 绑定域名 | 用自己的域名 | 已购域名 | DNS 记录 + 自定义域名 | HTTPS 生效、www 跳转正确 |
| **4** 日常更新 | 改内容即上线 | 已连 GitHub | `git push` | 60 秒内线上生效、链接不变 |
| **5** 排查回滚 | 出问题能退回去 | 有提交历史 | 回滚命令 | 一条命令回到上一版 |

> 本次已完成 **阶段 0 / 1 / 2**。阶段 3–5 需要你的账号，命令已备好，见下文。

---

## 阶段 2：部署（当前进度）

### 2.1 前置检查

```bash
cd C:/Users/EDY/WorkBuddy/boya-museum-site
python tools/deploy.py --check
```

预期输出：Node.js ✓ / 构建产物 ✓（13 个文件，1.81 MB）/ 凭据提示。

### 2.2 方式 A：Git 集成（推荐）

**为什么推荐**：一次配置，以后每次 `git push` 自动部署，**不需要在本地跑任何部署命令**。

**Step 1 — 推到 GitHub**

```bash
cd C:/Users/EDY/WorkBuddy/boya-museum-site
git remote add origin https://github.com/<你的用户名>/boya-museum-site.git
git push -u origin main
```

> 仓库需为 **Public**，否则 Cloudflare Pages 免费版无法连接私有仓库。

**Step 2 — Cloudflare 后台配置**

1. 登录 <https://dash.cloudflare.com> → 左侧 **Workers 和 Pages** → **创建** → **Pages** → **连接到 Git**
2. 选择 `boya-museum-site` 仓库 → **开始部署**
3. 设置（**Build settings**）：

   | 字段 | 值 | 说明 |
   |---|---|---|
   | 框架预设 | **None** | 纯静态站点，不要选框架 |
   | 构建命令 | **留空** | 无需构建，`site/` 已是成品 |
   | 构建输出目录 | **site** | ⚠️ 最关键的一项 |
   | 根目录 | 留空 | 仓库根即项目根 |

4. 点 **保存并部署** → 约 1 分钟完成
5. 得到链接：`https://<项目名>.pages.dev`

**Step 3 — 验证**

```bash
# 本机起一个服务模拟线上，或直接用 curl 查线上
curl -I https://<项目名>.pages.dev
```

- 期望 `HTTP/2 200`
- `curl -s https://<项目名>.pages.dev | grep -c "base64"` → 应为 `0`
- 浏览器打开 → 三个案例标签可切换、图片能看、点「查看作品原图」能放大

### 2.3 方式 B：Wrangler 直传（不想接 Git 时）

```bash
# 1) 登录（会打开浏览器授权）
npx wrangler login

# 2) 检查并部署
python tools/deploy.py --project <项目名> --exec
```

等价命令：

```bash
npx wrangler pages deploy site --project-name=<项目名>
```

**CI 场景**用环境变量而非 `wrangler login`：

| 变量 | 用途 | 权限要求 |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | 账号 ID | — |
| `CLOUDFLARE_API_TOKEN` | API Token | **Pages:Edit** |

在 Cloudflare 控制台 → 我的个人资料 → **API 令牌** → 创建令牌 → 模板选 **Cloudflare Pages**。

> ⚠️ 令牌属于高权限凭据。**不要写进代码、不要提交到 Git**。本仓库的 `.gitignore` 已排除 `.env`、`wrangler.toml`、`.netrc`、`secrets.json`。

---

## 阶段 3：绑定自己的域名（下一步）

**前提**：域名已注册并已完成实名认证。

**Step 1 — 域名接入 Cloudflare**

Cloudflare → 添加站点 → 填你的域名 → 免费套餐 → 按提示改域名注册商的 NS 记录。

**Step 2 — Pages 项目加自定义域名**

Workers 和 Pages → 你的项目 → **Custom domains** → **设置自定义域名** → 填 `example.com`。

Cloudflare 会自动配好 DNS 并签发证书，**约 10–60 分钟生效**，无需手动加 CNAME。

**Step 3 — 生成带域名的跳转规则**

```bash
python tools/build.py --domain example.com
git add -A && git commit -m "chore: 配置 www → 主域跳转" && git push
```

> `_redirects` 目前是占位模板（注释状态）。填了 `--domain` 后会生成生效规则：
> `/*  https://example.com/$1  301`
>
> ⚠️ 该规则会把**所有路径**跳到主域。若你的站点只有首页，更简洁的写法是：
> ```
> /*  https://example.com/  301
> ```

**Step 4 — 验证**

```bash
curl -I https://www.example.com     # 期望 301 → https://example.com
curl -I https://example.com         # 期望 200
```

---

## 阶段 4：日常更新

```bash
# 1. 改 src/js/data.js 里的文案（或换 src/img/ 里的图片）

# 2. 构建 + 自检
python tools/build.py

# 3. 回归验证（强烈建议每次都跑）
export NODE_PATH="C:/Users/EDY/.workbuddy/binaries/node/workspace/node_modules"
node tools/verify.js

# 4. 提交推送 → Cloudflare 自动部署（约 30–60 秒）
git add -A
git commit -m "更新案例 01 研究背景"
git push
```

**链接永远不变** —— 这是 Git 集成的核心价值。

---

## 阶段 5：排查与回滚

### 快速回滚到上一版

Cloudflare 控制台 → Workers 和 Pages → 你的项目 → **Deployments** → 找到上一条成功部署 → 右侧 **⋯** → **Rollback to this deployment**。

秒级生效，**不需要重新构建**。

### 用 Git 回滚

```bash
git log --oneline -10          # 找到目标提交
git revert <commit>            # 撤销一次提交（安全，可再推）
git push                       # 线上自动更新

# 或彻底回退到某个提交（会丢弃后续提交，慎用）
git reset --hard <commit>
git push --force
```

### 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 部署成功但页面 404 | 构建输出目录不是 `site` | 回后台改成 `site` 并重新部署 |
| 页面样式全丢 | `css/main.css` 没上传 | 检查 `site/css/main.css` 是否存在 |
| 图片裂图 | `img/` 没上传 | 检查 `site/img/` 三个文件 |
| 控制台报 `openai.callTool` | 用的是迁移前的旧文件 | 重新 `python tools/migrate.py` + `build.py` |
| 改了内容线上没变 | 浏览器/CDN 缓存 | `_headers` 已对 HTML 设 `max-age=0`；仍不行则强制刷新 |
| 「恢复原文」错位 | 增删了正文标题/段落 | 见 README「加一个新案例」的注意事项 |

---

## 免费额度与成本

| 项目 | 费用 | 说明 |
|---|---|---|
| Cloudflare Pages 托管 | **$0** | 静态请求与带宽**无限**，500 次构建/月 |
| 绑定域名 | ¥40–90/年 | 唯一刚性支出 |
| HTTPS 证书 | **$0** | 自动签发与续期 |
| CDN 加速 | **$0** | 自带全球节点 |

**国内访问**：`pages.dev` 裸域名在境内有 DNS 污染的社区实测反馈，**务必绑自有域名**。
若主要面向大陆用户且需要更快速度，方案 A 之外的备选是「阿里云 OSS + CDN」（约 ¥18/月，需 ICP 备案）。

---

## 链接长期有效的保证

1. **自有域名是唯一可带走的资产** —— `pages.dev` 随账号存在，域名不会
2. **NS 记录留在 Cloudflare** —— 平台倒闭也能改 DNS 迁走
3. **Git 仓库 + Gitee 镜像双备份** —— 内容永不丢
4. **离线备份一份 `site/`** —— 平台全挂也能 10 分钟重建
5. **域名开启自动续费 + 注册商锁 + 到期提醒** —— 域名过期是链接失效最常见原因
6. **UptimeRobot 探活** —— 挂了第一时间知道

详见 `docs/OPERATIONS.md`。
