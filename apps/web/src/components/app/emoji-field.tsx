import { useState } from "react";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Button showing the current emoji that opens a searchable picker. Never yields an empty icon. */
export function EmojiField({
  id,
  value,
  fallback,
  onChange,
}: {
  id?: string;
  value: string;
  fallback: string;
  onChange: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        aria-label="Elegir icono"
        className="flex h-9 w-full items-center justify-center rounded-md border bg-transparent text-xl shadow-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
      >
        {value || fallback}
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <EmojiPicker
          onEmojiSelect={(emoji) => {
            onChange(emoji || fallback);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
