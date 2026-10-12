import { EmojiPicker as Frimousse } from "frimousse";
import { cn } from "@/lib/utils";

// Served from public/emojibase (see scripts/copy-emojibase.mjs) so it works offline and over Tailscale.
const EMOJIBASE_URL = "/emojibase";
// The UI is Spanish-only, so the picker is too (labels, categories and search keywords).
const locale = "es";

export function EmojiPicker({
  className,
  onEmojiSelect,
}: {
  className?: string;
  onEmojiSelect: (emoji: string) => void;
}) {
  return (
    <Frimousse.Root
      locale={locale}
      emojibaseUrl={EMOJIBASE_URL}
      columns={8}
      onEmojiSelect={({ emoji }) => onEmojiSelect(emoji)}
      className={cn("isolate flex h-80 w-full flex-col", className)}
    >
      <Frimousse.Search
        autoFocus
        placeholder="Buscar emoji…"
        className="mx-2 mt-2 rounded-md bg-muted px-3 py-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Frimousse.Viewport className="relative flex-1 outline-hidden">
        <Frimousse.Loading className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Cargando…
        </Frimousse.Loading>
        <Frimousse.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Sin resultados
        </Frimousse.Empty>
        <Frimousse.List
          className="pb-2 select-none"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div className="bg-popover px-3 pt-3 pb-1.5 text-xs font-medium text-muted-foreground" {...props}>
                {category.label}
              </div>
            ),
            Row: ({ children, ...props }) => (
              <div className="scroll-my-1.5 px-1.5" {...props}>
                {children}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button className="flex size-9 items-center justify-center rounded-md text-xl data-[active]:bg-accent" {...props}>
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </Frimousse.Viewport>
    </Frimousse.Root>
  );
}
