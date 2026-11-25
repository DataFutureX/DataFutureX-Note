"""DataFutureX Note 标志：圆角方形页面 + 居中双色 X（白 + 青）。

设计：(viewBox 0 0 136 136)
- 圆角方形页面（平涂靛蓝），像素级左右对称
- 居中 X：白 "/" + 青 "\"，回到上一版的样式
- 去除顶部标签
无渐变、无投影、无立体。

输出 resources/brand-source.png（透明底）。
"""
from __future__ import annotations

import os

from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "resources", "brand-source.png")

VIEW = 136
SIZE = 1024
SCALE = SIZE / VIEW

PAGE = (0x5B, 0x6C, 0xF0)  # 页面主色（靛蓝）
WHITE = (0xFF, 0xFF, 0xFF)
CYAN = (0x43, 0xD6, 0xFF)  # 青色 X


def rounded_rect(draw, box, radius, fill) -> None:
    x0, y0, x1, y1 = [v * SCALE for v in box]
    draw.rounded_rectangle((x0, y0, x1, y1), radius=radius * SCALE, fill=fill)


def stroke(draw, a, b, color, width) -> None:
    """带圆头端点的粗笔画。"""
    ax, ay = a
    bx, by = b
    w = width * SCALE
    r = w / 2
    draw.line(
        [(ax * SCALE, ay * SCALE), (bx * SCALE, by * SCALE)],
        fill=color, width=int(w), joint="curve",
    )
    for x, y in (a, b):
        cx, cy = x * SCALE, y * SCALE
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)


def make_symmetric(img: Image.Image) -> Image.Image:
    """用左半幅镜像覆盖右半幅，从构造上保证像素级左右对称。"""
    w, h = img.size
    half = w // 2
    left = img.crop((0, 0, half, h))
    right = left.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    img.paste(right, (half, 0))
    return img


def main() -> None:
    # 页面层：平涂圆角方形，严格左右对称
    page = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    rounded_rect(ImageDraw.Draw(page), (20, 30, 116, 118), 14, PAGE)
    page = make_symmetric(page)

    # X 层：双色（白 "/" + 青 "\"）
    x_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(x_layer)
    stroke(d, (48, 52), (88, 92), WHITE, 13)  # "\" 白
    stroke(d, (88, 52), (48, 92), CYAN, 13)  # "/" 青

    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(page)
    canvas.alpha_composite(x_layer)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    canvas.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} {canvas.size}")


if __name__ == "__main__":
    main()
