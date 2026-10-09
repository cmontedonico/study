// Renders public/icon*.svg to the PNG icons referenced by the manifest. Not part of the build:
// run it only when the artwork changes (`node scripts/generate-icons.mjs`, needs Playwright installed).
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const pub = new URL("../public/", import.meta.url);
const jobs = [
  ["icon.svg", "icon-192.png", 192],
  ["icon.svg", "icon-512.png", 512],
  ["icon-maskable.svg", "icon-maskable-512.png", 512],
  ["icon-maskable.svg", "apple-touch-icon.png", 180], // iOS rounds the corners itself
];

const browser = await chromium.launch();
for (const [src, out, size] of jobs) {
  const svg = await readFile(new URL(src, pub), "utf8");
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await writeFile(new URL(out, pub), await page.screenshot({ omitBackground: true }));
  await page.close();
}
await browser.close();
