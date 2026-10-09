import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const dataDir =
  process.env.HUB_DATA_DIR ?? join(homedir(), "Library", "Application Support", "claude-hub");
export const filesDir = join(dataDir, "files");
export const dbPath = join(dataDir, "hub.db");

mkdirSync(filesDir, { recursive: true });
