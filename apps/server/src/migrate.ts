import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";

/** Moves the data dir of the app's former name (Claude Hub) to its new location. Returns true if moved. */
export function migrateLegacyDataDir(oldDir: string, newDir: string): boolean {
  if (existsSync(newDir) || !existsSync(oldDir)) return false;
  mkdirSync(dirname(newDir), { recursive: true });
  renameSync(oldDir, newDir);
  console.log(`StudyLab: datos migrados de ${oldDir} a ${newDir}`);
  return true;
}
