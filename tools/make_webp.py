# -*- coding: utf-8 -*-
"""
make_webp.py — 从 src/img/*.jpg 生成响应式 WebP 变体。

为什么要有这个文件：
    三张海报原图是 1900px 宽的 baseline JPEG，合计 1.73 MB。
    页面里 hero 与展板图实际只显示 560~600 CSS px，
    手机 2 倍屏也只要约 690 px —— 每次都在下载 1900 px 的原图。

产出：
    img/case-0N-640.webp   img/case-0N-960.webp
    img/case-0N-1280.webp  img/case-0N-<原宽>.webp

约束：
    只缩放不改比例 —— data.js 的 analysisRegions 是百分比坐标，
    analysisPositions 也是百分比，改比例会让热点错位。
    不改 EXIF 方向 —— canvas 裁剪按 naturalWidth/Height 算像素区域。

用法：
    python tools/make_webp.py            # 生成/覆盖全部变体
    python tools/make_webp.py --check    # 只校验变体是否与源图同步
"""
from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
IMG = ROOT / "src" / "img"

SOURCES = ["case-01.jpg", "case-02.jpg", "case-03.jpg"]
WIDTHS = [640, 960, 1280]
QUALITY = 80


def widths_for(width: int) -> list[int]:
    """固定档位 + 原宽；原宽小于某档时跳过该档，避免放大失真。"""
    out = [w for w in WIDTHS if w < width]
    out.append(width)
    return out


def variant_name(src_name: str, width: int, orig_width: int) -> str:
    stem = Path(src_name).stem
    suffix = "" if width == orig_width else f"-{width}"
    return f"{stem}{suffix}.webp"


def encode(im: Image.Image, width: int, quality: int) -> bytes:
    height = round(im.height * width / im.width)
    resized = im.resize((width, height), Image.LANCZOS)
    buf = io.BytesIO()
    resized.save(buf, "WEBP", quality=quality, method=6)
    return buf.getvalue()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只比对，不写文件")
    args = ap.parse_args()

    problems: list[str] = []
    total_new = 0

    for src_name in SOURCES:
        src = IMG / src_name
        if not src.exists():
            problems.append(f"缺源图：{src}")
            continue
        with Image.open(src) as im:
            im = im.convert("RGB")
            orig_w = im.width
            for width in widths_for(orig_w):
                out = IMG / variant_name(src_name, width, orig_w)
                data = encode(im, width, QUALITY)
                total_new += len(data)
                if args.check:
                    if not out.exists():
                        problems.append(f"缺变体：{out.name}")
                    elif out.stat().st_size != len(data):
                        problems.append(
                            f"变体与源图不同步：{out.name} "
                            f"（现有 {out.stat().st_size} B，按源图重建为 {len(data)} B）"
                        )
                else:
                    out.write_bytes(data)
                    print(f"[OK] {out.name:24s} {width:>4}px  {len(data) / 1024:6.1f} KB")

    if args.check:
        print("\n=== 变体同步检查 ===")
        if problems:
            for p in problems:
                print("[FAIL]", p)
            return 1
        print("[OK] 全部变体与源图同步")
        return 0

    print(f"\n新增变体合计 {total_new / 1024:.0f} KB（原三张 JPEG 合计 1733 KB）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
