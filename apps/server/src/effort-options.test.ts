import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.HUB_DATA_DIR = mkdtempSync(join(tmpdir(), "hub-effort-test-"));
const { effortProviderOptions } = await import("./model.ts");

test("API engine maps effort to the Anthropic provider option", () => {
  assert.deepEqual(effortProviderOptions("api", "sonnet", "high"), { anthropic: { effort: "high" } });
  assert.equal(effortProviderOptions("api", "haiku", "high"), undefined);
  assert.equal(effortProviderOptions("api", "opus", null), undefined);
  assert.equal(effortProviderOptions("cli", "opus", "high"), undefined);
});
