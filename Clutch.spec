# PyInstaller build recipe for Clutch.exe  (used by build_installer.bat)
from PyInstaller.utils.hooks import collect_all

datas = [("panel.html", "."), ("overlay.html", "."), ("assets", "assets")]
binaries = []
hiddenimports = ["pystray._win32", "PIL.ImageChops"]
for pkg in ("vgamepad", "webview", "pystray"):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

a = Analysis(["app.py"], pathex=["."], binaries=binaries, datas=datas, hiddenimports=hiddenimports,
             excludes=["tkinter", "matplotlib", "numpy"], noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="Clutch", console=False,
          icon="assets/clutch.ico", upx=False)
coll = COLLECT(exe, a.binaries, a.datas, name="Clutch", upx=False)
