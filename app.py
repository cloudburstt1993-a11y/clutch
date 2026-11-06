"""
Clutch desktop app: control panel window + system tray icon + background engine.

  Clutch.exe                 open the app
  Clutch.exe --background    start hidden in the tray (used by "Start with Windows")

Closing the window keeps Clutch running in the tray. Quit from the tray menu.
"""
import json
import os
import sys
import threading
import urllib.request

import clutch as cm


def already_running(port):
    """If another Clutch is running, ask it to show its window and return True."""
    for p in range(port, port + 10):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{p}/api/hello", timeout=0.4) as r:
                if json.loads(r.read().decode()).get("app") == cm.APP_NAME:
                    req = urllib.request.Request(f"http://127.0.0.1:{p}/api/show", data=b"{}", method="POST")
                    urllib.request.urlopen(req, timeout=1).close()
                    return True
        except Exception:
            continue
    return False


def single_instance_lock():
    """Returns False if another copy already holds the lock (Windows named mutex)."""
    if not cm.IS_WINDOWS:
        return True
    import ctypes
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    k32.CreateMutexW.restype = ctypes.c_void_p
    single_instance_lock.handle = k32.CreateMutexW(None, False, "Local\\ClutchControllerApp")
    return ctypes.get_last_error() != 183  # ERROR_ALREADY_EXISTS


def windows_shutting_down():
    if not cm.IS_WINDOWS:
        return False
    try:
        import ctypes
        return bool(ctypes.windll.user32.GetSystemMetrics(0x2000))  # SM_SHUTTINGDOWN
    except Exception:
        return False


def message_box(text, title=cm.APP_NAME):
    if cm.IS_WINDOWS:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, text, title, 0x40)
    else:
        print(text)


def main():
    if "--hidhide-setup" in sys.argv:  # elevated helper started by one-click HidHide setup
        i = sys.argv.index("--hidhide-setup")
        if i + 1 < len(sys.argv):
            cm.hidhide_setup_job(sys.argv[i + 1])
        return
    if "--set-autostart" in sys.argv:  # used by the installer, running as the signed-in user
        try:
            cm.set_autostart(True)
        except OSError:
            pass
        return
    background = "--background" in sys.argv
    cm.set_dpi_aware()
    cfg_path = cm.default_config_path()

    port = 8765
    try:
        port = int((cm.load_config(cfg_path).get("panel") or {}).get("port", 8765))
    except Exception:
        pass
    if not single_instance_lock():
        if not already_running(port):
            message_box("Clutch is already starting. Give it a few seconds, then try again.")
        return

    log_path = os.path.join(cm.DATA_DIR, "clutch.log")

    def log(msg):
        try:
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(msg.rstrip() + "\n")
        except OSError:
            pass
    try:  # keep the log small
        if os.path.getsize(log_path) > 512_000:
            os.remove(log_path)
    except OSError:
        pass

    runner = cm.ModRunner(cfg_path, app_mode=True, log=log)
    if not runner.start_panel(open_browser=False):
        message_box("Clutch couldn't start its control panel (ports 8765-8774 are busy).")
        return
    runner.start()
    overlay = cm.CrosshairOverlay(runner)
    runner.overlay = overlay
    overlay.start()

    import pystray
    import webview
    from PIL import Image

    icon_on = Image.open(cm.resource("assets", "tray_on.png"))
    icon_off = Image.open(cm.resource("assets", "tray_off.png"))
    state = {"quitting": False, "hinted": False, "visible": not background}

    window = webview.create_window(
        cm.APP_NAME, runner.panel.url + "?app=1", width=1380, height=900, min_size=(980, 660),
        hidden=background, background_color="#121a33", text_select=True)

    def show(*_):
        state["visible"] = True
        try:
            window.show()
            window.restore()
        except Exception:
            pass

    def on_closing():
        if state["quitting"] or windows_shutting_down():
            state["quitting"] = True   # never block Windows from shutting down or signing out
            overlay.stop()
            runner.stop()
            try:
                tray.stop()
            except Exception:
                pass
            return True
        window.hide()
        state["visible"] = False
        if not state["hinted"]:
            state["hinted"] = True
            try:
                tray.notify("Clutch is still running here. Right-click this icon to quit.", cm.APP_NAME)
            except Exception:
                pass
        return False

    def quit_app(*_):
        state["quitting"] = True
        overlay.stop()
        runner.stop()
        try:
            tray.stop()
        except Exception:
            pass
        try:
            window.destroy()
        except Exception:
            pass

    runner.on_quit = lambda: threading.Thread(target=quit_app, daemon=True).start()  # used after starting an update

    def toggle_mods(*_):
        runner.set_enabled(not runner.engine.enabled)

    def toggle_cross(*_):
        runner.toggle_crosshair()

    def profile_items():
        for name in list(runner.engine.profile_names):
            p = runner.engine.cfg["profiles"].get(name) or {}
            label = f"{p.get('emoji', '')} {name}".strip()
            yield pystray.MenuItem(label, (lambda n: lambda *_: runner.set_profile(n))(name),
                                   checked=(lambda n: lambda item: runner.engine.active == n)(name), radio=True)

    menu = pystray.Menu(
        pystray.MenuItem("Open Clutch", show, default=True),
        pystray.MenuItem("Mods on", toggle_mods, checked=lambda item: runner.engine.enabled),
        pystray.MenuItem("Crosshair", toggle_cross, checked=lambda item: runner.engine.crosshair_on),
        pystray.MenuItem("Profile", pystray.Menu(profile_items)),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quit Clutch", quit_app),
    )
    tray = pystray.Icon("Clutch", icon_on, cm.APP_NAME, menu)

    def on_change():
        eng = runner.engine
        tray.icon = icon_on if eng.enabled else icon_off
        tray.title = f"Clutch - {eng.active}" + ("" if eng.enabled else " (mods off)")
        try:
            tray.update_menu()
        except Exception:
            pass

    def notify(title, msg):
        if not state["visible"]:  # the panel already shows changes when it's open
            tray.notify(msg, title)

    runner.on_show = show
    runner.on_change = on_change
    runner.notify = notify
    window.events.closing += on_closing
    threading.Thread(target=tray.run, name="ClutchTray", daemon=True).start()

    # Let the app's little UI sounds play even when the kids only use the controller (no mouse click first).
    # pywebview passes --disable-features=ElasticOverscroll itself; this variable replaces its list, so keep it.
    os.environ.setdefault("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                          "--autoplay-policy=no-user-gesture-required --disable-features=ElasticOverscroll")
    webview.start(private_mode=False, storage_path=os.path.join(cm.DATA_DIR, "webview"))
    if not state["quitting"]:
        quit_app()


if __name__ == "__main__":
    main()
