# 迭代与持续维护手册

> 面向：已经上线的博雅博物馆站（<https://museum-site-cwb.pages.dev>）。
> 回答四个问题：**改什么** → **怎么发** → **链接为什么不失效** → **出错了怎么退**。
> 本文所有机制均于 2026-11-12 在本项目上实测验证，非文档转述。

---

## 0. 你的技术栈现状（迭代前必须知道）

| 层 | 现状 | 迭代影响 |
|---|---|---|
| 真源 | `src/`（12 个文件 + 12 个 WebP 变体） | **只改这里** |
| 产物 | `site/`（26 个文件，3.84 MB） | 不进 Git，`.gitignore` 排除，**永远不要手改** |
| 数据层 | `src/js/data.js`（3 案例 + 响应式图字段） | **无数据库**，纯静态 JS 对象 |
| 交互层 | `src/js/app.js`（单文件，含编辑/导出/复原功能） | 改逻辑 |
| 样式 | `src/css/main.css`（15 KB，无重复选择器） | 改样式 |
| 存档 | `src/index.html` 内嵌 `<script id="editorData">` | 🔴 **DOM 顺序敏感，见 §5** |
| 图片 | `src/img/*.jpg`（原图）+ `*.webp`（4 档变体） | 改图后跑 `tools/make_webp.py` |
| 构建 | `tools/build.py` → `site/` | 复制 → favicon → 平台配置 → `_redirects` 校验 → 自检 |
| 部署 | Cloudflare Pages（Git 集成，`main` 分支） | push 即自动部署 |
| 产物特性 | 确定性重建 | ✅ 同一提交必得同一产物 md5（已实测） |

> 🔴 **本项目没有数据库。** `data.js` 就是数据层，它是一个 JS 数组字面量，随页面一起加载。
> 这意味着「改数据库数据」= 「改 `data.js` 后重新构建」，没有另外的同步步骤，也没有数据丢失风险。

---

## 1. 内容更新方式：四类改动对照

### 1.1 页面文案（最常改）

| 改什么 | 改哪里 | 注意 |
|---|---|---|
| 三个案例的标题/正文/解读/维度 | `src/js/data.js` | 🔴 见 §5 的结构约束 |
| 静态区块文字（页眉/页脚/检查表标题） | `src/index.html` | 改 `<script id="editorData">` **外面**的正文 |
| 自查表 13 个检查项 | `src/index.html` 的 `#checks` 容器 | 它由 `app.js` 运行时渲染，数据在 `data.js` 的 `groups` 数组 |

### 1.2 样式

改 `src/css/main.css`。三条纪律：

1. **不要写行内 `style="..."`**（除了极少数动态定位，比如热点按钮的 `left/top`）——行内样式覆盖 CSS，后续难维护
2. **新增 CSS 变量**优先改 `:root` 里现有的变量组，不要新造一套颜色
3. 改完必须**多视口验证**（见 §3.3），桌面好看不代表手机不溢出

### 1.3 功能

改 `src/js/app.js`。⚠️ **单文件、压缩风格、无模块化**。加功能时注意：

- 所有事件用 `onclick="函数名(...)"` 内联绑定（站点既有风格），函数必须是全局函数
- 新增全局函数名**不要与 `data.js` 里的键名冲突**
- 改完必须跑 `node tools/verify.js`（16 项本地验证）

### 1.4 数据

**没有数据库。** 两种"数据"要分清：

| 类型 | 位置 | 改法 |
|---|---|---|
| 案例内容数据 | `src/js/data.js` 的 `cases` 数组 | 直接改 → 构建 → 提交 |
| 用户勾选状态 | 浏览器 localStorage，键 `museum-checks-v2` | **不在仓库里**，是用户本地数据。改代码不会影响它，除非你主动改 key 名 |
| 编辑器草稿 | localStorage，键 `museum-editor-<时间戳>-<随机>` | 同上，**每次导出新文件都会换 key**，所以老草稿不会被自动继承 |

> 🔴 **改 `museum-checks-v2` 这个 key 名 = 所有用户的勾选进度清零。**
> 除非你明确要重置，否则不要动它。

### 1.5 新增图片

1. 放 `src/img/case-04.jpg`
2. 在 `src/js/data.js` 加第 4 个案例对象（含 `image: "img/case-04.jpg"`）
3. 在 `src/index.html` 的 `.tabs` 加第 4 个 `<button role="tab" id="tab3" onclick="render(3)">`
4. 🔴 **`build.py` 的自检里写死了 `data.js` 案例数必须是 3**（`n != 3` 就报错）。
   加第 4 个案例必须同步改 `tools/build.py` 的这一行，否则构建直接失败。

