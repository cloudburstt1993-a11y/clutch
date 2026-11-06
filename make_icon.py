"""Draws the Clutch icon set (app .ico, tray icons, PNG) with Pillow. Run: python make_icon.py"""
import os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
NIGHT = (20, 27, 58)
PINK = (255, 95, 162)
VIOLET = (124, 92, 255)
VOLT = (255, 210, 63)
GREY = (120, 132, 156)
S = 1024


def gradient(size, c1, c2):
    """Diagonal gradient, top-left c1 -> bottom-right c2."""
    g = Image.new("RGB", (size, size))
    px = g.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return g


def controller_mask(size):
    """White controller silhouette on black, 1024 canvas."""
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([170, 330, 854, 640], radius=150, fill=255)          # body
    d.ellipse([130, 430, 430, 840], fill=255)                                 # left grip
    d.ellipse([594, 430, 894, 840], fill=255)                                 # right grip
    return m


def bolt_points(cx, cy, s):
    pts = [(0.10, -0.62), (-0.34, 0.06), (-0.04, 0.06), (-0.14, 0.62), (0.34, -0.10), (0.04, -0.10), (0.16, -0.62)]
    return [(cx + x * s, cy + y * s) for x, y in pts]


def draw_icon(on=True):
    base = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bg = gradient(S, PINK if on else (70, 78, 100), VIOLET if on else (44, 50, 70))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([24, 24, S - 24, S - 24], radius=230, fill=255)
    base.paste(bg, (0, 0), mask)

    pad = controller_mask(S)
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    shadow.paste((10, 10, 30, 110), (0, 26), pad.filter(ImageFilter.GaussianBlur(18)))
    base = Image.alpha_composite(base, shadow)
    body = Image.new("RGBA", (S, S), NIGHT + (255,))
    base.paste(body, (0, 0), pad)

    d = ImageDraw.Draw(base)
    bolt = bolt_points(512, 505, 300)
    d.polygon(bolt, fill=VOLT if on else GREY)
    # a few button details so it still reads as a controller
    accent = PINK if on else GREY
    for cx, cy in ((735, 430), (690, 475), (780, 475), (735, 520)):
        d.ellipse([cx - 22, cy - 22, cx + 22, cy + 22], fill=accent)
    d.rounded_rectangle([262, 455, 362, 495], radius=10, fill=accent)
    d.rounded_rectangle([292, 425, 332, 525], radius=10, fill=accent)
    return base


def main():
    os.makedirs(OUT, exist_ok=True)
    on, off = draw_icon(True), draw_icon(False)
    on.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, "clutch.png"))
    on.save(os.path.join(OUT, "clutch.ico"), sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (40, 40),
                                                    (48, 48), (64, 64), (128, 128), (256, 256)])
    on.resize((64, 64), Image.LANCZOS).save(os.path.join(OUT, "tray_on.png"))
    off.resize((64, 64), Image.LANCZOS).save(os.path.join(OUT, "tray_off.png"))
    on.resize((1024, 1024)).save(os.path.join(OUT, "clutch_1024.png"))
    print("Icons written to", OUT)


if __name__ == "__main__":
    main()
