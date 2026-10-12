import type { UIMessage } from "ai";

/** Renders a thread as Markdown: title, optional project, then one section per message. */
export function threadToMarkdown(title: string, messages: UIMessage[], projectName?: string): string {
  const lines = [`# ${title}`, ""];
  if (projectName) lines.push(`Proyecto: ${projectName}`, "");
  for (const message of messages) {
    if (message.role === "system") continue;
    lines.push(message.role === "user" ? "## Tú" : "## Claude", "");
    for (const part of message.parts) {
      if (part.type === "text") lines.push(part.text, "");
      else if (part.type === "file") lines.push(`[Adjunto: ${part.filename ?? "archivo"}]`, "");
    }
  }
  return lines.join("\n").trimEnd() + "\n";
}

/** Strips characters that filesystems reject from a file name. */
export const safeFileName = (title: string, fallback: string) =>
  // eslint-disable-next-line no-control-regex
  title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim() || fallback;

/** Downloads text as a file via Blob + anchor (works in Safari and the iPad PWA). */
export function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari/iOS can cancel the download if the URL is revoked immediately.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads text as a .md file. */
export function downloadMarkdown(title: string, content: string) {
  downloadText(`${safeFileName(title, "chat")}.md`, content, "text/markdown");
}
