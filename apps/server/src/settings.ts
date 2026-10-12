import { eq } from "drizzle-orm";
import { db, schema } from "./db.ts";
import type { EffortLevel } from "./models.ts";

export type SettingKey =
  | "anthropicApiKey"
  | "defaultEngine"
  | "defaultModel"
  | "defaultEffort"
  | "accessToken"
  | "notionTokens"
  | "notionClient"
  | "notionPending"
  | "notionAccount"
  | "notionExportParent";

export function getSetting(key: SettingKey): string | undefined {
  return db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()?.value;
}

export function setSetting(key: SettingKey, value: string | null) {
  if (value === null || value === "") {
    db.delete(schema.settings).where(eq(schema.settings.key, key)).run();
    return;
  }
  db.insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
}

function parseParent(raw: string | undefined): { id: string; title: string } | null {
  try {
    const p = JSON.parse(raw ?? "null") as { id?: unknown; title?: unknown } | null;
    return p && typeof p.id === "string" ? { id: p.id, title: typeof p.title === "string" ? p.title : "" } : null;
  } catch {
    return null;
  }
}

export function publicSettings() {
  return {
    defaultEngine: (getSetting("defaultEngine") ?? "cli") as "cli" | "api",
    defaultModel: getSetting("defaultModel") ?? "sonnet",
    defaultEffort: (getSetting("defaultEffort") as EffortLevel | undefined) ?? null,
    hasApiKey: Boolean(getSetting("anthropicApiKey")),
    notionConnected: Boolean(getSetting("notionTokens")),
    notionExportParent: parseParent(getSetting("notionExportParent")),
  };
}
