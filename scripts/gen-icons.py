#!/usr/bin/env python3
"""Generate the ytblocker toolbar/extension icons.

Design: red rounded square + white play triangle + red diagonal slash.
Reads at 16px as "blocked video" without ambiguity.
"""

from pathlib import Path
from PIL import Image, ImageDraw

SIZES = [16, 32, 48, 96, 128]
RED = (204, 0, 0, 255)
WHITE = (255, 255, 255, 255)
OUT_DIR = Path(__file__).parent.parent / "public" / "icon"


def render(size: int) -> Image.Image:
    # Supersample 4x for clean downscale.
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Rounded red square background.
    radius = s // 6
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=RED)

    # White play triangle, slightly offset right so it looks centered to the eye.
    margin_x = s // 4
    margin_y = s // 4
    triangle = [
        (margin_x, margin_y),
        (margin_x, s - margin_y),
        (s - margin_x + s // 12, s // 2),
    ]
    d.polygon(triangle, fill=WHITE)

    # Red diagonal slash from upper-right to lower-left, cutting through the
    # triangle. Width scales with icon size so it stays visible at 16px.
    line_w = max(scale * 2, s // 9)
    pad = s // 10
    d.line(
        [(s - pad, pad), (pad, s - pad)],
        fill=RED,
        width=line_w,
    )

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        out = OUT_DIR / f"{size}.png"
        render(size).save(out, optimize=True)
        print(f"wrote {out.relative_to(OUT_DIR.parent.parent)}")


if __name__ == "__main__":
    main()
