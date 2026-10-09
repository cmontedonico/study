import { createAnthropic } from "@ai-sdk/anthropic";
import { claudeCode } from "ai-sdk-provider-claude-code";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { apiModelIds, isModelAlias } from "./models.ts";
import { dataDir } from "./paths.ts";
import { getSetting } from "./settings.ts";

export type Engine = "cli" | "api";

/** Empty working dir so the CLI never picks up CLAUDE.md or files from elsewhere. */
const cliCwd = join(dataDir, "cli-sandbox");
mkdirSync(cliCwd, { recursive: true });

export function resolveModel(engine: Engine, alias: string) {
  const model = isModelAlias(alias) ? alias : "sonnet";
  if (engine === "cli") {
    return claudeCode(model, {
      cwd: cliCwd,
      tools: [], // v1: chat only, no file or shell tools
      maxTurns: 1,
      persistSession: false,
      sdkOptions: { strictMcpConfig: true }, // ignore the user's MCP servers / claude.ai connectors
    });
  }
  const apiKey = getSetting("anthropicApiKey");
  if (!apiKey) throw new Error("Falta la API key de Anthropic (Ajustes).");
  return createAnthropic({ apiKey })(apiModelIds[model]);
}