---

## 2. 重新发布：一条命令链路

### 2.1 完整流程（每次迭代照做）

```bash
cd C:/Users/EDY/WorkBuddy/boya-museum-site

# ① 改 src/ 下的文件（用编辑器改，别用 sed 改中文）

# ② 本地构建 + 自检（失败会明确报错，不会产出坏产物）
bash tools/build_cloud.sh

# ③ 本地功能验证（16 项）
export NODE_PATH="C:/Users/EDY/.workbuddy/binaries/node/workspace/node_modules"
node tools/verify.js

# ④ 提交推送
git add -A && git commit -m "描述本次改动" && git push origin main

# ⑤ 等 2~4 分钟，Cloudflare 自动构建部署
#    线上地址不变：https://museum-site-cwb.pages.dev
```

### 2.1.1 完整验证清单（2026-11-13 起，77 项）

改动越大，跑得越多。**改了 CSS 或图片，必须跑 3 和 4**。

```bash
export NODE_PATH="C:/Users/EDY/.workbuddy/binaries/node/workspace/node_modules"

node tools/verify.js            # 16 项 · 功能回归（含与原单文件逐字比对 V8）
node tools/verify_features.js   # 15 项 · 键盘导航、URL 同步、skip-link、锚点
node tools/verify_a11y_seo.js   # 21 项 · 对比度 AA、标题层级、SEO 元数据、sitemap
node tools/verify_images.js     # 25 项 · 响应式选图、导出件内联与独立打开
```

### 2.1.2 改了 CSS 还要跑像素回归

```bash
node tools/capture_visual.js .snap/before     # 改 CSS 之前抓基线
# ... 改 CSS → bash tools/build_cloud.sh ...
node tools/capture_visual.js .snap/after
node tools/capture_visual.js .snap/after2      # 同版本再抓一次，量噪声地板
python tools/compare_visual.py .snap/before .snap/after --noise .snap/after2
```

抓取覆盖 4 视口（320/375/768/1440）× 5 状态（默认 / 案例 03 / 展板放大弹层 / 编辑模式 / 打印）。

> ⚠️ **Chromium 对缩放后的图片栅格化并非逐次一致**：同一份代码抓两次，
> 图片区域也会出现约 0.4% 的抗锯齿差异。所以 `--noise` 是必需的 ——
> 它用同版本的另一次抓取做噪声地板，A→B 的差异不超过地板才算通过。

### 2.1.3 改了图片源图

```bash
# 改了 src/img/case-0N.jpg 之后
python tools/make_webp.py            # 重新生成 4 档 WebP 变体
python tools/make_webp.py --check    # 只校验变体是否与源图同步
```

🔴 **只缩放不改比例** —— `data.js` 的 `analysisRegions` 是百分比坐标，改比例会让展板热点错位。

### 2.2 部署前提条件（六个，缺一不可）

| # | 前提 | 不满足的后果 |
|---|---|---|
| 1 | 改动全在 `src/` | 改了 `site/` 会被下次构建覆盖，且**根本不会上线** |
| 2 | `bash tools/build_cloud.sh` 本地跑通 | 错误推上去，云端构建同样失败 |
| 3 | `src/` 与 `site/` 引用路径一致 | 自检会报「引用了不存在的文件」 |
| 4 | GitHub 仓库 `Elliot-elli/museum-site` 可访问 | Cloudflare 拉不到代码 |
| 5 | Pages 项目仍连着这个仓库、构建命令仍是 `bash tools/build_cloud.sh` | 报 `Failed to find directory site` |
| 6 | 推送到 `main` 分支 | 推到别的分支只生成预览，不上线 |

### 2.3 部署后必须做的验收

```bash
# 公网验收（9 项，含导出 HTML 独立打开 + 移动视口）
node tools/verify_live.js "https://museum-site-cwb.pages.dev"
```

退出码 0 = 全通过。**这一步不能省** —— 它是唯一能自动发现「部署成功但功能坏了」的手段。

---

## 3. 链接保持不变：技术原理

### 3.1 三层保障

