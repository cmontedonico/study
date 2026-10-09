import { Hono } from "hono";
import { sqlite } from "../db.ts";

export const searchRoutes = new Hono();

/** Quotes each word and adds a prefix `*`, so user input can never be parsed as FTS5 syntax. */
export function toMatchQuery(input: string): string | null {
  const terms = input.match(/[\p{L}\p{N}_]+/gu);
  if (!terms?.length) return null;
  return terms.map((t) => `"${t}"*`).join(" ");
}

const searchStmt = sqlite.prepare(`
  SELECT f.thread_id AS threadId, t.title AS title, t.project_id AS projectId,
         snippet(message_fts, 2, '<mark>', '</mark>', '…', 12) AS snippet
  FROM message_fts f JOIN thread t ON t.id = f.thread_id
  WHERE message_fts MATCH ?
  ORDER BY bm25(message_fts)
  LIMIT 300
`);

interface Hit {
  threadId: string;
  title: string;
  projectId: string | null;
  snippet: string;
}

searchRoutes.get("/", (c) => {
  const match = toMatchQuery(c.req.query("q") ?? "");
  if (!match) return c.json([]);
  const seen = new Set<string>();
  const results: Hit[] = [];
  for (const hit of searchStmt.all(match) as Hit[]) {
    if (seen.has(hit.threadId)) continue; // best-ranked row per thread
    seen.add(hit.threadId);
    results.push(hit);
    if (results.length === 30) break;
  }
  return c.json(results);
});
