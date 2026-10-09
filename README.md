# StudyLab

> Antes llamado Claude Hub.

Chat personal con Claude organizado por proyectos. Usa tu CLI de `claude` (suscripción)
o una API key de Anthropic. Ver [SPEC.md](SPEC.md) para alcance y fases.

## Requisitos
- Node 22+ y pnpm
- `claude` instalado y autenticado (`claude auth login`) para el motor CLI

## Capacidades
- Adjuntos: imágenes, PDFs y texto. Los PDFs escaneados (sin capa de texto) se leen con OCR usando la visión de
  Claude (Haiku, mismo motor que tu ajuste por defecto): solo se procesan las páginas sin texto, hasta 40 por PDF
  (~3 s por página). Vale también para el conocimiento de los proyectos. Usa `@napi-rs/canvas` para rasterizar las páginas.

- Audio y dictado: puedes adjuntar notas de voz (m4a, mp3, wav, ogg, webm…, hasta 60 min) y dictar con el botón del
  micrófono. La transcripción es **local**: Whisper large-v3-turbo (cuantizado a 4 bits) corre en la Mac con
  `@huggingface/transformers`; no se envía audio a ningún servicio. Claude recibe el texto (`<audio_transcript>`) y
  responde siempre por escrito. El modelo (~740 MB) se descarga la primera vez que se usa en `<datos>/models`; después
  funciona sin conexión. El navegador convierte el audio a WAV de 16 kHz mono antes de subirlo (sin ffmpeg), y el idioma
  se detecta automáticamente. Una transcripción tarda ~11 s por minuto de audio en un Mac con Apple Silicon.

## Uso

```bash
pnpm install
pnpm desktop   # app de escritorio (Electron); arranca el servidor si no está corriendo
pnpm dev       # desarrollo: servidor en :4317 + Vite con hot reload en :5173
pnpm start     # solo servidor + web compilada en :4317 (para iPad/iPhone)
```

### Usar desde iPad / iPhone
El servidor de la Mac sirve también la web, así que el iPad/iPhone solo necesita llegar a ella por red.

