#!/usr/bin/env python3
"""Compose the GitHub social preview (1280x640) from the logo and a hero screenshot.

Usage: social_preview.py HERO_PNG [OUT_PNG]
Requires Pillow. Upload the result manually: GitHub → Settings → General → Social preview.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
W, H = 1280, 640
BG = (245, 240, 232)
INK = (54, 46, 36)
MUTED = (120, 106, 88)
ACCENT = (124, 96, 58)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def main() -> None:
    hero_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'docs/images/social-preview.png'
    canvas = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(canvas)

    logo = Image.open(ROOT / 'build/icon.png').convert('RGBA').resize((96, 96), Image.LANCZOS)
    canvas.paste(logo, (72, 64), logo)
    draw.text((188, 64), 'TextEx', font=font(64, bold=True), fill=INK)
    draw.text((190, 140), 'Free, local-first LaTeX editor', font=font(28), fill=MUTED)

    bullets = ['Bundled Tectonic — no TeX install', 'Live PDF preview with SyncTeX',
               'Edit sentences straight from the PDF', 'Zotero, Git, templates, optional AI']
    y = 206
    for line in bullets:
        draw.ellipse((78, y + 10, 90, y + 22), fill=ACCENT)
        draw.text((104, y), line, font=font(24), fill=INK)
        y += 40

    hero = Image.open(hero_path).convert('RGB')
    target_w = 760
    ratio = target_w / hero.width
    hero = hero.resize((target_w, int(hero.height * ratio)), Image.LANCZOS)
    frame = Image.new('RGB', (hero.width + 16, hero.height + 16), (216, 206, 190))
    frame.paste(hero, (8, 8))
    shadow = Image.new('RGBA', (frame.width + 40, frame.height + 40), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((20, 28, frame.width + 20, frame.height + 28), radius=12, fill=(0, 0, 0, 60))
    x, yy = 540, 380
    canvas.paste(shadow, (x - 20, yy - 20), shadow)
    canvas.paste(frame, (x, yy))
    canvas.save(out_path, optimize=True)
    print(f'wrote {out_path}')


if __name__ == '__main__':
    main()
