# 上线环境探测结论（2026-11-12 实测）

> 记录本机部署环境的真实网络边界与工具可用性。
> 下次部署前先看这份，能省掉一轮试错。

---

## 一、GitHub 连接的三条路径实测

| 路径 | 域名 | 结果 | 备注 |
|---|---|---|---|
| **REST API** | `api.github.com` | ✅ **可达 HTTP 200** | 未认证时返回 401（正常）；`/repos` 返回 404（正常） |
| **git over HTTPS** | `github.com:443` | ❌ **被代理拦截** | `CONNECT tunnel failed, response 502`；直连 10s 超时 |
| **git over SSH 443** | `ssh.github.com:443` | ✅ **可用** | 握手成功，认证后返回 `Hi <user>! You've successfully authenticated` |

### 结论：git 必须走 SSH over 443

已配置（全局）：

```bash
git config --global core.sshCommand 'ssh -o HostName=ssh.github.com -p 443 -i C:/Users/EDY/.ssh/id_ed25519_github -o IdentitiesOnly=yes'
```

同时写了 `C:\Users\EDY\.ssh\config`，让 `ssh git@github.com` 也自动走 443。

> ⚠️ **排查陷阱**：验证 `git config --global --get core.sshCommand` 时，
> 用 `grep user\.` 之类的过滤会因 git 把键名小写成 `core.sshcommand` 而漏看。
> 直接 `git config --global --get core.sshCommand` 或 `--list` 才准。

---

## 二、GitHub MCP 连接器的权限边界

连接器状态是 `connected`，但**工具权限受限**：

| 操作 | 结果 |
|---|---|
| `search_repositories`（读） | ✅ 正常 |
| `list_branches` / `list_commits`（读） | ✅ 正常 |
| `create_repository`（建仓） | ❌ **403 `Resource not accessible by integration`** |
| `create_branch`（建分支） | ❌ **403 同上** |

**原因**：GitHub App token 只有「读写已有仓库」权限，**没有 `repo:create`**。
SSH 也不能建仓（只能推送到已存在的仓库）。

→ **建仓这一步必须用户手动在网页完成**（约 30 秒）。
建好之后，推送、验证、后续维护我都能自动化。

---

## 三、账号事实

- **SSH 公钥实际认证到的账号**：`Elliot-elli`（GitHub id `319360133`）
- ⚠️ 曾误用 `feixiang`（id `339298`）—— **那是另一个账号**，remote 与文档已修正
- 该账号现有公开仓库：`my-html-website`、`learningEnglish-`
- 本机 Git 提交身份：`飞象老师 <teacher@feixiang.com>`（沿用 SKT 项目仓库的身份）

---

## 四、Cloudflare 侧实测

| 项 | 结果 |
|---|---|
| `api.cloudflare.com` | ✅ 可达（未认证时提示 `Missing X-Auth-Email`/`X-Auth-Key`） |
| `dash.cloudflare.com` | 返回 403 —— **API 端点的正常反应**，浏览器访问不受影响 |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | ❌ 均未设置 |
| Wrangler CLI | ❌ 未安装（`npx wrangler` 需联网拉包），未登录（无 `~/.wrangler`） |

→ **Cloudflare 侧需用户在网页操作**（连接 GitHub + 设构建参数）。
不建议在命令行传 Token（凭据暴露面大），网页授权更安全。

---

## 五、已为本项目配置的项

| 项 | 位置 | 状态 |
|---|---|---|
| SSH 私钥（ed25519，无密码） | `C:\Users\EDY\.ssh\id_ed25519_github` | ✅ 已生成并注册到 GitHub |
| SSH 公钥 | `C:\Users\EDY\.ssh\id_ed25519_github.pub` | ✅ |
| SSH config（github.com → 443） | `C:\Users\EDY\.ssh\config` | ✅ |
| git core.sshCommand | 全局 | ✅ |
| git user.name / user.email | 全局 | ✅ |
| remote | `git@github.com:Elliot-elli/museum-site.git` | ✅ |
| 一键推送脚本 | `tools/setup_github.sh` | ✅ |

---

## 六、已排除的障碍

| 曾经的问题 | 处理方式 |
|---|---|
| 无 `gh` CLI | 用 SSH + git 原生命令替代，无需安装 |
| `github.com:443` 被代理拦截 | 改走 SSH over 443 |
| MCP 无法建仓 | 建仓改由用户手动，之后我全自动 |
| `git ls-remote` 报 `Repository not found` | 正常 —— 仓库还没建 |
| 目录名与账号不一致 | 全部改为 `Elliot-elli` |

> 💡 **一个通用结论**：在受管网络环境下，
> **「API 可达 ≠ git 可达」**。判断能否推送要单独测 SSH/HTTPS，
> 不能只看 API 返回 200 就以为链路通。

---

## 附录：SKT 全局记忆条目原文（2026-11-12 从 MEMORY.md 下沉）

> 本段曾长期占用全局上下文（每次会话都注入）。
> 内容全部属于本项目，故下沉至此；全局只留一句指针。

## 🔴 二、静态站拆分上公网（2026-11-12 实证）

**四条硬约束**（细节见 `WorkBuddy/boya-museum-site/docs/ENVIRONMENT.md` 与 `CLOUDFLARE-CONFIG.md`）：

1. **DOM 顺序敏感** —— 「按 DOM 叶子序号索引」的存档（`case0:34`）在改 HTML 结构后会错位
   → 拆分必须保序 + 加「恢复原文回位」验证项。
2. **数据异步化会改绑定时序** —— 把内联数据改成 `fetch()` 会让 `bindXxx()` 相对存档的绑定时机改变
   → 存档被污染 → 还原错位。**改用同步 `<script src>`** 保持执行顺序。
3. **沙箱注入层必炸** —— AI 工具产物常含 `globalThis.openai.callTool()` 等宿主 API，
   普通浏览器**每次点击都抛 TypeError** → 上公网前必须剥离。
   配套：**「导出 HTML」拆分后会产出白页** → 需重写为导出时内联资源。
4. **平台配置「部署成功」≠「规则生效」** —— CF Pages：`_redirects` 用 `:splat` 不用 `$1`
   （后者静默忽略）；按【路径】匹配不按主机名 → www↔主域须用后台 Redirect Rules；
   产物目录不入库则**构建命令不能留空** → 提交 `build_cloud.sh` 让云端自建。

**通用教训**：平台静默失败不会报错 → 配置必须**单独写语法校验并接进构建**。

---

## Cloudflare 2026 控制台改版（2026-11-12 实测与官方文档核对）

> 原为全局记忆条目，因只属本项目而下沉至此。

5. **Cloudflare 2026 改版：创建入口默认走 Workers，Pages 降级为「旧版工作流」** ——
   Pages 入口是创建页顶部/底部一行小字（"Looking to deploy Pages? Get Started"），
   官方直达链接 `dash.cloudflare.com/?to=/:account/workers-and-pages/create/pages`。
   🔴 **用户说「找不到 Workers 和 Pages」多半是这个原因，不是他没登录。**
   两条路线都要准备：Pages 填「构建输出目录」；Workers 用 `wrangler.jsonc`
   （assets-only：无 `main`、无 `assets.binding`；`name` 必须与后台 Worker 名**完全一致**）。
   Workers Static Assets **同样原生支持 `_headers`/`_redirects`**。
   ⚠️ **Workers 绑自定义域名要求 NS 托管在 Cloudflare**；Pages 可 CNAME 到外部 DNS。
   → 详见该仓库 `docs/CLOUDFLARE-STEPS.md`
