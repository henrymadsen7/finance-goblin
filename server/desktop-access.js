import { randomBytes, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
export const desktopEvents = new EventEmitter();
const browserPaths = new Set([
  "/desktop-connect",
  "/oauth/callback",
  "/bank-link.js",
  "/bank-link.css",
  "/favicon.svg",
  "/api/desktop/link-info",
  "/api/provider/link",
  "/api/provider/exchange",
  "/api/sync",
  "/api/desktop/link-complete",
]);
export function createDesktopAccess(secret, { now = Date.now } = {}) {
  const tickets = new Map(),
    browserSessions = new Map();
  const equal = (a, b) => {
    const left = Buffer.from(a || ""),
      right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  };
  function cookieValue(header) {
    return (
      (header || "")
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("fg-desktop="))
        ?.slice("fg-desktop=".length) || ""
    );
  }
  function clean() {
    for (const [id, s] of tickets) if (s.expires < now()) tickets.delete(id);
    for (const [id, s] of browserSessions)
      if (s.expires < now()) browserSessions.delete(id);
  }
  return {
    createTicket(itemId) {
      clean();
      const ticket = randomBytes(32).toString("hex");
      tickets.set(ticket, { itemId, expires: now() + 60_000 });
      return ticket;
    },
    redeemTicket(ticket) {
      clean();
      const entry = tickets.get(ticket);
      if (!entry) return null;
      tickets.delete(ticket);
      const token = randomBytes(32).toString("hex");
      browserSessions.set(token, { ...entry, expires: now() + 30 * 60_000 });
      return token;
    },
    authorize(cookie, path) {
      clean();
      const token = cookieValue(cookie);
      if (equal(token, secret)) return { kind: "desktop" };
      const entry = browserSessions.get(token);
      if (entry && browserPaths.has(path)) return { kind: "bank", ...entry };
      return null;
    },
    revokeBrowser(cookie) {
      browserSessions.delete(cookieValue(cookie));
    },
  };
}
