import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, engines, models, type Engine, type ModelAlias } from "@/lib/api";
import { useHub } from "@/lib/hub";
import { ConnectDevice } from "./connect-device";

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, refresh } = useHub();
  const settings = state?.settings;
  const [engine, setEngine] = useState<Engine>("cli");
  const [model, setModel] = useState<ModelAlias>("sonnet");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (!open || !settings) return;
    setEngine(settings.defaultEngine);
    setModel(settings.defaultModel);
    setApiKey("");
  }, [open, settings]);

  async function save() {
    await api.updateSettings({
      defaultEngine: engine,
      defaultModel: model,
      ...(apiKey ? { anthropicApiKey: apiKey.trim() } : {}),
    });
    await refresh();
    toast.success("Ajustes guardados");
    onOpenChange(false);
  }

  async function removeKey() {
    await api.updateSettings({ anthropicApiKey: null });
    await refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajustes</DialogTitle>
          <DialogDescription>Valores por defecto para los chats nuevos.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Motor</Label>
              <Select value={engine} onValueChange={(v) => setEngine(v as Engine)}>
                <SelectTrigger className="w-full">
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
            </div>
            <div className="grid gap-2">
              <Label>Modelo</Label>
              <Select value={model} onValueChange={(v) => setModel(v as ModelAlias)}>
                <SelectTrigger className="w-full">
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
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="api-key">API key de Anthropic</Label>
            <div className="flex gap-2">
              <Input
                id="api-key"
                type="password"
                placeholder={settings?.hasApiKey ? "•••••••• (guardada)" : "sk-ant-…"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              {settings?.hasApiKey && (
                <Button variant="outline" onClick={() => void removeKey()}>
                  Quitar
                </Button>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              Solo necesaria para el motor "API key". El motor CLI usa tu sesión de <code>claude</code>.
            </p>
          </div>

          <ConnectDevice />
        </div>

        <DialogFooter>
          <Button onClick={() => void save()}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
