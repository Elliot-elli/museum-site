# Cloudflare Pages 具体操作（照着点即可）

> 前提：GitHub 仓库 `Elliot-elli/museum-site` **已存在且已推送**。
> 若还没建仓，先做 `docs/GO-LIVE-CHECKLIST.md` 的步骤 1–3。

---

## 阶段一 · 连接 GitHub（5 分钟）

### 1-1 打开正确的页面

<https://dash.cloudflare.com> → 左侧边栏 **Workers 和 Pages**

> ⚠️ **不要**去 "Workers" 标签下找，Pages 是独立入口。

### 1-2 创建项目

点 **创建** → 标签页选 **Pages** → 往下滑选 **连接到 Git**

### 1-3 授权 GitHub

1. 点 **开始使用 GitHub**
2. 弹窗里选你的账号 `Elliot-elli`
3. 勾选 **`museum-site`** 仓库（只勾这一个）
4. 点 **Install & Authorize**（安装并授权）

> 💡 如果页面显示"没有找到仓库"：先在 GitHub 确认仓库已推送（不能是空仓库），
> 然后回到这一步点 **Refresh repository list**。

### 1-4 选仓库并部署

1. 下拉框选 `Elliot-elli/museum-site`
2. 点 **开始部署**
3. 首次会用默认设置部署，**大概率失败**（找不到 `site/` 目录）—— **正常，继续下一步**

---

## 阶段二 · 改构建设置（**最关键，填错必失败**）

### 2-1 进入设置

左侧 **设置（Settings）** → 顶部切到 **构建设置（Build settings）**

### 2-2 逐项填写

| 界面项（英文） | 界面项（中文） | 填什么 |
|---|---|---|
| Framework preset | 框架预设 | **None** |
| Build command | 构建命令 | **`bash tools/build_cloud.sh`** |
| Build output directory | 构建输出目录 | **`site`** |
| Root directory | 根目录 | **留空** |
| Environment variables | 环境变量 | **留空** |

### 2-3 ⚠️ 三个必须记牢的点

**① 构建命令绝对不能留空**

本项目的 `site/` 是构建产物，被 `.gitignore` 排除，**不在 Git 仓库里**。
CF 克隆后只有：

```
README.md   docs/   src/   tools/      ← 没有 site/
```

- 留空 → 部署报 **`Failed to find directory site`** → 直接失败
- 填 `bash tools/build_cloud.sh` → 云端自己构建出 `site/` → 正常

**② 构建输出目录必须是 `site`**

写成仓库根目录 → 上线的是一堆源码；写成 `src` → 上线的是源文件不是产物。**都会 404 或白屏。**

**③ 框架预设选 None**

选 Vite/React 等会让 CF 尝试跑 `npm install && npm run build`，本项目没有 package.json → 失败。

### 2-4 保存并部署

点 **保存** → 顶部会提示重新部署 → 点 **保存并部署** 或 **Retry deployment**

等约 1 分钟。

---

## 阶段三 · 确认成功

### 3-1 看部署状态

**Workers 和 Pages → museum-site → Deployments（部署）**

最新一条应该是绿色 **Success**。如果是红色，点进去看 **Build log（构建日志）**。

### 3-2 拿到链接

项目主页顶部会显示：

```
https://museum-site.pages.dev
```

### 3-3 逐项验证（复制到终端跑）

```bash
# 1) 首页能通
curl -I https://museum-site.pages.dev
#    期望：HTTP/2 200

# 2) 页面没塞进 3MB 的 base64（说明图片落地成功）
curl -s https://museum-site.pages.dev | grep -c base64
#    期望：0

# 3) 静态资源都在
curl -s -o /dev/null -w "css  %{http_code}\n" https://museum-site.pages.dev/css/main.css
curl -s -o /dev/null -w "js   %{http_code}\n" https://museum-site.pages.dev/js/app.js
curl -s -o /dev/null -w "data %{http_code}\n" https://museum-site.pages.dev/js/data.js
curl -s -o /dev/null -w "img  %{http_code}\n" https://museum-site.pages.dev/img/case-01.jpg
#    期望：全部 200

# 4) 自定义 404 生效
curl -s -o /dev/null -w "404  %{http_code}\n" https://museum-site.pages.dev/nope
#    期望：404（且页面是我们做的那张，不是 CF 默认页）

# 5) HTML 不缓存（改完刷新即见）
curl -I https://museum-site.pages.dev | grep -i cache-control
#    期望：max-age=0
```