| 层 | 机制 | 什么变了会失效 |
|---|---|---|
| **域名层** | `museum-site-cwb.pages.dev` 绑定在 Cloudflare 账号下 | 🔴 **Pages 项目名不能改**（官方 known issues：只能删项目重建）；🔴 绑自有域名后更稳 |
| **托管层** | Cloudflare Pages 项目 + `main` 分支 Git 集成 | 仓库被删除 / Pages 项目被删 / GitHub 授权被撤销 |
| **URL 结构层** | 单一入口 `/` → `index.html`，其余是相对路径资源 | 🔴 改 `src/` 里的目录结构会让旧路径 404 |

### 3.2 为什么普通迭代不会掉链接

- 部署是**原地替换**：Cloudflare 保留同一个 URL，只换背后的文件。所以 `museum-site-cwb.pages.dev` 永远指向最新版本
- Cloudflare 保留**部署历史**，任何历史版本都能一键回退（§4.1）
- 你的 URL 结构是**单入口 + 相对路径**（`/js/data.js`、`/css/main.css`），没有版本号路径，所以**不存在"旧版本路径过期"问题**

### 3.3 URL 结构的唯一硬约束

当前站内锚点：`#research`、`#reading`、`#checklist`（来自 `src/index.html` 的 `<section id>`）。

> 🔴 **删掉或重命名这三个 `id` = 别人分享出去的 `museum-site-cwb.pages.dev/#checklist` 直接失效。**
> 改结构时保留这三个 id；确实要改的话，用 `_redirects` 补一条跳转。

### 3.4 缓存策略对更新的影响

`_headers` 已配置分层缓存：

| 资源 | 缓存 | 迭代时的影响 |
|---|---|---|
| `/index.html` | `max-age=0, must-revalidate` | ✅ 每次都取最新，改完刷新即见 |
| `/css/*`、`/js/*` | `max-age=604800`（7 天） | ⚠️ **用户 7 天内可能看到旧版** |
| `/img/*` | `max-age=2592000`（30 天） | ⚠️ 同上 |

> 🔴 **改了 `main.css` 或 `app.js` 后，老用户可能一周内看不到变化。**
> 解决办法（二选一）：
> 1. **改文件名**：`main.css` → `main.v2.css`，同时改 `index.html` 引用（推荐，缓存自然失效）
> 2. 用户手动强制刷新（Ctrl+F5）—— 不可控，不推荐

---

## 4. 版本管理与回退

### 4.1 三种回退方式对比

| 方式 | 操作 | 生效速度 | 是否改 Git | 会不会被下次 push 覆盖 | 适用场景 |
|---|---|---|---|---|---|
| **A. Cloudflare 一键回退** | 后台 Deployments → 选历史部署 → Rollback | **秒级** | ❌ 不改 | 🔴 **会** —— 下次 push `main` 就覆盖回去 | 线上出紧急故障，要立刻止血 |
| **B. `git revert` + push** | `git revert <坏提交>` → `git push origin main` | 2~4 分钟 | ✅ 改（新增一个反向提交） | ❌ 不会 | 想**真正修掉**问题，保留完整历史 |
| **C. `git reset` 强推** | `git reset --hard <好提交>` → `git push --force` | 2~4 分钟 | 🔥 改写历史 | ❌ 不会 | 🔴 **本项目不建议**（多人协作会毁掉他人提交） |

> 📌 **A 和 B 的关系**：A 是「临时把线上切回旧版」，但**代码里的 bug 还在**。
> 正确姿势是：**先 A 止血 → 再 B 修代码 → push 后线上自动恢复成修复版**。
> 只做 A 不做 B，下次 push 就把坏版本推回来了。

### 4.2 回退可行性已实测

在 `c91bb65`、`22c68dd`、`c91bb65` 三个提交上分别重建，产物 `index.html` 的 md5 **完全一致**（`770aefac5f11a473d959df9c18e00a9c`），且与线上一致。

→ **「按某个提交重建」= 确定性产物**。任何历史提交都能被精确还原，回退方案可靠。

### 4.3 建议的版本标记习惯

目前仓库**还没有 tag**。建议每次有意义的迭代打一个：

```bash
git tag -a v1.0 -m "首次上线，9 项验收通过"
git tag -a v1.1 -m "补充案例 04"
git push origin --tags
```

tag 的价值：给"能安全回退到的版本"一个明确名字。Cloudflare 的回退靠部署 ID，Git 的回退靠 commit SHA，tag 让两者对得上。

### 4.4 完整回退演练（建议你现在就做一次）

