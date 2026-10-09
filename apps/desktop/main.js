// Electron shell: makes sure the hub server is running, then shows it in a native window.
// The same server is what the iPad/iPhone PWA connects to, so it outlives the window:
// closing the window leaves it running (tray icon), quitting stops it.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, Menu, nativeImage, screen, shell, Tray, utilityProcess } from "electron";

const here = dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT ?? "4317";
const url = `http://localhost:${port}`;
app.setName("Claude Hub"); // userData dir otherwise derives from the package name (@hub/desktop)
let server; // child we started (undefined when reusing an already-running server)
let win;
let tray;

// "ready" | "no-ui" (a hub server that can't serve the page, e.g. a stray dev server) | "down"
async function probe() {
  try {
    const res = await fetch(`${url}/api/health`);
    if (!res.ok) return "down";
    return (await res.json()).ui ? "ready" : "no-ui";
  } catch {
    return "down";
  }
}

function startServer() {
  if (app.isPackaged) {
    // Runs inside Electron's own Node (no system Node needed); better-sqlite3 is rebuilt for its ABI.
    const child = utilityProcess.fork(join(here, "server-dist/server.mjs"), [], {
      stdio: "inherit",
      env: { ...process.env, PORT: port, HUB_WEB_DIST: join(process.resourcesPath, "web") },
    });
    return { kill: () => child.kill() };
  }
  // Dev: system Node via the workspace script, so native modules need no Electron rebuild.
  const child = spawn("pnpm", ["start"], {
    cwd: join(here, "../server"),
    stdio: "inherit",
    env: { ...process.env, PORT: port },
  });
  return { kill: () => child.kill() };
}

async function ensureServer() {
  const state = await probe();
  if (state === "ready") return; // already running (e.g. `pnpm start` or a launchd service)
  if (state === "no-ui") {
    throw new Error(
      `El puerto ${port} lo ocupa otro servidor de Claude Hub sin la interfaz web ` +
        "(probablemente uno de desarrollo). Ciérralo y vuelve a abrir la app.",
    );
  }
  server = startServer();
  for (let i = 0; i < 100; i++) {
    const now = await probe();
    if (now === "ready") return;
    if (now === "no-ui") throw new Error("Falta la interfaz web. Ejecuta: pnpm --filter @hub/web build");
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("El servidor no arrancó");
}

// --- window geometry persistence ---
const statePath = () => join(app.getPath("userData"), "window-state.json");

function loadBounds() {
  try {
    const b = JSON.parse(readFileSync(statePath(), "utf8"));
    const visible = screen.getAllDisplays().some(({ workArea: a }) => {
      return b.x >= a.x - 50 && b.y >= a.y - 50 && b.x < a.x + a.width && b.y < a.y + a.height;
    });
    return { width: b.width, height: b.height, ...(visible ? { x: b.x, y: b.y } : {}) };
  } catch {
    return { width: 1280, height: 820 };
  }
}

function saveBounds() {
  if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
  try {
    writeFileSync(statePath(), JSON.stringify(win.getBounds()));
  } catch {
    // best effort
  }
}

function showWindow() {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return;
  }
  win = new BrowserWindow({ ...loadBounds(), minWidth: 380, backgroundColor: "#0a0a0a" });
  win.loadURL(url);
  win.on("close", saveBounds);
  win.on("moved", saveBounds);
  win.on("resized", saveBounds);
  // External links (e.g. in Claude's answers) open in the default browser.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!target.startsWith(url)) void shell.openExternal(target);
    return { action: target.startsWith(url) ? "allow" : "deny" };
  });
}

// --- login item + menus ---
const loginItem = () => ({
  label: "Iniciar al abrir sesión",
  type: "checkbox",
  checked: app.getLoginItemSettings().openAtLogin,
  enabled: app.isPackaged, // in dev it would register the bare Electron binary
  click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
});

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: "about", label: "Acerca de Claude Hub" },
          { type: "separator" },
          loginItem(),
          { type: "separator" },
          { role: "hide", label: "Ocultar Claude Hub" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit", label: "Salir de Claude Hub" },
        ],
      },
      { role: "editMenu", label: "Edición" },
      { role: "viewMenu", label: "Ver" },
      { role: "windowMenu", label: "Ventana" },
    ]),
  );
}

function buildTray() {
  const icon = nativeImage.createFromPath(join(here, "assets/trayTemplate.png"));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Claude Hub");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir Claude Hub", click: showWindow },
      { type: "separator" },
      { label: "Salir", click: () => app.quit() },
    ]),
  );
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.whenReady().then(async () => {
    buildMenu();
    if (existsSync(join(here, "assets/trayTemplate.png"))) buildTray();
    try {
      await ensureServer();
    } catch (err) {
      dialog.showErrorBox("Claude Hub", String(err.message ?? err));
      app.quit();
      return;
    }
    showWindow();
    app.on("activate", showWindow);
  });
  // The server keeps running in the background after the last window closes.
  app.on("window-all-closed", () => {});
  app.on("before-quit", () => {
    server?.kill();
  });
}
