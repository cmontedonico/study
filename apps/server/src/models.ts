export const modelAliases = ["opus", "sonnet", "haiku", "fable"] as const;
export type ModelAlias = (typeof modelAliases)[number];

/**
 * Effort levels offered in the UI. The Claude Code CLI (`--effort`) and the SDK `EffortLevel` also accept
 * "max", which we leave out on purpose: it is not available on every model.
 */
export const effortLevels = ["low", "medium", "high", "xhigh"] as const;
export type EffortLevel = (typeof effortLevels)[number];

/**
 * Mirrors what the bundled CLI reports via the Agent SDK `query().supportedModels()`
 * (@anthropic-ai/claude-agent-sdk 0.3.x): Opus, Sonnet and Fable support every effort level; the Haiku
 * alias reports no effort support (the CLI does not reject `--effort` on claude-haiku-5-5, but nothing confirms it applies, so it stays off). Kept as a constant because that query spawns a CLI process.
 */
export const modelEfforts: Record<ModelAlias, readonly EffortLevel[]> = {
  opus: effortLevels,
  sonnet: effortLevels,
  fable: effortLevels,
  haiku: [],
};

/** Concrete IDs for the API engine. */
export const apiModelIds: Record<ModelAlias, string> = {
  opus: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
  haiku: "claude-haiku-5-5",
  fable: "claude-fable-5-1",
};

/**
 * What `--model` receives on the CLI engine. Explicit ids, same as the API engine, so the label, the pricing
 * and the model that actually runs always match (the CLI accepts these ids; its aliases are only a moving target).
 */
export const cliModelIds: Record<ModelAlias, string> = apiModelIds;

export function isModelAlias(value: string): value is ModelAlias {
  return (modelAliases as readonly string[]).includes(value);
}

export function isEffortLevel(value: string): value is EffortLevel {
  return (effortLevels as readonly string[]).includes(value);
}

/** The effort to send for this model: null/unsupported means "model default" (nothing is sent). */
export function effectiveEffort(alias: ModelAlias, effort: string | null | undefined): EffortLevel | undefined {
  if (!effort || !isEffortLevel(effort)) return undefined;
  return modelEfforts[alias].includes(effort) ? effort : undefined;
}
