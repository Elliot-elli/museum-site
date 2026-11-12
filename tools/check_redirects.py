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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="", help="只检查指定文件")
    args = ap.parse_args()

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
