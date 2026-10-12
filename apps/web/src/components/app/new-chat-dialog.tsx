import { MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useHub } from "@/lib/hub";

/** Show the search box only when the list is long enough to need it. */
const SEARCH_THRESHOLD = 6;

/** "New chat" picker: a clean chat, or one that starts from a template's instructions. */
export function NewChatDialog() {
  const { state, picker, closePicker, newThread } = useHub();
  const [creating, setCreating] = useState(false);
  const templates = state?.templates ?? [];

  async function choose(templateId: string | null) {
    if (creating || !picker) return;
    setCreating(true);
    try {
      await newThread(picker.projectId, templateId);
      closePicker();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={picker !== null} onOpenChange={(open) => !open && closePicker()}>
      <DialogContent className="top-[10%] max-h-[80dvh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>Nuevo chat</DialogTitle>
          <DialogDescription>Empieza en limpio o elige una plantilla.</DialogDescription>
        </DialogHeader>
        <Command className="max-h-[calc(80dvh-5rem)]">
          {templates.length > SEARCH_THRESHOLD && <CommandInput placeholder="Buscar plantilla…" />}
          <CommandList className="max-h-none">
            {/* forceMount keeps the clean option reachable while filtering. */}
            <CommandItem
              forceMount
              value="__clean__"
              disabled={creating}
              onSelect={() => void choose(null)}
              className="mb-1 gap-3 border py-3"
            >
              <MessageSquarePlus className="size-5 shrink-0" />
              <div className="min-w-0">
                <div className="font-medium">Chat en limpio</div>
                <div className="text-muted-foreground text-xs">Sin instrucciones previas</div>
              </div>
            </CommandItem>
            <CommandEmpty>Ninguna plantilla coincide.</CommandEmpty>
            {templates.map((t) => (
              <CommandItem
                key={t.id}
                value={`${t.name} ${t.description}`}
                disabled={creating}
                onSelect={() => void choose(t.id)}
                className="items-start gap-3 py-3"
              >
                <span className="text-xl leading-none" aria-hidden>
                  {t.icon}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.name}</div>
                  {t.description && <div className="text-muted-foreground line-clamp-2 text-xs">{t.description}</div>}
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
