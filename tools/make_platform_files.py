# -*- coding: utf-8 -*-
"""
make_platform_files.py — 生成 Cloudflare Pages 平台配置文件。

输出：
  site/_headers   — 缓存策略与安全响应头
  site/_redirects — 域名跳转规则（占位，需替换为真实域名）

说明：这两个文件是 Cloudflare Pages 的「约定文件名」，不是普通静态资源。
必须在 site/ 根目录下才会被平台识别。

用法：python tools/make_platform_files.py [--domain example.com]
"""
from __future__ import annotations

import argparse
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"

HEADERS = """\
# Cloudflare Pages 响应头配置
# 规则自上而下匹配，命中即生效。

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: geolocation=(), microphone=(), camera=()

# HTML 不缓存：保证内容更新后用户刷新即可看到最新版本
/index.html
  Cache-Control: public, max-age=0, must-revalidate

/404.html
  Cache-Control: public, max-age=0, must-revalidate

# 静态资源可长缓存（内容变更时用带版本号的文件名或强制刷新）
/css/*
  Cache-Control: public, max-age=604800

/js/*
  Cache-Control: public, max-age=604800

/img/*
  Cache-Control: public, max-age=2592000

/favicon.svg
  Cache-Control: public, max-age=2592000

/favicon.ico
  Cache-Control: public, max-age=2592000
"""

REDIRECTS_TEMPLATE = """\
# Cloudflare Pages 跳转规则（尚未绑定自有域名）
#
# ⚠️ 本文件【不会】生成 www → 主域 的跳转，这不是遗漏，是 Cloudflare 的硬限制：
#    · Pages 的 _redirects 按【路径】匹配，不按主机名匹配
#      （官方文档 Advanced redirects 表里 Domain-level redirects 一栏直接标 ❌ 不支持）
#    · 规则会同时作用于 *.pages.dev 与自定义域名。若写
#      /*  https://example.com/:splat  301
#      则 pages.dev 也会跳走，而自定义域名又 CNAME 指回本项目 → 无限重定向。
#
# ✅ 绑域名后 www↔主域跳转的正确做法（二选一，详见 docs/DOMAIN-BINDING.md）：
#   A) 域名 NS 托管到 Cloudflare → 后台 Rules → Redirect Rules 建规则
#   B) NS 留在原 DNS 服务商 → 把 www 也加为第二个自定义域名
#
# 旧路径兼容：单文件时代的产物名，仍允许访问
# /old-file-name.html    /index.html     301
#
# 去掉 .html 后缀（可选，友好 URL）
# /index    /  301
"""

REDIRECTS_WITH_DOMAIN = """\
# Cloudflare Pages 跳转规则（已绑定域名：{domain}）
#
# ⚠️ 这里【刻意不生成】 www → 主域 的跳转规则，理由同上：
#    Cloudflare Pages 的 _redirects 按【路径】匹配、不按主机名匹配，
#    且规则同时作用于 *.pages.dev 与自定义域名 —— 写成根通配 /* 会在两个地址之间死循环。
#
# ✅ 请在 Cloudflare 后台手工建这一条（仅路线 A「NS 托管 Cloudflare」可用）：
#    Rules → Redirect Rules → Create rule
#      Rule name     : www → apex
#      Condition     : Custom filter → Hostname equals www.{domain}
#      Then          : Static redirect → https://{domain}
#      Status code   : 301
#
#    若是路线 B（NS 留在原 DNS 服务商），后台 Redirect Rules 不生效，
#    请改为把 www.{domain} 也加为第二个自定义域名（见 docs/DOMAIN-BINDING.md §4）。
#
# 旧路径兼容：单文件时代的产物名，仍允许访问
# /old-file-name.html    /index.html     301
#
# 去掉 .html 后缀（可选，友好 URL）
# /index    /  301
"""


def collect_active_rules() -> list[str]:
    """读取真源 src/_redirects 里【手写的有效规则】。

    为什么需要：本脚本会整体重写 _redirects。若直接把生成内容整份覆盖，
    用户手写在 src/_redirects 里的规则会被【静默抹掉】——
    构建照样成功、部署照样 Success，规则却不在产物里。

    确定性不受影响：真源固定，产物每次重建都一致。
    """
    src_file = ROOT / "src" / "_redirects"
    if not src_file.exists():
        return []
    rules = []
    for raw in src_file.read_text(encoding="utf-8", newline="").split("\n"):
        s = raw.strip()
        if s and not s.startswith("#"):
            rules.append(s)
    return rules


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--domain", default="",
                    help="你的主域名；填了就会生成带该域名的说明性 _redirects")
    ap.add_argument("--out", default="src",
                    help="输出目录（相对项目根）：src=真源，site=构建产物")
    args = ap.parse_args()

    out_dir = ROOT / args.out
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "_headers").write_text(HEADERS, encoding="utf-8", newline="")

    # 注意：不要拿 "example.com" 当「未指定域名」的哨兵值 ——
    # 那会让「真的想绑 example.com」被静默降级成占位模板。
    if args.domain:
        body = REDIRECTS_WITH_DOMAIN.format(domain=args.domain)
        print(f"[OK] _redirects 已按域名 {args.domain} 生成 → {out_dir}")
    else:
        body = REDIRECTS_TEMPLATE
        print(f"[OK] _redirects 已生成占位模板 → {out_dir}（指定 --domain 后附上该域名的跳转说明）")

    # 追加真源里手写的有效规则（不覆盖、不丢失）
    active = collect_active_rules()
    if active:
        body += "\n# ---- 以下为 src/_redirects 中手写的有效规则（构建时保留）----\n"
        body += "\n".join(active) + "\n"
        print(f"[OK] 保留手写规则 {len(active)} 条")

    (out_dir / "_redirects").write_text(body, encoding="utf-8", newline="")
    print(f"[OK] _headers 已生成 → {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
