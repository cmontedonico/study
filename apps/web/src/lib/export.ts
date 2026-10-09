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

/** Downloads text as a .md file, stripping characters that filesystems reject from the name. */
export function downloadMarkdown(title: string, content: string) {
  // eslint-disable-next-line no-control-regex
  const name = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim() || "chat";
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
