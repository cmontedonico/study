import assert from "node:assert/strict";
import { test } from "node:test";
import { isModelAlias } from "./models.ts";

test("isModelAlias accepts known aliases only", () => {
  assert.equal(isModelAlias("sonnet"), true);
  assert.equal(isModelAlias("gpt-5"), false);
});
