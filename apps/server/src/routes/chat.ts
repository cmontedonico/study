import type { UIMessage } from "ai";
import { Hono } from "hono";
import { handleChat } from "../chat.ts";

export const chatRoutes = new Hono();

chatRoutes.post("/", async (c) => {
  const { id, messages } = (await c.req.json()) as { id: string; messages: UIMessage[] };
  return handleChat(id, messages, c.req.raw.signal);
});
