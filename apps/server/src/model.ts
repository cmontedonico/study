import { createAnthropic } from "@ai-sdk/anthropic";
import { claudeCode } from "ai-sdk-provider-claude-code";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { apiModelIds, cliModelIds, effectiveEffort, isModelAlias, type ModelAlias } from "./models.ts";
import { dataDir } from "./paths.ts";
import { getSetting } from "./settings.ts";

export type Engine = "cli" | "api";

/** Empty working dir so the CLI never picks up CLAUDE.md or files from elsewhere. */
const cliCwd = join(dataDir, "cli-sandbox");
mkdirSync(cliCwd, { recursive: true });

export function resolveModel(engine: Engine, alias: string, effort?: string | null) {
  const model: ModelAlias = isModelAlias(alias) ? alias : "sonnet";
  const level = effectiveEffort(model, effort);
  if (process.env.HUB_DEBUG) {
    console.log(`[model] engine=${engine} model=${model} effort=${level ?? "default"}`);
  }
  if (engine === "cli") {
    return claudeCode(cliModelIds[model], {
      cwd: cliCwd,
      tools: [], // v1: chat only, no file or shell tools
      maxTurns: 1,
      persistSession: false,
      ...(level ? { effort: level } : {}),
      sdkOptions: { strictMcpConfig: true }, // ignore the user's MCP servers / claude.ai connectors
    });
  }
  const apiKey = getSetting("anthropicApiKey");
  if (!apiKey) throw new Error("Falta la API key de Anthropic (Ajustes).");
  return createAnthropic({ apiKey })(apiModelIds[model]);
}

/** API engine only: the CLI engine already got the effort as a provider setting in `resolveModel`. */
export function effortProviderOptions(engine: Engine, alias: string, effort?: string | null) {
  const level = isModelAlias(alias) ? effectiveEffort(alias, effort) : undefined;
  return engine === "api" && level ? { anthropic: { effort: level } } : undefined;
}
