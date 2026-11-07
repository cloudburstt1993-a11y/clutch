// Copies fonts and the Clutch icon into www/ (they come from npm and the PC app's assets).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const www = path.join(root, "www");
fs.mkdirSync(path.join(www, "fonts"), { recursive: true });
const f = (pkg, file, out) => fs.copyFileSync(path.join(root, "node_modules", "@fontsource", pkg, "files", file), path.join(www, "fonts", out));
f("barlow-condensed", "barlow-condensed-latin-800-normal.woff2", "bc-800.woff2");
f("barlow-condensed", "barlow-condensed-latin-900-normal.woff2", "bc-900.woff2");
for (const w of [500, 600, 700]) f("barlow", `barlow-latin-${w}-normal.woff2`, `b-${w}.woff2`);
fs.copyFileSync(path.join(root, "..", "assets", "clutch.png"), path.join(www, "icon.png"));
fs.writeFileSync(path.join(www, "manifest.webmanifest"), JSON.stringify({
  name: "Clutch", short_name: "Clutch", start_url: ".", display: "standalone",
  background_color: "#0d1328", theme_color: "#0d1328", icons: [{ src: "icon.png", sizes: "256x256", type: "image/png" }],
}, null, 1));
console.log("assets copied");
