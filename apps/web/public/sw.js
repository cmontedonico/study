// Minimal service worker: makes the app shell load offline and fast. It never touches /api/*
// (state, chat streaming), so data and streams always go straight to the network.
const CACHE = "hub-shell-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request)); // content-hashed filenames: safe to keep forever
  } else {
    event.respondWith(staleWhileRevalidate(request)); // manifest, icons
  }
});

async function networkFirstShell(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    // Redirects (e.g. ?token= handshake) and errors must not replace the cached shell.
    if (res.ok && !res.redirected) await cache.put("/", res.clone());
    return res;
  } catch {
    const cached = await cache.match("/");
    if (cached) return cached;
    throw new Error("offline and no cached shell");
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  // A missing chunk falls back to index.html on the server: don't cache that as JS/CSS.
  if (res.ok && !(res.headers.get("content-type") ?? "").includes("text/html")) {
    await cache.put(request, res.clone());
  }
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) void cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  return cached ?? (await network) ?? Response.error();
}
