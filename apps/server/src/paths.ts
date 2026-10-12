import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { migrateLegacyDataDir } from "./migrate.ts";

const appSupport = join(homedir(), "Library", "Application Support");

if (!process.env.HUB_DATA_DIR) {
  // Must run before the DB opens: the app used to be called "Claude Hub".
  migrateLegacyDataDir(join(appSupport, "claude-hub"), join(appSupport, "StudyLab", "data"));
}

const defaultDataDir = join(appSupport, "StudyLab", "data");
export const dataDir = process.env.HUB_DATA_DIR ?? defaultDataDir;

// Safety net: node --test sets NODE_TEST_CONTEXT in test processes; never touch the user's real data there.
if (process.env.NODE_TEST_CONTEXT && dataDir === defaultDataDir) {
  throw new Error("Tests must set HUB_DATA_DIR (see src/test-setup.ts); refusing to use the real data dir.");
}
export const filesDir = join(dataDir, "files");
export const dbPath = join(dataDir, "hub.db");

mkdirSync(filesDir, { recursive: true });
