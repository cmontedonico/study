import { Hono } from "hono";
import { z } from "zod";
import { publicSettings, setSetting } from "../settings.ts";
import { effort, engine, model } from "./validators.ts";

export const settingsRoutes = new Hono();

settingsRoutes.put("/", async (c) => {
  const body = z
    .object({ anthropicApiKey: z.string().nullable(), defaultEngine: engine, defaultModel: model,
      defaultEffort: effort.nullable(),
    })
    .partial()
    .parse(await c.req.json());
  for (const [key, value] of Object.entries(body)) {
    setSetting(key as Parameters<typeof setSetting>[0], value ?? null);
  }
  return c.json(publicSettings());
});
