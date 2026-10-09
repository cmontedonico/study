import { WifiOffIcon } from "lucide-react";
import { useHub } from "@/lib/hub";

/** Shown while `/api/state` fails: offline iPad, Mac asleep, Tailscale off or an invalid token. */
export function ConnectionBanner() {
  const { connectionError } = useHub();
  if (!connectionError) return null;
  const unauthorized = connectionError.startsWith("No autorizado");
  return (
    <div
      role="alert"
      className="bg-destructive text-primary-foreground fixed top-[max(0.5rem,env(safe-area-inset-top))] left-1/2 z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm shadow-lg"
    >
      <WifiOffIcon className="size-4 shrink-0" />
      <span className="truncate">
        {unauthorized
          ? "Sin acceso: abre el enlace con token desde Ajustes → Conectar dispositivo."
          : "Servidor no disponible. Reintentando…"}
      </span>
    </div>
  );
}
