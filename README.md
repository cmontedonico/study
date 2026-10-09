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

## Estructura
- `apps/server` — Hono + AI SDK + SQLite (Drizzle). Datos en `~/Library/Application Support/claude-hub`.
- `apps/web` — Vite + React + shadcn + AI Elements.
- `apps/desktop` — Electron (ventana nativa sobre el servidor).