```bash
# 1. 确认线上当前状态
curl -s https://museum-site-cwb.pages.dev/ | md5sum
# 记下这个 md5

# 2. 制造一个可识别的改动
echo "<!-- probe $(date) -->" >> src/index.html
bash tools/build_cloud.sh
git add -A && git commit -m "test: rollback drill" && git push origin main

# 3. 等 3 分钟，确认线上 md5 变了
curl -s https://museum-site-cwb.pages.dev/ | md5sum

# 4. 回退（二选一）
#    A. 后台一键回退到上一次的部署
#    B. 命令行：
git revert --no-edit HEAD
git push origin main

# 5. 等 3 分钟，确认 md5 回到第 1 步的值
curl -s https://museum-site-cwb.pages.dev/ | md5sum
```

**第 5 步的 md5 与第 1 步一致 = 回退成功**。演练一遍心里才有底。

---

## 5. 🔴 迭代中最容易踩的坑：editorData 存档错位

### 5.1 问题本质

`src/index.html` 里的 `<script id="editorData">` 存着"恢复原文"功能的基线存档：

```json
"originals": {"case0:0": "作品现场实拍 · 点击放大查看展板细节", "case0:34": "..."}
```

**键名里的数字是 DOM 叶子节点的序号**（`case0` = 案例 0 的内容区，`:34` = 第 34 个叶子）。

### 5.2 后果

在案例 0 的正文里**插入或删除一个标题/段落**，会让后面所有叶子的序号**整体错位**：

- 原来的 `case0:34` 现在指向了另一个节点
- 用户点「恢复原文」时，**文字会被恢复成错位的内容**
- 而且**不会报错** —— 这是静默故障，最难发现

### 5.3 正确做法

| 场景 | 做法 |
|---|---|
| 只改文字内容，**不增删标签** | ✅ 直接改，不用管存档 |
| **增删了正文标签**（新加 `<h3>`、删掉一个 `<p>`） | 🔴 必须重置基线，见下 |
| 改的是 `data.js` 里的案例文案 | ⚠️ 看情况：`data.js` 的内容不进 `editorData` 存档，**改它不影响存档**；但若同时改了 `index.html` 的静态区，就要注意 |

### 5.4 重置基线的正确流程

```bash
# 1. 改完 src/ 后，本地构建并起服务
bash tools/build_cloud.sh
cd site && python -m http.server 8000
#    浏览器打开 http://localhost:8000

# 2. 点「编辑文字」→「恢复原文」→ 确认
#    这一步会按当前 DOM 重新记录 originals 基线

# 3. 点「导出新版 HTML」，得到带新基线的文件

# 4. 从导出的文件里取出新的 editorData JSON，
#    替换回 src/index.html 的 <script id="editorData"> 内容

# 5. 重新构建、验证、提交
cd ..
bash tools/build_cloud.sh
node tools/verify.js
```

### 5.5 自动防线（✅ 已实现，2026-11-12）

已新增 `tools/check_editor_baseline.py`，并接入 `tools/build.py` 的自检环节 —— **基线漂移会在构建阶段直接失败**，不会流到线上。

判据不是猜的，而是复刻 `app.js` 的 `bindScope()` 规则：

- 每个 scope 的 index 必须**从 0 开始连续无缺口**（`bindScope` 就是按 DOM 叶子顺序编号的）
- 出现未知 scope（`app.js` 里没有对应的 `bindScope` 调用）→ 该存档永远不会被使用
- 同一 index 重复 → 存档被改坏
- `storageId` 缺失 → 编辑器草稿无法落盘

单独运行：

```bash
python tools/check_editor_baseline.py          # 检查 src/
python tools/check_editor_baseline.py --site   # 检查构建产物
```

当前基线状态（2026-11-12）：**320 个键 / 6 个 scope**，全部 index 连续。

| scope | 键数 | index 范围 |
|---|---|---|
| `case0` | 93 | 0..92 |
| `case1` | 96 | 0..95 |
| `case2` | 94 | 0..93 |
| `checklist` | 33 | 0..32 |
| `footer` | 1 | 0..0 |
| `header` | 3 | 0..2 |

反向验证已做：人为把 `case0:50` 改成 `case0:99X` 后，检查脚本正确报出 `缺失 [50]` 且**退出码 1**，构建被拦住。恢复正常后退出码 0，产物 md5 不变。

