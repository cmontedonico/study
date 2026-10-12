import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, efforts, models, type EffortLevel, type ModelAlias, type Thread } from "@/lib/api";
import { useHub } from "@/lib/hub";

/** Model + reasoning effort for the conversation; the next message uses whatever is selected here. */
export function ModelPicker({ thread }: { thread: Thread }) {
  const { refresh } = useHub();
  const model = models.find((m) => m.id === thread.model) ?? models[0]!;
  // An effort the model does not support is ignored by the server: show it as the default.
  const effort = efforts.find((e) => e.id === thread.effort && model.efforts.includes(e.id));

  async function update(body: { model?: ModelAlias; effort?: EffortLevel | null }) {
    try {
      await api.updateThread(thread.id, body);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Keep the menu open so model and effort can be changed in one go.
  const keepOpen = (event: Event) => event.preventDefault();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PromptInputButton aria-label="Modelo y esfuerzo" className="w-auto gap-1 px-2 text-xs">
          <span>
            {model.label}
            {effort ? ` · ${effort.label}` : ""}
          </span>
          <ChevronDownIcon className="size-3" />
        </PromptInputButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        <DropdownMenuLabel>Modelo</DropdownMenuLabel>
        {models.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={(e) => {
              keepOpen(e);
              void update({ model: m.id });
            }}
            className="items-start gap-2"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm">{m.label}</div>
              <div className="text-muted-foreground text-xs">{m.description}</div>
            </div>
            {m.id === model.id && <CheckIcon className="mt-0.5 size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Esfuerzo</DropdownMenuLabel>
        {model.efforts.length === 0 && (
          <div className="text-muted-foreground px-2 py-1.5 text-xs">{model.label} no admite esfuerzo.</div>
        )}
        {model.efforts.length > 0 && (
          <DropdownMenuItem
            onSelect={(e) => {
              keepOpen(e);
              void update({ effort: null });
            }}
          >
            <span className="flex-1">Predeterminado</span>
            {!effort && <CheckIcon className="size-4" />}
          </DropdownMenuItem>
        )}
        {efforts.map((e) => (
          <DropdownMenuItem
            key={e.id}
            disabled={!model.efforts.includes(e.id)}
            onSelect={(ev) => {
              keepOpen(ev);
              void update({ effort: e.id });
            }}
          >
            <span className="flex-1">{e.label}</span>
            {effort?.id === e.id && <CheckIcon className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
