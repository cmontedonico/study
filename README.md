# Claude Hub

Chat personal con Claude organizado por proyectos. Usa tu CLI de `claude` (suscripción)
o una API key de Anthropic. Ver [SPEC.md](SPEC.md) para alcance y fases.

## Requisitos
- Node 22+ y pnpm
- `claude` instalado y autenticado (`claude auth login`) para el motor CLI

## Uso

```bash
pnpm install
pnpm desktop   # app de escritorio (Electron); arranca el servidor si no está corriendo
pnpm dev       # desarrollo: servidor en :4317 + Vite con hot reload en :5173
pnpm start     # solo servidor + web compilada en :4317 (para iPad/iPhone)
```

### iPad / iPhone
1. Instala [Tailscale](https://tailscale.com) en la Mac y en los dispositivos.
2. Con el servidor corriendo, abre `http://<nombre-de-tu-mac>:4317` en Safari.
3. Compartir → "Añadir a pantalla de inicio".

## Instalar la app de escritorio

App de macOS (Apple Silicon) que funciona sin el repo, pnpm ni Node instalados.

```bash
pnpm install
pnpm desktop:dist   # compila web + servidor y genera apps/desktop/out/Claude Hub-<versión>-arm64.dmg
```

Abre el `.dmg` y arrastra **Claude Hub** a Aplicaciones. La app no está firmada: la primera vez,
clic derecho → **Abrir**, o bien `xattr -cr "/Applications/Claude Hub.app"`.

- **Segundo plano**: cerrar la ventana no detiene el servidor (el iPad/iPhone siguen conectados).
  Hay un icono en la barra de menús con "Abrir Claude Hub" y "Salir"; salir detiene el servidor.
- **Iniciar al abrir sesión**: menú *Claude Hub → Iniciar al abrir sesión*.
- Datos en `~/Library/Application Support/claude-hub`; puerto 4317 (o `PORT`). Si ya hay un servidor en ese puerto, la app lo reutiliza.
- El motor "CLI" usa el binario nativo de Claude Code incluido en la app (`@anthropic-ai/claude-agent-sdk-darwin-arm64`);
  hay que haber iniciado sesión en Claude Code (`claude` → `/login`) o usar el motor API con tu key.

Cómo se empaqueta: el servidor se compila a un único `server.mjs` con esbuild y se ejecuta dentro de Electron
(`utilityProcess`), con `better-sqlite3` reconstruido para la ABI de Electron por electron-builder.
`bundle:server` falla si el SDK fijado en `apps/desktop` no coincide con el que pide `ai-sdk-provider-claude-code`; al actualizar el provider, fija las mismas versiones en `apps/desktop/package.json`.
El paquete va sin asar (`asar: false`) para que el binario de Claude Code sea ejecutable.

## Estructura
- `apps/server` — Hono + AI SDK + SQLite (Drizzle). Datos en `~/Library/Application Support/claude-hub`.
- `apps/web` — Vite + React + shadcn + AI Elements.
- `apps/desktop` — Electron (ventana nativa sobre el servidor).
