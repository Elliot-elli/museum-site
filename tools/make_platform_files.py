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
# Cloudflare Pages 跳转规则
# 用法：把 example.com 换成你的真实域名后生效。
#
# 1) www  → 主域（保留路径与查询串）
# 2) 主域 → www（若你更希望用 www 作为主域，启用这一条并注释掉上面那条）
# 3) 旧路径兼容：单文件时代的产物名，仍允许访问
# 4) 去掉 .html 后缀（可选，友好 URL）

# /old-file-name.html    /index.html     301
"""

REDIRECTS_WITH_DOMAIN = """\
# Cloudflare Pages 跳转规则

# 1) www → 主域（保留路径与查询串）
/*  https://{domain}/$1  301

# 2) 去掉 .html 后缀（可选，友好 URL）
# /index  /  301
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--domain", default="example.com",
                    help="你的主域名；填 real domain 后生成可用的 _redirects")
    ap.add_argument("--out", default="src",
                    help="输出目录（相对项目根）：src=真源，site=构建产物")
    args = ap.parse_args()

    out_dir = ROOT / args.out
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "_headers").write_text(HEADERS, encoding="utf-8", newline="")

    if args.domain and args.domain != "example.com":
        (out_dir / "_redirects").write_text(
            REDIRECTS_WITH_DOMAIN.format(domain=args.domain), encoding="utf-8", newline="")
        print(f"[OK] _redirects 已按域名 {args.domain} 生成 → {out_dir}")
    else:
        (out_dir / "_redirects").write_text(REDIRECTS_TEMPLATE, encoding="utf-8", newline="")
        print(f"[OK] _redirects 已生成占位模板 → {out_dir}（指定 --domain 后生成可用规则）")

    print(f"[OK] _headers 已生成 → {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
