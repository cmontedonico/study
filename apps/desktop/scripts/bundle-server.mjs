// Bundles apps/server into one ESM file for the packaged app.
// better-sqlite3 (native addon) and the Agent SDK (resolves its per-platform native
// binary relative to its own files) stay external and ship as real node_modules.
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [join(root, "../server/src/index.ts")],
  outfile: join(root, "server-dist/server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external: ["better-sqlite3", "@anthropic-ai/claude-agent-sdk"],
  // Some bundled CJS deps call require() on Node builtins.
  banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  logLevel: "info",
});
