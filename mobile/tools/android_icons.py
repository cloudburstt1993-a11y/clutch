"""Makes the Android launcher icons from the PC app's icon drawing (make_icon.py). Run from the repo root."""
import os, sys
from PIL import Image
sys.path.insert(0, os.path.abspath("."))
import make_icon
res = os.path.join("mobile", "android", "app", "src", "main", "res")
full = make_icon.draw_icon(True).convert("RGBA")          # 1024 rounded-square icon
# foreground for adaptive icons: the drawing on a transparent 108dp canvas, art inside the 66dp safe zone
for d, px in {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}.items():
    fg = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    art = full.resize((int(px * .72), int(px * .72)), Image.LANCZOS)
    fg.paste(art, ((px - art.width) // 2, (px - art.height) // 2), art)
    fg.save(os.path.join(res, f"mipmap-{d}", "ic_launcher_foreground.png"))
for d, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    ic = full.resize((px, px), Image.LANCZOS)
    ic.save(os.path.join(res, f"mipmap-{d}", "ic_launcher.png"))
    ic.save(os.path.join(res, f"mipmap-{d}", "ic_launcher_round.png"))
bg = os.path.join(res, "values", "ic_launcher_background.xml")
open(bg, "w").write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#14 1B3A</color>\n</resources>\n'.replace("#14 1B3A", "#141B3A"))
print("android icons done")
# splash screens: Clutch icon on the app's night blue, same size as Capacitor's placeholder files
import glob
for f in glob.glob(os.path.join(res, "drawable*", "splash.png")):
    w, h = Image.open(f).size
    sp = Image.new("RGB", (w, h), (13, 19, 40))
    s = int(min(w, h) * .28)
    art = full.resize((s, s), Image.LANCZOS)
    sp.paste(art, ((w - s) // 2, (h - s) // 2), art)
    sp.save(f)
print("splash done")
