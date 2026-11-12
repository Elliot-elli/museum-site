# -*- coding: utf-8 -*-
"""
migrate.py — 阶段0 迁移器：把桌面单文件 HTML 拆分为可维护的多文件真源（src/）。

输入：SOURCE_HTML（桌面上的单文件真源）
输出：src/ 目录（真源，日常改这里）

设计约束（改动前必读）：

1. **保序（最重要）**
   editorData.originals 是按 DOM 叶子序号索引的（case0:34 / header:2 ...），共 320 条。
   若拆分改变了 <body> 内元素的相对顺序，「恢复原文」会把文字还原到错误位置。
   → 本脚本只做「抽取 + 外链 + 去沙箱」，绝不重排 body 结构、绝不改写 render() 模板。

2. **同步加载，不用 fetch**
   cases 数据若用 fetch() 异步加载，bindCaseEdits() 相对 embedded.originals 的
   绑定时机会改变（原本在脚本尾部同步绑定），导致 originals 被污染、
   「恢复原文」错位。
   → 改用 <script src="js/data.js">（window.MUSEUM_DATA）同步加载，
     执行顺序与原版完全一致。

3. **不改正文**
   cases 内的文本、class 名、data-* 属性一律原样搬运。

4. **去沙箱**
   删除 codex 注入层（9 个 <script> + 2 个 <style>）。它在普通浏览器会因
   globalThis.openai.callTool 不存在而每次点击/输入/悬停都抛 TypeError。

5. **图片落地**
   3 张 JPEG 从 base64 抽成 img/case-0N.jpg，按案例序号命名，相对路径引用。
   注：案例 03 的图片在原 HTML 内出现两次（首屏静态占位 + cases[2].image），
   共用同一个文件。

用法：
    python migrate.py            # 迁移到 src/
    python migrate.py --check    # 只打印拆解报告，不写入
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SITE = ROOT / "src"

SOURCE_HTML = Path(
    r"C:\Users\EDY\Desktop\博雅博物馆_优秀案例解读_点击放大互动版_2026-11-02.html"
)

# codex 沙箱注入层特征
CODEX_ID_RE = re.compile(r"codex-visualization-[a-z-]+")
CODEX_MARKERS = ("globalThis.openai", "__codexVisualizationInitialGlobals",
                 "codex-visualization-")


def find_blocks(html: str, tag: str) -> list[tuple[int, int, int, str, str]]:
    """返回 (open_start, body_start, body_end, attrs, body)。"""
    out = []
    for m in re.finditer(r"<%s([^>]*)>" % tag, html):
        close = html.find("</%s>" % tag, m.end())
        if close == -1:
            continue
        out.append((m.start(), m.end(), close, m.group(1).strip(), html[m.end():close]))
    return out


def is_codex(attrs: str, body: str) -> bool:
    if CODEX_ID_RE.search(attrs):
        return True
    return any(mk in body for mk in CODEX_MARKERS)


def match_brace(text: str, start: int) -> int:
    """从 text[start] 处的 '{' 开始配平，返回匹配 '}' 的下标。"""
    depth = 0
    i = start
    quote = None
    while i < len(text):
        c = text[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = None
        elif c in "\"'`":
            quote = c
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只打印拆解报告，不写入")
    args = ap.parse_args()

    if not SOURCE_HTML.exists():
        print(f"[FAIL] 源文件不存在：{SOURCE_HTML}")
        return 1

    html = SOURCE_HTML.read_text(encoding="utf-8", newline="")
    report: list[str] = []

    # ---------- 1. 拆解 ----------
    style_blocks = find_blocks(html, "style")
    script_blocks = find_blocks(html, "script")

    css_parts, removed_styles = [], []
    for idx, (_s, _bs, _be, attrs, body) in enumerate(style_blocks):
        if is_codex(attrs, body):
            removed_styles.append(idx)
            continue
        css_parts.append(
            f"/* ---- 原 style 块 #{idx} (attrs={attrs or 'none'}) ---- */\n{body.strip()}"
        )

    editor_data = None
    main_js = None
    main_js_attrs = ""
    removed_scripts = []
    for idx, (_s, _bs, _be, attrs, body) in enumerate(script_blocks):
        if is_codex(attrs, body):
            removed_scripts.append(idx)
            continue
        if 'id="editorData"' in attrs:
            editor_data = body
        elif len(body) > len(main_js or ""):
            main_js = body
            main_js_attrs = attrs

    if editor_data is None or main_js is None:
        print("[FAIL] 未找到 editorData 或主脚本块")
        return 1

    ed = json.loads(editor_data)
    report.append(f"CSS：保留 {len(css_parts)} 块，剥离沙箱 {len(removed_styles)} 块"
                  f"（style 索引 {removed_styles}）")
    report.append(f"JS：剥离沙箱 {len(removed_scripts)} 块"
                  f"（script 索引 {removed_scripts}）")
    report.append(f"editorData：storageId={ed['storageId']}，"
                  f"edits={len(ed['edits'])} 条，originals={len(ed['originals'])} 条")

    # ---------- 2. 抽离 cases ----------
    m = re.search(r"const cases=\[(.*?)\];let current=0;", main_js, re.S)
    if not m:
        print("[FAIL] 未定位到 cases 数组")
        return 1
    cases = json.loads("[" + m.group(1) + "]")
    report.append(f"cases：{len(cases)} 个案例，字段数 {[len(c) for c in cases]}")

    # ---------- 3. 图片编号（按案例序号命名） ----------
    digest_of = {}
    for c in cases:
        b64 = c["image"].split(",", 1)[1]
        digest_of[hashlib.md5(b64.encode()).hexdigest()] = c["image"]

    name_by_digest = {}
    for i, c in enumerate(cases, 1):
        b64 = c["image"].split(",", 1)[1]
        d = hashlib.md5(b64.encode()).hexdigest()
        name_by_digest[d] = f"img/case-{i:02d}.jpg"
        c["image"] = name_by_digest[d]

    # 首屏静态占位用的那张（案例 03）也要落到同一文件
    static_digests = set()
    for mm in re.finditer(r'src="data:image/jpeg;base64,([A-Za-z0-9+/=]+)"', html):
        static_digests.add(hashlib.md5(mm.group(1).encode()).hexdigest())
    for d in static_digests:
        if d not in name_by_digest:
            print(f"[FAIL] 静态占位图片 {d[:12]} 不属于任何案例，无法归一")
            return 1
    report.append(f"图片：{len(cases)} 张唯一 JPEG（按案例编号命名 "
                  f"{[name_by_digest[d] for d in name_by_digest]}）；"
                  f"原 HTML 内 4 处引用（案例 03 重复 1 次）")

    # ---------- 4. 组装 app.js ----------
    app_out = main_js

    # 4a. exportHTML 改造（拆分后导出必须重新内联资源，否则下载到的是白页）
    patch = (HERE / "export_patch.js").read_text(encoding="utf-8")
    sig = "function exportHTML(){"
    ks = app_out.find(sig)
    if ks == -1:
        report.append("exportHTML：[WARN] 未找到函数签名，未改造")
    else:
        bs = app_out.find("{", ks)
        be = match_brace(app_out, bs)
        old = app_out[ks:be + 1]
        if len(old) > 200 and "clone.outerHTML" in old:
            app_out = app_out[:ks] + patch + app_out[be + 1:]
            report.append(f"exportHTML：已替换为「导出时重新内联 CSS/JS/图片」版本"
                          f"（原 {len(old)} → 新 {len(patch)} 字符）")
        else:
            report.append("exportHTML：[WARN] 函数体异常，未改造")

    # 4b. cases 内联数组 → window.MUSEUM_DATA（同步加载，保持原有执行顺序）
    cases_inline = "const cases=[" + m.group(1) + "];"
    if cases_inline not in app_out:
        print("[FAIL] cases 字面量未命中（exportHTML 替换可能已破坏它）")
        return 1
    app_out = app_out.replace(
        cases_inline,
        "const cases=window.MUSEUM_DATA;  // 数据已抽离到 js/data.js",
        1,
    )
    report.append("app.js：cases 数组 → window.MUSEUM_DATA 引用"
                  "（同步加载，执行顺序与原版完全一致）")

    # ---------- 5. 组装 index.html ----------
    out = html

    # 5a. 剥离沙箱 style / script（从后往前删，避免偏移失效）
    kill = []
    for idx, (_s, _bs, be, attrs, _body) in enumerate(style_blocks):
        if idx in removed_styles:
            kill.append((_s, be + len("</style>")))
    for idx, (_s, _bs, be, attrs, _body) in enumerate(script_blocks):
        if idx in removed_scripts:
            kill.append((_s, be + len("</script>")))
    for start, end in sorted(kill, reverse=True):
        out = out[:start] + out[end:]

    # 5b. style 块 → 外链（三个块合并进一个 main.css，
    #     只能生成一个 <link>，否则会重复引用三次）
    out, n_style = re.subn(r"<style([^>]*)>.*?</style>",
                           '<link rel="stylesheet" href="css/main.css">',
                           out, flags=re.S)
    # 把第 2、3 次替换产生的多余 link 删掉，只保留第一个
    first = out.find('<link rel="stylesheet" href="css/main.css">')
    dup = '<link rel="stylesheet" href="css/main.css">'
    while True:
        nxt = out.find(dup, first + len(dup))
        if nxt == -1:
            break
        out = out[:nxt] + out[nxt + len(dup):]
    report.append(f"index.html：{n_style} 个 <style> 块 → 1 个 <link>（合并进 css/main.css）")

    # 5c. 主脚本块 → 两个外链标签（data.js 必须在前）
    marker = "<script>\nconst cases=["
    p = out.find(marker)
    if p == -1:
        marker = "<script>const cases=["
        p = out.find(marker)
    if p == -1:
        print("[FAIL] 未定位到主脚本块")
        return 1
    end = out.find("</script>", p)
    out = (out[:p]
           + '<script src="js/data.js"></script>\n'
             + '<script src="js/app.js"></script>'
           + out[end + len("</script>"):])
    report.append(f"index.html：主脚本块 {end - p} 字符 → "
                  f"<script src=\"js/data.js\"> + <script src=\"js/app.js\">")

    # 5d. 静态占位 base64 图片 → 相对路径
    def repl_static(mm):
        d = hashlib.md5(mm.group(1).encode()).hexdigest()
        return 'src="%s"' % name_by_digest[d]

    out = re.sub(r'src="data:image/jpeg;base64,([A-Za-z0-9+/=]+)"', repl_static, out)

    # 5e. 收尾收敛
    out = out.replace("</script>\n\n</body>", "</script>\n</body>")

    # 5f. 补 favicon 声明（浏览器默认请求 /favicon.ico，缺失即 404）
    if "rel=\"icon\"" not in out:
        out = out.replace(
            '<link rel="stylesheet" href="css/main.css">',
            '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n'
            '<link rel="alternate icon" href="/favicon.ico" sizes="32x32">\n'
            '<link rel="stylesheet" href="css/main.css">',
            1,
        )
        report.append("index.html：已补 favicon 声明（svg + ico）")

    # ---------- 6. 落盘 ----------
    if args.check:
        print("\n".join(report))
        return 0

    if SITE.exists():
        shutil.rmtree(SITE)
    (SITE / "css").mkdir(parents=True)
    (SITE / "js").mkdir(parents=True)
    (SITE / "img").mkdir(parents=True)

    # 用原始 base64 写出图片文件
    for d, path in name_by_digest.items():
        b64 = digest_of[d].split(",", 1)[1]
        (SITE / path).write_bytes(base64.b64decode(b64))

    (SITE / "css" / "main.css").write_text(
        "\n\n".join(css_parts) + "\n", encoding="utf-8", newline="")
    (SITE / "js" / "data.js").write_text(
        "/* cases 数据 —— 修改文案/配图只需改这里，改完重新构建即可。\n"
        "   image 字段填相对路径（img/case-0N.jpg）。 */\n"
        "window.MUSEUM_DATA = " + json.dumps(cases, ensure_ascii=False, indent=2)
        + ";\n", encoding="utf-8", newline="")
    (SITE / "js" / "app.js").write_text(app_out, encoding="utf-8", newline="")
    (SITE / "index.html").write_text(out, encoding="utf-8", newline="")

    # 404 页与 robots.txt：若真源已存在则保留（避免覆盖用户的修改）
    for name in ("404.html", "robots.txt"):
        if not (SITE / name).exists():
            print(f"[WARN] {name} 不存在，请从 site/ 复制一份到 src/ 后再迁移")

    print("\n".join(report))
    print(f"\n[OK] 真源已写入 {SITE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
