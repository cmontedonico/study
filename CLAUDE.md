# StudyLab — guía para agentes (antes Claude Hub)

App personal de chat con Claude por proyectos. Alcance y fases en `SPEC.md`.

## Estructura
- `apps/server` — Node + Hono + AI SDK v7 + SQLite (better-sqlite3 + Drizzle). Se ejecuta con `tsx` (sin build). Imports con extensión `.ts`.
  - `src/routes/<recurso>.ts` — un `Hono` por recurso, montado en `src/routes/index.ts`. Features nuevas = módulo nuevo + una línea en index.
  - `src/db.ts` — el esquema SQL se crea con `CREATE TABLE IF NOT EXISTS` al arrancar (no hay migraciones). Columnas nuevas en tablas existentes: `ALTER TABLE` idempotente (comprobar `PRAGMA table_info`). Mantener `src/schema.ts` (Drizzle) sincronizado.
  - `src/chat.ts` — streaming de chat; motor `cli` (ai-sdk-provider-claude-code, sin herramientas) o `api` (@ai-sdk/anthropic).
- `apps/web` — Vite + React 19 + Tailwind v4 + shadcn (estilo `radix-nova`) + AI Elements (`src/components/ai-elements`).
  - Componentes de la app en `src/components/app/`. Cliente HTTP tipado en `src/lib/api.ts`. Estado global en `src/lib/hub.tsx`.
  - Añadir componentes shadcn: `pnpm dlx shadcn@latest add <name>` dentro de `apps/web`. No editar a mano `components/ui` salvo necesidad.
- `apps/desktop` — Electron (JS plano, `main.js`), carga el servidor en `http://localhost:4317`. `pnpm desktop:dist` genera el `.dmg` (servidor empaquetado con esbuild, ver README).

## Convenciones
- TypeScript estricto, sin `any`. Código y nombres en inglés; textos de UI en español.
- Estilo: el del código vecino (comillas dobles, punto y coma, 2 espacios, ~110 columnas). Comentarios solo para el "por qué".
- Sin dependencias nuevas salvo que sean claramente necesarias; justifícalas en el PR.

## Verificación (obligatoria antes de abrir PR)
```bash
pnpm install
pnpm typecheck
pnpm --filter @hub/web build
pnpm --filter @hub/server test   # si existen tests
```
Para probar a mano: `HUB_DATA_DIR=/tmp/hub-<feature> PORT=<puerto libre> pnpm --filter @hub/server start` (sirve `apps/web/dist`). El puerto 4399 está ocupado en esta máquina. No uses el directorio de datos real del usuario.
`ELECTRON_RUN_AS_NODE=1` puede estar definido en el entorno: lanza Electron con `env -u ELECTRON_RUN_AS_NODE`.

## Git
- Una rama por feature: `feat/<nombre>`. Commits pequeños y descriptivos. PR contra `main` con resumen, cómo se probó y capturas si hay UI.
