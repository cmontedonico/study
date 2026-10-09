import { eq } from "drizzle-orm";
import { db, schema } from "./db.ts";

export type SettingKey = "anthropicApiKey" | "defaultEngine" | "defaultModel" | "accessToken";

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

export function publicSettings() {
  return {
    defaultEngine: (getSetting("defaultEngine") ?? "cli") as "cli" | "api",
    defaultModel: getSetting("defaultModel") ?? "sonnet",
    hasApiKey: Boolean(getSetting("anthropicApiKey")),
  };
}
