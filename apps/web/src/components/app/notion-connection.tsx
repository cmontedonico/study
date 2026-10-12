import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api, type NotionStatus } from "@/lib/api";

// The OAuth redirect points at localhost, so the flow can only be started from the Mac itself.
const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);

export function NotionConnection() {
  const [status, setStatus] = useState<NotionStatus | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.notionStatus();
      setStatus(s);
      return s;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // After opening Notion in the browser, poll until the callback has stored the tokens.
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > 10 * 60 * 1000) return setWaiting(false);
      void load().then((s) => {
        if (s?.connected) {
          setWaiting(false);
          toast.success("Notion conectado");
        }
      });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [waiting, load]);

  async function connect() {
    setBusy(true);
    try {
      const { url } = await api.notionConnect();
      // Electron sends window.open to the system browser; a plain browser opens a new tab.
      window.open(url, "_blank");
      setWaiting(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("¿Desconectar Notion? Se borrarán los permisos guardados en este equipo.")) return;
    await api.notionDisconnect();
    setTestResult(null);
    setWaiting(false);
    await load();
  }

  async function test() {
    setBusy(true);
    setTestResult(null);
    try {
      const r = await api.notionTest();
      setTestResult(r.result || (r.ok ? "Conexión correcta" : "Notion devolvió un error"));
      await load();
    } catch (e) {
      setTestResult((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const connected = status?.connected ?? false;

  return (
    <div className="grid gap-2 border-t pt-4">
      <Label>Notion</Label>
      {connected ? (
        <>
          <p className="text-xs">
            Conectado{status?.workspace ? ` a ${status.workspace}` : ""}
            {status?.user ? ` (${status.user})` : ""}.
          </p>
          {status?.error && <p className="text-destructive text-xs">{status.error}</p>}
          {status?.tools && (
            <details className="text-muted-foreground text-xs">
              <summary className="cursor-pointer">{status.tools.length} herramientas disponibles</summary>
              <p className="mt-1 break-words">{status.tools.join(", ")}</p>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void test()}>
              Probar conexión
            </Button>
            {isLocalhost && (
              <Button variant="outline" size="sm" onClick={() => void disconnect()}>
                Desconectar
              </Button>
            )}
          </div>
          {testResult && (
            <pre className="bg-muted max-h-40 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap">{testResult}</pre>
          )}
        </>
      ) : isLocalhost ? (
        <>
          <p className="text-muted-foreground text-xs">
            Conecta tu cuenta para exportar a Notion. En la pantalla de Notion eliges a qué páginas puede acceder StudyLab.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void connect()}>
              Conectar con Notion
            </Button>
            {waiting && <span className="text-muted-foreground text-xs">Esperando la autorización en el navegador…</span>}
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-xs">Conéctalo desde la Mac.</p>
      )}
    </div>
  );
}
