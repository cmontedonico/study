# StudyLab — Especificación v1 (antes llamado Claude Hub)

App personal de chat con Claude, organizada por proyectos, que usa el CLI de Claude
(tu suscripción) o una API key de Anthropic. Escritorio en Mac (Electron) y acceso
desde iPad / iPhone como PWA conectada a la Mac.

## Decisiones tomadas (entrevista 2026-10-08)

| Tema | Decisión |
|---|---|
| Usuarios | Solo yo. Sin login, sin multiusuario. Datos locales. |
| Móvil | La Mac es el servidor. iPad/iPhone abren la misma UI como PWA vía Tailscale. |
| Capacidad de Claude | Solo conversar (sin herramientas de archivos/terminal) en v1. |
| Uso principal | Aprendizaje / mentoría y Negocio / investigación. |
| Prompts predefinidos | Plantillas de "tipo de proyecto" que se copian al crear el proyecto y se editan libremente. |
| Conocimiento | Cada proyecto tiene archivos (PDF, notas) que se incluyen en el contexto de todos sus hilos. |
| Extras de chat v1 | Selector de modelo por hilo, editar/regenerar/ramificar, búsqueda en hilos, exportar a Markdown. |
| Diseño | Estilo Vercel/shadcn limpio, modo claro/oscuro, sidebar de proyectos inspirado en Envato. |
| Motor por defecto | CLI (suscripción). API key como alternativa en Ajustes. |
| Costos / tokens | No en v1. |

## Arquitectura

```
┌──────────────────────── Mac ────────────────────────┐
│ apps/desktop  Electron: ventana nativa, arranca el   │
│               servidor y carga http://localhost:4317 │
│                                                      │
│ apps/server   Node + Hono                            │
│   ├─ /api/*     REST: proyectos, hilos, mensajes,    │
│   │             plantillas, archivos, búsqueda       │
│   ├─ /api/chat  streaming (AI SDK UI message stream) │
│   │     ├─ motor "cli" → ai-sdk-provider-claude-code │
│   │     │                (Claude Agent SDK → tu CLI)  │
│   │     └─ motor "api" → @ai-sdk/anthropic (API key)  │
│   ├─ SQLite (Drizzle) en ~/Library/Application       │
│   │     Support/StudyLab/data/hub.db                 │
│   └─ sirve el build de apps/web                      │
│                                                      │
│ apps/web      Vite + React + Tailwind + shadcn +     │
│               AI SDK useChat (responsive + PWA)      │
└──────────────────────────────────────────────────────┘
          ▲
          │ http://<mac>.<tailnet>.ts.net:4317
   iPad / iPhone (PWA "Añadir a inicio")
```

**Por qué no Electron en móvil:** Electron solo existe para macOS/Windows/Linux, y el
CLI de Claude no corre en iOS. Una sola UI web sirve a los tres dispositivos.

### Motores (providers)

- **CLI** (`ai-sdk-provider-claude-code`): usa el `claude` autenticado de la Mac.
  Herramientas deshabilitadas (modo "solo conversar"). Limitación: el Agent SDK no
  acepta PDFs inline → el servidor extrae el texto del PDF y lo envía como texto. Las
  páginas escaneadas (sin texto) se transcriben con OCR vía visión de Claude (Haiku) al subir.
  Imágenes sí se envían nativamente.
- **API** (`@ai-sdk/anthropic`): API key guardada localmente. PDFs e imágenes nativos.

Ambos se exponen con la misma interfaz del AI SDK, así la UI no sabe cuál se usa.

### Modelos

Alias `opus`, `sonnet`, `haiku` (el motor CLI los resuelve a la última versión; el
motor API los mapea a IDs concretos en `apps/server/src/models.ts`).

## Modelo de datos

```
project        id, name, icon, instructions (system prompt), templateId?, createdAt, updatedAt
template       id, name, description, instructions, builtIn
project_file   id, projectId, name, mediaType, path, extractedText?, createdAt
thread         id, projectId? (null = hilo suelto), title, model, engine,
               parentThreadId?, forkedFromMessageId?, createdAt, updatedAt
message        id, threadId, role, parts (JSON UIMessage parts), createdAt
attachment     id, messageId?, name, mediaType, path, extractedText?
settings       key, value   (anthropicApiKey, defaultEngine, defaultModel, theme)
```