> ⚠️ **局限（要知道）**：本检查能发现「存档被改坏 / 版本混用 / 键不连续」，
> 但**无法发现「DOM 变多了一个标签而基线仍是旧的连续序列」** —— 因为旧基线本身仍然是连续的。
> 这种情况的特征是：构建通过，但点「恢复原文」后部分文字错位。
> **根治办法仍是 §5.4 重置基线**。本检查是「廉价的第一道拦截」，不是万无一失。

---

## 6. 分支策略：迭代不污染生产

### 6.1 Cloudflare 的预览部署机制（已实测）

推送**非生产分支**会自动生成预览站，**不影响生产站**：

```
https://<分支名去掉斜杠>-<项目名>.pages.dev
例：feature/preview-test → https://feature-preview-test.museum-site-cwb.pages.dev
```

实测：推送后 **30 秒内**预览站返回 200，生产站 md5 保持不变。

### 6.2 推荐的迭代流程（最稳）

```bash
# 1. 从 main 切出工作分支
git checkout -b feature/案例04-补充

# 2. 改 src/ → 构建 → 验证
bash tools/build_cloud.sh
node tools/verify.js

# 3. 推分支，得到预览链接
git add -A && git commit -m "feat: 补充案例 04" && git push -u origin feature/案例04-补充
#    → 等 30 秒，访问 https://feature-案例04-补充.museum-site-cwb.pages.dev 验收

# 4. 在预览站上跑公网验收
node tools/verify_live.js "https://feature-案例04-补充.museum-site-cwb.pages.dev"

# 5. 满意后合并到 main（此时才上线）
git checkout main && git merge --no-ff feature/案例04-补充
git push origin main
```

> ⚠️ **分支名含中文/斜杠会让预览 URL 变形。** 实测 `feature/preview-test` → `feature-preview-test`。
> 建议分支名**只用小写字母、数字、连字符**，如 `feature/case-04` → `feature-case-04`。
> 注意 `git checkout -b feature/案例04` 这种含中文的分支名，Cloudflare 生成的子域名可能含中文或被截断，**不可靠**。

### 6.3 预览部署的两个限制

1. **预览部署不能作为回退目标**（官方明确：只有生产部署可回退）
2. 预览部署**不计入** 500 次/月的构建额度？不计入 —— 官方限额是 500 deploys/月，预览与生产都算
   （免费版：500 构建/月、1 并发构建）

---

## 7. 五种迭代方案对比

| 方案 | 前提条件 | 运维成本 | 适用场景 | 链接影响 |
|---|---|---|---|---|
| **① 直接改 main** | 本地构建+验证通过 | 最低（1 条命令） | 小文案微调、紧急修复 | 无 |
| **② 分支 + 预览验收** | Git 分支、CF 自动预览 | 低（多 3 步） | **新功能、大改、需要先看效果** | 无（生产不动） |
| **③ 后台一键回退** | 有历史部署记录 | 最低（点 3 下） | 线上紧急故障止血 | 无（秒级切回） |
| **④ `git revert` 回退** | Git 提交历史完整 | 低（2 条命令） | **真正修掉问题** | 无 |
| **⑤ 强制 `reset --force` 推** | 无其他协作者 | 中（风险高） | 🔴 不建议本项目用 | 无但**毁历史** |
| **⑥ 基线自动拦截**（已内置） | 无额外前提 | **零**（构建时自动跑） | **防「恢复原文」静默错位** | 无 |

### 推荐组合

- **日常** → ①
- **较大改动** → ②（分支预览），验收通过再合 main
- **出故障** → ③ 立刻止血 → ④ 修代码
- **每季度** → 打一个 tag，标记"验证过的稳定版本"

---

## 8. 常见迭代故障速查

| 现象 | 原因 | 处理 |
|---|---|---|
| 改了没生效 | 改了 `site/` 而非 `src/` | 改 `src/`，重新构建 |
| 推送后线上没变 | CF 构建失败 | 后台看构建日志；本地跑 `bash tools/build_cloud.sh` 看同样的错 |
| 推送后线上没变 | 推到了非 `main` 分支 | 只有 `main` 会部署到生产 |
| `Failed to find directory site` | 后台构建命令被改了 | 改回 `bash tools/build_cloud.sh` |
| 老用户看不到新样式 | css/js 被缓存 7 天 | 改文件名（`main.v2.css`）+ 改引用 |
| 「恢复原文」后文字错位 | 增删了正文标签，存档序号漂移 | 重置基线（§5.4） |
| 加了第 4 个案例构建失败 | `build.py` 写死案例数 = 3 | 改 `tools/build.py` 的 `n != 3` 那行 |
| 分支推了但预览 404 | 分支名含中文/特殊字符 | 改用 `feature/case-04` 这种纯小写名字 |
| 回退后又被覆盖 | 只做了 Cloudflare 回退没改代码 | 补做 `git revert` + push |
| 别人的勾选进度没了 | 改了 localStorage key | 恢复 `museum-checks-v2` |

