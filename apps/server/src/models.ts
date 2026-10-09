export const modelAliases = ["opus", "sonnet", "haiku"] as const;
export type ModelAlias = (typeof modelAliases)[number];

/** Concrete IDs for the API engine. The CLI engine resolves aliases itself. */
export const apiModelIds: Record<ModelAlias, string> = {
  opus: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
  haiku: "claude-haiku-5-5",
};

export function isModelAlias(value: string): value is ModelAlias {
  return (modelAliases as readonly string[]).includes(value);
}
