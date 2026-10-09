import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { api } from "./routes/index.ts";

const port = Number(process.env.PORT ?? 4317);
const host = process.env.HOST ?? "0.0.0.0"; // reachable from iPad/iPhone over Tailscale/LAN
// HUB_WEB_DIST lets the packaged desktop app point at the web build bundled in its resources.
const webDist = process.env.HUB_WEB_DIST ?? join(dirname(fileURLToPath(import.meta.url)), "../../web/dist");

const app = new Hono();
app.use("/api/*", logger());
app.route("/api", api);

if (existsSync(webDist)) {
  const root = relative(process.cwd(), webDist);
  app.use("/*", serveStatic({ root }));
  app.get("*", serveStatic({ root, path: "index.html" })); // SPA fallback
}

serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(`Claude Hub server → http://localhost:${info.port}`);
});
