// Copies the Spanish emoji dataset into public/emojibase so the picker works offline:
// frimousse fetches from a CDN by default, which fails on the desktop app without network.
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.dirname(createRequire(import.meta.url).resolve("emojibase-data/package.json"));
const out = path.resolve(import.meta.dirname, "../public/emojibase");
for (const locale of ["es"]) {
  mkdirSync(path.join(out, locale), { recursive: true });
  for (const file of ["data.json", "messages.json"]) {
    cpSync(path.join(root, locale, file), path.join(out, locale, file));
  }
}
