# Cloudflare 上线操作（2026-11 改版后）

> ⚠️ **先读这一段**：Cloudflare 在 2026 年改版了控制台。
> **「创建应用」的默认流程现在是 Workers，不再是 Pages。**
> Pages 被降级为「旧版工作流」，入口是创建页面**顶部或底部的一行小字**，
> 很多人因此以为找不到入口 —— 这不是你的问题。

---

## 找不到入口？直接用直达链接

| 用途 | 链接 |
|---|---|
| **Pages 创建页**（推荐路线） | <https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/pages> |
| Workers 和 Pages 总览 | <https://dash.cloudflare.com/?to=%2F%3Aaccount%2Fworkers-and-pages> |

> 两个链接都是 Cloudflare 官方文档给出的。`:account` 会自动替换成你的账号。
> 打不开就直接用下面的手动路径。

### 手动路径（左侧边栏）

**计算（Compute） → Workers 和 Pages**

- 中文界面：在左侧栏往上找到 **「计算」** 分组 → 点 **「Workers 和 Pages」**
- 英文界面：**Compute** → **Workers & Pages**

> 如果连「Workers 和 Pages」都看不到，说明你还没创建 Cloudflare 账号，
> 或停留在别的账号/组织下 —— 看右上角账号名，必要时先切换。

---

## 路线 A · Pages（推荐，与本仓库配置完全对应）

### A-1 进入创建页

**Worker 和 Pages → 创建应用（Create application）**

此时你会看到默认的 **Workers** 界面 —— **别急着点「导入 Git 存储库」**，
先找那一行小字：

> 页面**顶部或底部**有一行 **「需要使用旧版 Pages 工作流？继续前往 Pages」**
> （英文：*Looking to deploy Pages? Get Started*）

**点它。** 之后就进入真正的 Pages 创建界面了。

> 💡 找不到那行字？直接用上面的**直达链接**，效果完全一样。

### A-2 授权 GitHub

1. 点 **开始使用 GitHub**
2. 选账号 **`Elliot-elli`**
3. 仓库选择界面选 **Only select repositories** → 只勾 **`museum-site`**
4. 点 **Install & Authorize**

### A-3 选仓库

1. 列表里选 **`Elliot-elli/museum-site`**
2. 点 **开始设置（Begin setup）**

### A-4 ⚠️ 填构建设置（**填错必失败**）

| 界面项 | 填什么 |
|---|---|
| Project name（项目名称） | `museum-site`（默认即可） |
| Production branch（生产分支） | `main` |
| Framework preset（框架预设） | **None** |
| **Build command（构建命令）** | **`bash tools/build_cloud.sh`** |
| **Build output directory（构建输出目录）** | **`site`** |
| Root directory（根目录） | 留空 |
| Environment variables | 留空 |

点 **保存并部署（Save and Deploy）**。

#### 为什么要填构建命令（不能留空）

本仓库的 `site/` 是**构建产物**，被 `.gitignore` 排除，**不在 Git 里**。
CF 克隆后只有：

```
README.md   docs/   src/   tools/   wrangler.jsonc
```

留空 → 部署报 **`Failed to find directory site`** → 直接失败。
填 `bash tools/build_cloud.sh` → 云端自己构建出 `site/` → 正常。

#### 为什么框架预设选 None

选 Vite/React 等会让 CF 去跑 `npm install && npm run build`，
本项目没有 `package.json` → 失败。

### A-5 验证

```bash
curl -I https://museum-site.pages.dev                      # 期望 200
curl -s https://museum-site.pages.dev | grep -c base64     # 期望 0
curl -s -o /dev/null -w "%{http_code}\n" https://museum-site.pages.dev/js/data.js   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://museum-site.pages.dev/css/main.css # 200
```

浏览器再点一遍：三个标签能切 / 图片能看 / 能放大 / 13 项自查能勾。

---

## 路线 B · Workers + Static Assets（Cloudflare 现在主推）

如果 A 路线实在找不到入口，走这条。**仓库已配好 `wrangler.jsonc`，无需任何额外文件。**

### B-1 进入创建页

**Workers 和 Pages → 创建应用 → 导入现有 Git 存储库（Import an existing Git repository）**

### B-2 授权 + 选仓库

同 A-2 / A-3（GitHub App 会共用同一个授权）。

### B-3 ⚠️ 填构建设置

| 界面项 | 填什么 |
|---|---|
| Worker name（Worker 名称） | **`museum-site`** ← 必须与 `wrangler.jsonc` 的 `name` **完全一致** |
| Production branch | `main` |
| **Build command** | **`bash tools/build_cloud.sh`** |
| **Deploy command** | **`npx wrangler deploy`** |
| Root directory | 留空 |

### B-4 关键差异（Workers vs Pages）

| | Pages | Workers |
|---|---|---|
| 域名 | `*.pages.dev` | `*.workers.dev` |
| 输出目录怎么定 | 后台填「构建输出目录」 | `wrangler.jsonc` 的 `assets.directory`（已配好 `./site`） |
| 404 页 | 自动识别 `404.html` | 需 `not_found_handling: "404-page"`（已配好） |
| `_headers` / `_redirects` | ✅ 原生支持 | ✅ **同样原生支持**（官方文档确认） |
| 自定义域名 | **可绑非 Cloudflare 的域名**（CNAME） | **要求域名 NS 托管在 Cloudflare** |
| 分支预览部署 | 更灵活 | 一般 |

> 🔴 **如果打算用国内域名服务商（阿里云/腾讯云）且不打算改 NS → 选 Pages（路线 A）。**
> Workers 绑定自定义域名**必须**把域名的 NS 托管到 Cloudflare。

---

## 两条路线都踩过的坑（已在本仓库规避）

1. **构建命令不能留空** → 产物目录不入库，必须让云端自己构建
2. **`_redirects` 用 `:splat` 不用 `$1`** → 后者是 Netlify 风格，CF **静默忽略**
3. **`_redirects` 按【路径】匹配不按主机名** → www↔主域跳转必须用后台 Redirect Rules
4. **Worker 名称必须与 `wrangler.jsonc` 的 `name` 一致** → 不一致直接构建失败
5. **`_headers` 规则不要重叠** → 重叠时多个值会被逗号拼接，浏览器只取第一个

---

## 绑自定义域名（两条路线通用）

项目页 → **Custom domains（自定义域名）** → 填 `example.com` → 继续。

CF 自动配 DNS 和证书，**不用手动加 CNAME**。等约 1–2 分钟状态变 **Active**。

**www → 主域 的跳转**（`_redirects` 做不了，CF 按路径不按主机名匹配）：

**Rules → Redirect Rules → Create rule**
- Condition：`Hostname` **equals** `www.example.com`
- Then：**Static redirect** → `https://example.com` → 状态码 **301**

---

## 出问题时看哪里

| 现象 | 原因 |
|---|---|
| `Failed to find directory site` | 构建命令留空了 → 填 `bash tools/build_cloud.sh` |
| 部署成功但页面 404 | 构建输出目录不是 `site` |
| 部署成功但样式丢失 | 构建输出目录填成了 `src` |
| 部署成功但页面是源码 | 构建输出目录填成了仓库根 |
| Worker 构建报名称不匹配 | Worker 名称 ≠ `wrangler.jsonc` 的 `name` |
| 跳转规则不生效 | `_redirects` 用了 `$1`（应为 `:splat`）或想用 `_redirects` 做主机名跳转 |
