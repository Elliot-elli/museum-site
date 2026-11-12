# 交接卡 · 2026-11-12 暂停点

> **状态：已上线，验收通过，全部工作已提交推送，仓库干净。**
> 明天的任何工作都可以从 `main` 分支直接开始。

---

## 一、一句话现状

博雅博物馆站已部署到 Cloudflare Pages 并通过全部验收：
**<https://museum-site-cwb.pages.dev>** —— HTTP 200，产物 md5 `770aefac5f11a473d959df9c18e00a9c`，本地与线上逐字节一致。

---

## 二、暂停时的精确状态（已核验）

| 项 | 值 |
|---|---|
| 项目目录 | `C:/Users/EDY/WorkBuddy/boya-museum-site` |
| GitHub 仓库 | <https://github.com/Elliot-elli/museum-site>（Public） |
| 当前分支 | `main`（本地唯一分支，无残留测试分支） |
| HEAD | `87ee5d5` |
| `origin/main` | `87ee5d5` ✅ 一致 |
| 工作区 | **干净**，无未提交、无未跟踪文件 |
| 线上地址 | <https://museum-site-cwb.pages.dev> |
| 线上 md5 | `770aefac5f11a473d959df9c18e00a9c` |
| 标签 | ⚠️ **尚未打任何 tag**（见 §六 待办） |

---

## 三、本次会话完成了什么

| 阶段 | 成果 |
|---|---|
| 选型 | Pages vs Workers 六维度对照 → **选 Pages**（附境内 DNS 污染实测证据） |
| 教程 | `docs/CLOUDFLARE-TUTORIAL.md`（九步照做版） |
| 上线 | 用户在后台创建 Pages 项目并部署成功 |
| 公网验收 | **9 / 9 PASS**，新增 `tools/verify_live.js` |
| 境内实测 | 阿里+腾讯 DNS 解析稳定，IP 均属 AS13335 Cloudflare；微信 UA 返回完整正文无拦截 |
| 迭代方案 | `docs/ITERATION-GUIDE.md`（416 行）+ `tools/check_editor_baseline.py` 基线防线 |

**提交历史**（本会话新增）：

```
87ee5d5  feat: add iteration guide and editorData baseline guard
c91bb65  feat: add public acceptance verification script and acceptance report
22c68dd  docs: add step-by-step Cloudflare Pages deployment tutorial
c8b573b  docs: add Pages vs Workers selection conclusion with CN DNS pollution evidence
```

---

## 四、目录地图（明天直接看这里）

```
boya-museum-site/
├── src/                        ← 【真源】只改这里
│   ├── index.html              含内嵌 editorData 存档（🔴 DOM 顺序敏感）
│   ├── js/data.js              ← 三个案例的全部文案（= 数据层，无数据库）
│   ├── js/app.js               ← 交互逻辑（单文件、压缩风格）
│   ├── css/main.css            ← 样式
│   └── img/case-0{1,2,3}.jpg
│
├── site/                       ← 【产物】不入库，.gitignore 排除
│
├── tools/
│   ├── build.py                ← 构建器（已接入基线检查）
│   ├── build_cloud.sh          ← CF 云端构建入口
│   ├── verify.js               ← 本地 16 项验证
│   ├── verify_viewports.js     ← 5 视口验证
│   ├── verify_live.js          ← 公网 9 项验收
│   ├── check_editor_baseline.py← 🆕 基线一致性检查
│   ├── check_redirects.py      ← _redirects 语法校验
│   └── sync_src.py             ← site/ 回写 src/
│
└── docs/
    ├── ITERATION-GUIDE.md      ← 🆕 迭代/部署/回退完整方案
    ├── CLOUDFLARE-TUTORIAL.md  ← 上线教程
    ├── ACCEPTANCE-2026-11-12.md← 验收报告
    ├── CLOUDFLARE-STEPS.md    ← 选型依据 + 实测证据
    ├── GO-LIVE-CHECKLIST.md
    ├── OPERATIONS.md / HANDOFF.md / ENVIRONMENT.md
    └── DEPLOY.md / CLOUDFLARE-CONFIG.md
```

---

## 五、明天怎么接上（两条路）

### 路线 A · 继续迭代内容（最常见）

```bash
cd C:/Users/EDY/WorkBuddy/boya-museum-site

# ① 改 src/ 下的文件
# ② 构建 + 自检（基线检查会自动跑）
bash tools/build_cloud.sh

# ③ 本地 16 项验证
export NODE_PATH="C:/Users/EDY/.workbuddy/binaries/node/workspace/node_modules"
node tools/verify.js

# ④ 提交推送
git add -A && git commit -m "描述" && git push origin main

# ⑤ 等 2~4 分钟，Cloudflare 自动部署，链接不变
# ⑥ 公网验收
node tools/verify_live.js "https://museum-site-cwb.pages.dev"
```

### 路线 B · 绑自有域名（尚未做的关键遗留）

前提：买一个域名（`.com`/`.cn`，几十元/年，`.cn` 需实名认证）

```bash
# 1. Cloudflare 后台：项目 → Custom domains → 加域名（如 museum.example.com）
# 2. DNS 服务商（阿里云/腾讯云）：加 CNAME → museum-site-cwb.pages.dev
#    🔴 顺序不能反，反了报 522
# 3. 等 10 分钟再点验证（首次报「已被他人占用」是假象）
# 4. www 跳转要用后台 Rules → Redirect Rules（_redirects 按路径不按主机名匹配）
```

---

## 六、待办清单（按优先级）

| 优先级 | 事项 | 说明 |
|---|---|---|
| 🔴 高 | **绑自有域名** | 微信按**域名维度**风控。`pages.dev` 是共享段，任意一页违规可能连坐整段 → 你的链接会莫名其妙打不开 |
| 🟡 中 | **打第一个 tag** | `git tag -a v1.0 -m "首次上线，9 项验收通过" && git push origin --tags` |
| 🟡 中 | ICP 备案 | 真正流畅的境内方案：EdgeOne/阿里云 CDN 扛境内流量，CF 退为海外回源 |
| 🟢 低 | 删掉 `wrangler.jsonc` | 走 Pages 路线时它被忽略，纯冗余。留着也无害（已同步 name） |
| 🟢 低 | 多视口回归 | `node tools/verify_viewports.js` 已存在，迭代后建议跑 |

---

## 七、三条铁律（明天别忘）

1. **只改 `src/`，永远不要手改 `site/`** —— `site/` 不在 Git 里，手改既不会上线也会被下次构建覆盖
2. **增删正文标签后必须重置 editorData 基线** —— 否则「恢复原文」会静默恢复成错位内容（`docs/ITERATION-GUIDE.md` §5.4 有流程）
3. **回退要两步**：Cloudflare 后台一键回退止血（秒级）+ `git revert` 修代码（否则下次 push 又把坏版本推回来）

---

## 八、环境备忘

```bash
export NODE_PATH="C:/Users/EDY/.workbuddy/binaries/node/workspace/node_modules"
NODE="C:/Users/EDY/.workbuddy/binaries/node/versions/22.22.2-6/node.exe"
PY="C:/Users/EDY/.workbuddy/binaries/python/versions/3.13.12/python.exe"
CHROME="C:/Users/EDY/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
```

- `bash tools/build_cloud.sh` 需要 bash + python3（Windows Git Bash 自带）
- GitHub 走 SSH over 443：`ssh.github.com:443`（`github.com:443` 被代理拦截）
- 本机 `raw.githubusercontent.com` / `dns.google` 不可达，核验远程内容用 `git cat-file -p origin/main:<path>`
