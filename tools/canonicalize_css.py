# -*- coding: utf-8 -*-
"""
canonicalize_css.py — 合并同一媒体上下文里的重复选择器。

为什么需要：
    样式表里同一个选择器被分散定义多次（如 .nav 出现 5 次），
    后面的靠「覆盖」生效。读代码时看到的是最后一条，
    改前面那条不报错也不生效 —— 静默陷阱。
    合并后每个选择器只剩一处，实际生效值不变。

做法：
    按 (媒体上下文, 选择器文本) 分组，组内按出现顺序合并声明
    （同名属性取最后一次），合并结果放回该组最后一次出现的位置，
    组内更早的整条删除。其余字节不动 —— 不重新序列化整份文件。

只处理 @media / @supports 内部；@layer 原样保留
（层内规则优先级低于层外，拆出来会改变生效顺序）。

用法：
    python tools/canonicalize_css.py           # 规范化 src/css/main.css
    python tools/canonicalize_css.py --check   # 只报告重复情况，重复时退出码 1
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / "src" / "css" / "main.css"

COMMENT_RE = re.compile(r"/\*.*?\*/", re.S)
RULE_RE = re.compile(r"([^{}]+)\{([^{}]*)\}")
# @layer 也当作独立上下文：层内规则的优先级低于层外，
# 与层外同选择器合并会改变生效顺序。
AT_MEDIA_RE = re.compile(r"@(media|supports|layer)\b[^{]*\{")


def mask_comments(text: str) -> str:
    """把注释内容换成等长空格，保持所有偏移量不变。"""
    return COMMENT_RE.sub(lambda m: " " * len(m.group(0)), text)


def media_spans(text: str) -> list[tuple[int, int]]:
    """所有 @media / @supports 块的 (起, 止) 区间，含嵌套。"""
    spans = []
    i = 0
    while True:
        m = AT_MEDIA_RE.search(text, i)
        if not m:
            break
        depth, j = 1, m.end()
        while j < len(text) and depth:
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
            j += 1
        spans.append((m.start(), j))
        i = j
    return spans


def split_decls(body: str) -> list[tuple[str, str]]:
    out = []
    for part in body.split(";"):
        part = part.strip()
        if not part:
            continue
        prop, _, value = part.partition(":")
        out.append((prop.strip(), value.strip()))
    return out


def merge_decls(bodies: list[str]) -> str:
    """同名属性取最后一次出现，保留各自在原声明中的相对位置。"""
    parsed = [split_decls(b) for b in bodies]
    last: dict[str, tuple[int, int]] = {}
    for gi, items in enumerate(parsed):
        for ii, (prop, _) in enumerate(items):
            last[prop] = (gi, ii)
    out = []
    for gi, items in enumerate(parsed):
        for ii, (prop, value) in enumerate(items):
            if last[prop] == (gi, ii):
                out.append(f"{prop}:{value}")
    return ";".join(out)


def collect_rules(masked: str) -> list[tuple[int, int, str, str, str]]:
    """返回 [(起, 止, 选择器, 声明体, 媒体上下文)]。"""
    spans = media_spans(masked)
    rules = []

    def scan(chunk: str, base: int, ctx: str):
        for m in RULE_RE.finditer(chunk):
            sel = m.group(1).strip()
            if not sel or sel.startswith("@"):
                continue
            rules.append((base + m.start(), base + m.end(), sel, m.group(2), ctx))

    # 顶层规则：在媒体块之间的空隙里扫描（保持原始偏移量）
    pos = 0
    for a, b in spans:
        scan(masked[pos:a], pos, "")
        pos = b
    scan(masked[pos:], pos, "")

    # 媒体块内部：排除嵌套媒体块，避免同一条规则被扫两次
    for idx, (a, b) in enumerate(spans):
        inner = masked[a:b]
        open_at = inner.find("{")
        interior = inner[open_at + 1: inner.rfind("}")]
        base = a + open_at + 1
        ctx = f"{a}:{b}"
        nested = [(na, nb) for j, (na, nb) in enumerate(spans)
                  if j != idx and a < na and nb < b]
        p = 0
        for na, nb in nested:
            s0, e0 = na - base, nb - base
            scan(interior[p:s0], base + p, ctx)
            p = e0
        scan(interior[p:], base + p, ctx)

    return rules


def unsafe_to_merge(members, spans, selectors_in_span) -> str:
    """判断合并这组规则会不会改变层叠顺序，返回原因（空 = 可安全合并）。

    合并会把整组声明搬到该组最后一次出现的位置。若这中间隔着媒体块，
    且媒体块里有同选择器的规则，窄屏下媒体规则会从「后于顶层规则」
    变成「先于顶层规则」—— 优先级翻转，布局改变。
    """
    first = min(m[0] for m in members)
    last = max(m[0] for m in members)
    sel = members[0][2]
    for a, b in spans:
        if a <= first and last < a:
            continue
        if not (first < a < last or first < b <= last):
            continue
        if sel in selectors_in_span.get((a, b), ()):
            return f"与 @media 块 {a}:{b} 内的同选择器规则冲突"
    return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只报告，不改文件")
    args = ap.parse_args()

    original = CSS.read_text(encoding="utf-8", newline="")
    masked = mask_comments(original)
    rules = collect_rules(masked)
    spans = media_spans(masked)
    selectors_in_span: dict[tuple[int, int], set] = {}
    for r in rules:
        if r[4]:
            a, b = (int(x) for x in r[4].split(":"))
            selectors_in_span.setdefault((a, b), set()).add(r[2])

    groups: dict[tuple[str, str], list] = {}
    for r in rules:
        groups.setdefault((r[4], r[2]), []).append(r)
    dups = {k: v for k, v in groups.items() if len(v) > 1}

    print("=== CSS 重复选择器检查 ===")
    print(f"规则总数 {len(rules)}，重复组 {len(dups)}")

    if not dups:
        print("[OK] 没有重复选择器")
        return 0

    safe, skipped = {}, {}
    for k, members in sorted(dups.items()):
        reason = unsafe_to_merge(members, spans, selectors_in_span)
        if reason:
            skipped[k] = reason
        else:
            safe[k] = members

    for (ctx, sel), members in sorted(dups.items()):
        tag = "媒体内" if ctx else "顶层"
        mark = "跳过" if (ctx, sel) in skipped else "可合并"
        print(f"  {len(members)}x  [{tag}] {mark}  {sel}"
              + (f"  ← {skipped[(ctx, sel)]}" if (ctx, sel) in skipped else ""))

    if args.check:
        return 1 if skipped else 0

    # 合并：保留组内最后一次出现的位置并改写为合并后的声明；更早的整条删除
    edits = []
    for k, members in sorted(safe.items()):
        sel = members[0][2]
        members = sorted(members, key=lambda r: r[0])
        merged = merge_decls([m[3] for m in members])
        last = members[-1]
        merged_rule = sel + "{" + merged + "}"
        edits.append((last[0], last[1], merged_rule))
        for m in members[:-1]:
            edits.append((m[0], m[1], ""))

    text = original
    for start, end, repl in sorted(edits, key=lambda e: e[0], reverse=True):
        text = text[:start] + repl + text[end:]

    CSS.write_text(text, encoding="utf-8", newline="")
    print(f"\n已合并 {len(safe)} 组，跳过 {len(skipped)} 组；"
          f"文件 {len(original)} → {len(text)} 字节")

    rules2 = collect_rules(mask_comments(text))
    groups2: dict[tuple[str, str], list] = {}
    for r in rules2:
        groups2.setdefault((r[4], r[2]), []).append(r)
    left = {k: v for k, v in groups2.items() if len(v) > 1}
    print(f"复检：规则 {len(rules2)}，剩余重复组 {len(left)}（跳过的组仍重复属预期）")
    for k in left:
        print("  仍重复:", k[1])
    return 0


if __name__ == "__main__":
    sys.exit(main())
