#!/usr/bin/env python3
"""Draws the DR87 app icon (striped sun over a dune horizon, "87") and writes every size the
web, iOS, Android and desktop builds need. Placeholder art until the final icon is designed.

    python3 tools/make-icons.py      (needs Pillow: pip install pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / 'apps/web/public/icons'
DESK = ROOT / 'apps/desktop/src-tauri/icons'
NIGHT, SAND, HOT, TEAL, INK = (29, 18, 16), (240, 180, 76), (255, 107, 59), (38, 184, 178), (255, 246, 230)


def font(size):
    for f in ['DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
              '/System/Library/Fonts/Supplemental/Arial Black.ttf']:
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def draw(size, safe=1.0):
    S = 1024
    im = Image.new('RGB', (S, S), NIGHT)
    d = ImageDraw.Draw(im)
    for y in range(S):  # dusk gradient
        t = y / S
        c = tuple(int(NIGHT[i] * (1 - t) + (92, 34, 40)[i] * t) for i in range(3))
        d.line([(0, y), (S, y)], fill=c)
    k = safe
    cx, cy, r = S // 2, int(S * (0.5 - 0.04 * k)), int(S * 0.3 * k)
    sun = Image.new('L', (S, S), 0)
    ImageDraw.Draw(sun).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    grad = Image.new('RGB', (S, S))
    gd = ImageDraw.Draw(grad)
    for y in range(cy - r, cy + r + 1):
        t = (y - (cy - r)) / (2 * r)
        gd.line([(0, y), (S, y)], fill=tuple(int(SAND[i] * (1 - t) + HOT[i] * t) for i in range(3)))
    md = ImageDraw.Draw(sun)
    for n in range(6):  # retro stripes cut through the lower half
        y0 = cy + int(r * (0.08 + n * 0.16)); h = int(r * (0.03 + n * 0.018))
        md.rectangle([0, y0, S, y0 + h], fill=0)
    im.paste(grad, (0, 0), sun)
    hy = int(S * (0.5 + 0.2 * k))  # dune horizon
    d.polygon([(0, hy), (S * .3, hy - 40 * k), (S * .55, hy + 10), (S * .8, hy - 60 * k), (S, hy), (S, S), (0, S)], fill=(58, 24, 20))
    for i in range(1, 7):  # neon grid
        y = hy + int((S - hy) * (i / 7) ** 1.6)
        d.line([(0, y), (S, y)], fill=TEAL, width=max(2, int(4 * k)))
    for i in range(-6, 7):
        d.line([(cx + i * 30 * k, hy), (cx + i * 260 * k, S)], fill=TEAL, width=max(2, int(4 * k)))
    f = font(int(300 * k))
    d.text((cx, int(S * (0.5 + 0.06 * k))), '87', font=f, fill=INK, anchor='mm', stroke_width=int(14 * k), stroke_fill=NIGHT)
    return im.resize((size, size), Image.LANCZOS)


def main():
    WEB.mkdir(parents=True, exist_ok=True); DESK.mkdir(parents=True, exist_ok=True)
    for s in (180, 192, 512, 1024):
        draw(s).save(WEB / f'icon-{s}.png')
    draw(512, safe=0.8).save(WEB / 'icon-maskable-512.png')  # content inside the 80% safe zone
    draw(1024).save(DESK / 'icon.png')  # source for `npx tauri icon`, which makes .icns/.ico
    for s in (32, 128):
        draw(s).save(DESK / f'{s}x{s}.png')
    draw(256).save(DESK / '128x128@2x.png')
    big = draw(1024)
    og = Image.new('RGB', (1200, 630), NIGHT); og.paste(big.resize((630, 630), Image.LANCZOS), (285, 0))
    og.save(ROOT / 'apps/web/public/og.png')
    print('icons written')


if __name__ == '__main__':
    main()
