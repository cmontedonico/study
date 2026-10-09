import { networkInterfaces } from "node:os";
import { Hono } from "hono";
import { generateToken, isLoopback, socketAddress, type AddressSource } from "../auth.ts";
import { getSetting, setSetting } from "../settings.ts";

export interface AccessUrl {
  kind: "tailscale" | "lan";
  label: string;
  url: string;
}

/** Returns the stored token, creating one on first use. */
export function ensureAccessToken(): string {
  let token = getSetting("accessToken");
  if (!token) {
    token = generateToken();
    setSetting("accessToken", token);
  }
  return token;
}

export function accessUrls(token: string, port: number, interfaces = networkInterfaces()): AccessUrl[] {
  const urls: AccessUrl[] = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      const tailscale = a.address.startsWith("100.");
      urls.push({
        kind: tailscale ? "tailscale" : "lan",
        label: `${tailscale ? "Tailscale" : "Red local"} (${name})`,
        url: `http://${a.address}:${port}/?token=${token}`,
      });
    }
  }
  // Tailscale first: it is the one that works away from home.
  return urls.sort((a, b) => Number(b.kind === "tailscale") - Number(a.kind === "tailscale"));
}

export function accessRoutes(address: AddressSource = socketAddress) {
  const routes = new Hono();
  const port = Number(process.env.PORT ?? 4317);

  // Only the Mac itself may read or rotate the token, never a remote client holding it.
  routes.use("*", async (c, next) => {
    if (!isLoopback(address(c))) return c.json({ error: "Solo disponible desde este equipo" }, 403);
    return next();
  });

  routes.get("/", (c) => {
    const token = ensureAccessToken();
    return c.json({ urls: accessUrls(token, port) });
  });

  routes.post("/regenerate", (c) => {
    const token = generateToken();
    setSetting("accessToken", token);
    return c.json({ urls: accessUrls(token, port) });
  });

  return routes;
}
