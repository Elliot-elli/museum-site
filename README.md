# 博雅博物馆 · 优秀案例解读（可部署版）

把桌面上的单文件 HTML（3.05 MB）拆成可维护、可部署、可长期更新的静态站点。

---

## 一、目录结构与职责

```
boya-museum-site/
├── src/          ← 【真源】日常改这里（进 Git）
│   ├── index.html
│   ├── 404.html
│   ├── robots.txt
│   ├── _headers          缓存策略与安全响应头
│   ├── _redirects        域名跳转规则
│   ├── css/main.css
│   ├── js/data.js        ★ 三个案例的全部文案与配图（最常改）
│   ├── js/app.js         交互逻辑（切案例 / 放大 / 自查表 / 编辑器）
│   └── img/case-0N.jpg
│
├── site/         ← 【产物】构建生成，用于部署（不进 Git）
│
├── tools/        ← 构建与验证脚本（进 Git）
│   ├── migrate.py         一次性：桌面单文件 → src/
│   ├── build.py           日常：src/ → site/（改完内容跑这个）
│   ├── sync_src.py        把 site/ 回写到 src/
│   ├── make_favicon.py    生成图标
│   ├── make_platform_files.py  生成 _headers / _redirects
│   ├── verify.js          功能验证（真实 Chromium）
│   └── verify_viewports.js 多视口验证
│
└── docs/
    ├── DEPLOY.md           部署手册
    └── OPERATIONS.md       运维与回滚
```

**一句话工作流**：改 `src/js/data.js` → `python tools/build.py` → `git commit && git push` → 线上自动更新，**链接不变**。

---

## 二、日常更新内容（最常用）

### 改文案

1. 用编辑器打开 `src/js/data.js`
2. 找到对应案例的字段（`title` / `intro` / `background` / `analysis` / `dims` …）直接改
3. 跑构建：

```bash
cd C:/Users/EDY/WorkBuddy/boya-museum-site
python tools/build.py
```

4. 提交并推送：

```bash
git add -A
git commit -m "更新案例 01 的研究背景文案"
git push
```

Cloudflare Pages 会自动重新部署（约 30–60 秒），**访问链接完全不变**。

### 换图片

把新图片按案例序号命名放进 `src/img/`：

```
src/img/case-01.jpg   ← 案例 01（碳足迹）
src/img/case-02.jpg   ← 案例 02（AI 与绿色提示词）
src/img/case-03.jpg   ← 案例 03（最后机会旅游）
```

建议：**保持文件名不变**，直接覆盖。这样 `data.js` 里的引用不用改。
若换了文件名，记得同步改 `data.js` 里对应的 `"image"` 字段。

### 加一个新案例

1. 在 `data.js` 的数组里加一个对象（照抄现有结构，字段齐全）
2. 在 `src/img/` 放 `case-04.jpg`
3. 在 `src/index.html` 的 `.tabs` 里加一个 `<button role="tab" id="tab3" onclick="render(3)">…</button>`
4. 在 `src/index.html` 里找到 `id="tab0/tab1/tab2"` 的 `role="tablist"` 容器
5. 构建 + 验证：

```bash
python tools/build.py
node tools/verify.js
```

> ⚠️ 注意：`editorData` 里的 `originals` 是按 DOM 顺序索引的（`case0:34` 这种）。
> 如果你**新增或删除**了正文里的标题/段落标签，「恢复原文」可能对不上位。
> 稳妥做法：新增内容后，在浏览器里点一次「恢复原文」，让它重新记录基线，
> 然后把新的 `editorData` 导出替换回来。

---

## 三、验证

```bash
# 功能验证（16 项：切案例 / 放大 / 裁剪 / 自查表 / 编辑器 / 资源）
export NODE_PATH="C:/Users/EDY/.workbuddy/binaries/node/workspace/node_modules"
node tools/verify.js

# 多视口验证（5 个视口：1440 / 1280 / 820 / 390 / 360）
node tools/verify_viewports.js

# 与原始单文件逐案例正文比对（可选，需桌面原文件存在）
node tools/verify.js --compare "C:/Users/EDY/Desktop/博雅博物馆_优秀案例解读_点击放大互动版_2026-11-02.html"
```

部署前请确保两个脚本都是 **0 FAIL**。

---

## 四、构建产物自检

`tools/build.py` 内置自检，自动拦截以下问题：

- 产物缺文件
- `index.html` 仍含 base64（图片没落地）
- `main.css` 被重复引用
- 引用了不存在的相对路径
- `app.js` 仍含 codex 沙箱调用
- `exportHTML` 定义数量异常

任一项不通过，构建直接失败退出，不会产出坏产物。

---

## 五、从零重建（万一 src/ 丢了）

```bash
python tools/migrate.py    # 桌面单文件 → src/（会覆盖 src/，先备份）
python tools/build.py      # src/ → site/
node tools/verify.js
```

原始真源始终是桌面那个文件：
`C:\Users\EDY\Desktop\博雅博物馆_优秀案例解读_点击放大互动版_2026-11-02.html`
（md5 `c8a62705ef6963ee7bb64b5475acc340`，迁移过程只读，不修改）

---

## 六、技术要点（改代码前必读）

| 要点 | 说明 |
|---|---|
| **DOM 顺序敏感** | `editorData.originals` 用 DOM 叶子序号索引（`case0:34`），共 320 条。改 `<body>` 内元素顺序会让「恢复原文」错位 |
| **数据用同步加载** | `data.js` 用 `<script src>` 而非 `fetch()`，保证 `bindCaseEdits()` 与 `originals` 的绑定时序与原版一致 |
| **codex 沙箱已剥离** | 原文件里 9 个脚本调用 `globalThis.openai.callTool()`，普通浏览器每次点击都会抛错。已全部移除 |
| **导出功能已重写** | 拆分后「导出 HTML」会在导出时把 CSS/JS/图片重新内联，保证下载到的仍是可独立分发的单文件 |
| **图片按案例编号** | `case-01/02/03.jpg` 与 `data.js` 里的顺序一一对应；原文件中案例 03 的图出现两次，已合并为一个文件 |
