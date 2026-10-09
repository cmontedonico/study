import { Hono } from "hono";
import { chatRoutes } from "./chat.ts";
import { fileRoutes } from "./files.ts";
import { projectRoutes } from "./projects.ts";
import { settingsRoutes } from "./settings.ts";
import { stateRoutes } from "./state.ts";
import { threadRoutes } from "./threads.ts";

// One module per resource; new features add a module and a single line here.
export const api = new Hono()
  .onError((err, c) => c.json({ error: err.message }, 400))
  .route("/", stateRoutes)
  .route("/projects", projectRoutes)
  .route("/threads", threadRoutes)
  .route("/chat", chatRoutes)
  .route("/files", fileRoutes)
  .route("/settings", settingsRoutes);