### 3-4 浏览器实测

打开 <https://museum-site.pages.dev>：

- [ ] 三个案例标签能切换
- [ ] 配图能正常显示
- [ ] 点「查看作品原图 ↗」能放大
- [ ] 点缩略图上的编号能看展板局部
- [ ] 滚到底部「作品自查」13 项能勾选
- [ ] 展开「编辑与导出」抽屉，能进编辑模式

---

## 阶段四 · 绑定自己的域名（可选）

### 4-1 域名接入 Cloudflare

Cloudflare 首页 → **添加站点** → 填域名（如 `example.com`）→ 免费套餐

按提示去域名注册商改 **NS 服务器**（两条），生效通常 30 分钟–24 小时。

### 4-2 加自定义域名

**Workers 和 Pages → museum-site → Custom domains（自定义域）→ 设置自定义域名**

填 `example.com` → 提交。

Cloudflare 会**自动配好 DNS 并签发证书**，**不用手动加 CNAME**。等 10–60 分钟。

### 4-3 www → 主域跳转（**不能用 `_redirects`**）

CF 的 `_redirects` **按路径匹配，不按主机名匹配** → 用它做主机名跳转会被**静默忽略**。

正确做法 —— 后台加规则：

1. 左侧 **Rules（规则）** → **Redirect Rules（重定向规则）** → **Create rule**
2. **Rule name**：填 `www → apex`
3. **If（条件）**：**Custom filter** → **Hostname** → **is equal to** → `www.example.com`
4. **Then（执行）**：**Static redirect（静态重定向）**
5. **URL**：填 `https://example.com`
6. **Status code**：**301**
7. 点 **Deploy**（部署）→ 立即生效

### 4-4 验证

```bash
curl -I https://www.example.com   # 期望 301 → https://example.com
curl -I https://example.com       # 期望 200
```

> 💡 也可以把 `example.com` 和 `www.example.com` **都**加为自定义域名，
> 让两个地址都能访问（但 SEO 上不理想）。做 301 跳转更规范。

---

## 阶段五 · 日常更新（以后每次）

```bash
cd C:/Users/EDY/WorkBuddy/boya-museum-site

# 1. 改 src/js/data.js 里的文案（或换 src/img/ 里的图片）

# 2. 一键：构建 + 41 项验证 + 提交推送
bash tools/update.sh "更新案例 01 研究背景"
```

**30–60 秒后线上自动生效，链接永远不变。**

---

## 出错了怎么办

### 看构建日志

**Deployments → 点开失败的那次 → Build log**

### 失败对照表

| 日志里的错误 | 原因 | 处理 |
|---|---|---|
| `Failed to find directory site` | 构建命令留空了 | 填 `bash tools/build_cloud.sh` |
| `ModuleNotFoundError: No module named 'xxx'` | 构建命令填了 python 脚本但解释器不对 | 只填 `bash tools/build_cloud.sh`（脚本内部自动找 python3/python） |
| `npm ERR!` / `package.json not found` | 构建命令里带了 `npm install` 或选了框架预设 | 预设改 **None**，命令只填 bash 那一条 |
| 部署 Success 但打开 404 | 输出目录不是 `site` | 改成 `site` |
| 部署 Success 但页面无样式 | `css/main.css` 没上传 | 看 Build log 是否有报错；本地跑 `bash tools/build_cloud.sh` 复现 |
| 部署 Success 但图片裂 | `img/` 没上传 | 同上 |
| 改了内容线上没变 | CDN 边缘缓存 | 后台 **Caching → Purge Cache**，或 Ctrl+Shift+R 强制刷新 |

### 本地复现云端构建

```bash
git clone <你的仓库> /tmp/t && cd /tmp/t && bash tools/build_cloud.sh
```

本地能过、云端不能过 → 通常是**构建命令写法**问题（本地有 python3，CF 镜像的 PATH 不同）。

### 回滚

**Deployments → 选上一条成功部署 → 右侧 ⋯ → Rollback to this deployment**

秒级生效，不需要重新构建。也可以在 Git 侧 `git revert <commit> && git push`。

---

## 一句话备忘

| 字段 | 值 |
|---|---|
| 框架预设 | **None** |
| 构建命令 | **`bash tools/build_cloud.sh`** |
| 构建输出目录 | **`site`** |
| 根目录 | 留空 |

**三个最易错：构建命令别留空、输出目录写 `site`、框架选 None。**
