import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import { CopyIcon, FileTextIcon, PaperclipIcon, RefreshCcwIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageAction, MessageActions, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { api, engines, models, type Engine, type ModelAlias, type Thread } from "@/lib/api";
import { useHub } from "@/lib/hub";

const accept = "image/*,application/pdf,text/*,.md,.csv,.json";

/** Loads a thread's saved messages, then mounts the live chat for it. */
export function ChatView({ thread }: { thread: Thread }) {
  const [initial, setInitial] = useState<UIMessage[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInitial(null);
    api.messages(thread.id).then((m) => !cancelled && setInitial(m));
    return () => {
      cancelled = true;
    };
  }, [thread.id]);

  return (
    <div className="flex h-dvh min-w-0 flex-1 flex-col">
      <ChatHeader thread={thread} />
      {initial && <Chat key={thread.id} thread={thread} initialMessages={initial} />}
    </div>
  );
}

function ChatHeader({ thread }: { thread: Thread }) {
  const { state, refresh } = useHub();
  const project = state?.projects.find((p) => p.id === thread.projectId);

  async function update(body: { model?: ModelAlias; engine?: Engine }) {
    await api.updateThread(thread.id, body);
    await refresh();
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 pt-[env(safe-area-inset-top)]">
      <SidebarTrigger />
      <div className="min-w-0 flex-1">
        {project && (
          <div className="text-muted-foreground truncate text-xs">
            {project.icon} {project.name}
          </div>
        )}
        <div className="truncate text-sm font-medium">{thread.title}</div>
      </div>
      <Select value={thread.engine} onValueChange={(v) => void update({ engine: v as Engine })}>
        <SelectTrigger size="sm" className="hidden sm:flex">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {engines.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={thread.model} onValueChange={(v) => void update({ model: v as ModelAlias })}>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </header>
  );
}

function Chat({ thread, initialMessages }: { thread: Thread; initialMessages: UIMessage[] }) {
  const { refresh } = useHub();
  const { messages, sendMessage, regenerate, status, stop, error } = useChat({
    id: thread.id,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    onFinish: () => void refresh(), // picks up the auto-generated title
  });

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  async function submit({ text, files }: PromptInputMessage) {
    if (!text.trim() && files.length === 0) return;
    try {
      const uploaded = await Promise.all(files.map((f) => api.upload(f)));
      await sendMessage({ text, files: uploaded });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const lastAssistantId = messages.findLast((m) => m.role === "assistant")?.id;

  return (
    <>
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 ? (
            <ConversationEmptyState title="¿En qué trabajamos hoy?" description="Escribe, o adjunta imágenes, PDFs o textos." />
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  {message.parts.map((part, i) =>
                    part.type === "text" ? (
                      <MessageResponse key={i}>{part.text}</MessageResponse>
                    ) : part.type === "file" ? (
                      <Attachment key={i} part={part} />
                    ) : null,
                  )}
                </MessageContent>
                {message.role === "assistant" && status === "ready" && (
                  <MessageActions>
                    <MessageAction tooltip="Copiar" onClick={() => void navigator.clipboard.writeText(textOf(message))}>
                      <CopyIcon className="size-3.5" />
                    </MessageAction>
                    {message.id === lastAssistantId && (
                      <MessageAction tooltip="Regenerar" onClick={() => void regenerate()}>
                        <RefreshCcwIcon className="size-3.5" />
                      </MessageAction>
                    )}
                  </MessageActions>
                )}
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-3xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <PromptInput onSubmit={submit} accept={accept} multiple globalDrop maxFileSize={25 * 1024 * 1024}>
          <PromptInputHeader>
            <PendingAttachments />
          </PromptInputHeader>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Pregunta lo que quieras…" />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <AttachButton />
            </PromptInputTools>
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  );
}

function textOf(message: UIMessage) {
  return message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

function Attachment({ part }: { part: FileUIPart }) {
  if (part.mediaType.startsWith("image/")) {
    return <img src={part.url} alt={part.filename ?? ""} className="max-h-60 rounded-lg border object-contain" />;
  }
  return (
    <a
      href={part.url}
      target="_blank"
      rel="noreferrer"
      className="bg-background flex w-fit items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
    >
      <FileTextIcon className="size-4" />
      {part.filename}
    </a>
  );
}

function AttachButton() {
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputButton onClick={() => attachments.openFileDialog()} aria-label="Adjuntar archivos">
      <PaperclipIcon className="size-4" />
    </PromptInputButton>
  );
}

function PendingAttachments() {
  const { files, remove } = usePromptInputAttachments();
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 p-2">
      {files.map((file) => (
        <div key={file.id} className="bg-muted flex items-center gap-1.5 rounded-md py-1 pr-1 pl-2 text-xs">
          {file.mediaType.startsWith("image/") ? (
            <img src={file.url} alt="" className="size-5 rounded object-cover" />
          ) : (
            <FileTextIcon className="size-4" />
          )}
          <span className="max-w-40 truncate">{file.filename}</span>
          <button type="button" onClick={() => remove(file.id)} className="hover:bg-background rounded p-0.5">
            <XIcon className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
