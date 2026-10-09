import { createContext, use, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import { api, type HubState } from "./api";

interface Hub {
  state: HubState | null;
  refresh: () => Promise<void>;
  threadId: string | null;
  openThread: (id: string | null) => void;
  /** Creates a thread (optionally inside a project) and opens it. */
  newThread: (projectId?: string | null) => Promise<void>;
}

const HubContext = createContext<Hub | null>(null);

// The open thread lives in the URL hash (#/t/<id>) so reloads on iPad/iPhone keep it.
function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}
const readThreadId = () => window.location.hash.match(/^#\/t\/(.+)$/)?.[1] ?? null;

export function HubProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HubState | null>(null);
  const threadId = useSyncExternalStore(subscribeHash, readThreadId);

  const followUp = useRef<ReturnType<typeof setTimeout>>(undefined);

  const refresh = useCallback(async () => {
    try {
      const next = await api.state();
      setState(next);
      // The server may rename a chat with Haiku a few seconds after a reply finishes: look once more.
      const justUpdated = next.threads.some((t) => Date.now() - t.updatedAt < 15_000);
      if (justUpdated && followUp.current === undefined) {
        // Haiku on the CLI engine can take several seconds: two delayed looks, then stop.
        const look = (delays: number[]) => {
          const [delay, ...rest] = delays;
          if (delay === undefined) {
            followUp.current = undefined;
            return;
          }
          followUp.current = setTimeout(() => {
            void api.state().then(setState, () => undefined);
            look(rest);
          }, delay);
        };
        look([4000, 6000]);
      }
    } catch (error) {
      toast.error(`No se pudo conectar con el servidor: ${(error as Error).message}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openThread = useCallback((id: string | null) => {
    window.location.hash = id ? `/t/${id}` : "";
  }, []);

  const newThread = useCallback(
    async (projectId?: string | null) => {
      const thread = await api.createThread({ projectId });
      await refresh();
      openThread(thread.id);
    },
    [refresh, openThread],
  );

  return <HubContext value={{ state, refresh, threadId, openThread, newThread }}>{children}</HubContext>;
}

export function useHub() {
  const hub = use(HubContext);
  if (!hub) throw new Error("useHub must be used inside <HubProvider>");
  return hub;
}
