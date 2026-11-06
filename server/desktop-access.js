import { randomBytes, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
export const desktopEvents = new EventEmitter();
const browserRoutes = new Set([
  "GET /desktop-connect",
  "GET /oauth/callback",
  "GET /bank-link.js",
  "GET /bank-link.css",
  "GET /favicon.svg",
  "GET /api/desktop/link-info",
  "POST /api/provider/link",
  "POST /api/provider/exchange",
  "POST /api/sync",
  "POST /api/desktop/link-complete",
]);
export class AccessError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.status = status;
  }
}
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
    for (const [id, s] of tickets) if (s.expires <= now()) tickets.delete(id);
    for (const [id, s] of browserSessions)
      if (s.expires <= now()) browserSessions.delete(id);
  }
  return {
    createTicket(itemId) {
      clean();
      if (tickets.size >= 20) tickets.delete(tickets.keys().next().value);
      const ticket = randomBytes(32).toString("hex");
      tickets.set(ticket, { itemId: itemId || null, expires: now() + 60_000 });
      return ticket;
    },
    redeemTicket(ticket) {
      clean();
      const entry = tickets.get(ticket);
      if (!entry) return null;
      tickets.delete(ticket);
      if (browserSessions.size >= 20)
        browserSessions.delete(browserSessions.keys().next().value);
      const token = randomBytes(32).toString("hex");
      browserSessions.set(token, {
        ...entry,
        csrf: randomBytes(32).toString("hex"),
        phase: "ready",
        busy: false,
        attempts: 0,
        expires: now() + 30 * 60_000,
      });
      return token;
    },
    authorize(cookie, path, method = "GET") {
      clean();
      const token = cookieValue(cookie);
      if (equal(token, secret)) return { kind: "desktop" };
      const entry = browserSessions.get(token);
      if (entry && browserRoutes.has(`${method} ${path}`))
        return { kind: "bank", ...entry };
      return null;
    },
    // One authorized bank, one result, serialized provider calls. Retries are
    // bounded; a new session requires a fresh handoff from the desktop app.
    beginOperation(cookie, operation, itemId = null) {
      clean();
      const entry = browserSessions.get(cookieValue(cookie));
      if (!entry)
        throw new AccessError("This bank connection session expired.");
      if (entry.busy)
        throw new AccessError("A connection request is already running.", 409);
      if (operation === "complete") {
        if (entry.phase !== "linked")
          throw new AccessError("Finish authorizing your bank first.");
      } else {
        if (entry.phase === "linked")
          throw new AccessError("This bank connection is already complete.");
        if ((itemId || null) !== entry.itemId)
          throw new AccessError(
            "This session belongs to a different bank connection.",
          );
        if (
          (operation === "exchange" && entry.itemId) ||
          (operation === "sync" && !entry.itemId)
        )
          throw new AccessError(
            "This operation is not permitted for this bank session.",
          );
        if (operation !== "link" && entry.phase !== "linking")
          throw new AccessError("Start bank authorization first.");
        if (++entry.attempts > 12)
          throw new AccessError(
            "Too many attempts. Start a new connection from the desktop app.",
            429,
          );
      }
      entry.busy = true;
      let finished = false;
      return (success = false) => {
        if (finished) return;
        finished = true;
        entry.busy = false;
        if (success) entry.phase = operation === "link" ? "linking" : "linked";
      };
    },
    revokeBrowser(cookie) {
      browserSessions.delete(cookieValue(cookie));
    },
  };
}

// Developer/browser launches also require an owner-held bootstrap link. This
// keeps another local OS user or an untrusted website from reading its API.
export function createBrowserAccess({ now = Date.now } = {}) {
  const ticket = randomBytes(32).toString("hex"),
    token = randomBytes(32).toString("hex");
  const expires = now() + 5 * 60_000;
  let redeemed = false;
  return {
    ticket,
    redeem(value) {
      if (redeemed || now() >= expires || value !== ticket) return null;
      redeemed = true;
      return token;
    },
    authorize(cookie = "") {
      const value =
        cookie
          .split(";")
          .map((s) => s.trim())
          .find((s) => s.startsWith("fg-browser="))
          ?.slice(11) || "";
      const a = Buffer.from(value),
        b = Buffer.from(token);
      return a.length === b.length && timingSafeEqual(a, b);
    },
  };
}
