import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { migrateLegacyDataDir } from "./migrate.ts";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "hub-migrate-"));
  return { root, oldDir: join(root, "claude-hub"), newDir: join(root, "StudyLab", "data") };
}

test("moves the old dir to the new location, creating the parent", () => {
  const { root, oldDir, newDir } = setup();
  mkdirSync(oldDir);
  writeFileSync(join(oldDir, "hub.db"), "data");
  assert.equal(migrateLegacyDataDir(oldDir, newDir), true);
  assert.equal(readFileSync(join(newDir, "hub.db"), "utf8"), "data");
  assert.equal(existsSync(oldDir), false);
  rmSync(root, { recursive: true });
});

test("does nothing if the new dir already exists", () => {
  const { root, oldDir, newDir } = setup();
  mkdirSync(oldDir);
  mkdirSync(newDir, { recursive: true });
  assert.equal(migrateLegacyDataDir(oldDir, newDir), false);
  assert.equal(existsSync(oldDir), true);
  rmSync(root, { recursive: true });
});

test("does nothing if there is no old dir", () => {
  const { root, oldDir, newDir } = setup();
  assert.equal(migrateLegacyDataDir(oldDir, newDir), false);
  assert.equal(existsSync(newDir), false);
  rmSync(root, { recursive: true });
});
