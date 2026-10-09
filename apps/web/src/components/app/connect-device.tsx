import { CopyIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api, type AccessInfo } from "@/lib/api";
import { cn } from "@/lib/utils";

const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);

/** URLs with the access token + QR so an iPad/iPhone can connect. Only rendered on the Mac itself. */
export function ConnectDevice() {
  const [info, setInfo] = useState<AccessInfo | null>(null);
  const [selected, setSelected] = useState(0);
  const [qr, setQr] = useState<string | null>(null);

  const load = useCallback(async (regenerate = false) => {
    try {
      setInfo(await (regenerate ? api.regenerateAccessToken() : api.access()));
      setSelected(0);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (isLocalhost) void load();
  }, [load]);

  const url = info?.urls[selected]?.url;
  useEffect(() => {
    if (!url) return setQr(null);
    let cancelled = false;
    // Lazy: the QR encoder is only needed when this section is opened.
    void import("qrcode").then(async ({ default: QRCode }) => {
      const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 192 });
      if (!cancelled) setQr(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!isLocalhost) return null;

  async function regenerate() {
    if (!window.confirm("Los dispositivos conectados tendrán que volver a conectarse con el nuevo enlace. ¿Continuar?")) {
      return;
    }
    await load(true);
    toast.success("Token regenerado");
  }

  return (
    <div className="grid gap-2 border-t pt-4">
      <Label>Conectar dispositivo</Label>
      <p className="text-muted-foreground text-xs">
        Abre uno de estos enlaces en tu iPad o iPhone (o escanea el QR). Guarda el acceso con un token; no lo compartas.
      </p>
      {info && info.urls.length === 0 && (
        <p className="text-muted-foreground text-xs">No se encontró ninguna red. Conecta el Mac a Wi-Fi o Tailscale.</p>
      )}
      <div className="flex items-start gap-3">
        {qr && <img src={qr} alt="QR de conexión" className="size-32 shrink-0 rounded-md border bg-white p-1" />}
        <ul className="grid min-w-0 flex-1 gap-1.5">
          {info?.urls.map((u, i) => (
            <li key={u.url}>
              <button
                type="button"
                onClick={() => setSelected(i)}
                className={cn(
                  "w-full rounded-md border px-2 py-1.5 text-left text-xs",
                  i === selected ? "border-primary" : "hover:bg-muted",
                )}
              >
                <div className="font-medium">{u.label}</div>
                <div className="text-muted-foreground truncate">{u.url.replace(/\?token=.*/, "?token=••••")}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!url}
          onClick={() => {
            if (url) void navigator.clipboard.writeText(url).then(() => toast.success("Enlace copiado"));
          }}
        >
          <CopyIcon /> Copiar enlace
        </Button>
        <Button variant="outline" size="sm" onClick={() => void regenerate()}>
          <RefreshCwIcon /> Regenerar token
        </Button>
      </div>
    </div>
  );
}
