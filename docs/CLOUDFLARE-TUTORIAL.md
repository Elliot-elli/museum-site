# Cloudflare Pages 上线教程（照着做即可）

> 面向：第一次用 Cloudflare、或者在改版后的后台里找不到入口的人。
> 目标：把 `Elliot-elli/museum-site` 仓库部署成公网可访问的 `https://museum-site-cwb.pages.dev`。
> 全程约 10 分钟，其中等构建约 2~4 分钟。
>
> **本教程只走 Pages 路线。** 选 Pages 的理由见 `docs/CLOUDFLARE-STEPS.md` 的「B-5 选型结论」
> （含本机实测的境内 DNS 污染证据）。
>
> ✅ **已上线并通过验收**（2026-11-12）：线上地址 `https://museum-site-cwb.pages.dev`，
> 9 项浏览器验收全通过，大陆 DNS 解析正常。下方步骤可作为「重建一个项目」的参考。

---

## 第 0 步 · 先确认前置条件

| 检查项 | 要求 | 怎么确认 |
|---|---|---|
| GitHub 仓库 | 已存在且公开，地址 <https://github.com/Elliot-elli/museum-site> | 浏览器能打开这个地址 |
| 仓库里有 `src/` | 目录结构见下 | 打开仓库首页能看到 `src` 文件夹 |
| Cloudflare 账号 | 已注册并登录 | 打开 <https://dash.cloudflare.com> 不跳转注册页 |

仓库应有的结构（缺任何一项都会导致后面构建失败）：

```
museum-site/
├── README.md
├── src/          ← 真源
├── tools/
│   ├── build.py
│   └── build_cloud.sh   ← 云端构建入口
└── wrangler.jsonc
```

> ⚠️ **`site/` 不在仓库里是故意的。** 它是构建产物，被 `.gitignore` 排除。
> 所以后台的「构建命令」**必须填**，不能留空 —— 留空 Cloudflare 会找不到输出目录直接报错。

---

## 第 1 步 · 进入 Pages 创建页

### 1.1 直达链接（最省事）

点这个链接直接进 Pages 创建页：

**<https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/pages>**

`:account` 会自动替换成你的账号。打不开就用下面手动路径。

### 1.2 手动路径

1. 打开 <https://dash.cloudflare.com>
2. 左侧边栏找到 **「计算」（Compute）**
3. 点 **「Workers 和 Pages」**
4. 点 **「创建应用」（Create application）**

### 1.3 🔴 最容易卡住的一步

Cloudflare 在 2026 年改了版，**「创建应用」的默认流程现在是 Workers，不再是 Pages。**
所以点进「创建应用」后，你看到的界面是 Workers 的，**这不是你操作错了**。

你要找的是页面**顶部或底部**的一行小字：

> **「需要使用旧版 Pages 工作流？继续前往 Pages」**
> （英文：*Looking to deploy Pages? Get Started*）

**点它**，就进入真正的 Pages 创建界面。

> 找不到那行字？用 1.1 的直达链接，效果完全一样。

---

## 第 2 步 · 授权 GitHub

1. 点 **「开始使用 GitHub」**（Get started with GitHub）
2. 选账号 **`Elliot-elli`**
3. 仓库选择界面选 **Only select repositories**（只选特定仓库）
4. 只勾选 **`museum-site`**，**不要选 All repositories**
5. 点 **Install & Authorize**

> 🔴 **只授权这一个仓库。** 选 All repositories 会把 GitHub 账号下所有仓库的读写权限都给 Cloudflare，
> 对一个只有一个项目的站点来说完全没必要。

---

## 第 3 步 · 选仓库

1. 列表里选 **`Elliot-elli/museum-site`**
2. 点 **「开始设置」**（Begin setup）

---

## 第 4 步 · ⚠️ 填构建设置（**填错必失败**）

这一屏的每个字段都要精确：

| 界面项（英文） | 界面项（中文） | 填什么 | 为什么 |
|---|---|---|---|
| Project name | 项目名称 | `museum-site-cwb` | 本项目实际用的名字，决定 `museum-site-cwb.pages.dev` |
| Production branch | 生产分支 | `main` | 你的主分支 |
| Framework preset | 框架预设 | **None** | 选 Vite/React 会让 CF 去跑 `npm install && npm run build`，本项目没有 `package.json` → 失败 |
| **Build command** | **构建命令** | **`bash tools/build_cloud.sh`** | 🔴 **不能留空**。`site/` 不在 Git 里，留空 → 报 `Failed to find directory site` |
| **Build output directory** | **构建输出目录** | **`site`** | 填 `src` 会样式丢失；填仓库根会显示源码 |
| Root directory | 根目录 | **留空** | 留空 = 仓库根。填 `museum-site` 会导致找不到 `src/` |
| Environment variables | 环境变量 | 留空 | 本项目不需要 |

填完点 **「保存并部署」**（Save and Deploy）。