1. **Instala [Tailscale](https://tailscale.com)** en la Mac y en el iPad/iPhone e inicia sesión con la misma cuenta.
2. **Nombre de la Mac**: en la app de Tailscale (o en la consola de administración) activa *MagicDNS*; tu Mac será accesible como `nombre-mac` o `nombre-mac.<tailnet>.ts.net`. También sirve su IP `100.x.y.z`.
3. **Compila y arranca** el servidor en la Mac: `pnpm --filter @hub/web build && pnpm start` (puerto 4317).
4. **Token de acceso**: los clientes que no son la propia Mac necesitan un token. En la Mac abre `http://localhost:4317` → *Ajustes → Conectar dispositivo*, y abre en el iPad/iPhone el enlace (o escanea el QR). Ese primer acceso guarda una cookie de larga duración y quita el token de la URL. *Regenerar token* invalida los dispositivos ya conectados.
5. **Añadir a pantalla de inicio**: Safari → Compartir → "Añadir a pantalla de inicio". Se abre como app a pantalla completa.

Notas:
- Por HTTP plano (`http://nombre-mac:4317`) iOS instala la app pero no registra el service worker (requiere HTTPS), así que no hay caché offline del shell. Para tenerla, publica el servidor con HTTPS de Tailscale: `tailscale serve --bg 4317` y usa `https://nombre-mac.<tailnet>.ts.net`. Las peticiones que llegan por ese proxy (`tailscale serve`/`funnel`, o cualquier proxy inverso con cabeceras `X-Forwarded-For`, `Forwarded`, `X-Real-IP` o `Tailscale-User-*`) se tratan como remotas aunque vengan de localhost, así que también necesitan el token: abre el enlace con `?token=` igual que en el paso 4.
- **Dictado desde iPad/iPhone**: el micrófono (`getUserMedia`) solo existe en contextos seguros (HTTPS o `localhost`). Con `http://<ip>:4317` el botón del micrófono aparece desactivado con una explicación; adjuntar archivos de audio sí funciona. Para dictar, publica el servidor con HTTPS: `tailscale serve --bg 4317` (una vez; `tailscale serve status` muestra la URL y `tailscale serve reset` la quita) y abre `https://nombre-mac.<tailnet>.ts.net/?token=<token>` (el token es el de *Ajustes → Conectar dispositivo*; esa pantalla solo ofrece URLs `http://`, sustituye el esquema y el host). La app de escritorio ya tiene permiso de micrófono (macOS lo pedirá la primera vez).
- Seguridad: solo se confía en la propia Mac si la petición llega directa y con `Host` `localhost`/`127.0.0.1`/`[::1]`; las escrituras (`POST`/`PUT`/…) de `/api/*` con cabecera `Origin` de otro origen se rechazan (403), para que una web cualquiera no pueda llamar a `localhost:4317`.
- Si el servidor no responde, la app muestra un aviso "Servidor no disponible" y reintenta sola.

#### Mantener el servidor en marcha
- La Mac no debe suspenderse: Ajustes del Sistema → Batería/Pantalla → evitar la suspensión automática con corriente, o ejecuta `caffeinate -s pnpm start`.
- Para que arranque solo al iniciar sesión, usa la app de escritorio (autoarranque, ver SPEC Fase 4) o un LaunchAgent que ejecute `pnpm start` en este directorio.
- El motor CLI usa tu sesión de `claude` en la Mac: debe seguir iniciada.

## Instalar la app de escritorio

App de macOS (Apple Silicon) que funciona sin el repo, pnpm ni Node instalados.

```bash
pnpm install
pnpm desktop:dist   # compila web + servidor y genera apps/desktop/out/StudyLab-<versión>-arm64.dmg
```

Abre el `.dmg` y arrastra **StudyLab** a Aplicaciones. La app no está firmada: la primera vez,
clic derecho → **Abrir**, o bien `xattr -cr "/Applications/StudyLab.app"`.

- **Segundo plano**: cerrar la ventana no detiene el servidor (el iPad/iPhone siguen conectados).
  Hay un icono en la barra de menús con "Abrir StudyLab" y "Salir"; salir detiene el servidor.
- **Iniciar al abrir sesión**: menú *StudyLab → Iniciar al abrir sesión*.
- Datos en `~/Library/Application Support/StudyLab/data` (antes `claude-hub`; se migra solo al arrancar); puerto 4317 (o `PORT`). Si ya hay un servidor en ese puerto, la app lo reutiliza.
- El motor "CLI" usa el binario nativo de Claude Code incluido en la app (`@anthropic-ai/claude-agent-sdk-darwin-arm64`);
  hay que haber iniciado sesión en Claude Code (`claude` → `/login`) o usar el motor API con tu key.

Cómo se empaqueta: el servidor se compila a un único `server.mjs` con esbuild y se ejecuta dentro de Electron
(`utilityProcess`), con `better-sqlite3` reconstruido para la ABI de Electron por electron-builder (`@napi-rs/canvas` es N-API y va con binarios precompilados).
`bundle:server` falla si el SDK fijado en `apps/desktop` no coincide con el que pide `ai-sdk-provider-claude-code`; al actualizar el provider, fija las mismas versiones en `apps/desktop/package.json`.
El paquete va sin asar (`asar: false`) para que el binario de Claude Code sea ejecutable.

## Estructura
- `apps/server` — Hono + AI SDK + SQLite (Drizzle). Datos en `~/Library/Application Support/StudyLab/data` (antes `claude-hub`; se migra solo al arrancar).
- `apps/web` — Vite + React + shadcn + AI Elements.
- `apps/desktop` — Electron (ventana nativa sobre el servidor).
