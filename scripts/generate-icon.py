"""
从 resources/brand-source.jpg（或 .png）生成应用 / 托盘 / 安装包图标。
自动去除白色边缘并设为透明。
"""
from __future__ import annotations

import os
import shutil
from collections import deque

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RES = os.path.join(ROOT, "resources")
BUILD = os.path.join(ROOT, "build")
PUBLIC = os.path.join(ROOT, "public")
ASSETS = os.path.join(ROOT, "src", "assets")


def make_transparent(im: Image.Image, threshold: int = 248) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    visited = [[False] * h for _ in range(w)]
    q: deque[tuple[int, int]] = deque()

    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))

    def is_white(r: int, g: int, b: int, a: int) -> bool:
        return a > 0 and r >= threshold and g >= threshold and b >= threshold

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or visited[x][y]:
            continue
        visited[x][y] = True
        r, g, b, a = px[x, y]
        if is_white(r, g, b, a):
            px[x, y] = (r, g, b, 0)
            q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    # 去掉外轮廓抗锯齿白边：紧贴透明区的近白像素直接透明
    for x in range(w):
        for y in range(h):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            near_t = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                    near_t = True
                    break
            if not near_t:
                continue
            # 近白 / 低不透明度抗锯齿点
            if a < 48 or min(r, g, b) >= 200 or (a < 96 and min(r, g, b) >= 160):
                px[x, y] = (r, g, b, 0)
    return im


