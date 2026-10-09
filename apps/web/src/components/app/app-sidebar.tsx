import {
  ChevronRight,
  FolderOutput,
  FolderPlus,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import { useState, type ComponentProps, type DragEvent } from "react";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { api, type Project, type Thread } from "@/lib/api";
import { useHub } from "@/lib/hub";
import { ProjectDialog } from "./project-dialog";
import { SearchDialog } from "./search-dialog";
import { SettingsDialog } from "./settings-dialog";

const THREAD_MIME = "application/x-hub-thread";

/** Native HTML5 drop target that only reacts to dragged threads. */
function useThreadDrop(onDropThread: (threadId: string) => void) {
  const [over, setOver] = useState(false);
  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(THREAD_MIME);
  const props = {
    onDragOver: (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
    },
    onDrop: (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      setOver(false);
      onDropThread(e.dataTransfer.getData(THREAD_MIME));
    },
  };
  return { over, props };
}

const dropHighlight = "rounded-md bg-sidebar-accent ring-2 ring-primary/60";

function dragProps(thread: Thread) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(THREAD_MIME, thread.id);
      e.dataTransfer.effectAllowed = "move";
    },
  };
}

export function AppSidebar() {
  const { state, newThread, refresh } = useHub();
  const [projectDialog, setProjectDialog] = useState<{ project?: Project } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [renaming, setRenaming] = useState<Thread | null>(null);

  async function moveThread(threadId: string, project: Project | null) {
    const thread = state?.threads.find((t) => t.id === threadId);
    if (!thread || thread.projectId === (project?.id ?? null)) return;
    try {
      await api.updateThread(threadId, { projectId: project?.id ?? null });
      toast.success(project ? `Movido a ${project.name}` : "Sacado del proyecto");
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  const chatsDrop = useThreadDrop((id) => void moveThread(id, null));

  const projects = state?.projects ?? [];
  const threads = state?.threads ?? [];
  const looseThreads = threads.filter((t) => !t.projectId);

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-semibold">
            C
          </div>
          <span className="font-semibold">Claude Hub</span>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => void newThread(null)}>
              <Plus />
              Nuevo chat
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setSearchOpen(true)}>
              <Search />
              Buscar
              <kbd className="ml-auto text-xs text-muted-foreground">⌘K</kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Proyectos</SidebarGroupLabel>
          <SidebarGroupAction title="Nuevo proyecto" onClick={() => setProjectDialog({})}>
            <FolderPlus />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.map((project) => (
                <ProjectItem
                  key={project.id}
                  project={project}
                  threads={threads.filter((t) => t.projectId === project.id)}
                  allProjects={projects}
                  onEdit={() => setProjectDialog({ project })}
                  onRename={setRenaming}
                  onMove={moveThread}
                />
              ))}
              {projects.length === 0 && (
                <SidebarMenuItem>
                  <SidebarMenuButton className="text-muted-foreground" onClick={() => setProjectDialog({})}>
                    <FolderPlus />
                    Crea tu primer proyecto
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup {...chatsDrop.props} className={cn(chatsDrop.over && dropHighlight)}>
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {looseThreads.map((thread) => (
                <ThreadItem
                  key={thread.id}
                  thread={thread}
                  projects={projects}
                  onRename={setRenaming}
                  onMove={moveThread}
                />
              ))}
              {chatsDrop.over && looseThreads.length === 0 && (
                <SidebarMenuItem className="px-2 py-1 text-xs text-muted-foreground">Suelta aquí</SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setSettingsOpen(true)}>
              <Settings />
              Ajustes
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {projectDialog && (
        <ProjectDialog project={projectDialog.project} onClose={() => setProjectDialog(null)} />
      )}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <RenameDialog thread={renaming} onClose={() => setRenaming(null)} />
    </Sidebar>
  );
}

interface ThreadActions {
  onRename: (thread: Thread) => void;
  onMove: (threadId: string, project: Project | null) => Promise<void>;
}

function ProjectItem({
  project,
  threads,
  allProjects,
  onEdit,
  onRename,
  onMove,
}: { project: Project; threads: Thread[]; allProjects: Project[]; onEdit: () => void } & ThreadActions) {
  const { refresh, newThread, threadId, openThread } = useHub();
  const containsOpenThread = threads.some((t) => t.id === threadId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const drop = useThreadDrop((id) => void onMove(id, project));

  async function remove() {
    try {
      await api.deleteProject(project.id);
      if (containsOpenThread) openThread(null);
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <Collapsible
      asChild
      defaultOpen={containsOpenThread || threads.length > 0}
      className="group/collapsible"
    >
      <SidebarMenuItem {...drop.props} className={cn(drop.over && dropHighlight)}>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton>
            <span className="text-base leading-none">{project.icon}</span>
            <span className="truncate">{project.name}</span>
            <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction showOnHover className="right-7">
              <MoreHorizontal />
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start">
            <DropdownMenuItem onClick={() => void newThread(project.id)}>
              <Plus /> Nuevo chat en el proyecto
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}>
              <Pencil /> Editar proyecto
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Borrar proyecto
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <CollapsibleContent>
          <SidebarMenuSub>
            {threads.map((thread) => (
              <SidebarMenuSubItem key={thread.id}>
                <SidebarMenuSubButton asChild isActive={thread.id === threadId}>
                  <button type="button" className="w-full" onClick={() => openThread(thread.id)} {...dragProps(thread)}>
                    <span className="truncate">{thread.title}</span>
                  </button>
                </SidebarMenuSubButton>
                <ThreadMenu
                  thread={thread}
                  projects={allProjects}
                  onRename={onRename}
                  onMove={onMove}
                  className="top-1 md:opacity-0 group-hover/menu-sub-item:opacity-100 group-focus-within/menu-sub-item:opacity-100 aria-expanded:opacity-100"
                />
              </SidebarMenuSubItem>
            ))}
            <SidebarMenuSubItem>
              <SidebarMenuSubButton asChild className="text-muted-foreground">
                <button type="button" className="w-full" onClick={() => void newThread(project.id)}>
                  <Plus /> Nuevo chat
                </button>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          </SidebarMenuSub>
        </CollapsibleContent>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Borrar "{project.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                {threads.length > 0
                  ? `Se borrarán también sus ${threads.length} chats y su conocimiento. No se puede deshacer.`
                  : "Se borrará el proyecto y su conocimiento. No se puede deshacer."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => void remove()}>
                Borrar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function ThreadItem({ thread, projects, onRename, onMove }: { thread: Thread; projects: Project[] } & ThreadActions) {
  const { threadId, openThread } = useHub();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={thread.id === threadId} onClick={() => openThread(thread.id)} {...dragProps(thread)}>
        <MessageSquare />
        <span className="truncate">{thread.title}</span>
      </SidebarMenuButton>
      <ThreadMenu thread={thread} projects={projects} onRename={onRename} onMove={onMove} showOnHover />
    </SidebarMenuItem>
  );
}

/** Rename / move / take out of project / delete, shared by loose threads and threads inside projects. */
function ThreadMenu({
  thread,
  projects,
  onRename,
  onMove,
  ...triggerProps
}: { thread: Thread; projects: Project[] } & ThreadActions &
  Pick<ComponentProps<typeof SidebarMenuAction>, "className" | "showOnHover">) {
  const { refresh, threadId, openThread } = useHub();
  const targets = projects.filter((p) => p.id !== thread.projectId);

  async function remove() {
    try {
      await api.deleteThread(thread.id);
      if (thread.id === threadId) openThread(null);
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction {...triggerProps}>
          <MoreHorizontal />
        </SidebarMenuAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start">
        <DropdownMenuItem onClick={() => onRename(thread)}>
          <Pencil /> Renombrar
        </DropdownMenuItem>
        {targets.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderPlus /> Mover a proyecto
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {targets.map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => void onMove(thread.id, p)}>
                  {p.icon} {p.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {thread.projectId && (
          <DropdownMenuItem onClick={() => void onMove(thread.id, null)}>
            <FolderOutput /> Sacar del proyecto
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => void remove()}>
          <Trash2 /> Borrar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RenameDialog({ thread, onClose }: { thread: Thread | null; onClose: () => void }) {
  const { refresh } = useHub();
  const [title, setTitle] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);

  // Reset the field whenever a different thread is opened for renaming.
  if (thread && thread.id !== lastId) {
    setLastId(thread.id);
    setTitle(thread.title);
  }

  async function save() {
    const next = title.trim();
    if (!thread || !next) return;
    try {
      await api.updateThread(thread.id, { title: next });
      await refresh();
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <Dialog
      open={thread !== null}
      onOpenChange={(open) => {
        if (!open) {
          setLastId(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Renombrar chat</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus aria-label="Título" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
