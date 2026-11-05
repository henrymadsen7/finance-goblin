import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer as createHttpsServer } from "node:https";
import { z } from "zod";
import { createStore } from "./store.js";
import { migratePlaidCategories } from "./migrations.js";
import { preferencesSchema, readPreferences } from "./preferences.js";
import { demoData, importCSV, categories } from "./domain.js";
import { plaid, syncItem, linkTokenParams } from "./plaid.js";
import { syncActual } from "./actual.js";
import { createDesktopAccess, desktopEvents } from "./desktop-access.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4310);
const secure = !!(process.env.LOCAL_TLS_CERT && process.env.LOCAL_TLS_KEY);
const origin = `${secure ? "https" : "http"}://localhost:${port}`;
const store = createStore(process.env.FINANCE_DATA_DIR || join(root, ".local"));
migratePlaidCategories(store);
const csrf = randomBytes(32).toString("hex");
const desktopSecret = process.env.FINANCE_DESKTOP_SESSION;
const desktopAccess = desktopSecret ? createDesktopAccess(desktopSecret) : null;
const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  const host = req.headers.host;
  if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(host))
    return res.status(403).json({ error: "Use the local dashboard address." });
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-store",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
  if (desktopAccess) {
    if (req.path === "/desktop/bank-authorize" && req.method === "GET") {
      const token = desktopAccess.redeemTicket(String(req.query.ticket || ""));
      if (!token)
        return res
          .status(401)
          .send(
            "This bank connection link expired. Open it again from Finance Goblin.",
          );
      res.cookie("fg-desktop", token, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 30 * 60_000,
      });
      return res.redirect("/desktop-connect");
    }
    const access = desktopAccess.authorize(req.headers.cookie, req.path);
    if (!access)
      return res.status(401).json({
        error:
          "Open Finance Goblin from Applications to access this workspace.",
      });
    req.desktopAccess = access;
  }
  if (req.path.startsWith("/api/")) {
    if (
      req.headers["sec-fetch-site"] === "cross-site" ||
      (req.headers.origin &&
        ![origin, `${secure ? "https" : "http"}://127.0.0.1:${port}`].includes(
          req.headers.origin,
        ))
    )
      return res
        .status(403)
        .json({ error: "Cross-site requests are blocked." });
    if (req.method !== "GET" && req.headers["x-finance-csrf"] !== csrf)
      return res
        .status(403)
        .json({ error: "Reload the dashboard and try again." });
  }
  next();
});
app.use(express.json({ limit: "5mb" }));
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
let syncing = false;
app.get("/api/state", (req, res) => {
  const demo = req.query.mode === "demo";
  const data = demo
    ? demoData()
    : {
        accounts: store.list("account"),
        transactions: store.list("transaction"),
        budgets: store.get("preferences", "budgets") || {},
      };
  const config = store.get("config", "plaid");
  const actual = store.get("config", "actual");
  res.json({
    ...data,
    preferences: readPreferences(store),
    desktop: !!desktopAccess,
    actual: actual
      ? {
          configured: true,
          serverURL: actual.serverURL,
          budgetId: actual.budgetId,
          lastSync: actual.lastSync,
          error: actual.error,
        }
      : { configured: false },
    csrf,
    mode: demo ? "demo" : "live",
    syncing,
    provider: {
      configured: !!config,
      environment: config?.environment || null,
      redirectUri: config?.redirectUri || null,
    },
    connections: store
      .list("item")
      .map(({ accessToken, cursor, ...safe }) => safe),
    categories,
    serverTime: new Date().toISOString(),
    origin,
  });
});
app.post("/api/desktop/bank-link", (req, res) => {
  if (!desktopAccess || req.desktopAccess?.kind !== "desktop")
    return res
      .status(403)
      .json({ error: "Open bank connections from the desktop app." });
  const itemId = req.body.itemId;
  if (itemId && !store.get("item", itemId))
    return res.status(404).json({ error: "Connection not found." });
  const ticket = desktopAccess.createTicket(itemId);
  res.json({ url: `${origin}/desktop/bank-authorize?ticket=${ticket}` });
});
app.get("/api/desktop/link-info", (req, res) => {
  if (req.desktopAccess?.kind !== "bank")
    return res
      .status(403)
      .json({ error: "Open this page from Finance Goblin." });
  res.json({
    csrf,
    environment: store.get("config", "plaid")?.environment,
    itemId: req.desktopAccess.itemId || null,
  });
});
app.post("/api/desktop/link-complete", (req, res) => {
  if (req.desktopAccess?.kind !== "bank")
    return res
      .status(403)
      .json({ error: "No active bank connection session." });
  desktopEvents.emit("bank-linked");
  res.json({ ok: true });
});
app.get("/desktop-connect", (req, res) =>
  res.sendFile(join(root, "public/bank-link.html")),
);
app.get("/oauth/callback", (req, res, next) => {
  if (req.desktopAccess?.kind === "bank")
    return res.sendFile(join(root, "public/bank-link.html"));
  next();
});
app.get("/bank-link.js", (req, res) =>
  res.sendFile(join(root, "public/bank-link.js")),
);
app.get("/bank-link.css", (req, res) =>
  res.sendFile(join(root, "public/bank-link.css")),
);
const configSchema = z.object({
  clientId: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_-]{10,100}$/),
  secret: z.string().trim().min(10).max(300),
  environment: z.enum(["sandbox", "production"]),
  redirectUri: z
    .url()
    .max(500)
    .refine((v) => {
      const u = new URL(v);
      return (
        ["localhost", "127.0.0.1"].includes(u.hostname) &&
        u.pathname === "/oauth/callback"
      );
    }, "Use this computer’s /oauth/callback URL."),
});
app.post(
  "/api/provider/config",
  wrap(async (req, res) => {
    const config = configSchema.parse(req.body);
    if (
      !desktopAccess &&
      config.environment === "production" &&
      !config.redirectUri.startsWith("https://")
    )
      return res.status(400).json({
        error:
          "Production bank OAuth requires HTTPS. Enable local HTTPS before saving production keys; see the setup guide.",
      });
    const old = store.get("config", "plaid");
    if (
      old &&
      old.environment !== config.environment &&
      store.list("item").length
    )
      return res.status(409).json({
        error: "Disconnect existing banks before switching environments.",
      });
    await plaid(config, "institutions/get", {
      count: 1,
      offset: 0,
      country_codes: ["US"],
    });
    store.put("config", "plaid", config);
    res.json({ ok: true });
  }),
);
app.post(
  "/api/provider/link",
  wrap(async (req, res) => {
    const config = store.get("config", "plaid");
    const item = req.body.itemId ? store.get("item", req.body.itemId) : null;
    if (req.body.itemId && !item)
      return res.status(404).json({ error: "Connection not found." });
    const params = linkTokenParams(config, item, { desktop: !!desktopAccess });
    const result = await plaid(config, "link/token/create", params);
    res.json({ linkToken: result.link_token, update: !!item });
  }),
);
app.post(
  "/api/provider/exchange",
  wrap(async (req, res) => {
    const { publicToken, institution } = z
      .object({
        publicToken: z.string().min(10).max(500),
        institution: z.string().min(1).max(200),
      })
      .parse(req.body);
    const config = store.get("config", "plaid");
    const result = await plaid(config, "item/public_token/exchange", {
      public_token: publicToken,
    });
    const item = {
      id: result.item_id,
      accessToken: result.access_token,
      institution,
      cursor: "",
      lastSync: null,
      error: null,
    };
    store.put("item", item.id, item);
    try {
      await syncItem(store, item);
      res.json({ ok: true });
    } catch (e) {
      res.json({ ok: true, warning: e.message });
    }
  }),
);
async function syncAll() {
  if (syncing) return;
  syncing = true;
  const errors = [];
  try {
    const actual = store.get("config", "actual");
    if (actual) {
      try {
        await syncActual(store, actual);
      } catch (e) {
        store.put("config", "actual", { ...actual, error: e.message });
        errors.push(e.message);
      }
    }
    for (const item of store.list("item")) {
      try {
        await syncItem(store, item);
      } catch (e) {
        errors.push(`${item.institution}: ${e.message}`);
      }
    }
  } finally {
    syncing = false;
  }
  return errors;
}
app.post(
  "/api/sync",
  wrap(async (req, res) => {
    if (syncing)
      return res.status(409).json({ error: "A sync is already running." });
    const errors = await syncAll();
    res.json({ ok: !errors.length, errors });
  }),
);
app.post(
  "/api/connections/:id/disconnect",
  wrap(async (req, res) => {
    const item = store.get("item", req.params.id);
    if (!item) return res.status(404).json({ error: "Connection not found." });
    if (syncing)
      return res
        .status(409)
        .json({ error: "Wait for the current sync to finish." });
    await plaid(store.get("config", "plaid"), "item/remove", {
      access_token: item.accessToken,
    });
    store.batch(() => {
      store.remove("item", item.id);
      for (const kind of ["account", "transaction"])
        for (const row of store.list(kind))
          if (row.itemId === item.id) store.remove(kind, row.id);
    });
    res.json({ ok: true });
  }),
);
app.post(
  "/api/actual/config",
  wrap(async (req, res) => {
    if (syncing)
      return res
        .status(409)
        .json({ error: "Wait for the current sync to finish." });
    const config = z
      .object({
        serverURL: z.url().refine((v) => {
          const u = new URL(v);
          return (
            !u.username &&
            !u.password &&
            (["localhost", "127.0.0.1"].includes(u.hostname)
              ? ["http:", "https:"].includes(u.protocol)
              : u.protocol === "https:")
          );
        }, "Use HTTPS for remote Actual servers."),
        password: z.string().min(1).max(500),
        budgetId: z.uuid(),
        encryptionPassword: z.string().max(500).optional(),
      })
      .parse(req.body);
    syncing = true;
    try {
      await syncActual(store, config);
    } finally {
      syncing = false;
    }
    res.json({ ok: true });
  }),
);
app.post("/api/actual/disconnect", (req, res) => {
  if (syncing)
    return res
      .status(409)
      .json({ error: "Wait for the current sync to finish." });
  store.batch(() => {
    store.remove("config", "actual");
    for (const kind of ["account", "transaction"])
      for (const row of store.list(kind))
        if (row.itemId === "actual") store.remove(kind, row.id);
  });
  res.json({ ok: true });
});
app.post("/api/import/preview", (req, res, next) => {
  try {
    const csv = z.string().max(4500000).parse(req.body.csv);
    const rows = importCSV(csv);
    res.json({
      count: rows.length,
      duplicates: rows.filter((r) => store.get("transaction", r.id)).length,
      rows: rows.slice(0, 6),
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/import", (req, res, next) => {
  try {
    const rows = importCSV(z.string().max(4500000).parse(req.body.csv));
    let count = 0;
    store.batch(() => {
      for (const { accountName, ...row } of rows) {
        if (store.get("transaction", row.id)) continue;
        store.put("transaction", row.id, row);
        if (!store.get("account", row.accountId))
          store.put("account", row.accountId, {
            id: row.accountId,
            name: accountName,
            institution: "CSV import",
            type: "unknown",
            balance: null,
            currency: "USD",
            source: "csv",
          });
        count++;
      }
    });
    res.json({ ok: true, count });
  } catch (e) {
    next(e);
  }
});
app.post("/api/budgets", (req, res, next) => {
  try {
    const budgets = z
      .record(z.string().max(100), z.number().int().min(0).max(100000000))
      .parse(req.body.budgets);
    store.put("preferences", "budgets", budgets);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.post("/api/preferences", (req, res, next) => {
  try {
    const preferences = preferencesSchema.parse(req.body);
    for (const plan of preferences.payments) {
      const account = store.get("account", plan.accountId);
      if (!account || account.type !== "credit")
        return res
          .status(400)
          .json({
            error: "Payment dates must belong to a connected credit card.",
          });
    }
    store.put("preferences", "dashboard", preferences);
    res.json({ ok: true, preferences });
  } catch (e) {
    next(e);
  }
});
app.get("/api/health", (req, res) =>
  res.json({ ok: true, app: "finance-goblin", version: "1.0.0" }),
);
app.use("/api", (req, res) =>
  res.status(404).json({ error: "API route not found." }),
);
if (process.argv.includes("--dev")) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: {
      middlewareMode: true,
      hmr: { port: port + 1, host: "localhost" },
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  if (!existsSync(join(root, "dist/index.html")))
    throw new Error("Build the dashboard first: npm run build");
  app.use(express.static(join(root, "dist"), { etag: false }));
  app.get("/{*path}", (req, res) =>
    res.sendFile(join(root, "dist/index.html")),
  );
}
app.use((err, req, res, next) => {
  res
    .status(
      err instanceof z.ZodError
        ? 400
        : err.type === "entity.too.large"
          ? 413
          : 400,
    )
    .json({
      error:
        err instanceof z.ZodError
          ? "Please check the input format."
          : err.message || "Request failed.",
    });
});
const server = secure
  ? createHttpsServer(
      {
        cert: readFileSync(process.env.LOCAL_TLS_CERT),
        key: readFileSync(process.env.LOCAL_TLS_KEY),
      },
      app,
    )
  : app;
export const httpServer = server.listen(port, "127.0.0.1", () =>
  console.log(`Finance Goblin is running at ${origin}`),
);
const timer = setInterval(
  () => {
    void syncAll();
  },
  30 * 60 * 1000,
);
timer.unref();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    process.exit(0);
  });

export function stopService() {
  clearInterval(timer);
  httpServer.close();
}
