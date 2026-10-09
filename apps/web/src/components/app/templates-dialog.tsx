import { Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, type Template, type TemplateInput } from "@/lib/api";
import { useHub } from "@/lib/hub";
import { cn } from "@/lib/utils";

const empty: TemplateInput = { name: "", icon: "✨", description: "", instructions: "" };

/** Browse built-in templates (read-only, duplicable) and create, edit or delete custom ones. */
export function TemplatesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, refresh } = useHub();
  const templates = state?.templates ?? [];
  // `null` = nothing selected, "new" = unsaved draft.
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<TemplateInput>(empty);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = templates.find((t) => t.id === selectedId);
  const readOnly = selected?.builtIn ?? false;

  function select(template: Template) {
    setSelectedId(template.id);
    setDraft({
      name: template.name,
      icon: template.icon,
      description: template.description,
      instructions: template.instructions,
    });
  }

  function startNew() {
    setSelectedId("new");
    setDraft(empty);
  }

  async function run(action: () => Promise<void>) {
    setSaving(true);
    try {
      await action();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const save = () =>
    run(async () => {
      const saved =
        selectedId === "new" ? await api.createTemplate(draft) : await api.updateTemplate(selectedId!, draft);
      await refresh();
      select(saved);
      toast.success("Plantilla guardada");
    });

  const duplicate = () =>
    run(async () => {
      if (!selected) return;
      const copy = await api.createTemplate({ ...draft, name: `${selected.name} (copia)` });
      await refresh();
      select(copy);
      toast.success("Plantilla duplicada");
    });

  const remove = () =>
    run(async () => {
      if (!selected) return;
      await api.deleteTemplate(selected.id);
      setConfirmDelete(false);
      setSelectedId(null);
      await refresh();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Plantillas</DialogTitle>
          <DialogDescription>
            Las plantillas definen las instrucciones iniciales de un proyecto nuevo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
          <div className="grid content-start gap-1">
            <Button type="button" variant="outline" size="sm" className="mb-1" onClick={startNew}>
              <Plus /> Nueva plantilla
            </Button>
            <div className="grid max-h-[50vh] gap-1 overflow-y-auto">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => select(t)}
                  className={cn(
                    "hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    selectedId === t.id && "bg-accent",
                  )}
                >
                  <span>{t.icon}</span>
                  <span className="flex-1 truncate">{t.name}</span>
                  {t.builtIn && <span className="text-muted-foreground text-[0.65rem] uppercase">Integrada</span>}
                </button>
              ))}
            </div>
          </div>

          {selectedId === null ? (
            <p className="text-muted-foreground self-center text-center text-sm">
              Selecciona una plantilla o crea una nueva.
            </p>
          ) : (
            <form
              className="grid content-start gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!readOnly) void save();
              }}
            >
              {readOnly && (
                <p className="text-muted-foreground text-xs">
                  Las plantillas integradas son de solo lectura. Duplícala para personalizarla.
                </p>
              )}
              <div className="flex gap-3">
                <div className="grid w-16 gap-2">
                  <Label htmlFor="tpl-icon">Icono</Label>
                  <Input
                    id="tpl-icon"
                    value={draft.icon}
                    disabled={readOnly}
                    className="text-center"
                    onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                  />
                </div>
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="tpl-name">Nombre</Label>
                  <Input
                    id="tpl-name"
                    required
                    disabled={readOnly}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tpl-description">Descripción</Label>
                <Input
                  id="tpl-description"
                  disabled={readOnly}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tpl-instructions">Instrucciones</Label>
                <Textarea
                  id="tpl-instructions"
                  rows={10}
                  disabled={readOnly}
                  className="max-h-[40vh] font-mono text-sm"
                  value={draft.instructions}
                  onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {selected && !readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive mr-auto"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 /> Borrar
                  </Button>
                )}
                {selected && (
                  <Button type="button" variant="outline" disabled={saving} onClick={() => void duplicate()}>
                    <Copy /> Duplicar
                  </Button>
                )}
                {!readOnly && (
                  <Button type="submit" disabled={saving || !draft.name.trim()}>
                    {selectedId === "new" ? "Crear plantilla" : "Guardar"}
                  </Button>
                )}
              </div>
            </form>
          )}
        </div>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Borrar “{selected?.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                Los proyectos ya creados con esta plantilla no se verán afectados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => void remove()}>Borrar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