### 4.1 三个填错的后果对照

| 填错的东西 | Cloudflare 报什么 | 页面表现 |
|---|---|---|
| 构建命令留空 | `Failed to find directory site` | 构建直接失败 |
| 输出目录填 `src` | 构建成功 | 页面没样式，白底裸 HTML |
| 输出目录填仓库根 | 构建成功 | 显示的是仓库里的 `README.md` 源码 |
| 根目录填 `museum-site` | `src/ 不存在` | 构建脚本自己会报错退出 |

---

## 第 5 步 · 等构建

点完「保存并部署」后，页面会跳到部署详情页，状态从 **Building** → **Ready**。

- 构建在 Cloudflare 的 Linux 容器里跑，约 2~4 分钟
- 日志里应该能看到这三步（来自 `tools/build_cloud.sh`）：
  ```
  ==> 1/3 检查真源
  ==> 2/3 构建产物
  ==> 3/3 校验产物
  [OK] 云端构建完成
  ```
- 看到 **`[OK] 云端构建完成`** 就对了
- 如果红色报错，把日志里的 `[FAIL]` 那一行截图给我

---

## 第 6 步 · 验收（4 条命令 + 浏览器）

### 6.1 命令行验收

```bash
# 1) 首页 200
curl -I https://museum-site-cwb.pages.dev

# 2) 页面里不该再有 base64 内联大图（应该拆成了独立文件）
curl -s https://museum-site-cwb.pages.dev | grep -c base64     # 期望 0

# 3) 三个静态资源都要 200
curl -s -o /dev/null -w "%{http_code}\n" https://museum-site-cwb.pages.dev/js/data.js    # 200
curl -s -o /dev/null -w "%{http_code}\n" https://museum-site-cwb.pages.dev/css/main.css  # 200
curl -s -o /dev/null -w "%{http_code}\n" https://museum-site-cwb.pages.dev/js/app.js     # 200

# 4) 三张图都要 200
for i in 01 02 03; do
  curl -s -o /dev/null -w "%{http_code}\n" https://museum-site-cwb.pages.dev/img/case-$i.jpg
done
```

### 6.2 浏览器验收（必须手动点一遍）

打开 <https://museum-site-cwb.pages.dev>，逐项确认：

- [ ] 三个标签能切换
- [ ] 每张图能点开、放大、关闭
- [ ] 底部 13 项自查表能勾选
- [ ] **点「导出 HTML」能导出文件，且导出后单独打开仍是完整页面**（不是白页）
- [ ] 页面**无滚动条**（单屏放下）
- [ ] F12 控制台**没有任何红色报错**

> 🔴 **「导出 HTML」这一项最容易出问题。** 之前在拆分阶段它会产出白页，
> 因为导出时把外链资源也带出去了。已修过，但要你亲眼确认一次。

---

## 第 7 步 · 绑自己的域名（**要发微信就强烈建议做**）

### 7.1 为什么必须做

微信是**按域名维度**风控的，不是按页面维度：

- 共享的 `*.pages.dev` 下只要有**任意一个**页面违规，**整个域名段**都可能被拦截
- 用户点开你的链接看到「已停止访问该网页」，你完全不知道为什么
- 自有域名 + 完整备案是降低被拦截概率**最有效**的手段

另外 `pages.dev` 免费二级域名在境内线路不稳定，绑自有域名后访问质量也更好。

### 7.2 买域名

阿里云 / 腾讯云 / 华为云都行，`.com` 或 `.cn` 都可以，**几十块一年**。

> `.cn` 域名要求**实名认证**（个人身份证即可，免费，几分钟）。
> `.com` 不强制但也建议做。

### 7.3 在 Cloudflare 里加自定义域名

> 📌 **2026-11-13 更新**：本步只覆盖「DNS 留在原服务商 + 用子域名」这条路线。
> 完整的三条路线对比（含 NS 托管 Cloudflare、根域名要求）见
> [`docs/DOMAIN-BINDING.md`](./DOMAIN-BINDING.md)，建议直接照那份做。

1. 进入 **Workers 和 Pages → 你的项目 `museum-site`**
2. 点 **「Custom domains」（自定义域名）**
3. 点 **「Set up a custom domain」**
4. 填你的域名，例如 `museum.example.com`
   （**必须是子域名**：官方要求「根域名必须把 NS 托管到 Cloudflare」，本步骤不适用）
5. 点 **「Continue」**
6. Cloudflare 会提示你去 DNS 服务商加一条 **CNAME 记录**

### 7.4 在 DNS 服务商加 CNAME

**顺序很重要：先在 Cloudflare 侧添加自定义域名，再去 DNS 加记录。**
反过来会报 **522**。

在阿里云/腾讯云的 DNS 控制台添加：

| 字段 | 值 |
|---|---|
| 主机记录 | `museum`（对应 `museum.example.com`） |
| 记录类型 | **CNAME** |
| 记录值 | **`museum-site-cwb.pages.dev`** |
| TTL | 默认（600 秒） |

