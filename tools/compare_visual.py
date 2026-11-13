# -*- coding: utf-8 -*-
"""
compare_visual.py — 比对两次截图目录，逐像素找出差异。

用法：
    python tools/compare_visual.py <目录A> <目录B> [--tol 2]
    python tools/compare_visual.py <目录A> <目录B> --noise <目录N>

判定：
    逐像素 RGB 最大通道差 > tol 记为差异像素。
    没有噪声基线时，差异像素必须为 0 才算通过 ——
    CSS 去重若真的等价，渲染必须逐字节一致。

--noise 的作用：
    Chromium 对缩放后的图片栅格化并非逐次一致，同一份代码抓两次
    也会在图片区域出现约 0.4% 的抗锯齿差异。
    传 --noise 指向「同一份代码的另一次抓取」，用它的差异量作噪声地板：
    A→B 的差异不超过噪声地板即判通过（噪声内）。

退出码 0 = 全部一致或在噪声内；1 = 有超出噪声的差异。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageChops


def compare_pair(a: Path, b: Path, tol: int) -> tuple[int, int, int]:
    """返回 (差异像素数, 总像素数, 最大通道差)。"""
    with Image.open(a) as ia, Image.open(b) as ib:
        if ia.size != ib.size:
            return -1, ia.size[0] * ia.size[1], 255
        diff = ImageChops.difference(ia.convert("RGB"), ib.convert("RGB"))
        bands = diff.split()
        max_band = bands[0]
        for band in bands[1:]:
            max_band = ImageChops.lighter(max_band, band)
        hist = max_band.histogram()
        diff_px = sum(hist[tol + 1:])
        worst = max((i for i, c in enumerate(hist) if c), default=0)
        return diff_px, ia.size[0] * ib.size[1], worst


def judge(da: Path, db: Path, name: str, tol: int, noise_dir: Path | None):
    """返回 (是否通过, 说明文字)。"""
    diff_px, total, worst = compare_pair(da / name, db / name, tol)
    if diff_px == 0:
        return True, ""
    if diff_px < 0:
        return False, "尺寸不一致"
    if noise_dir and (noise_dir / name).exists():
        noise_px, _, noise_worst = compare_pair(noise_dir / name, db / name, tol)
        within = diff_px <= noise_px * 1.05 + 20 and worst <= max(noise_worst, 2)
        return within, f"差异 {diff_px} 像素 / 噪声基线 {noise_px} 像素 → {'噪声内' if within else '超出噪声'}"
    pct = diff_px / total * 100 if total else 0
    return False, f"差异像素 {diff_px}（{pct:.4f}%）最大通道差 {worst}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("dir_a")
    ap.add_argument("dir_b")
    ap.add_argument("--tol", type=int, default=2, help="允许的最大通道差（0=完全一致）")
    ap.add_argument("--noise", default="", help="噪声基线目录：同一份代码的另一次抓取")
    ap.add_argument("--max-report", type=int, default=12)
    args = ap.parse_args()

    da, db = Path(args.dir_a), Path(args.dir_b)
    files_a = sorted(p.name for p in da.glob("*.png"))
    files_b = sorted(p.name for p in db.glob("*.png"))

    if not files_a:
        print(f"[FAIL] 目录 A 为空：{da}")
        return 1

    only_a = [f for f in files_a if f not in files_b]
    only_b = [f for f in files_b if f not in files_a]
    common = [f for f in files_a if f in files_b]

    noise_dir = Path(args.noise) if args.noise else None
    print(f"=== 像素比对：{da.name} → {db.name} ===")
    print(f"共同截图 {len(common)} 张；仅 A 有 {len(only_a)} 张；仅 B 有 {len(only_b)} 张")
    if noise_dir:
        print(f"噪声基线：{noise_dir.name}")
    for f in only_a:
        print(f"  [缺失] {f}")
    for f in only_b:
        print(f"  [新增] {f}")

    fails = []
    for name in common:
        ok, note = judge(da, db, name, args.tol, noise_dir)
        print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  {note}" if note else ""))
        if not ok:
            fails.append(name)

    print(f"\n=== 结果：{len(common) - len(fails)} PASS / {len(fails)} FAIL ===")
    if fails:
        print("差异明细：")
        for name in fails[: args.max_report]:
            print(f"  - {name}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
