# -*- coding: utf-8 -*-
"""
check_redirects.py — 校验 _redirects / _headers 语法是否符合 Cloudflare Pages 规范。

为什么需要这个：
  Cloudflare Pages 遇到**看不懂的 _redirects 行会静默忽略**——
  部署显示 Success，规则却不生效。官方文档明确写了：
  「Only one redirect can be defined per line and must follow this format,
    otherwise it will be ignored.」
  所以「部署成功」不等于「规则生效」，必须单独校验。

规范（Cloudflare Pages）：
  格式   : [source] [destination] [code?]
  源     : 路径，可含通配符 * 与占位符 :name
  目标   : 路径或外部链接，可用 :splat / :placeholder
  状态码 : 可选，默认 302；跳转用 301
  注释   : 以 # 开头
  限制   : 每文件 2000 条静态 + 100 条动态；每行 1000 字符
  ⚠️ 源里写主机名（如 https://www.x.com/*）不生效 —— CF 按路径匹配。

用法：
    python tools/check_redirects.py
    python tools/check_redirects.py --file src/_redirects
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

VALID_CODES = {"301", "302", "303", "307", "308", "200", "404"}
# Netlify 风格的占位符 —— 在 CF Pages 里会被静默忽略
NETLIFY_STYLE = re.compile(r"\$\d+|\$\{[^}]+\}")

# 匹配「所有路径」的源。只有根通配 + 外部绝对地址目标才是致命的：
# Pages 的规则对 *.pages.dev 与自定义域名【同时生效】，
# 目标域名又 CNAME 指回本项目 → 无限重定向；pages.dev 地址也会一并失效。
ROOT_WILDCARD_SOURCES = {"/*", "/:splat", "/*/", "/:splat/"}


def is_root_wildcard(src: str) -> bool:
    return src.strip() in ROOT_WILDCARD_SOURCES


def check_file(path: Path) -> list[str]:
    problems: list[str] = []
    if not path.exists():
        return [f"文件不存在：{path}"]

    raw = path.read_text(encoding="utf-8", newline="")
    lines = raw.split("\n")

    static_count = dynamic_count = 0

    for i, line in enumerate(lines, 1):
        s = line.strip()
        if not s or s.startswith("#"):
            continue

        if len(s) > 1000:
            problems.append(f"第 {i} 行：超过 1000 字符上限（CF 会忽略）")

        # 主机名级跳转 —— CF 不支持，会被静默忽略
        if s.startswith("http://") or s.startswith("https://"):
            problems.append(
                f"第 {i} 行：源包含主机名 —— Cloudflare Pages 按【路径】匹配，"
                f"主机名级跳转会被静默忽略。www↔主域请用后台 Redirect Rules。")

        parts = s.split()
        if len(parts) < 2:
            problems.append(f"第 {i} 行：格式错误，至少需要 [source] [destination] —— {s!r}")
            continue
        if len(parts) > 3:
            problems.append(f"第 {i} 行：一行只能有一条规则，实际解析出 {len(parts)} 段 —— {s!r}")
            continue

        src, dst = parts[0], parts[1]
        code = parts[2] if len(parts) == 3 else None

        if code is not None and code not in VALID_CODES:
            problems.append(f"第 {i} 行：状态码 {code!r} 不在 CF 支持列表 {sorted(VALID_CODES)}")

        # 目标里的 Netlify 风格占位符
        if NETLIFY_STYLE.search(dst):
            problems.append(
                f"第 {i} 行：目标用了 Netlify 风格的 $1/${{...}} —— "
                f"Cloudflare Pages 必须用 :splat 或 :name，写错会被静默忽略。")

        # 源里的 Netlify 风格占位符
        if NETLIFY_STYLE.search(src):
            problems.append(
                f"第 {i} 行：源用了 Netlify 风格的 $1/${{...}} —— "
                f"Cloudflare Pages 必须用 :splat 或 :name。")

        # 🔴 根通配 + 外部绝对地址目标 = 死循环 / pages.dev 失效
        #    Pages 的 _redirects 对所有主机名生效，根通配会同时命中
        #    *.pages.dev 与自定义域名；目标域名若 CNAME 指回本项目 → 无限重定向。
        if is_root_wildcard(src) and (dst.startswith("http://") or dst.startswith("https://")):
            problems.append(
                f"第 {i} 行：根通配源（{src}）+ 外部绝对地址目标（{dst}）—— "
                f"该规则会同时作用于 *.pages.dev 与自定义域名；"
                f"若目标域名 CNAME 指回本 Pages 项目会造成【无限重定向】，"
                f"并让 pages.dev 地址失效。"
                f"www↔主域请用后台 Redirect Rules，或把 www 也加为第二个自定义域名"
                f"（详见 docs/DOMAIN-BINDING.md）。")

        # 目标里的 :splat 必须与源的 * 对应
        if "*" in src and ":splat" not in dst and "?" not in dst:
            # 允许纯根路径跳转（/old  → /new），只是提醒
            if dst.rstrip("/").count("/") == 1 and dst.count("*") == 0 and dst != "/":
                pass  # 正常路径映射

        if "*" in src:
            dynamic_count += 1
        else:
            static_count += 1

    if static_count > 2000:
        problems.append(f"静态规则 {static_count} 条，超出 2000 上限")
    if dynamic_count > 100:
        problems.append(f"动态规则 {dynamic_count} 条，超出 100 上限")

    return problems


def check_headers(path: Path) -> list[str]:
    problems: list[str] = []
    if not path.exists():
        return [f"文件不存在：{path}"]

    lines = path.read_text(encoding="utf-8", newline="").split("\n")
    rule_count = 0
    i = 0
    while i < len(lines):
        s = lines[i].strip()
        if not s or s.startswith("#"):
            i += 1
            continue
        # 路径行（不含冒号）
        if ":" not in s:
            rule_count += 1
            # 后续缩进的行是头字段
            j = i + 1
            while j < len(lines) and lines[j].startswith((" ", "\t")) and lines[j].strip():
                if ":" not in lines[j]:
                    problems.append(f"第 {j + 1} 行：头部字段缺少冒号 —— {lines[j].strip()!r}")
                j += 1
            i = j
        else:
            problems.append(f"第 {i + 1} 行：缺少路径行（应先写路径再写头部字段）")
            i += 1

    if rule_count > 100:
        problems.append(f"规则 {rule_count} 条，超出 CF 的 100 条上限（会静默失败）")
    return problems


def selftest() -> int:
    """自检：每条判据都要有「必须被拦」的反例，否则说明判据写成了永真。"""
    import tempfile

    cases: list[tuple[str, str, bool]] = [
        # (说明, 文件内容, 期望被拦)
        ("根通配 + 外部绝对地址（死循环）",
         "/*  https://museum.example.com/:splat  301\n", True),
        ("根通配 + 外部绝对地址（无 splat）",
         "/*  https://museum.example.com/  301\n", True),
        ("根通配占位符源 + 外部绝对地址",
         "/:splat  https://museum.example.com/:splat  301\n", True),
        ("Netlify 风格 $1",
         "/*  https://museum.example.com/$1  301\n", True),
        ("源里带主机名",
         "https://www.example.com/*  /index.html  301\n", True),
        ("非法状态码",
         "/a  /b  999\n", True),
        ("一行多条规则",
         "/a  /b  301  /c\n", True),
        ("只有源没有目标",
         "/a\n", True),
        ("正常路径映射（应放行）",
         "/old.html  /index.html  301\n", False),
        ("正常路径重写 + splat（应放行）",
         "/blog/*  /posts/:splat  301\n", False),
        ("去掉 .html 后缀（应放行）",
         "/index  /  301\n", False),
        ("全是注释（应放行）",
         "# just a comment\n# /a  /b  301\n", False),
        ("空文件（应放行）",
         "", False),
    ]

    failed = 0
    for i, (name, content, should_flag) in enumerate(cases, 1):
        with tempfile.NamedTemporaryFile("w", suffix="_redirects", delete=False,
                                         encoding="utf-8", newline="") as fh:
            fh.write(content)
            tmp = Path(fh.name)
        try:
            problems = check_file(tmp)
            flagged = len(problems) > 0
            if flagged == should_flag:
                print(f"PASS  R{i}  {name}"
                      + (f"  — {problems[0][:60]}" if problems else ""))
            else:
                failed += 1
                print(f"FAIL  R{i}  {name}  — 期望{'拦截' if should_flag else '放行'}，"
                      f"实际{'拦截' if flagged else '放行'}")
                for p in problems:
                    print(f"        {p}")
        finally:
            tmp.unlink(missing_ok=True)

    print()
    print(f"===== 跳转规则自检 {len(cases)} 项 =====")
    print("结果：全部通过" if failed == 0 else f"结果：{failed} 项失败")
    return 1 if failed else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="", help="只检查指定文件")
    ap.add_argument("--selftest", action="store_true", help="只跑自检（不检查项目文件）")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    if args.file:
        targets = [(Path(args.file), "redirects")]
    else:
        targets = []
        for base in (ROOT / "src", ROOT / "site"):
            targets.append((base / "_redirects", "redirects"))
            targets.append((base / "_headers", "headers"))

    all_problems: list[str] = []
    checked = 0
    for path, kind in targets:
        if not path.exists():
            continue
        checked += 1
        problems = check_file(path) if kind == "redirects" else check_headers(path)
        label = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
        if problems:
            print(f"[FAIL] {label}")
            for p in problems:
                print(f"       - {p}")
                all_problems.append(f"{label}: {p}")
        else:
            print(f"[OK ] {label}")

    print()
    if all_problems:
        print(f"[FAIL] 共 {len(all_problems)} 个问题 —— 这些会导致 CF 静默忽略规则")
        return 1
    print(f"[OK ] 校验通过（{checked} 个文件）—— 规则语法符合 Cloudflare Pages 规范")
    return 0


if __name__ == "__main__":
    sys.exit(main())
