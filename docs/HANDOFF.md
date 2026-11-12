# 上线交接卡（会话续接用）

> 状态快照 · 2026-11-12 14:25
> **新会话接手时先读这一页**，不必回溯长对话。

---

## 一句话现状

**阶段 0/1/2 全部完成并通过验证**；代码已推送 GitHub。
**只剩 Cloudflare Pages 的网页连接操作**（需你操作一次）。

---

## 已完成（不要重做）

| 项 | 状态 |
|---|---|
| 桌面单文件 → 结构化站点 | ✅ `src/` 真源 + `site/` 产物，3.05 MB → 1.81 MB |
| 沙箱注入层剥离 | ✅ 原文件每次点击抛 `openai.callTool is not a function`，已复现并修掉 |
| 「导出 HTML」重写 | ✅ 导出时重新内联资源，不再产白页 |
| 功能验证 | ✅ `verify.js` 16 项 + `verify_viewports.js` 25 项 = **41 PASS / 0 FAIL** |
| Git 仓库 | ✅ 10 提交，`main` 分支，`.gitattributes` 锁 LF，克隆重建 **13/13 逐字节一致** |
| SSH 密钥 | ✅ `~/.ssh/id_ed25519_github`，已注册到 GitHub，认证账号 **`Elliot-elli`** |
| git 网络通路 | ✅ 全局改走 `ssh.github.com:443`（`github.com:443` 被代理拦截） |
| **代码推送** | ✅ **已完成**，`Elliot-elli/museum-site`（Public），远程 HEAD `9465837` |
| **远程内容校验** | ✅ **tarball 逐文件 md5 比对 34/34 全部一致** |
| 部署配置 | ✅ `_headers` / `_redirects` / `build_cloud.sh` / `check_redirects.py` 全部就绪 |

---

## 卡点 · Cloudflare Pages 连接（**需要你点一次**）

> 🔴 **2026 改版警告**：Cloudflare「创建应用」的默认流程**已改为 Workers**，
> Pages 被降级为「旧版工作流」—— 入口是创建页顶部/底部**一行小字**，
> 很多人因此以为找不到。**这不是你操作的问题。**
>
> **官方直达链接**（推荐，最省事）：
> <https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/pages>
>
> **手动路径**：左侧栏 **计算（Compute）→ Workers 和 Pages**

两条路线**都已配好**，照着 `docs/CLOUDFLARE-STEPS.md` 走即可。

### 路线 A · Pages（推荐）

1. **Worker 和 Pages → 创建应用**
2. 找那一行小字 **「需要使用旧版 Pages 工作流？继续前往 Pages」** → 点它
   （找不到就直接用上面的直达链接）
3. 点 **开始使用 GitHub** → 选 `Elliot-elli` → 只勾 **`museum-site`** → **Install & Authorize**
4. 列表里选 **`Elliot-elli/museum-site`** → **开始设置**

**设置 → 构建设置（Build settings）**

| 界面项 | 填什么 |
|---|---|
| Framework preset | **None** |
| **Build command** | **`bash tools/build_cloud.sh`** |
| Build output directory | **`site`** |
| Root directory | 留空 |

> 🔴 **构建命令留空 = 必失败**。`site/` 是构建产物、被 `.gitignore` 排除 → CF 克隆后没有该目录
> → 报 `Failed to find directory site`。这就是要提交 `build_cloud.sh` 让云端自己构建的原因。

保存 → **Retry deployment** → 等约 1 分钟变绿 → 拿到 `museum-site.pages.dev`。

### 路线 B · Workers（Cloudflare 现在主推）

**创建应用 → 导入现有 Git 存储库** → 选仓库 → 设置：

| 界面项 | 填什么 |
|---|---|
| **Worker name** | **`museum-site`** ← 必须与 `wrangler.jsonc` 的 `name` **完全一致** |
| Production branch | `main` |
| **Build command** | **`bash tools/build_cloud.sh`** |
| **Deploy command** | **`npx wrangler deploy`** |

