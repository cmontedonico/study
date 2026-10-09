import { randomBytes, timingSafeEqual } from "node:crypto";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

export const TOKEN_COOKIE = "hub_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // browsers cap cookies at ~400 days

export type AddressSource = (c: Context) => string | undefined;

/** Socket address of the peer. Injectable so tests can pretend to be a remote client. */
export const socketAddress: AddressSource = (c) => {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined; // no socket (e.g. app.request in tests) → treated as remote
  }
};

export function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  return address === "::1" || address.startsWith("127.") || address === "::ffff:127.0.0.1";
}

export function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

function safeEqual(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface AuthOptions {
  getToken: () => string;
  address?: AddressSource;
}

/**
 * Loopback is always allowed. Remote clients need the access token (Bearer header or cookie) for `/api/*`;
 * static assets stay public so the PWA shell, manifest and icons load. A `?token=` query on any page
 * sets the cookie and redirects to the same URL without it.
 */
export function accessAuth({ getToken, address = socketAddress }: AuthOptions): MiddlewareHandler {
  return async (c, next) => {
    if (isLoopback(address(c))) return next();
    const token = getToken();

    const queryToken = c.req.query("token");
    if (queryToken !== undefined) {
      const url = new URL(c.req.url);
      url.searchParams.delete("token");
      if (safeEqual(queryToken, token)) {
        setCookie(c, TOKEN_COOKIE, token, {
          httpOnly: true,
          sameSite: "Lax",
          path: "/",
          maxAge: COOKIE_MAX_AGE,
        });
      }
      return c.redirect(url.pathname + url.search, 302);
    }

    if (!c.req.path.startsWith("/api/")) return next();

    const bearer = c.req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (safeEqual(bearer, token) || safeEqual(getCookie(c, TOKEN_COOKIE), token)) return next();
    if (getCookie(c, TOKEN_COOKIE)) deleteCookie(c, TOKEN_COOKIE, { path: "/" }); // stale after a regenerate
    return c.json({ error: "No autorizado: falta el token de acceso" }, 401);
  };
}
