# -*- coding: utf-8 -*-
"""
build.py — 日常构建器：src/（真源） → site/（部署产物）。

这是**日常改内容后要跑的那一条命令**：

    改 src/js/data.js 里的文案
    → python tools/build.py
    → site/ 更新
    → git commit + git push
    → Cloudflare Pages 自动重新部署（链接不变）

目录职责：
  src/   真源 —— 人改这里（进 Git）
  site/  产物 —— 构建生成（不进 Git，由 .gitignore 排除）
  tools/ 脚本 —— 构建与验证（进 Git）

构建步骤：
  1. 复制 src/ 全部文件到 site/
  2. 生成 favicon（tools/make_favicon.py）
  3. 生成平台配置 _headers / _redirects（tools/make_platform_files.py）
  4. 自检：确认关键文件存在、无 base64 残留、引用路径可解析

用法：
    python tools/build.py                # 构建
    python tools/build.py --domain real.com   # 构建并生成带域名的跳转规则
    python tools/build.py --check        # 只构建不部署，仅自检
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SRC = ROOT / "src"
SITE = ROOT / "site"

REQUIRED = [
    "index.html", "404.html", "robots.txt", "sitemap.xml", "_headers", "_redirects",
    "favicon.svg", "favicon.ico",
    "css/main.css", "js/app.js", "js/data.js",
    "img/case-01.jpg", "img/case-02.jpg", "img/case-03.jpg",
]


def selfcheck() -> list[str]:
    """构建后自检，返回问题列表（空 = 通过）。"""
    problems: list[str] = []

    for rel in REQUIRED:
        if not (SITE / rel).exists():
            problems.append(f"缺少文件：{rel}")

    idx = SITE / "index.html"
    if idx.exists():
        h = idx.read_text(encoding="utf-8", newline="")
        if "base64" in h:
            problems.append("index.html 仍含 base64 数据（图片未落地？）")
        if h.count('<link rel="stylesheet"') != 1:
            problems.append(f"main.css 引用次数异常：{h.count('<link rel=\"stylesheet\"')}")
        for m in re.finditer(r'(?:src|href)="([^"]+)"', h):
            u = m.group(1)
            if u.startswith(("http://", "https://", "#", "data:", "mailto:", "//")):
                continue
            if u.startswith("/"):
                continue  # 站点根路径（favicon 等），交由平台解析
            target = (SITE / u.split("?")[0].split("#")[0])
            if not target.exists():
                problems.append(f"index.html 引用了不存在的文件：{u}")

    app = SITE / "js/app.js"
    if app.exists():
        a = app.read_text(encoding="utf-8", newline="")
        if "globalThis.openai" in a:
            problems.append("app.js 仍含 codex 沙箱调用（globalThis.openai）")
        if a.count("function exportHTML") != 1:
            problems.append(f"exportHTML 定义数异常：{a.count('function exportHTML')}")

    data = SITE / "js/data.js"
    if data.exists():
        d = data.read_text(encoding="utf-8", newline="")
        if "base64" in d:
            problems.append("data.js 仍含 base64 数据（图片未落地？）")
        n = d.count('"image":')
        if n != 3:
            problems.append(f"data.js 案例数异常：{n}")

    # 5. editorData 基线一致性
    #    editorData.originals 的键是「DOM 叶子序号」（case0:34 这种），
    #    正文增删标签会让序号整体错位 → 「恢复原文」静默恢复成错位内容。
    #    这是静默故障（不报错），所以必须在构建阶段拦住。
    if idx.exists():
        try:
            rc = subprocess.run(
                [sys.executable, str(HERE / "check_editor_baseline.py"), "--site"],
                capture_output=True, text=True,
            )
            if rc.returncode != 0:
                problems.append("editorData 基线不一致 —— 见 tools/check_editor_baseline.py 的输出")
                print(rc.stdout)
        except Exception as e:  # noqa: BLE001
            problems.append(f"基线检查脚本执行异常：{e}")

    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--domain", default="", help="主域名，用于生成 _redirects 规则")
    ap.add_argument("--check", action="store_true", help="构建后仅自检（默认行为相同，保留兼容）")
    args = ap.parse_args()

    if not SRC.exists():
        print(f"[FAIL] 真源目录不存在：{SRC}")
        print("       首次请先运行：python tools/migrate.py")
        return 1

    # 1. 复制
    if SITE.exists():
        shutil.rmtree(SITE)
    shutil.copytree(SRC, SITE)

    # 2. favicon
    subprocess.run([sys.executable, str(HERE / "make_favicon.py")], check=True)

    # 3. 平台配置
    cmd = [sys.executable, str(HERE / "make_platform_files.py"), "--out", "site"]
    if args.domain:
        cmd += ["--domain", args.domain]
    subprocess.run(cmd, check=True)

    # 4. 平台配置语法校验
    #    CF 对看不懂的 _redirects 行会【静默忽略】——部署显示 Success 但规则不生效，
    #    所以必须单独校验，不能只看构建是否通过。
    rc = subprocess.run([sys.executable, str(HERE / "check_redirects.py")],
                        capture_output=True, text=True)
    if rc.returncode != 0:
        print(rc.stdout)
        print("[FAIL] _redirects / _headers 语法校验未通过")
        return 1

    # 5. 自检
    problems = selfcheck()
    if problems:
        print("\n[FAIL] 构建自检未通过：")
        for p in problems:
            print("  - " + p)
        return 1

    total = sum(f.stat().st_size for f in SITE.rglob("*") if f.is_file())
    print(f"[OK] 构建完成：{SITE}")
    print(f"     文件数 {len([f for f in SITE.rglob('*') if f.is_file()])}，"
          f"总大小 {total / 1024 / 1024:.2f} MB")
    print("     自检通过（无 base64 残留 / 无沙箱调用 / 引用路径均可解析）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
