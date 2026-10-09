// Bundles apps/server into one ESM file for the packaged app.
// better-sqlite3 (native addon) and the Agent SDK (resolves its per-platform native
// binary relative to its own files) stay external and ship as real node_modules.
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// The bundled server must run against the same Agent SDK the provider was written for.
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const desktopPkg = readJson(join(root, "package.json"));
const providerPkg = readJson(
  createRequire(join(root, "../server/package.json")).resolve("ai-sdk-provider-claude-code/package.json"),
);
const wanted = providerPkg.dependencies?.["@anthropic-ai/claude-agent-sdk"];
const pinned = {
  "@anthropic-ai/claude-agent-sdk": desktopPkg.dependencies?.["@anthropic-ai/claude-agent-sdk"],
  "@anthropic-ai/claude-agent-sdk-darwin-arm64":
    desktopPkg.optionalDependencies?.["@anthropic-ai/claude-agent-sdk-darwin-arm64"],
};
const drift = Object.entries(pinned).filter(([, v]) => v !== wanted);
if (drift.length > 0) {
  console.error(
    `ai-sdk-provider-claude-code ${providerPkg.version} depends on @anthropic-ai/claude-agent-sdk ${wanted}, but apps/desktop pins:\n` +
      drift.map(([name, v]) => `  ${name}: ${v ?? "(missing)"}`).join("\n") +
      `\nPin both to exactly ${wanted} in apps/desktop/package.json and run pnpm install.`,
  );
  process.exit(1);
}

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
