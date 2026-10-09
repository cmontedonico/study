import { MessageSquarePlus } from "lucide-react";
import { useEffect } from "react";
import { AppSidebar } from "@/components/app/app-sidebar";
import { ConnectionBanner } from "@/components/app/connection-banner";
import { ChatView } from "@/components/app/chat-view";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HubProvider, useHub } from "@/lib/hub";

export default function App() {
  return (
    <HubProvider>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <Main />
          </SidebarInset>
        </SidebarProvider>
        <ConnectionBanner />
        <Toaster position="top-center" />
      </TooltipProvider>
    </HubProvider>
  );
}

function Main() {
  const { state, threadId, newThread } = useHub();
  const { setOpenMobile } = useSidebar();
  const thread = state?.threads.find((t) => t.id === threadId);

  // On iPhone the sidebar is a drawer: close it once a chat is picked.
  useEffect(() => setOpenMobile(false), [threadId, setOpenMobile]);

  if (thread) return <ChatView thread={thread} />;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center px-3 pt-[env(safe-area-inset-top)]">
        <SidebarTrigger />
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">Hola 👋</h1>
        <p className="text-muted-foreground max-w-sm">
          Empieza un chat suelto o crea un proyecto con instrucciones para que Claude te guíe.
        </p>
        <Button onClick={() => void newThread(null)}>
          <MessageSquarePlus /> Nuevo chat
        </Button>
      </div>
    </div>
  );
}
