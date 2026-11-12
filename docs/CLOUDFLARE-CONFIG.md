# Cloudflare Pages 配置速查

> ⚠️ 本文件是**说明文档**，不是 Cloudflare 识别的配置文件。
>    Pages 的构建参数在**后台网页界面**设置，不读仓库里的文件。
>    保留它是为了：① 记录正确参数值；② 换平台或重建时不至于忘记；③ 交接给他人时一目了然。

---

## 一、构建参数（**最关键，填错必失败**）

**Workers 和 Pages → 你的项目 → Settings → Build settings**

| 字段 | 填什么 | ⚠️ 说明 |
|---|---|---|
| 框架预设 | **None** | 不要选任何框架 |
| **构建命令** | **`bash tools/build_cloud.sh`** | **不能留空！** 见下方说明 |
| **构建输出目录** | **`site`** | 写错会 404 |
| 根目录 | 留空 | 即仓库根 |
| 环境变量 | 无 | — |

### 为什么构建命令不能留空（踩坑点）

本项目的 `site/` 是**构建产物**，被 `.gitignore` 排除，**不在 Git 仓库里**。
Cloudflare 从 Git 克隆后拿到的是：

```
README.md  docs/  src/  tools/     ← 没有 site/ 目录
```

所以：
- ❌ **构建命令留空 + 输出目录 `site`** → 部署直接失败，报 `Failed to find directory site`
- ✅ **构建命令 `bash tools/build_cloud.sh`** → 云端跑一次构建，生成 `site/` → 正常部署

`tools/build_cloud.sh` 会自动完成：检查 `src/` → 调 `tools/build.py` 构建 → 校验产物。
它只依赖 bash + python3，**不需要 Node、不需要 npm install**（CF 的构建镜像自带 python3）。

### 为什么不把 site/ 直接提交进仓库

| 方案 | 问题 |
|---|---|
| `site/` 入库 | 改完 `src/` 忘记重新构建 → **线上是旧的，仓库里也是旧的**，看起来一切正常，实际内容不更新 |
| **`site/` 不入库（当前方案）** | 每次部署云端必然重新构建 → 线上内容永远与 `src/` 一致，不存在静默不一致 |

代价只是 CF 多花几秒构建（1.81 MB，几秒而已）。

---

## 二、构建产物清单（13 个文件，1.81 MB）

| 文件 | 大小 | 说明 |
|---|---|---|
| `index.html` | 58,770 B | 入口 |
| `css/main.css` | 16,173 B | 主样式 |
| `js/app.js` | 17,210 B | 交互逻辑 |
| `js/data.js` | 29,991 B | ★ **三个案例的文案与配图 —— 日常改这里** |
| `img/case-01.jpg` | 704,252 B | 案例 01 碳足迹 |
| `img/case-02.jpg` | 655,536 B | 案例 02 AI 与绿色提示词 |
| `img/case-03.jpg` | 414,856 B | 案例 03 最后机会旅游 |
| `404.html` | 1,625 B | 自定义 404 页 |
| `_headers` | 814 B | 缓存策略 + 安全响应头（CF 约定文件名） |
| `_redirects` | 417 B | 跳转规则（CF 约定文件名） |
| `favicon.svg` / `favicon.ico` | 394 / 178 B | 图标 |
| `robots.txt` | 143 B | 爬虫策略 |

> ⚠️ `_headers` 和 `_redirects` **必须在输出目录（即 `site/`）里**才生效。
> 放在仓库根目录不会被识别。

---

## 三、缓存策略（`_headers` 里定的）

| 路径 | 策略 | 理由 |
|---|---|---|
| `index.html` / `404.html` | `max-age=0, must-revalidate` | 改完刷新即见最新 |
| `css/*` `js/*` | `max-age=604800`（7 天） | 改动频率低 |
| `img/*` `favicon.*` | `max-age=2592000`（30 天） | 图片不变 |

> ⚠️ CF 的 CDN 边缘缓存**不会因为新部署自动清除**。
> 若改了 `js/data.js` 却看到旧内容，在后台点 **Purge Cache** 或强制刷新（Ctrl+Shift+R）。

---

## 四、绑定域名后要做的一件事

### www ↔ 主域 跳转：**不能用 `_redirects`**

CF Pages 的 `_redirects` **按路径匹配，不按主机名匹配**。
写 `https://www.example.com/*  https://example.com/:splat  301` 会被**静默忽略**
（部署成功但跳转不生效）。这是 Cloudflare 上最常见的「以为配好了其实没生效」。

**正确做法 —— 后台 Redirect Rules**：

Cloudflare → 左侧 **Rules** → **Redirect Rules** → **Create rule**

| 字段 | 填什么 |
|---|---|
| Rule name | `www → apex` |
| Condition | **Custom filter** → `Hostname` **equals** `www.example.com` |
| Then | **Static redirect** |
| URL | `https://example.com` |
| Status code | **301** |

> 想反向（主域 → www）就把条件里的主机名换掉。

### 语法提醒：CF 用 `:splat`，不是 `$1`

```
/*  https://example.com/:splat  301     ✅ CF 正确
/*  https://example.com/$1      301     ❌ Netlify 风格，CF 静默忽略
```

项目里有 `tools/check_redirects.py` 专门校验这个，**构建时会自动跑**，
语法错会直接让构建失败（不会静默上线一个失效的规则）。

---

## 五、部署后的验证命令

```bash
curl -I https://museum-site.pages.dev
# 期望 HTTP/2 200

curl -s https://museum-site.pages.dev | grep -c base64
# 期望 0（说明没把 3 MB 的 base64 传上去）

curl -s -o /dev/null -w "%{http_code}\n" https://museum-site.pages.dev/css/main.css
# 期望 200

curl -s -o /dev/null -w "%{http_code}\n" https://museum-site.pages.dev/js/data.js
# 期望 200

curl -s -o /dev/null -w "%{http_code}\n" https://museum-site.pages.dev/img/case-01.jpg
# 期望 200

curl -s -o /dev/null -w "%{http_code}\n" https://museum-site.pages.dev/nonexist
# 期望 404（且页面是自定义 404.html，不是 CF 默认页）

curl -I https://museum-site.pages.dev | grep -i cache-control
# 期望包含 max-age=0（HTML 不缓存）
```

---

## 六、常见失败对照

| 报错 | 原因 | 处理 |
|---|---|---|
| `Failed to find directory site` | 构建命令留空，CF 克隆后没有 site/ | 构建命令填 `bash tools/build_cloud.sh` |
| 部署成功但 404 | 输出目录写错 | 改成 `site` |
| 部署成功但页面无样式 | `css/main.css` 没上传 | 检查构建日志有无报错 |
| 部署失败 `python3: not found` | 构建镜像问题 | 确认构建命令前缀是 `bash tools/build_cloud.sh`（脚本内会自动 fallback 到 `python`） |
| 改了内容线上没变 | CDN 缓存 | Purge Cache 或强制刷新 |
| www 跳转不生效 | 用了 `_redirects` 做主机名跳转 | 改用后台 Redirect Rules |