def trim_transparent(im: Image.Image, pad_ratio: float = 0.04) -> Image.Image:
    """去掉大片透明边，让小尺寸任务栏图标主体更大更清晰。"""
    im = im.convert("RGBA")
    bbox = im.split()[-1].getbbox()
    if not bbox:
        return im
    cropped = im.crop(bbox)
    pad = max(2, int(max(cropped.size) * pad_ratio))
    canvas = Image.new("RGBA", (cropped.size[0] + pad * 2, cropped.size[1] + pad * 2), (0, 0, 0, 0))
    canvas.paste(cropped, (pad, pad), cropped)
    # 方形画布，避免拉伸
    side = max(canvas.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(canvas, ((side - canvas.size[0]) // 2, (side - canvas.size[1]) // 2), canvas)
    return square


def load_brand() -> Image.Image:
    # 优先用原始 jpg，每次重新去白边，避免旧 png 残留白边
    candidates = [
        os.path.join(RES, "brand-source.jpg"),
        os.path.join(RES, "brand-source.jpeg"),
        os.path.join(RES, "brand-source.png"),
    ]
    src = next((p for p in candidates if os.path.exists(p)), None)
    if not src:
        raise FileNotFoundError("missing resources/brand-source.jpg|png")
    im = Image.open(src)
    return trim_transparent(make_transparent(im))


def scrub_fringe(im: Image.Image) -> Image.Image:
    """缩放后再次清掉外圈近白抗锯齿。"""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for x in range(w):
        for y in range(h):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            near_t = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if nx < 0 or ny < 0 or nx >= w or ny >= h or px[nx, ny][3] == 0:
                    near_t = True
                    break
            if near_t and (a < 64 or min(r, g, b) >= 190):
                px[x, y] = (0, 0, 0, 0)
    return im


def sharpen_small(im: Image.Image, size: int) -> Image.Image:
    """小尺寸略锐化，任务栏 / 托盘更清晰。"""
    if size > 48:
        return im
    from PIL import ImageFilter

    # 先轻微对比，再 UnsharpMask
    out = im.filter(ImageFilter.UnsharpMask(radius=1.1, percent=145, threshold=2))
    return out


def resize(im: Image.Image, size: int) -> Image.Image:
    # 两步缩小减少糊边：先到 2x 再落到目标
    if size < 128 and max(im.size) > size * 2:
        mid = im.resize((size * 2, size * 2), Image.Resampling.LANCZOS)
        out = mid.resize((size, size), Image.Resampling.LANCZOS)
    else:
        out = im.resize((size, size), Image.Resampling.LANCZOS)
    return sharpen_small(scrub_fringe(out), size)


def write_png(im: Image.Image, path: str, size: int | None = None) -> None:
    out = resize(im, size) if size else scrub_fringe(im.copy())
    out.save(path, "PNG", optimize=True)
    print(f"  png {os.path.basename(path)} {out.size}")


def _png_bytes(im: Image.Image) -> bytes:
    from io import BytesIO

    buf = BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _bmp_icon_image(im: Image.Image) -> bytes:
    """传统 32bpp BMP XOR + 1bpp AND，Windows Shell / 任务栏兼容最好。"""
    im = im.convert("RGBA")
    size = im.size[0]
    header = bytearray(40)
    header[0:4] = (40).to_bytes(4, "little")
    header[4:8] = size.to_bytes(4, "little", signed=True)
    header[8:12] = (size * 2).to_bytes(4, "little", signed=True)
    header[12:14] = (1).to_bytes(2, "little")
    header[14:16] = (32).to_bytes(2, "little")
    header[20:24] = (size * size * 4).to_bytes(4, "little")

    px = im.load()
    xor = bytearray(size * size * 4)
    and_row = ((size + 31) >> 5) * 4
    and_mask = bytearray(and_row * size)
    for y in range(size):
        src_y = size - 1 - y
        for x in range(size):
            r, g, b, a = px[x, src_y]
            i = (y * size + x) * 4
            xor[i] = b
            xor[i + 1] = g
            xor[i + 2] = r
            xor[i + 3] = a
            if a < 128:
                and_mask[y * and_row + (x >> 3)] |= 0x80 >> (x & 7)
    return bytes(header) + bytes(xor) + bytes(and_mask)


def write_ico(im: Image.Image, path: str, sizes: list[int]) -> None:
    """手写多尺寸 ICO：≤48 用 BMP，更大用 PNG。避免 Pillow 只写出 16x16。"""
    entries: list[tuple[int, bytes]] = []
    for s in sizes:
        frame = resize(im, s)
        if s <= 48:
            entries.append((s, _bmp_icon_image(frame)))
        else:
            entries.append((s, _png_bytes(frame)))

    count = len(entries)
    offset = 6 + count * 16
    chunks: list[bytes] = []
    dir_bytes = bytearray(6 + count * 16)
    dir_bytes[0:2] = (0).to_bytes(2, "little")
    dir_bytes[2:4] = (1).to_bytes(2, "little")
    dir_bytes[4:6] = count.to_bytes(2, "little")

    for i, (s, data) in enumerate(entries):
        o = 6 + i * 16
        dir_bytes[o] = 0 if s >= 256 else s
        dir_bytes[o + 1] = 0 if s >= 256 else s
        dir_bytes[o + 2] = 0
        dir_bytes[o + 3] = 0
        dir_bytes[o + 4 : o + 6] = (1).to_bytes(2, "little")
        dir_bytes[o + 6 : o + 8] = (32).to_bytes(2, "little")
        dir_bytes[o + 8 : o + 12] = len(data).to_bytes(4, "little")
        dir_bytes[o + 12 : o + 16] = offset.to_bytes(4, "little")
        chunks.append(data)
        offset += len(data)

    with open(path, "wb") as f:
        f.write(dir_bytes)
        for c in chunks:
            f.write(c)
    print(f"  ico {os.path.basename(path)} sizes={sizes} bytes={os.path.getsize(path)}")


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def main() -> None:
    ensure_dir(RES)
    ensure_dir(BUILD)
    brand = load_brand()
    brand_png = os.path.join(RES, "brand-source.png")
    brand.save(brand_png, "PNG", optimize=True)
    print(f"brand {brand.size} corner={brand.getpixel((0, 0))}")

    # 应用 / 安装界面
    write_png(brand, os.path.join(RES, "icon.png"), 256)
    write_png(brand, os.path.join(RES, "icon-256.png"), 256)
    write_png(brand, os.path.join(RES, "icon-48.png"), 48)
    # 含任务栏常用 16/20/24/32/40/48，避免只有 16 被放大发糊
    write_ico(brand, os.path.join(RES, "icon.ico"), [16, 20, 24, 32, 40, 48, 64, 128, 256])

    # 托盘值守
    write_png(brand, os.path.join(RES, "tray-source.png"), 64)
    write_png(brand, os.path.join(RES, "tray-16.png"), 16)
    write_png(brand, os.path.join(RES, "tray-20.png"), 20)
    write_png(brand, os.path.join(RES, "tray-24.png"), 24)
    write_png(brand, os.path.join(RES, "tray-32.png"), 32)
    write_ico(brand, os.path.join(RES, "tray.ico"), [16, 20, 24, 32, 40, 48])

    # UI / public 资源
    write_png(brand, os.path.join(RES, "logo-mark.png"), 256)
    write_png(brand, os.path.join(RES, "logo.png"), 512)
    if os.path.isdir(PUBLIC):
        write_png(brand, os.path.join(PUBLIC, "logo-mark.png"), 256)
        write_png(brand, os.path.join(PUBLIC, "logo.png"), 512)
    if os.path.isdir(ASSETS):
        write_png(brand, os.path.join(ASSETS, "logo-mark.png"), 256)

    shutil.copy2(os.path.join(RES, "icon.ico"), os.path.join(BUILD, "icon.ico"))
    print("copied build/icon.ico")
    print("Generated brand logo icons (transparent edges)")


if __name__ == "__main__":
    main()
