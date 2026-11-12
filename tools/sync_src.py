# -*- coding: utf-8 -*-
"""
sync_src.py — 把 site/ 的可编辑源回写到 src/（建立并维护「真源」目录）。

为什么需要这一步：
  site/ 是构建产物（可随时由 tools/build.py 重新生成），不应进 Git。
  但我们需要一个「可编辑的真源」，用于日常改文案 —— 那就是 src/。
  src/ 里的文件与 site/ 一一对应，构建时 src/ 优先。

职责边界：
  · src/ = 真源（人改这里）→ 进 Git
  · site/ = 产物（构建生成）→ 不进 Git
  · tools/ = 构建与验证脚本 → 进 Git

用法：
    python tools/sync_src.py            # site/ → src/（首次建立真源 / 回写产物）
    python tools/sync_src.py --check    # 只比对，不写入；不一致则退出码 1
"""
from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SITE = ROOT / "site"
SRC = ROOT / "src"

# 参与同步的文件（相对路径）
FILES = [
    "index.html",
    "404.html",
    "robots.txt",
    "_headers",
    "_redirects",
    "favicon.svg",
    "favicon.ico",
    "css/main.css",
    "js/app.js",
    "js/data.js",
    "img/case-01.jpg",
    "img/case-02.jpg",
    "img/case-03.jpg",
]


def md5(p: Path) -> str:
    return hashlib.md5(p.read_bytes()).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只比对，不写入")
    args = ap.parse_args()

    if not SITE.exists():
        print(f"[FAIL] 产物目录不存在：{SITE}（请先运行 tools/build.py）")
        return 1

    diffs, missing = [], []
    for rel in FILES:
        s = SITE / rel
        t = SRC / rel
        if not s.exists():
            missing.append(rel)
            continue
        if not t.exists():
            diffs.append(f"{rel}: src 缺失")
        elif md5(s) != md5(t):
            diffs.append(f"{rel}: 内容不同")

    if missing:
        print("[FAIL] 产物缺少文件：" + ", ".join(missing))
        return 1

    if args.check:
        if diffs:
            print(f"[FAIL] src/ 与 site/ 不一致（{len(diffs)} 项）：")
            for d in diffs:
                print("  - " + d)
            print("\n提示：运行 python tools/sync_src.py 把产物回写到真源")
            return 1
        print(f"[OK] src/ 与 site/ 完全一致（{len(FILES)} 个文件）")
        return 0

    for rel in FILES:
        s = SITE / rel
        t = SRC / rel
        t.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(s, t)

    print(f"[OK] 已把 {len(FILES)} 个文件从 site/ 回写到 src/")
    for rel in FILES:
        print(f"  - src/{rel}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
