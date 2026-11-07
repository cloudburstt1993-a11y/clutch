# Clutch phone app

Sets up a Clutch console box from a phone over Bluetooth: profiles, power-ups, game packs, a live
controller test, and parent controls. It has a built-in demo box, so it works before the hardware exists.

- Power-ups and game packs come from the PC app's `panel.html` at build time (`tools/extract.mjs`), so
  the phone and PC always match. Anything that needs a keyboard, mouse, the crosshair overlay or gyro is
  left out automatically.
- How the app and box talk: [PROTOCOL.md](PROTOCOL.md). The demo box (`src/demobox.js`) is the reference
  for the box side.
- Bluetooth goes through `@capacitor-community/bluetooth-le`, which uses Web Bluetooth in a browser,
  so the same code runs as the Android app and as a web page in Chrome.

## Build

```
cd mobile
npm ci
npm run build          # makes www/ complete (catalog, Bluetooth bundle, fonts, icon)
npx cap sync android   # copies www/ into the Android project
cd android && ./gradlew assembleDebug
```

Try it in a browser: serve `www/` (for example `python -m http.server` inside `www`) and open it in Chrome.

## Releases

GitHub Actions (`.github/workflows/mobile.yml`) builds on every push that touches `mobile/` or `panel.html`:
- **Android test app:** `Clutch-Android.apk` on the `android-test` pre-release. Test builds are signed
  with `android/clutch-test.keystore` (on purpose, so each build installs over the last). The Play Store
  version must use a private key.
- **Web version:** GitHub Pages, once Pages is set to "GitHub Actions" in the repo settings.

iPhone: the same code builds for iOS with `npx cap add ios` on a Mac; installing on iPhones needs an Apple
developer account.