## Funcionalidades

### Fase 1 — Esqueleto (este scaffold)
- [x] Monorepo pnpm: `apps/server`, `apps/web`, `apps/desktop`
- [x] Servidor Hono con SQLite + Drizzle y esquema completo
- [x] Chat con streaming por motor CLI y API, selector de modelo
- [x] Sidebar: proyectos con sus hilos + hilos sueltos; crear/renombrar/borrar
- [x] Proyecto con instrucciones (system prompt) y plantillas integradas
- [x] Adjuntos: imágenes, PDF (texto extraído en CLI), texto/markdown
- [x] OCR de PDFs escaneados con la visión de Claude (adjuntos y conocimiento; máx. 40 páginas por PDF)
- [x] Electron que arranca el servidor y abre la ventana
- [x] Servidor accesible en la red (0.0.0.0) para iPad/iPhone

### Fase 2 — Chat completo
- [x] Editar mensaje y regenerar respuesta
- [x] Ramificar: nuevo hilo desde un mensaje
- [x] Búsqueda en todos los hilos (SQLite FTS5)
- [x] Exportar hilo a Markdown
- [x] Títulos automáticos de hilos (Haiku)
- [x] Arrastrar hilos sueltos a un proyecto

### Fase 3 — Proyectos con conocimiento
- [x] Archivos de proyecto (subida, lista, borrado)
- [x] Inyección del conocimiento en el system prompt (con prompt caching en motor API)
- [x] Editor de plantillas propias (crear, duplicar, borrar)

### Fase 4 — Móvil y pulido
- [x] PWA: manifest, iconos, modo standalone, safe areas de iOS
- [x] Layout móvil: sidebar como drawer, input fijo abajo
- [x] Guía de Tailscale + token de acceso simple (aunque sea red privada)
- [x] Empaquetado `.dmg` con electron-builder, autoarranque al iniciar sesión

### Fuera de alcance (por ahora)
Multiusuario/login, herramientas de agente sobre carpetas, otros proveedores
(OpenAI, Gemini), contador de tokens/costos, voz, generación de imágenes.

## Plantillas integradas

1. **Mentor socrático** — enseña con preguntas, verifica comprensión, propone ejercicios.
2. **Tutor paso a paso** — plan de aprendizaje por módulos, explicaciones con ejemplos y quiz al final.
3. **Analista de negocio** — marcos (DAFO, 5 fuerzas, unit economics), supuestos explícitos, recomendaciones accionables.
4. **Investigador** — separa hechos de inferencias, cita las fuentes adjuntas, señala lagunas.
5. **Tutor de idiomas** — conversación guiada por nivel MCER, corrección en tabla, vocabulario y repasos espaciados.
6. **Tutor de matemáticas** — guía paso a paso sin regalar la respuesta, localiza el error, verifica resultados; fórmulas en LaTeX.
7. **Tutor de ajedrez** — notación algebraica, FEN/PGN/capturas, aperturas, táctica, finales y análisis de partidas; avisa de que no tiene motor.
8. **Tutor de guitarra acústica** — lectura de música, estudios por nivel (Carulli, Sor, Brouwer, Villa-Lobos…), plan semanal de práctica y teoría aplicada.
9. **Tutor e investigador de IA** — tendencias sin humo (avisa de su fecha de corte) y ayuda para diseñar y construir soluciones de IA.
10. **Asistente de tareas** — ayuda con tareas mediante pistas graduales sin dar la respuesta final; revisa tu razonamiento y cierra con una reflexión.
11. **En blanco** — sin instrucciones.

## Plantillas de referencia en el mercado

- `vercel/ai-chatbot` — referencia de UX del chat (no se usa directo: trae Next.js, Postgres y auth que sobran).
- Vercel **AI Elements** — componentes shadcn para chat (se añaden con `npx ai-elements add …`).
- `ai-sdk-provider-claude-code` — puente AI SDK ↔ Claude Agent SDK/CLI.
- `siteboon/claudecodeui`, `pingdotgg/t3code` — referencias de UIs sobre Claude Code.
