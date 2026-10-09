import { ChevronRight, FolderPlus, MessageSquare, MoreHorizontal, Pencil, Plus, Settings, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { SettingsDialog } from "./settings-dialog";

export function AppSidebar() {
  const { state, newThread } = useHub();
  const [projectDialog, setProjectDialog] = useState<{ project?: Project } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
                  onEdit={() => setProjectDialog({ project })}
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

        <SidebarGroup>
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {looseThreads.map((thread) => (
                <ThreadItem key={thread.id} thread={thread} projects={projects} />
              ))}
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
    </Sidebar>
  );
}

function ProjectItem({ project, threads, onEdit }: { project: Project; threads: Thread[]; onEdit: () => void }) {
  const { refresh, newThread, threadId, openThread } = useHub();
  const containsOpenThread = threads.some((t) => t.id === threadId);

  async function remove() {
    if (!confirm(`¿Borrar "${project.name}" y sus ${threads.length} chats?`)) return;
    await api.deleteProject(project.id);
    if (containsOpenThread) openThread(null);
    await refresh();
  }

  return (
    <Collapsible asChild defaultOpen={containsOpenThread || threads.length > 0} className="group/collapsible">
      <SidebarMenuItem>
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
            <DropdownMenuItem variant="destructive" onClick={() => void remove()}>
              <Trash2 /> Borrar proyecto
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <CollapsibleContent>
          <SidebarMenuSub>
            {threads.map((thread) => (
              <SidebarMenuSubItem key={thread.id}>
                <SidebarMenuSubButton asChild isActive={thread.id === threadId}>
                  <button type="button" className="w-full" onClick={() => openThread(thread.id)}>
                    <span className="truncate">{thread.title}</span>
                  </button>
                </SidebarMenuSubButton>
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
      </SidebarMenuItem>
    </Collapsible>
  );
}

function ThreadItem({ thread, projects }: { thread: Thread; projects: Project[] }) {
  const { refresh, threadId, openThread } = useHub();

  async function rename() {
    const title = prompt("Nuevo título", thread.title)?.trim();
    if (!title) return;
    await api.updateThread(thread.id, { title });
    await refresh();
  }

  async function moveTo(project: Project) {
    await api.updateThread(thread.id, { projectId: project.id });
    toast.success(`Movido a ${project.name}`);
    await refresh();
  }

  async function remove() {
    await api.deleteThread(thread.id);
    if (thread.id === threadId) openThread(null);
    await refresh();
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={thread.id === threadId}
        onClick={() => openThread(thread.id)}
      >
        <MessageSquare />
        <span className="truncate">{thread.title}</span>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction showOnHover>
            <MoreHorizontal />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem onClick={() => void rename()}>
            <Pencil /> Renombrar
          </DropdownMenuItem>
          {projects.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderPlus /> Mover a proyecto
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {projects.map((p) => (
                  <DropdownMenuItem key={p.id} onClick={() => void moveTo(p)}>
                    {p.icon} {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => void remove()}>
            <Trash2 /> Borrar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
