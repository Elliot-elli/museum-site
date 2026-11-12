# 上线操作清单（GitHub + Cloudflare Pages）

> 按顺序做，每步都有「做完怎么确认」。
> 全程约 15 分钟，**其中只有 2 步需要你动手**（建仓 + 连接 Cloudflare）。

---

## 步骤 1 · 把 SSH 公钥贴到 GitHub（一次性，2 分钟）✅ 已完成

### 1.1 复制公钥

公钥已在生成时打印过，也在下面这段里（**这是公钥，可以公开**）：

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIVgw+VaRHzPh0jG+porxXzpJpxDDDZ1lNZD7ySLPIF/ feixiang@museum-site-deploy
```

> 私钥在 `C:\Users\EDY\.ssh\id_ed25519_github`，**绝不外发**。

### 1.2 添加到 GitHub

1. 打开 <https://github.com/settings/ssh/new>
2. **Title**：填 `WorkBuddy museum-site`（随便起个好认的）
3. **Key**：粘贴上面那整行（从 `ssh-ed25519` 开始到结尾）
4. 点 **Add SSH key**

### 1.3 确认成功

```bash
cd C:/Users/EDY/WorkBuddy/boya-museum-site
ssh -T git@github.com
```

**期望输出**：

```
Hi Elliot-elli! You've successfully authenticated, but GitHub does not provide shell access.
```

看到这句 = 公钥生效 ✅（后半句是正常的，GitHub 本身不提供 shell）

---

## 步骤 2 · 创建 GitHub 仓库（30 秒，**需你手动**）

> ⚠️ 为什么必须手动：WorkBuddy 的 GitHub 连接器用的是 GitHub App token，
> 权限只覆盖「读写已有仓库」，**没有创建仓库的权限**（API 返回 403
> `Resource not accessible by integration`）。SSH 也无法建仓，只能推送到已存在的仓库。

1. 打开 <https://github.com/new>
2. **Owner**：`Elliot-elli`
3. **Repository name**：`museum-site`
4. **Public**（必须 Public —— Cloudflare Pages 免费版不接私有仓库）
5. ⚠️ **不要勾** "Add a README file"（我们要推已有历史）
6. ⚠️ **不要勾** "Add .gitignore" / "Choose a license"
7. 点 **Create repository**

建完会跳到一个空仓库页面，直接**回来告诉我一声**，我接着推送。

> 建仓后想改描述/主页，随时可以在仓库页右上角 ⚙ → General 里改，
> 或我也可以通过 API 帮你改。

---

## 步骤 3 · 推送代码（1 分钟，**我代办**）

```bash
cd C:/Users/EDY/WorkBuddy/boya-museum-site
bash tools/setup_github.sh
```

脚本会依次：测 SSH → 查 git 配置 → 检查仓库状态 → 配 remote → 推送 → 验证远程分支。

**期望**：

```
  [OK ] SSH 认证通过
  [OK ] 远程分支已存在：main
```

### 手动确认

```bash
git ls-remote --heads origin
# 应能看到 refs/heads/main
```

> 仓库里**没有** `site/` 目录 —— 这是设计如此（构建产物，不入库）。
> Cloudflare 会用仓库里的 `src/` 重新构建出 `site/`。

---

## 步骤 4 · 连接 Cloudflare Pages（5 分钟，**需你手动**）

### 4.1 登录

打开 <https://dash.cloudflare.com> → 用你的 Cloudflare 账号登录。

### 4.2 创建 Pages 项目

1. 左侧边栏 → **Workers 和 Pages** → **创建** → **Pages** → **连接到 Git**
2. 选 **GitHub** → 授权 → 在 GitHub 上勾选 **`museum-site`** 仓库 → 安装
   （授权时如果 GitHub 问权限，勾 **Administration: Read-only** 和 **Contents: Read-only** 即可）
3. 回到 Cloudflare，选中 `museum-site` 仓库 → **开始部署**
   （首次会用默认设置部署一次，**大概率失败**（找不到 site/ 目录）—— **没关系**，下一步改设置）

### 4.3 ⚠️ 改构建设置（**最关键的一步**）

**Workers 和 Pages → 你的项目 → Settings → Build settings**：

| 字段 | 填什么 |
|---|---|
| 框架预设 | **None** |
| **构建命令** | **`bash tools/build_cloud.sh`** |
| 构建输出目录 | **`site`** |
| 根目录 | 留空 |

点 **保存**。

> ❗ **构建命令不能留空！**
> 本项目的 `site/` 是构建产物，被 `.gitignore` 排除，不在仓库里。
> CF 克隆后只有 `README.md docs/ src/ tools/` —— **没有 `site/` 目录**。
> 构建命令留空 → 部署报 `Failed to find directory site` → **直接失败**。
>
> ❗ **构建输出目录必须是 `site`**，写成仓库根或 `src` 都会 404。
>
> `bash tools/build_cloud.sh` 只依赖 bash + python3，**不需要 Node、不需要 npm install**。

### 4.4 确认成功

1. 回到项目的 **Deployments** 列表
2. 点 **Retry deployment**（或直接 `git push` 空提交）
3. 约 1 分钟后状态变绿 **Success**
4. 拿到链接：`https://museum-site-cwb.pages.dev`

