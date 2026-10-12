// Loaded with `node --import` before every test file (each runs in its own process), so no test
// can ever fall back to the real data dir. Tests that set their own HUB_DATA_DIR still override it.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (!process.env.HUB_DATA_DIR) {
  const dir = mkdtempSync(join(tmpdir(), "hub-test-"));
  process.env.HUB_DATA_DIR = dir;
  process.on("exit", () => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });
}
