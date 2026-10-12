import type { FileUIPart, UIMessage } from "ai";
import { toast } from "sonner";

export type Engine = "cli" | "api";
export type ModelAlias = "opus" | "sonnet" | "haiku" | "fable";
export type EffortLevel = "low" | "medium" | "high" | "xhigh";

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
  /** null = the model's own default. */
  effort: EffortLevel | null;
  engine: Engine;
  parentThreadId: string | null;
  /** Last Notion page this chat was exported to. */
  notionUrl: string | null;
  updatedAt: number;
}

export interface ThreadUsage {
  /** Fresh (non-cached) prompt tokens. */
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  messages: number;
  costUsd: number | null;
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
  /** Built-in edited by the user. */
  customized: boolean;
  /** Projects created from this template. */
  projectCount: number;
}

export interface KnowledgeFile {
  id: string;
  name: string;
  mediaType: string;
  size: number;
  createdAt: number;
  /** Length of the extracted text that is injected into the system prompt. */
  chars: number;
}

export type TemplateInput = Pick<Template, "name" | "icon" | "description" | "instructions">;

export interface Settings {
  defaultEngine: Engine;
  defaultModel: ModelAlias;
  defaultEffort: EffortLevel | null;
  hasApiKey: boolean;
  notionConnected: boolean;
  /** Destination page of the last Notion export. */
  notionExportParent: { id: string; title: string } | null;
}

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  path?: string;
}

export type NotionExportMode = "full" | "summary" | "both";

export interface NotionStatus {
  connected: boolean;
  workspace?: string;
  user?: string;
  /** Tool names exposed by Notion's MCP server: they reflect the permissions granted. */
  tools?: string[];
  error?: string;
}

export interface HubState {
  projects: Project[];
  threads: Thread[];
  templates: Template[];
  /** Built-in templates deleted by the user (recoverable). */
  hiddenTemplateCount: number;
  settings: Settings;
}

export interface AccessInfo {
  urls: { kind: "tailscale" | "lan"; label: string; url: string }[];
}

export interface TranscriptionStatus {
  phase: "idle" | "downloading" | "loading" | "ready" | "error";
  /** Model files are already on disk: no download needed. */
  cached: boolean;
  progress: number;
  approxMb: number;
  error?: string;
}

const allEfforts: EffortLevel[] = ["low", "medium", "high", "xhigh"];

/** Mirrors `modelEfforts` in apps/server/src/models.ts (what the CLI reports as supported). */
export const models: { id: ModelAlias; label: string; description: string; efforts: EffortLevel[] }[] = [
  { id: "fable", label: "Fable", description: "Lo más capaz, para tareas difíciles", efforts: allEfforts },
  { id: "opus", label: "Opus", description: "Trabajo complejo y tareas diarias", efforts: allEfforts },
  { id: "sonnet", label: "Sonnet", description: "Eficiente para tareas rutinarias", efforts: allEfforts },
  { id: "haiku", label: "Haiku", description: "Respuestas rápidas (sin esfuerzo)", efforts: [] },
];

export const efforts: { id: EffortLevel; label: string }[] = [
  { id: "low", label: "Bajo" },
  { id: "medium", label: "Medio" },
  { id: "high", label: "Alto" },
  { id: "xhigh", label: "Muy alto" },
];

