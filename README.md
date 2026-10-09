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

### Usar desde iPad / iPhone
El servidor de la Mac sirve también la web, así que el iPad/iPhone solo necesita llegar a ella por red.

1. **Instala [Tailscale](https://tailscale.com)** en la Mac y en el iPad/iPhone e inicia sesión con la misma cuenta.
2. **Nombre de la Mac**: en la app de Tailscale (o en la consola de administración) activa *MagicDNS*; tu Mac será accesible como `nombre-mac` o `nombre-mac.<tailnet>.ts.net`. También sirve su IP `100.x.y.z`.
3. **Compila y arranca** el servidor en la Mac: `pnpm --filter @hub/web build && pnpm start` (puerto 4317).
4. **Token de acceso**: los clientes que no son la propia Mac necesitan un token. En la Mac abre `http://localhost:4317` → *Ajustes → Conectar dispositivo*, y abre en el iPad/iPhone el enlace (o escanea el QR). Ese primer acceso guarda una cookie de larga duración y quita el token de la URL. *Regenerar token* invalida los dispositivos ya conectados.
5. **Añadir a pantalla de inicio**: Safari → Compartir → "Añadir a pantalla de inicio". Se abre como app a pantalla completa.

Notas:
- Por HTTP plano (`http://nombre-mac:4317`) iOS instala la app pero no registra el service worker (requiere HTTPS), así que no hay caché offline del shell. Para tenerla, publica el servidor con HTTPS de Tailscale: `tailscale serve --bg 4317` y usa `https://nombre-mac.<tailnet>.ts.net`. Ojo: ese proxy conecta desde localhost, por lo que el servidor lo trata como local y **no pide token**; úsalo solo si confías en tu tailnet.
- Si el servidor no responde, la app muestra un aviso "Servidor no disponible" y reintenta sola.

#### Mantener el servidor en marcha
- La Mac no debe suspenderse: Ajustes del Sistema → Batería/Pantalla → evitar la suspensión automática con corriente, o ejecuta `caffeinate -s pnpm start`.
- Para que arranque solo al iniciar sesión, usa la app de escritorio (autoarranque, ver SPEC Fase 4) o un LaunchAgent que ejecute `pnpm start` en este directorio.
- El motor CLI usa tu sesión de `claude` en la Mac: debe seguir iniciada.

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
