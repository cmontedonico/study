import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { migrateLegacyDataDir } from "./migrate.ts";

const appSupport = join(homedir(), "Library", "Application Support");

if (!process.env.HUB_DATA_DIR) {
  // Must run before the DB opens: the app used to be called "Claude Hub".
  migrateLegacyDataDir(join(appSupport, "claude-hub"), join(appSupport, "StudyLab", "data"));
}

export const dataDir = process.env.HUB_DATA_DIR ?? join(appSupport, "StudyLab", "data");
export const filesDir = join(dataDir, "files");
export const dbPath = join(dataDir, "hub.db");

mkdirSync(filesDir, { recursive: true });
