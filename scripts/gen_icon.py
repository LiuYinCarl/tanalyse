#!/usr/bin/env python3
"""生成 tanalyse 应用图标源图(1024×1024 PNG)。

浅绿色对角渐变圆角方块 + 白色“提交格子”(GitHub contribution 母题),
其中一枚格子用深绿色点缀。仅依赖 Python 标准库。
"""

import math
import struct
import sys
import zlib

SIZE = 1024
RADIUS = 230
# 渐变:左上浅绿 → 右下主题绿
GRAD_FROM = (0xB4, 0xEC, 0xCB)
GRAD_TO = (0x6E, 0xC6, 0x99)
ACCENT_DEEP = (0x2F, 0x6B, 0x4F)

# 4×4 提交格子:alpha(0..1);1.0 的格子用深绿色点缀
GRID = [
    [0.95, 0.60, 0.80, 0.45],
    [0.55, 0.85, 0.50, 0.90],
    [0.75, 1.00, 0.65, 0.50],
    [0.45, 0.70, 0.90, 0.80],
]
GRID_N = 4
GRID_AREA0 = 196
GRID_AREA1 = 828
CELL_GAP = 44
CELL_RADIUS = 36


def rounded_span_y(y, y0, y1, r):
    """扫描线 y 在圆角矩形垂直范围内时,返回左右收缩量;否则 None。"""
    if y < y0 or y > y1:
        return None
    if y < y0 + r:
        dy = (y0 + r) - y
    elif y > y1 - r:
        dy = y - (y1 - r)
    else:
        return 0.0
    if dy >= r:
        return None
    return r - math.sqrt(max(0.0, r * r - dy * dy))


def coverage(px, lo, hi):
    """像素中心 px 在 [lo, hi] 内的 1px 抗锯齿覆盖(0..1)。"""
    left = max(0.0, min(1.0, px + 0.5 - lo))
    right = max(0.0, min(1.0, hi - (px - 0.5)))
    return min(left, right)


def lerp(a, b, t):
    return a + (b - a) * t


def render() -> bytes:
    cell_w = ((GRID_AREA1 - GRID_AREA0) - CELL_GAP * (GRID_N - 1)) / GRID_N
    rows = []
    for y in range(SIZE):
        row = bytearray(SIZE * 4)
        py = y + 0.5
        bg_inset = rounded_span_y(py, 0, SIZE, RADIUS)
        if bg_inset is None:
            rows.append(row)
            continue
        xa_all = bg_inset
        xb_all = SIZE - bg_inset
        x_lo = max(0, int(math.floor(xa_all)))
        x_hi = min(SIZE, int(math.ceil(xb_all)))
        # 背景:对角渐变
        for x in range(x_lo, x_hi):
            t = (x + y) / (2 * (SIZE - 1))
            cov = coverage(x + 0.5, xa_all, xb_all)
            if cov <= 0:
                continue
            o = x * 4
            row[o] = int(lerp(GRAD_FROM[0], GRAD_TO[0], t) + 0.5)
            row[o + 1] = int(lerp(GRAD_FROM[1], GRAD_TO[1], t) + 0.5)
            row[o + 2] = int(lerp(GRAD_FROM[2], GRAD_TO[2], t) + 0.5)
            row[o + 3] = int(255 * cov)
        # 提交格子
        for gy in range(GRID_N):
            cy0 = GRID_AREA0 + gy * (cell_w + CELL_GAP)
            cy1 = cy0 + cell_w
            inset_y = rounded_span_y(py, cy0, cy1, CELL_RADIUS)
            if inset_y is None:
                continue
            for gx in range(GRID_N):
                cx0 = GRID_AREA0 + gx * (cell_w + CELL_GAP)
                cx1 = cx0 + cell_w
                xa = cx0 + inset_y
                xb = cx1 - inset_y
                if xb <= xa:
                    continue
                alpha = GRID[gy][gx]
                is_accent = alpha >= 1.0
                fg = ACCENT_DEEP if is_accent else (255, 255, 255)
                a = 1.0 if is_accent else alpha
                lo = max(0, int(math.floor(xa)))
                hi = min(SIZE, int(math.ceil(xb)))
                for x in range(lo, hi):
                    cov = coverage(x + 0.5, xa, xb) * a
                    if cov <= 0:
                        continue
                    o = x * 4
                    da = row[o + 3] / 255.0
                    out_a = cov + da * (1 - cov)
                    if out_a <= 0:
                        continue
                    for ch in range(3):
                        out = (fg[ch] * cov + row[o + ch] * da * (1 - cov)) / out_a
                        row[o + ch] = int(out + 0.5)
                    row[o + 3] = int(out_a * 255 + 0.5)
        rows.append(row)
    # PNG 每条扫描线前有 1 字节 filter 类型(0 = 无滤波)
    return b"".join(b"\x00" + bytes(r) for r in rows)


def write_png(path: str, size: int, data: bytes) -> None:
    def chunk(tag: bytes, payload: bytes) -> bytes:
        raw = tag + payload
        return (
            struct.pack(">I", len(payload)) + raw + struct.pack(">I", zlib.crc32(raw) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", zlib.compress(data, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "icon-source.png"
    write_png(out, SIZE, render())
    print(f"written {out}")
