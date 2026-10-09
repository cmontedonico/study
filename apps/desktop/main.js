// Electron shell: makes sure the hub server is running, then shows it in a native window.
// The same server is what the iPad/iPhone PWA connects to.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, shell } from "electron";

const port = process.env.PORT ?? "4317";
const url = `http://localhost:${port}`;
const serverDir = join(dirname(fileURLToPath(import.meta.url)), "../server");
let server;

async function isUp() {
  try {
    return (await fetch(`${url}/api/health`)).ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await isUp()) return; // already running (e.g. `pnpm dev` or a launchd service)
  // Runs on the system Node so native modules (better-sqlite3) need no Electron rebuild.
  server = spawn("pnpm", ["start"], { cwd: serverDir, stdio: "inherit", env: { ...process.env, PORT: port } });
  for (let i = 0; i < 50; i++) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("El servidor no arrancó");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 380,
    backgroundColor: "#0a0a0a",
  });
  win.loadURL(url);
  // External links (e.g. in Claude's answers) open in the default browser.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!target.startsWith(url)) void shell.openExternal(target);
    return { action: target.startsWith(url) ? "allow" : "deny" };
  });
}

app.whenReady().then(async () => {
  await ensureServer();
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
app.on("before-quit", () => server?.kill());
