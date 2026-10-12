import assert from "node:assert/strict";
import { test } from "node:test";
import { apiModelIds, cliModelIds, effectiveEffort, isModelAlias, modelAliases } from "./models.ts";

test("isModelAlias accepts known aliases only", () => {
  assert.equal(isModelAlias("sonnet"), true);
  assert.equal(isModelAlias("gpt-5"), false);
});

test("effectiveEffort drops unsupported or unknown efforts", () => {
  assert.equal(effectiveEffort("sonnet", "high"), "high");
  assert.equal(effectiveEffort("fable", "xhigh"), "xhigh");
  assert.equal(effectiveEffort("haiku", "low"), undefined);
  assert.equal(effectiveEffort("opus", null), undefined);
  assert.equal(effectiveEffort("opus", "max"), undefined);
});

test("every alias has CLI and API ids, Fable is pinned to 5.1", () => {
  for (const alias of modelAliases) {
    assert.ok(cliModelIds[alias] && apiModelIds[alias]);
  }
  assert.equal(apiModelIds.fable, "claude-fable-5-1");
  assert.equal(cliModelIds.fable, "claude-fable-5-1");
  assert.equal(cliModelIds.haiku, "claude-haiku-5-5");
});
