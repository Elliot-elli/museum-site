# Cloudflare Pages 构建配置参考
#
# ⚠️ 本文件只是**说明文档**，不是 Cloudflare 识别的配置文件。
#    Cloudflare Pages 的构建参数在**后台网页界面**设置，不读仓库里的文件。
#    保留它是为了：① 记录正确参数值；② 换平台或重建时不至于忘记；
#    ③ 交接给他人时一目了然。
#
# ── Cloudflare Pages 后台设置（Workers 和 Pages → 你的项目 → Settings → Build settings）──
#
#   框架预设        : None
#   构建命令        : （留空 —— 本项目无构建步骤，site/ 已是成品）
#   构建输出目录    : site          ← 最关键，写错会 404
#   根目录          : （留空，即仓库根）
#   环境变量        : （无）
#
# ── 为什么构建命令留空 ──
#   site/ 由 tools/build.py 从 src/ 生成，是**可直接托管的成品**。
#   Cloudflare 只需把它原样发到 CDN，不需要再跑任何构建。
#   （若改用 GitHub Actions 方案，才需要在 CI 里跑 python tools/build.py。）
#
# ── 构建产物清单（13 个文件，1.81 MB）──
#
#   404.html          1,625 B    自定义 404 页
#   _headers            814 B    缓存策略 + 安全响应头（Cloudflare 约定文件名）
#   _redirects          417 B    域名跳转规则（Cloudflare 约定文件名）
#   favicon.ico         178 B
#   favicon.svg         394 B
#   index.html       58,770 B    入口
#   css/main.css     16,173 B
#   js/app.js        17,210 B    交互逻辑
#   js/data.js       29,991 B    ★ 三个案例的文案与配图（日常改这里）
#   img/case-01.jpg 704,252 B    案例 01 碳足迹
#   img/case-02.jpg 655,536 B    案例 02 AI 与绿色提示词
#   img/case-03.jpg 414,856 B    案例 03 最后机会旅游
#   robots.txt          143 B
#
# ── _headers 里定的缓存策略 ──
#
#   index.html / 404.html   max-age=0, must-revalidate   ← 改完刷新即见
#   css/* js/*              max-age=604800（7 天）
#   img/* favicon.*         max-age=2592000（30 天）
#
# ── 换域名后要补的一步 ──
#
#   python tools/build.py --domain yourdomain.com
#   git add -A && git commit -m "chore: 配置 www → 主域跳转" && git push
#
#   这会重写 src/_redirects 生成可用规则：
#       /*  https://yourdomain.com/$1  301
#   注意：Cloudflare 只会读取 **site/_redirects**，
#   所以必须先跑 build.py 让它同步到 site/，再 push。
#
# ── 绑定域名后的验证 ──
#
#   curl -I https://www.yourdomain.com    # 期望 301 → https://yourdomain.com
#   curl -I https://yourdomain.com        # 期望 200
#   curl -s https://yourdomain.com | grep -c base64   # 期望 0