export const engines: { id: Engine; label: string }[] = [
  { id: "cli", label: "CLI (suscripción)" },
  { id: "api", label: "API key" },
];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.headers ?? (init?.body instanceof FormData ? undefined : { "content-type": "application/json" }),
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

  knowledge: (projectId: string) => request<{ limit: number; files: KnowledgeFile[] }>(`/knowledge?projectId=${projectId}`),
  uploadKnowledge(projectId: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("projectId", projectId);
    return request<KnowledgeFile & { warning?: string }>("/knowledge", { method: "POST", body: form });
  },
  deleteKnowledge: (id: string) => request(`/knowledge/${id}`, { method: "DELETE" }),

  createTemplate: (body: Partial<TemplateInput> & Pick<TemplateInput, "name">) =>
    request<Template>("/templates", json("POST", body)),
  updateTemplate: (id: string, body: Partial<TemplateInput>) =>
    request<Template>(`/templates/${id}`, json("PATCH", body)),
  deleteTemplate: (id: string) => request(`/templates/${id}`, { method: "DELETE" }),
  restoreTemplate: (id: string) => request<Template>(`/templates/${id}/restore`, { method: "POST" }),
  restoreHiddenTemplates: () => request<{ count: number }>("/templates/restore-hidden", { method: "POST" }),
  applyTemplateToProjects: (id: string) =>
    request<{ count: number }>(`/templates/${id}/apply-to-projects`, { method: "POST" }),
  generateTemplate: (prompt: string) =>
    request<TemplateInput>("/templates/generate", json("POST", { prompt })),
  improveTemplate: (instructions: string, note?: string) =>
    request<{ instructions: string }>("/templates/improve", json("POST", { instructions, request: note })),
  importTemplates: (body: { templates: TemplateInput[] } | { markdown: string }) =>
    request<{ count: number; templates: Template[] }>("/templates/import", json("POST", body)),
  /** Plain text of an export endpoint (the server also sends it as an attachment). */
  exportTemplates: async (id?: string) => {
    const res = await fetch(`/api/templates/${id ? `${id}/` : ""}export`);
    if (!res.ok) throw new Error("No se pudo exportar");
    return res.text();
  },
  templateFromProject: (projectId: string) =>
    request<Template>(`/templates/from-project/${projectId}`, { method: "POST" }),

  createThread: (body: { projectId?: string | null }) => request<Thread>("/threads", json("POST", body)),
  updateThread: (id: string, body: Partial<Pick<Thread, "title" | "model" | "effort" | "engine" | "projectId">>) =>
    request<Thread>(`/threads/${id}`, json("PATCH", body)),
  deleteThread: (id: string) => request(`/threads/${id}`, { method: "DELETE" }),
  forkThread: (id: string, messageId: string) =>
    request<Thread>(`/threads/${id}/fork`, json("POST", { messageId })),
  messages: (threadId: string) => request<UIMessage[]>(`/threads/${threadId}/messages`),

  threadUsage: (threadId: string) => request<ThreadUsage>(`/threads/${threadId}/usage`),

  search: (q: string, signal?: AbortSignal) =>
    request<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`, { signal }),

  notionStatus: () => request<NotionStatus>("/notion/status"),
  /** Loopback only: returns the Notion authorization URL to open in a browser. */
  notionConnect: () => request<{ url: string }>("/notion/connect", { method: "POST" }),
  notionDisconnect: () => request<NotionStatus>("/notion/disconnect", { method: "POST" }),
  notionPages: (q: string, signal?: AbortSignal) =>
    request<{ pages: NotionPage[] }>(`/notion/pages?q=${encodeURIComponent(q)}`, { signal }),
  notionExport: (
    threadId: string,
    body: { parentId: string; parentTitle: string; mode: NotionExportMode; title: string },
  ) => request<{ url: string }>(`/notion/export/${threadId}`, json("POST", body)),
  notionTest: () => request<{ ok: boolean; result: string }>("/notion/test", { method: "POST" }),

  updateSettings: (body: Partial<Omit<Settings, "hasApiKey" | "notionConnected" | "notionExportParent"> & { anthropicApiKey: string | null }>) =>
    request<Settings>("/settings", json("PUT", body)),

  /** Loopback only: connection URLs (with token) for other devices. */
  access: () => request<AccessInfo>("/access"),
  regenerateAccessToken: () => request<AccessInfo>("/access/regenerate", { method: "POST" }),

  transcriptionStatus: () => request<TranscriptionStatus>("/transcribe/status"),
  /** Dictation: a 16 kHz mono WAV in, plain text out. */
  transcribe: (wav: Blob, signal?: AbortSignal) =>
    request<{ text: string }>("/transcribe", { method: "POST", body: wav, headers: { "content-type": "audio/wav" }, signal }),
  transcribeLive: (wav: Blob, language: string | undefined, signal?: AbortSignal) =>
    request<{ text: string; language?: string }>(`/transcribe?live=1${language ? `&language=${language}` : ""}`, {
      method: "POST",
      body: wav,
      headers: { "content-type": "audio/wav" },
      signal,
    }),
  warmTranscription: () => request<{ ok: boolean }>("/transcribe/warm", { method: "POST" }),
  fileTranscript: (url: string) => request<{ text: string }>(url.replace(/^\/api/, "") + "/transcript"),

  /** Uploads a file picked in the prompt input and returns a part that references it. */
  async upload(part: FileUIPart, projectId?: string): Promise<FileUIPart> {
    const blob = await (await fetch(part.url)).blob();
    return api.uploadFile(new File([blob], part.filename ?? "archivo", { type: part.mediaType }), projectId);
  },

  async uploadFile(file: File, projectId?: string): Promise<FileUIPart> {
    const form = new FormData();
    form.append("file", file);
    if (projectId) form.append("projectId", projectId);
    const saved = await request<{ url: string; name: string; mediaType: string; warning?: string }>("/files", {
      method: "POST",
      body: form,
    });
    if (saved.warning) toast.warning(`${saved.name}: ${saved.warning}`);
    return { type: "file", url: saved.url, filename: saved.name, mediaType: saved.mediaType };
  },
};
