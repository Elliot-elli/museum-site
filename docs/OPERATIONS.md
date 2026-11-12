# 运维手册

> 面向「站点已经上线之后」的日常维护。不涉及部署操作（见 `DEPLOY.md`）。

---

## 一、日常更新 SOP

### 场景 1：改文案（最常见）

```bash
cd C:/Users/EDY/WorkBuddy/boya-museum-site

# 1) 编辑 src/js/data.js
notepad src/js/data.js

# 2) 构建 + 自检
python tools/build.py

# 3) 回归验证
export NODE_PATH="C:/Users/EDY/.workbuddy/binaries/node/workspace/node_modules"
node tools/verify.js

# 4) 提交推送 → 自动部署
git add -A
git commit -m "更新案例 01 研究背景"
git push
```

线上 **30–60 秒**后生效，**链接不变**。

### 场景 2：换图片

```bash
# 用新图片覆盖同名文件（文件名不要变，引用就不用改）
cp 新图片.jpg src/img/case-01.jpg

python tools/build.py
git add -A && git commit -m "更新案例 01 配图" && git push
```

> ⚠️ 图片缓存期为 30 天（`_headers` 里 `/img/*` 的 `max-age=2592000`）。
> 若替换后仍显示旧图，在 Cloudflare 后台 → Caching → **Purge Cache** 清理该 URL。

### 场景 3：加一个新案例

1. `src/js/data.js` 数组里追加一个对象（照抄现有结构）
2. `src/img/` 放 `case-04.jpg`
3. `src/index.html` 的 `.tabs` 里加 `<button role="tab" id="tab3" onclick="render(3)">案例 04 · …</button>`
4. `python tools/build.py && node tools/verify.js`

> ⚠️ **DOM 顺序敏感**：`editorData.originals` 用 DOM 叶子序号索引（`case0:34`）。
> 新增/删除正文里的标题或段落标签会让「恢复原文」错位。
> 稳妥做法：改完后在浏览器里点一次「恢复原文」重新记录基线，
> 再用「导出新版 HTML」把新的 `editorData` 拿回来替换 `src/index.html`。

---

## 二、监控

### 可用性探活

在 <https://uptimerobot.com> 免费添加一个监控项：

- 监控类型：HTTP
- URL：`https://<你的域名>/`
- 间隔：5 分钟
- 告警方式：邮件 / 微信（可选）

### 自查脚本（无需外部服务）

```bash
python tools/deploy.py --check    # 产物完整性 + 前置条件
node tools/verify.js              # 功能回归
node tools/verify_viewports.js    # 多视口布局
```

建议在每次 `git push` **之前**至少跑一次 `verify.js`。

---

## 三、备份（三处，缺一不可）

| # | 备份对象 | 位置 | 频率 | 恢复方式 |
|---|---|---|---|---|
| 1 | **Git 仓库** | GitHub（+ Gitee 镜像） | 每次提交自动 | `git clone` |
| 2 | **离线产物** | 本地硬盘 / 网盘 | 每月 | `python tools/build.py` |
| 3 | **域名账号** | Cloudflare + 注册商 | — | 密码管理器 + 恢复码 |

**离线备份一条命令**：

```bash
cd C:/Users/EDY/WorkBuddy
"C:/Users/EDY/.workbuddy/binaries/python/versions/3.13.12/python.exe" -c "
import shutil
shutil.make_archive('D:/backup/boya-museum-site', 'zip', 'boya-museum-site', ignore=shutil.ignore_patterns('.git','site','__pycache__'))
print('backup done')
"
```

**Gitee 镜像**（GitHub 访问不稳时的保险）：

```bash
git remote add mirror https://gitee.com/<你的用户名>/boya-museum-site.git
git push -u mirror main
```

---

## 四、回滚

### 方式 1：Cloudflare 后台（最快，30 秒）

Workers 和 Pages → 项目 → **Deployments** → 上一条成功部署 → **⋯** → **Rollback**

### 方式 2：Git revert（推荐，可追溯）

```bash
git log --oneline -10
git revert <commit-hash>
git push
```

### 方式 3：Git reset（强制，慎用）

```bash
git reset --hard <commit-hash>
git push --force
```

> ⚠️ `reset --hard` + `--force` 会改写历史。若团队协作中有人已拉取，会造成混乱。
> 个人项目用 `revert` 足够。

---

## 五、故障排查

| 现象 | 可能原因 | 排查步骤 |
|---|---|---|
| 线上白屏 | JS 加载失败 | 浏览器 F12 → Console 看报错；Network 看 `js/app.js` 是否 404 |
| 样式丢失 | CSS 路径错 | 检查 `site/css/main.css` 是否存在；`_headers` 是否被上传 |
| 图片裂图 | `img/` 未上传或路径错 | 检查 `site/img/case-0N.jpg` 三件套 |
| 点了没反应 | JS 报错 | Console 里找 `TypeError` |
| 报 `openai.callTool is not a function` | 用的是迁移前的旧文件 | 重新 `python tools/migrate.py` 后 `build.py` |
| 改了内容线上没变 | 缓存 | HTML 已设 `max-age=0`；仍不行则强制刷新（Ctrl+Shift+R）或清理 CDN 缓存 |
| 「恢复原文」把文字还原错位 | 增删了正文标签 | 见「加一个新案例」的注意事项 |
| 部署成功但 404 | 构建输出目录不是 `site` | Cloudflare 后台改回 `site` |
| 链接失效 | 域名过期 / 账号欠费 | 检查域名到期时间、Cloudflare 账号状态 |

### 完整重建（真源丢了也能救）

```bash
python tools/migrate.py    # 桌面原文件 → src/
python tools/build.py      # src/ → site/
node tools/verify.js
```

**桌面原文件是最终保险**（只读，从不修改）：
`C:\Users\EDY\Desktop\博雅博物馆_优秀案例解读_点击放大互动版_2026-11-02.html`
md5 `c8a62705ef6963ee7bb64b5475acc340`

---

## 六、安全清单

- [ ] Cloudflare 账号开启**两步验证**
- [ ] 密码管理器保存登录信息 + **恢复码离线备份**
- [ ] GitHub 账号开启两步验证
- [ ] API Token 只授予 **Pages:Edit**，用完即弃或定期轮换
- [ ] `.env` / `wrangler.toml` / `.netrc` 不入库（`.gitignore` 已配置）
- [ ] 域名开启**自动续费** + **注册商锁**（Registrar Lock）
- [ ] 定期检查 <https://haveibeenpwned.com> 是否有泄露

---

## 七、关键事实备忘

| 项 | 值 |
|---|---|
| 真源 | `src/`（进 Git） |
| 产物 | `site/`（不进 Git，`.gitignore` 已排除） |
| 原始单文件 | 桌面 `..._2026-11-02.html`，md5 `c8a62705ef6963ee7bb64b5475acc340`，**只读** |
| 构建命令 | `python tools/build.py` |
| 验证命令 | `node tools/verify.js`（需 `NODE_PATH` 指向 playwright） |
| 换行策略 | `.gitattributes` 锁定 LF（**不要删**） |
| 产物体积 | 1.81 MB（HTML 58 KB + 3 图 1.7 MB） |
| `editorData.originals` | 320 条，**按 DOM 叶子序号索引** —— 改 DOM 结构会让「恢复原文」错位 |