---

## 9. 2026-11-13 优化迭代：新增约定

### 9.1 颜色变量

| 变量 | 现值 | 说明 |
|---|---|---|
| `--muted` | `#5f6a63` | 旧值 `#68746d` 在纸色底上只有 4.39:1，不达 AA |
| `--accent` | `#a8512f` | 旧值 `#be603b` 在米白底上只有 4.19:1，不达 AA |

改动这两个值**必须**重跑 `node tools/verify_a11y_seo.js`（A1 项判 38 处正文对比度）。
不要改回旧值 —— 它们是 2026-11-12 版 38 处对比度不达标的根因。

### 9.2 图片

- 变体档位固定为 **640 / 960 / 1280 + 原宽**。改档位要同步 `tools/make_webp.py` 的 `WIDTHS` 与 `data.js` 的 `imageSrcset`。
- **裁剪源是全分辨率原图**（`cases[i].image`），不是屏幕上那张缩略版 —— 展板小字要看得清。
- 导出件靠 `inlineAssets` 把图片转成 data URI；`srcset` 一律剥离，否则导出件里是坏图。

### 9.3 CSS

- 同一选择器**不允许在顶层重复出现**。合并用 `python tools/canonicalize_css.py`，
  它会自动跳过与 `@media` 内同选择器冲突的组（合并会把规则搬到媒体块之后，窄屏下优先级会翻转）。
- 🔴 **不要手工把一条规则挪到 `@media` 块之后。**

### 9.4 验证脚本

| 脚本 | 项数 | 何时必须跑 |
|---|---|---|
| `tools/verify.js` | 16 | 每次改动 |
| `tools/verify_features.js` | 15 | 改了 app.js / index.html 的交互 |
| `tools/verify_a11y_seo.js` | 21 | 改了 CSS 颜色、head 元数据、页面结构 |
| `tools/verify_images.js` | 25 | 改了图片相关代码 |
| `tools/capture_visual.js` + `tools/compare_visual.py` | 17 张截图 | 改了 CSS |

### 9.5 新增铁律

1. **改 head 元数据时保持 `<title>` 与 `<body>` 同行** —— 文案校验工具按行号判定 title 上下文，
   压掉换行会让 107 处既有正文突然被计入「信息密度」违规（实测 R10 从 0 跳到 107）。
2. **改图片必须跑 `make_webp.py`**，否则 `srcset` 会指向过期的变体。
3. **合并 CSS 前先跑 `canonicalize_css.py --check`**，它会指出哪些组不能合并。
4. **改完 CSS 跑像素回归**（§2.1.2），只跑功能验证不足以发现层叠顺序被改。

---

## 10. 一页纸速查

```
日常改内容：
  改 src/ → bash tools/build_cloud.sh → node tools/verify.js
  → git add -A && git commit -m "..." && git push origin main
  → 等 3 分钟 → node tools/verify_live.js https://museum-site-cwb.pages.dev

大改动：
  git checkout -b feature/case-04 → 改 → 构建验证 → push
  → 在 https://feature-case-04.museum-site-cwb.pages.dev 验收
  → git checkout main && git merge --no-ff feature/case-04 && git push origin main

改 CSS：
  改 src/css/main.css → bash tools/build_cloud.sh
  → node tools/capture_visual.js .snap/after && node tools/capture_visual.js .snap/after2
  → python tools/compare_visual.py .snap/before .snap/after --noise .snap/after2

改图片：
  改 src/img/case-0N.jpg → python tools/make_webp.py
  → bash tools/build_cloud.sh → node tools/verify_images.js

出故障：
  后台 Deployments → Rollback to this deployment（秒级止血）
  → git revert --no-edit HEAD && git push origin main（真正修掉）

五条铁律：
  ① 只改 src/，永远不要手改 site/
  ② 增删正文标签后，必须重置 editorData 基线
  ③ 每次大迭代后打一个 tag
  ④ 改 CSS 后跑像素回归，只跑功能验证看不出层叠顺序被改
  ⑤ 改 head 时保持 <title> 与 <body> 同行，别压换行
```
