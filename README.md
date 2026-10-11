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

- Plantillas de proyecto (11 integradas): *Mentor socrático*, *Tutor paso a paso*, *Analista de negocio*,
  *Investigador*, *Tutor de idiomas*, *Tutor de matemáticas*, *Tutor de ajedrez*, *Tutor de guitarra acústica*,
  *Tutor e investigador de IA* y *Asistente de tareas*, más *En blanco*.
  - Matemáticas: fórmulas en LaTeX con `$$…$$` (KaTeX); un `$` suelto **no** es matemática, se reserva para dinero.
  - Ajedrez: conviene usar Sonnet u Opus en lugar de Haiku.
  - Guitarra: lectura de partituras, estudios por nivel y guitarra acústica.
  - IA: tendencias y cómo construir soluciones.
  - Asistente de tareas: da pistas, nunca la respuesta completa.

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
3. **Arranca el servidor** en la Mac: lo más simple es la [app de escritorio](#instalar-la-app-de-escritorio); desde el repo, `pnpm --filter @hub/web build && pnpm start` (puerto 4317). Para que quede siempre disponible, sigue [Dejarlo siempre encendido](#dejarlo-siempre-encendido-mac--tailscale).
4. **Token de acceso**: los clientes que no son la propia Mac necesitan un token. En la Mac abre `http://localhost:4317` → *Ajustes → Conectar dispositivo*, y abre en el iPad/iPhone el enlace (o escanea el QR). Ese primer acceso guarda una cookie de larga duración y quita el token de la URL. *Regenerar token* invalida los dispositivos ya conectados.
5. **Añadir a pantalla de inicio**: Safari → Compartir → "Añadir a pantalla de inicio". Se abre como app a pantalla completa.

Notas:
- Por HTTP plano (`http://nombre-mac:4317`) iOS instala la app pero no registra el service worker (requiere HTTPS), así que no hay caché offline del shell. Para tenerla, publica el servidor con HTTPS de Tailscale: `tailscale serve --bg 4317` y usa `https://nombre-mac.<tailnet>.ts.net`. Las peticiones que llegan por ese proxy (`tailscale serve`/`funnel`, o cualquier proxy inverso con cabeceras `X-Forwarded-For`, `Forwarded`, `X-Real-IP` o `Tailscale-User-*`) se tratan como remotas aunque vengan de localhost, así que también necesitan el token: abre el enlace con `?token=` igual que en el paso 4.
- **Dictado desde iPad/iPhone**: el micrófono (`getUserMedia`) solo existe en contextos seguros (HTTPS o `localhost`). Con `http://<ip>:4317` el botón del micrófono aparece desactivado con una explicación; adjuntar archivos de audio sí funciona. Para dictar, publica el servidor con HTTPS: `tailscale serve --bg 4317` (una vez; `tailscale serve status` muestra la URL y `tailscale serve reset` la quita) y abre `https://nombre-mac.<tailnet>.ts.net/?token=<token>` (el token es el de *Ajustes → Conectar dispositivo*; esa pantalla solo ofrece URLs `http://`, sustituye el esquema y el host). La app de escritorio ya tiene permiso de micrófono (macOS lo pedirá la primera vez).
- Seguridad: solo se confía en la propia Mac si la petición llega directa y con `Host` `localhost`/`127.0.0.1`/`[::1]`; las escrituras (`POST`/`PUT`/…) de `/api/*` con cabecera `Origin` de otro origen se rechazan (403), para que una web cualquiera no pueda llamar a `localhost:4317`.
- Si el servidor no responde, la app muestra un aviso "Servidor no disponible" y reintenta sola.

Para mantenerlo siempre encendido, ver [Dejarlo siempre encendido](#dejarlo-siempre-encendido-mac--tailscale).

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

## Dejarlo siempre encendido (Mac + Tailscale)

Para que el iPad/iPhone lleguen siempre a StudyLab tienen que estar activos **a la vez** la app en la Mac y Tailscale.
El servidor escucha en `0.0.0.0:4317`. Checklist:

### 1. App de StudyLab
- [ ] Menú *StudyLab → Iniciar al abrir sesión* activado (usa `openAtLogin` de Electron).
- [ ] Cierra la ventana en vez de salir: el servidor sigue corriendo y queda el icono en la barra de menús.
- [ ] No uses *Salir* (menú del icono o *Salir de StudyLab*): detiene el servidor.

### 2. Tailscale en la Mac
- [ ] Instala la app de Mac (App Store o la versión independiente de tailscale.com) e inicia sesión.
- [ ] En sus ajustes activa *Launch at login* / *Iniciar al abrir sesión* y déjala conectada.
- [ ] Misma cuenta en el iPad/iPhone.
- [ ] En iOS, Tailscale debe estar conectado (VPN activa) al usar la app. En la app de Tailscale de iOS activa
  **On Demand** para que se reconecte sola.

### 3. HTTPS opcional (dictado y service worker)
- [ ] En la consola de administración de Tailscale: *DNS* → activa *MagicDNS* y *HTTPS Certificates*.
- [ ] En la Mac: `tailscale serve --bg 4317`. `tailscaled` guarda la configuración, así que persiste tras reinicios
  (`tailscale serve status` la muestra; `tailscale serve reset` la quita).
- [ ] Con la app de Mac no hay `tailscale` en el PATH: menú de Tailscale → *Settings* → *Install CLI*, o usa
  `/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg 4317`.
- [ ] Abre `https://nombre-mac.<tailnet>.ts.net/?token=<token>` (ver notas de [Usar desde iPad / iPhone](#usar-desde-ipad--iphone)).

### 4. La Mac no debe suspenderse
- [ ] *Ajustes del Sistema → Batería → Opciones*: "Evitar suspensión automática cuando la pantalla está apagada"
  con el adaptador de corriente (en un Mac de escritorio: *Energía*), y activa "Activar para acceso a la red"
  (*Wake for network access*).
- [ ] Mantén el portátil enchufado. Con la tapa cerrada solo funciona con pantalla externa; si no, déjala abierta.
- [ ] `caffeinate -dimsu` evita la suspensión solo mientras se ejecuta (sirve como solución temporal).

### 5. Sesión de Claude
- [ ] El motor CLI usa tu sesión de `claude` en la Mac: debe seguir iniciada (`claude` → `/login`). Alternativa: motor API con tu key.

### Comprobar que funciona
- En la Mac: `curl http://localhost:4317/api/health` → `{"ok":true,"ui":true}`.
- En el iPhone: abre `http://nombre-mac:4317` o la URL https `ts.net`.
- Un aviso "Servidor no disponible" significa que la app de la Mac está cerrada o dormida, o que Tailscale está desconectado.

### Problemas frecuentes
| Síntoma | Causa | Solución |
| --- | --- | --- |
| "Falta la interfaz web" (503) o la app avisa de que el puerto lo ocupa otro servidor | Otro servidor (p. ej. `pnpm dev`) ocupa el 4317 sin la web compilada | Ciérralo y reinicia StudyLab (o ejecuta `pnpm --filter @hub/web build`) |
| El iPhone no conecta | Tailscale apagado en la Mac o en el iPhone, o la Mac está dormida | Activa Tailscale en ambos (On Demand en iOS) y revisa los ajustes de energía |
| Botón del micrófono desactivado en el iPhone | Accedes por `http://` (no es contexto seguro) | Usa HTTPS con `tailscale serve --bg 4317` |
| Pide token o responde 401 | Cookie caducada o token regenerado | Vuelve a conectar el dispositivo: *Ajustes → Conectar dispositivo* |

## Limitaciones conocidas
- El audio no se admite como archivo de conocimiento de un proyecto (solo como adjunto/dictado en el chat).
- La búsqueda no mira dentro de los archivos de conocimiento.
- La app empaquetada pesa ~730 MB (el `.dmg`, ~290 MB) por el runtime de Whisper/onnxruntime; la primera transcripción descarga además el modelo (~740 MB).
- Tras migrar desde Claude Hub, el antiguo `Claude Hub.app` de `/Applications` se puede borrar a mano (los datos se migran solos).

## Estructura
- `apps/server` — Hono + AI SDK + SQLite (Drizzle). Datos en `~/Library/Application Support/StudyLab/data` (antes `claude-hub`; se migra solo al arrancar).
- `apps/web` — Vite + React + shadcn + AI Elements.
- `apps/desktop` — Electron (ventana nativa sobre el servidor).
