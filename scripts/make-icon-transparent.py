from __future__ import annotations

import os
from PIL import Image

BASE = os.path.join(os.path.dirname(__file__), "..", "resources")


def make_transparent(path: str, threshold: int = 245) -> None:
    im = Image.open(path).convert("RGBA")
    pixels = im.load()
    w, h = im.size
    visited: set[tuple[int, int]] = set()
    stack: list[tuple[int, int]] = []

    for x in range(w):
        stack.append((x, 0))
        stack.append((x, h - 1))
    for y in range(h):
        stack.append((0, y))
        stack.append((w - 1, y))

    while stack:
        x, y = stack.pop()
        if (x, y) in visited or x < 0 or y < 0 or x >= w or y >= h:
            continue
        visited.add((x, y))
        r, g, b, a = pixels[x, y]
        if r >= threshold and g >= threshold and b >= threshold and a > 0:
            pixels[x, y] = (r, g, b, 0)
            stack.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

    im.save(path)
    print(
        f"{os.path.basename(path)}: size={im.size} "
        f"corner={im.getpixel((0, 0))} center={im.getpixel((w // 2, h // 2))}"
    )


def write_ico_from_png(png_path: str, ico_path: str, sizes: list[int]) -> None:
    src = Image.open(png_path).convert("RGBA")
    images = []
    for size in sizes:
        images.append(src.resize((size, size), Image.Resampling.LANCZOS))
    images[0].save(ico_path, format="ICO", sizes=[(s, s) for s in sizes])
    print(f"Wrote {os.path.basename(ico_path)} sizes={sizes}")


def main() -> None:
    for name in ["icon.png", "icon-48.png", "icon-256.png", "tray-source.png"]:
        make_transparent(os.path.join(BASE, name))

    # Rebuild ICO from transparent master icon
    icon_png = os.path.join(BASE, "icon.png")
    write_ico_from_png(
        icon_png,
        os.path.join(BASE, "icon.ico"),
        [16, 24, 32, 48, 64, 128, 256],
    )


if __name__ == "__main__":
    main()