### 7.5 等证书

- 约 1~2 分钟，Cloudflare 自动签发证书，状态从 **Pending** 变 **Active**
- 变 Active 后访问 `https://museum.example.com` 应该跟 `pages.dev` 完全一样

### 7.6 统一 www / 主域跳转

CF 的 `_redirects` **按路径匹配、不按主机名**（官方「Advanced redirects」表里
Domain-level redirects 一栏标 ❌ 不支持），所以 `www` 跳转必须用后台规则：

**Rules → Redirect Rules → Create rule**
- Condition：`Hostname` **equals** `www.museum.example.com`
- Then：**Static redirect** → `https://museum.example.com` → 状态码 **301**

> 🔴 **前提**：域名必须在你的 Cloudflare 账号里（NS 托管到 Cloudflare）。
> 若 DNS 仍留在阿里云/腾讯云，请求不经过你的 Cloudflare 区域，
> **Redirect Rules 配了也不生效** —— 这种情况改用「www 也加为第二个自定义域名 +
> 同一条 CNAME」的双域名方案。详见 [`docs/DOMAIN-BINDING.md`](./DOMAIN-BINDING.md) §4。

### 7.7 域名劫持检查（❗ 重要，做完务必做）

**顺序错了会显示「已被他人占用」**：

1. 先在 Cloudflare 添加自定义域名
2. **再**去 DNS 加 CNAME
3. 两条都完成后，**等 10 分钟**再回来点「验证」

> 🔴 CF 的域名验证是**一次性快照检查**，如果加 CNAME 的瞬间它就检查，必然失败。
> 首次显示「已被他人占用」**不代表真被占用**，等 10 分钟再验证即可。

---

## 第 8 步 · 微信里的最终验收

发链接前，用**微信**（不是手机浏览器）打开链接确认：

1. 把链接发到「文件传输助手」
2. 点开 → 应该正常加载，**不显示「已停止访问该网页」**
3. 如果被拦了，去 <https://safety.weixin.qq.com/> → 域名查询，看具体原因

**没有被拦但仍想更稳**：走 ICP 备案 + 国内 CDN（EdgeOne），详见 `docs/CLOUDFLARE-STEPS.md` 的「境内访问的现实」。

---

## 第 9 步 · 日常更新流程

以后改了内容，流程是这样：

```bash
cd C:/Users/EDY/WorkBuddy/boya-museum-site

# 1. 改 src/ 下的文件（真源）

# 2. 本地构建 + 验证
bash tools/build_cloud.sh

# 3. 提交推送
git add -A && git commit -m "描述你的改动" && git push origin main
```

**push 之后 Cloudflare 自动重新构建部署**，约 2~4 分钟生效，不需要在后台做任何事。

> 🔴 **只改 `src/`，永远不要直接改 `site/`。**
> `site/` 是产物，不在 Git 里，你改了它下次构建就被覆盖，而且改动根本不会上线。
> 改 `src/` → 构建 → 提交，缺一不可。

---

## 出问题时看这里

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 找不到 Pages 入口 | 2026 改版后 Pages 被降级为「旧版工作流」 | 用第 1.1 步的直达链接 |
| `Failed to find directory site` | 构建命令留空了 | 填 `bash tools/build_cloud.sh` |
| 构建成功但页面 404 | 输出目录不是 `site` | 改成 `site` |
| 构建成功但没样式 | 输出目录填成了 `src` | 改成 `site` |
| 页面显示 README 源码 | 输出目录填了仓库根 | 改成 `site` |
| 构建日志报 `src/ 不存在` | 根目录填了 `museum-site` | 根目录留空 |
| 构建报 `npm install` 失败 | 框架预设选了 Vite/React 等 | 改成 **None** |
| 加自定义域名报 522 | 顺序错了 | 先加 CNAME 再加自定义域名 |
| 自定义域名显示「已被他人占用」 | 验证时机太早 | 等 10 分钟再验证 |
| 加了域名但页面没变 | DNS 没生效 | 等 TTL 过期，10 分钟~1 小时 |
| 跳转规则不生效 | `_redirects` 用了 `$1` | 必须是 `:splat`；主机名跳转要用后台 Redirect Rules |
| 微信里打不开 | 域名被微信风控 | 见第 7、8 步 |

---

## 附 · 关键链接

| 用途 | 链接 |
|---|---|
| Pages 创建页（直达） | <https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/pages> |
| Workers 和 Pages 总览 | <https://dash.cloudflare.com/?to=%2F%3Aaccount%2Fworkers-and-pages> |
| 本项目 GitHub 仓库 | <https://github.com/Elliot-elli/museum-site> |
| 部署完成后的地址 | <https://museum-site-cwb.pages.dev> |
| 微信域名查询 | <https://safety.weixin.qq.com/> |
| 文档中心 | <https://developers.cloudflare.com/pages/> |
