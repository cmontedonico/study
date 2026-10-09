import type { FileUIPart, UIMessage } from "ai";

export type Engine = "cli" | "api";
export type ModelAlias = "opus" | "sonnet" | "haiku";

export interface Project {
  id: string;
  name: string;
  icon: string;
  instructions: string;
  templateId: string | null;
}

export interface Thread {
  id: string;
  projectId: string | null;
  title: string;
  model: ModelAlias;
  engine: Engine;
  parentThreadId: string | null;
  updatedAt: number;
}

export interface SearchResult {
  threadId: string;
  title: string;
  projectId: string | null;
  /** Plain text with `<mark>…</mark>` around matches. */
  snippet: string;
}

export interface Template {
  id: string;
  name: string;
  icon: string;
  description: string;
  instructions: string;
  builtIn: boolean;
}

export interface Settings {
  defaultEngine: Engine;
  defaultModel: ModelAlias;
  hasApiKey: boolean;
}

export interface HubState {
  projects: Project[];
  threads: Thread[];
  templates: Template[];
  settings: Settings;
}

export const models: { id: ModelAlias; label: string }[] = [
  { id: "opus", label: "Opus" },
  { id: "sonnet", label: "Sonnet" },
  { id: "haiku", label: "Haiku" },
];

export const engines: { id: Engine; label: string }[] = [
  { id: "cli", label: "CLI (suscripción)" },
  { id: "api", label: "API key" },
];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body instanceof FormData ? undefined : { "content-type": "application/json" },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const api = {
  state: () => request<HubState>("/state"),

  createProject: (body: { name: string; templateId?: string }) =>
    request<Project>("/projects", json("POST", body)),
  updateProject: (id: string, body: Partial<Pick<Project, "name" | "icon" | "instructions">>) =>
    request<Project>(`/projects/${id}`, json("PATCH", body)),
  deleteProject: (id: string) => request(`/projects/${id}`, { method: "DELETE" }),

  createThread: (body: { projectId?: string | null }) => request<Thread>("/threads", json("POST", body)),
  updateThread: (id: string, body: Partial<Pick<Thread, "title" | "model" | "engine" | "projectId">>) =>
    request<Thread>(`/threads/${id}`, json("PATCH", body)),
  deleteThread: (id: string) => request(`/threads/${id}`, { method: "DELETE" }),
  forkThread: (id: string, messageId: string) =>
    request<Thread>(`/threads/${id}/fork`, json("POST", { messageId })),
  messages: (threadId: string) => request<UIMessage[]>(`/threads/${threadId}/messages`),

  search: (q: string, signal?: AbortSignal) =>
    request<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`, { signal }),

  updateSettings: (body: Partial<Omit<Settings, "hasApiKey"> & { anthropicApiKey: string | null }>) =>
    request<Settings>("/settings", json("PUT", body)),

  /** Uploads a file picked in the prompt input and returns a part that references it. */
  async upload(part: FileUIPart, projectId?: string): Promise<FileUIPart> {
    const blob = await (await fetch(part.url)).blob();
    const form = new FormData();
    form.append("file", new File([blob], part.filename ?? "archivo", { type: part.mediaType }));
    if (projectId) form.append("projectId", projectId);
    const saved = await request<{ url: string; name: string; mediaType: string }>("/files", {
      method: "POST",
      body: form,
    });
    return { type: "file", url: saved.url, filename: saved.name, mediaType: saved.mediaType };
  },
};