> 仓库根已有 `wrangler.jsonc`（assets-only，`assets.directory=./site`），**无需任何额外文件**。
> 域名是 `*.workers.dev`（不是 `pages.dev`）。

### 🔴 两条路线的关键差异

| | Pages | Workers |
|---|---|---|
| 域名 | `*.pages.dev` | `*.workers.dev` |
| 自定义域名 | **可 CNAME 到外部 DNS** | **必须把 NS 托管到 Cloudflare** |

> **如果域名在阿里云/腾讯云且不打算改 NS → 选 Pages。**

### 2.3 验证

```bash
curl -I https://museum-site.pages.dev                      # 期望 200
curl -s https://museum-site.pages.dev | grep -c base64     # 期望 0（没把 3MB base64 传上去）
curl -s -o /dev/null -w "%{http_code}\n" https://museum-site.pages.dev/js/data.js   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://museum-site.pages.dev/css/main.css # 200
```

浏览器再点一遍：三个标签能切 / 图片能看 / 能放大 / 13 项自查能勾。

### 2.4 绑域名（可选）

自定义域名里填 `example.com`，CF 自动配 DNS 和证书，**不用手动加 CNAME**。

**www→主域跳转必须用后台规则**（`_redirects` 做不了，CF 按路径不按主机名匹配）：
左侧 **Rules → Redirect Rules → Create rule** →
Condition：`Hostname` **equals** `www.example.com` →
Then：**Static redirect** → `https://example.com` → 状态码 **301**

---

## 关键环境事实（已实测，**别再重复探测**）

| 项 | 结论 |
|---|---|
| `github.com:443` | ❌ 被 WorkBuddy 代理拦截（CONNECT 502） |
| `api.github.com` / `ssh.github.com:443` / `codeload.github.com` | ✅ 可达 |
| `raw.githubusercontent.com` | ❌ **HTTP 000（返回空）** → 校验远程内容用 **codeload tarball**，别用 raw |
| GitHub MCP | ⚠️ 连接器 connected，但**无 `repo:create`**（建仓 403）、**无 `update_repository`**（描述改不了）；<br>偶发 `internal_error`（瞬时，重试可恢复） |
| Cloudflare Token | ❌ 无。`api.cloudflare.com` 可达（只需 Token），`dash.cloudflare.com` 返回 403 属正常 |
| 账号 | ⚠️ **SSH 公钥认证到 `Elliot-elli`**，不是 `feixiang`（那是另一个账号） |

详见 `docs/ENVIRONMENT.md`。

---

## 日常更新（一行）

```bash
cd C:/Users/EDY/WorkBuddy/boya-museum-site
bash tools/update.sh "更新案例 01 文案"
```

构建 → 41 项验证 → 提交 → 推送 → 线上 30–60 秒生效，**链接不变**。

---

## 相关文档

| 文件 | 内容 |
|---|---|
| `docs/DEPLOY.md` | 部署总览、Git 集成步骤、绑域名、回滚 |
| `docs/OPERATIONS.md` | 日常 SOP、监控、三处备份、故障排查表 |
| `docs/CLOUDFLARE-STEPS.md` | Cloudflare 逐步操作（最详细） |
| `docs/CLOUDFLARE-CONFIG.md` | Pages 构建参数速查 + 三个坑的原理 |
| `docs/GO-LIVE-CHECKLIST.md` | 全流程清单，每步带验证命令 |
| `docs/ENVIRONMENT.md` | 本机网络/凭据/工具实测结论 |
| `README.md` | 项目总览、目录职责、命令速查 |

---

## 新会话接手后的第一条命令

```bash
cd "C:/Users/EDY/WorkBuddy/boya-museum-site" && git log --oneline -3 && git status -sb
```

然后问用户：「Cloudflare Pages 连上了吗？」—— 连上就验证链接；没连就复述上面「卡点 · Cloudflare」那 5 步。

