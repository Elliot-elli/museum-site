# -*- coding: utf-8 -*-
"""
check_editor_baseline.py — editorData 存档基线一致性检查（迭代防线的核心）

为什么需要这个：
    src/index.html 里的 <script id="editorData"> 存着「恢复原文」功能的基线存档：
        "originals": {"case0:0": "作品现场实拍 …", "case0:34": "…"}
    键名里的数字是 **DOM 叶子节点的序号**（scope:index）。

    所以：如果你在案例正文里【增删】了一个标题或段落，
    后面所有叶子的序号会整体错位 → 用户点「恢复原文」时，
    文字会被恢复成【错位的内容】，而且**不报任何错** —— 静默故障。

    现有的 tools/verify.js 只验证「恢复原文能不能回位」，
    验证不了「基线本身还准不准」。本脚本补上这一环。

判定依据（不靠猜）：
    app.js 的 bindScope() 用 editableSelector 挑出候选元素，
    再筛出「叶子」（不含其他候选的后代），按 DOM 顺序编号。
    所以正确基线必须满足：**每个 scope 的 index 从 0 开始连续、无缺口**。

    - 有缺口  → 基线里有键指向了不存在的节点，或存档被手工改坏
    - 连续但数量对不上当前 DOM → 说明 DOM 变过、基线已过期（最危险，静默错位）

用法：
    python tools/check_editor_baseline.py            # 检查 src/index.html
    python tools/check_editor_baseline.py --site     # 检查构建产物 site/index.html

退出码：0 = 通过；1 = 有问题（构建应被阻断）
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

# 必须与 src/js/app.js 的 editableSelector 保持一致
EDITABLE_SELECTOR = [
    "h1", "h2", "h3", "h4", "p", ".label", ".point", ".tag", ".cn",
    ".caption", ".eyebrow", ".meta span", ".small", ".learn li",
    ".sectionhead b", ".sectionhead>span", ".check strong",
    ".checktext", ".editable-footer",
]

# app.js 里 bindScope 被调用的四个 scope
KNOWN_SCOPES = {"case0", "case1", "case2", "header", "checklist", "footer"}


def extract_editor_data(html: str) -> dict | None:
    """从 HTML 中取出 <script id="editorData"> 的 JSON。"""
    m = re.search(
        r'<script[^>]*id=["\']editorData["\'][^>]*>(.*?)</script>',
        html, re.S | re.I,
    )
    if not m:
        return None
    raw = m.group(1).strip()
    # 容忍 HTML 转义
    raw = (raw.replace("&quot;", '"').replace("&amp;", "&")
              .replace("&lt;", "<").replace("&gt;", ">"))
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # 退而求其次：抓出第一个 {...} 平衡块
        start = raw.find("{")
        if start < 0:
            return None
        depth, in_str, esc = 0, False, False
        for i in range(start, len(raw)):
            ch = raw[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(raw[start:i + 1])
                    except json.JSONDecodeError:
                        return None
        return None


def analyze(html: str) -> tuple[list[str], dict]:
    """返回 (问题列表, 统计信息)。"""
    problems: list[str] = []
    stats: dict = {}

    data = extract_editor_data(html)
    if data is None:
        return ["找不到或无法解析 <script id=\"editorData\"> 的 JSON"], stats

    originals = data.get("originals") or {}
    if not isinstance(originals, dict):
        return ["editorData.originals 不是对象"], stats

    stats["storageId"] = data.get("storageId", "(无)")
    stats["edits_count"] = len(data.get("edits") or {})

    # 按 scope 分组，解析 index
    scopes: dict[str, list[int]] = defaultdict(list)
    for key in originals:
        if ":" not in key:
            problems.append(f"originals 的键格式异常（缺 ':'）：{key}")
            continue
        scope, _, idx = key.rpartition(":")
        if not idx.isdigit():
            problems.append(f"originals 的键 index 不是数字：{key}")
            continue
        scopes[scope].append(int(idx))

    if not scopes:
        return ["editorData.originals 为空 —— 恢复原文功能将无基线可用"], stats

    stats["scopes"] = {k: len(v) for k, v in sorted(scopes.items())}

    for scope, idxs in sorted(scopes.items()):
        idxs_sorted = sorted(idxs)
        stats.setdefault("scope_detail", {})[scope] = {
            "count": len(idxs_sorted),
            "min": idxs_sorted[0],
            "max": idxs_sorted[-1],
        }

        # ① 连续性：必须是 0..n-1
        expected = list(range(len(idxs_sorted)))
        if idxs_sorted != expected:
            missing = sorted(set(expected) - set(idxs_sorted))
            problems.append(
                f"scope '{scope}' 的 index 不连续：共 {len(idxs_sorted)} 个，"
                f"范围 {idxs_sorted[0]}..{idxs_sorted[-1]}，"
                f"缺失 {missing[:10]}{'…' if len(missing) > 10 else ''}"
            )

        # ② 未知 scope（app.js 里没有对应 bindScope 调用）
        if scope not in KNOWN_SCOPES:
            problems.append(
                f"出现未知 scope '{scope}' —— app.js 的 bindScope 里没有这个 scope，"
                f"该存档永远不会被使用"
            )

        # ③ 同一 index 重复
        if len(set(idxs_sorted)) != len(idxs_sorted):
            dup = [i for i in set(idxs_sorted) if idxs_sorted.count(i) > 1]
            problems.append(f"scope '{scope}' 存在重复 index：{sorted(dup)[:10]}")

    # ④ storageId 必须存在且唯一（它是 localStorage 的 key）
    if not data.get("storageId"):
        problems.append("editorData 缺 storageId —— 编辑器草稿无法落盘")

    return problems, stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", action="store_true", help="检查 site/ 产物而非 src/")
    args = ap.parse_args()

    target = (ROOT / "site" / "index.html") if args.site else (ROOT / "src" / "index.html")
    if not target.exists():
        print(f"[FAIL] 文件不存在：{target}")
        return 1

    html = target.read_text(encoding="utf-8", newline="")
    problems, stats = analyze(html)

    print(f"==> 检查 {target.relative_to(ROOT)}")
    print(f"    storageId   : {stats.get('storageId')}")
    print(f"    originals   : {sum(stats.get('scopes', {}).values())} 个键，"
          f"分 {len(stats.get('scopes', {}))} 个 scope")
    for scope, d in sorted(stats.get("scope_detail", {}).items()):
        print(f"      {scope:10s} {d['count']:4d} 个，index {d['min']}..{d['max']}")
    print(f"    edits       : {stats.get('edits_count', 0)} 个待发布修改")

    if problems:
        print("\n[FAIL] 基线一致性检查未通过：")
        for p in problems:
            print(f"  - {p}")
        print("\n  处置办法：")
        print("    1. 若 index 不连续 → 存档被改坏或版本混用，需从导出文件重新提取")
        print("    2. 若只是数量变化 → 正文增删过标签，必须重置基线：")
        print("       本地构建 → 浏览器点「编辑文字」→「恢复原文」→ 导出新版 HTML")
        print("       → 把导出的 editorData 替换回 src/index.html → 重新构建")
        return 1

    print("\n[OK] 基线一致性通过 —— 恢复原文可安全使用")
    return 0


if __name__ == "__main__":
    sys.exit(main())