> 若部署失败，**看构建日志**（Deployments → 点开失败那次 → Build log）。
> 常见错误对照见 `docs/CLOUDFLARE-CONFIG.md` 第六节。

**验证**：

```bash
curl -I https://museum-site-cwb.pages.dev
# 期望 HTTP/2 200

curl -s https://museum-site-cwb.pages.dev | grep -c base64
# 期望 0（说明没把 3MB 的 base64 传上去）

curl -s -o /dev/null -w "%{http_code}\n" https://museum-site-cwb.pages.dev/css/main.css
# 期望 200

curl -s -o /dev/null -w "%{http_code}\n" https://museum-site-cwb.pages.dev/js/data.js
# 期望 200

curl -s -o /dev/null -w "%{http_code}\n" https://museum-site-cwb.pages.dev/img/case-01.jpg
# 期望 200

curl -s -o /dev/null -w "%{http_code}\n" https://museum-site-cwb.pages.dev/nonexist
# 期望 404（且页面是自定义 404.html，不是 CF 默认页）
```

浏览器打开 `https://museum-site-cwb.pages.dev` → 三个案例标签可切换、图片能看、点「查看作品原图」能放大。

---

## 步骤 5 · 绑定自己的域名（可选，有域名再做）

1. Cloudflare → **添加站点** → 填你的域名 → 免费套餐 → 按提示改注册商的 NS 记录
2. **Workers 和 Pages → 项目 → Custom domains → 设置自定义域名** → 填 `example.com`
   （Cloudflare 会自动配 DNS 并签发证书，10–60 分钟生效，**不用手动加 CNAME**）
3. 生成跳转规则并推送：

```bash
cd C:/Users/EDY/WorkBuddy/boya-museum-site
python tools/build.py --domain example.com
git add -A && git commit -m "chore: 配置 www → 主域跳转" && git push
```

4. ⚠️ **www → 主域的跳转不能用 `_redirects` 做**（CF 按路径不按主机名匹配，会静默忽略）。
   正确做法是后台加 Redirect Rules：Cloudflare → **Rules** → **Redirect Rules** → Create rule
   - Condition：`Hostname` **equals** `www.example.com`
   - Then：**Static redirect** → URL `https://example.com` → 状态码 **301**

5. 验证：

```bash
curl -I https://www.example.com   # 期望 301 → https://example.com
curl -I https://example.com       # 期望 200
```

---

## 日常更新（以后每次都这样）

```bash
cd C:/Users/EDY/WorkBuddy/boya-museum-site

# 1. 改 src/js/data.js 里的文案（或换 src/img/ 里的图片）

# 2. 一键构建 + 验证 + 提交推送
bash tools/update.sh "更新案例 01 研究背景"
```

**30–60 秒后线上生效，链接永远不变。**

---

## 出问题时

| 现象 | 原因 | 处理 |
|---|---|---|
| `ssh -T git@github.com` 报 Permission denied | 公钥没贴或贴错 | 回步骤 1 重做 |
| `git push` 卡住不动 | 走了被拦截的 HTTPS | 确认 `git config --global --get core.sshCommand` 有值 |
| Pages 部署报 "Failed to find directory" | 输出目录填错 | 改成 `site` |
| Pages 部署成功但打开 404 | 输出目录填错 | 同上 |
| 改了内容线上没变 | 缓存 | HTML 已设 `max-age=0`；仍不行则强制刷新 |
| 部署成功但页面样式全丢 | `css/main.css` 没上传 | 检查 `site/css/main.css` 是否存在 |

**回滚**：Cloudflare → 项目 → Deployments → 选上一条成功部署 → **⋯** → **Rollback**
（秒级生效，不需要重新构建）
