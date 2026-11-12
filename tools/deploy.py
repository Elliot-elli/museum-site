# -*- coding: utf-8 -*-
"""
deploy.py — 阶段2 部署助手：把 site/ 发布到 Cloudflare Pages。

两种部署方式：

  A. Git 集成（推荐，日常更新用这个）
     把本仓库推到 GitHub，Cloudflare Pages 后台连接仓库。
     之后每次 git push 自动重新部署，链接不变。
     → 这个方式不需要本脚本，见 docs/DEPLOY.md

  B. Wrangler 直传（一次性发布 / 不方便接 Git 时用）
     npx wrangler pages deploy site --project-name=<项目名>
     → 本脚本负责检查前置条件、构建、并给出可复制的命令

前置条件（方式 B）：
  1. 已安装 Node.js（本机 v22.22.2 ✅）
  2. 已注册 Cloudflare 账号
  3. 已登录 Wrangler：npx wrangler login
  4. 已创建 Pages 项目，或首次部署时用 --project-name 自动创建

环境变量（方式 B，推荐用 CI Secret 而非明文）：
  CLOUDFLARE_ACCOUNT_ID   账号 ID（Cloudflare 控制台右侧可见）
  CLOUDFLARE_API_TOKEN    API Token（需 Pages:Edit 权限）

用法：
    python tools/deploy.py --check              # 只检查前置条件与产物，不部署
    python tools/deploy.py --project <项目名>    # 检查 + 输出部署命令
    python tools/deploy.py --project <项目名> --exec   # 真正执行部署
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SITE = ROOT / "site"


def check_node() -> tuple[bool, str]:
    if not shutil.which("node"):
        return False, "未找到 node（需 Node.js 18+）"
    try:
        v = subprocess.run(["node", "--version"], capture_output=True, text=True,
                           timeout=20).stdout.strip()
    except Exception as e:
        return False, f"node 调用失败：{e}"
    major = int(v.lstrip("v").split(".")[0]) if v.lstrip("v").split(".")[0].isdigit() else 0
    if major < 18:
        return False, f"Node {v} 版本过低（需 18+）"
    return True, f"Node {v}"


def check_site() -> tuple[bool, str]:
    if not SITE.exists():
        return False, "site/ 不存在，请先运行 python tools/build.py"
    idx = SITE / "index.html"
    if not idx.exists():
        return False, "site/index.html 不存在"
    files = [f for f in SITE.rglob("*") if f.is_file()]
    total = sum(f.stat().st_size for f in files)
    return True, f"site/ 就绪：{len(files)} 个文件，{total / 1024 / 1024:.2f} MB"


def check_env() -> tuple[bool, str]:
    has_token = bool(os.environ.get("CLOUDFLARE_API_TOKEN"))
    has_acct = bool(os.environ.get("CLOUDFLARE_ACCOUNT_ID"))
    if has_token and has_acct:
        return True, "已设置 CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID（CI 场景）"
    return True, "未设置 Cloudflare 环境变量 → 方式 B 需先执行 npx wrangler login"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default="", help="Cloudflare Pages 项目名")
    ap.add_argument("--exec", action="store_true", help="真正执行部署（默认只打印命令）")
    ap.add_argument("--check", action="store_true", help="只做检查")
    args = ap.parse_args()

    print("=== 部署前置检查 ===\n")
    ok_all = True
    for name, fn in (("Node.js", check_node), ("构建产物", check_site), ("凭据", check_env)):
        ok, msg = fn()
        print(f"  [{'OK ' if ok else 'FAIL'}] {name:10s} {msg}")
        ok_all = ok_all and ok

    print("\n=== 部署产物清单 ===\n")
    if SITE.exists():
        for f in sorted(SITE.rglob("*")):
            if f.is_file():
                rel = f.relative_to(SITE).as_posix()
                print(f"  {f.stat().st_size:>9,}  {rel}")

    if not ok_all:
        print("\n[FAIL] 前置检查未通过")
        return 1

    if args.check or not args.project:
        print("\n[OK] 检查完成。指定 --project <项目名> 可生成部署命令。")
        print("     方式 A（推荐）：把本仓库推到 GitHub，在 Cloudflare Pages 后台")
        print("                      连接仓库并设置「构建输出目录 = site」。")
        return 0

    cmd = ["npx", "--yes", "wrangler", "pages", "deploy", "site",
           "--project-name", args.project]
    print(f"\n=== 部署命令 ===\n\n  {' '.join(cmd)}\n")
    if not args.exec:
        print("（加 --exec 才会真正执行）")
        return 0

    print("正在部署…\n")
    r = subprocess.run(cmd, cwd=ROOT)
    if r.returncode == 0:
        print("\n[OK] 部署完成。请在 Cloudflare 控制台查看分配的 *.pages.dev 链接。")
    else:
        print(f"\n[FAIL] 部署失败，退出码 {r.returncode}")
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
