# -*- coding: utf-8 -*-
"""
make_favicon.py — 生成 favicon.svg 与 favicon.ico（纯标准库，无第三方依赖）。

用法：python tools/make_favicon.py
输出：site/favicon.svg、site/favicon.ico
"""
import pathlib
import struct
import zlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"

SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="博雅博物馆">
  <rect width="64" height="64" rx="12" fill="#193c36"/>
  <path d="M14 22h36M14 32h36M14 42h22" stroke="#f5f3ec" stroke-width="5" stroke-linecap="round"/>
  <circle cx="46" cy="43" r="8" fill="#be603b"/>
  <path d="M52 49l7 7" stroke="#be603b" stroke-width="5" stroke-linecap="round"/>
</svg>
"""

INK = (0x19, 0x3C, 0x36)
PAPER = (0xF5, 0xF3, 0xEC)
ACCENT = (0xBE, 0x60, 0x3B)


def make_png(w: int, h: int) -> bytes:
    px = bytearray()
    for y in range(h):
        for x in range(w):
            r, g, b = INK
            # 三条浅色横线
            if 9 <= x <= 22 and y in (11, 16, 21):
                r, g, b = PAPER
            # 右下角放大镜
            dx, dy = x - 23, y - 23
            if dx * dx + dy * dy <= 36:
                r, g, b = ACCENT
            px += bytes((b, g, r, 255))

    raw = b"".join(b"\x00" + bytes(px[y * w * 4:(y + 1) * w * 4]) for y in range(h))

    def chunk(t: bytes, d: bytes) -> bytes:
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


def main() -> int:
    SITE.mkdir(parents=True, exist_ok=True)
    (SITE / "favicon.svg").write_text(SVG, encoding="utf-8", newline="")

    w = h = 32
    png = make_png(w, h)
    ico = (struct.pack("<HHH", 0, 1, 1)
           + struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(png), 22)
           + png)
    (SITE / "favicon.ico").write_bytes(ico)
    print(f"[OK] favicon.svg ({len(SVG)} B) / favicon.ico ({len(ico)} B)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
