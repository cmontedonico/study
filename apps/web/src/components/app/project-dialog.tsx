import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api, type Project } from "@/lib/api";
import { useHub } from "@/lib/hub";
import { cn } from "@/lib/utils";
import { KnowledgePanel } from "./knowledge-panel";

/** Creates a project from a template, or edits an existing project's name, icon and instructions. */
export function ProjectDialog({ project, onClose }: { project?: Project; onClose: () => void }) {
  const { state, refresh, newThread } = useHub();
  // "En blanco" goes last so the guided templates come first.
  const templates = [...(state?.templates ?? [])].sort(
    (a, b) => Number(a.id === "en-blanco") - Number(b.id === "en-blanco"),
  );
  const [name, setName] = useState(project?.name ?? "");
  const [icon, setIcon] = useState(project?.icon ?? "");
  const [instructions, setInstructions] = useState(project?.instructions ?? "");
  const [templateId, setTemplateId] = useState(templates[0]?.id);
  const [saving, setSaving] = useState(false);

  async function saveAsTemplate() {
    if (!project) return;
    try {
      // Persist pending edits first so the template reflects what is on screen.
      await api.updateProject(project.id, { name, icon: icon || "📁", instructions });
      const template = await api.templateFromProject(project.id);
      await refresh();
      toast.success(`Plantilla “${template.name}” guardada`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      if (project) {
        await api.updateProject(project.id, { name, icon: icon || "📁", instructions });
        await refresh();
      } else {
        const created = await api.createProject({ name, templateId });
        await newThread(created.id);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{project ? "Editar proyecto" : "Nuevo proyecto"}</DialogTitle>
            <DialogDescription>
              {project
                ? "Las instrucciones se aplican a todos los chats de este proyecto."
                : "Elige cómo quieres que Claude te guíe. Podrás editar las instrucciones después."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-3">
            {project && (
              <div className="grid w-16 gap-2">
                <Label htmlFor="icon">Icono</Label>
                <Input id="icon" value={icon} onChange={(e) => setIcon(e.target.value)} className="text-center" />
              </div>
            )}
            <div className="grid flex-1 gap-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                autoFocus
                required
                placeholder="Ej. Aprender finanzas"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          {project ? (
            <Tabs defaultValue="instructions">
              <TabsList>
                <TabsTrigger value="instructions">Instrucciones</TabsTrigger>
                <TabsTrigger value="knowledge">Conocimiento</TabsTrigger>
              </TabsList>
              <TabsContent value="instructions" className="grid gap-2 pt-2">
                <Label htmlFor="instructions">Instrucciones del proyecto</Label>
                <Textarea
                  id="instructions"
                  rows={12}
                  className="max-h-[50vh] font-mono text-sm"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </TabsContent>
              <TabsContent value="knowledge" className="pt-2">
                <KnowledgePanel projectId={project.id} />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="grid gap-2">
              <Label>Tipo de proyecto</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplateId(t.id)}
                    className={cn(
                      "flex gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent",
                      templateId === t.id && "border-primary bg-accent",
                    )}
                  >
                    <span className="text-xl leading-none">{t.icon}</span>
                    <span className="grid gap-1">
                      <span className="text-sm font-medium">{t.name}</span>
                      <span className="text-muted-foreground text-xs">{t.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            {project && (
              <Button type="button" variant="outline" className="sm:mr-auto" onClick={saveAsTemplate}>
                Guardar como plantilla
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {project ? "Guardar" : "Crear proyecto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
