import { memoryDay } from "./library.js";
import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
const scopes = z.enum(["life", "finance", "shared"]);
const title = z.string().trim().min(1).max(160);
export function memoryRouter(library, { isBusy = () => false } = {}) {
  const r = Router(),
    store = library.store;
  r.use("/library/:scope", (req, _res, next) => {
    if (req.method !== "GET" && isBusy(req.params.scope))
      return next(
        Error("Wait for the current reply before changing conversations."),
      );
    next();
  });
  const wrap = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
  r.get("/library/:scope", (req, res, next) => {
    try {
      const scope = z.enum(["life", "finance"]).parse(req.params.scope);
      res.json(library.state(scope));
    } catch (e) {
      next(e);
    }
  });
  r.post("/library/:scope/threads", (req, res, next) => {
    try {
      const scope = z.enum(["life", "finance"]).parse(req.params.scope);
      const v = z
        .object({
          title: title.optional(),
          projectId: z.string().nullable().optional(),
        })
        .strict()
        .parse(req.body);
      res.json(library.createThread(scope, v));
    } catch (e) {
      next(e);
    }
  });
  r.put("/library/:scope/threads/:id", (req, res, next) => {
    try {
      const scope = z.enum(["life", "finance"]).parse(req.params.scope),
        old = library.thread(scope, req.params.id),
        v = z
          .object({
            title: title.optional(),
            projectId: z.string().nullable().optional(),
            includeOtherScopes: z.boolean().optional(),
          })
          .strict()
          .parse(req.body);
      if (v.projectId) {
        const p = store.get("chatProject", v.projectId);
        if (!p || p.archivedAt || ![scope, "shared"].includes(p.scope))
          throw Error("Project is not available in this workspace.");
      }
      const next = {
        ...old,
        ...v,
        ...(v.title ? { titleAuto: false } : {}),
        updatedAt: new Date().toISOString(),
      };
      store.put("chatThread", old.id, next);
      library.touch();
      res.json(next);
    } catch (e) {
      next(e);
    }
  });
  r.post("/library/:scope/threads/:id/restore", (req, res, next) => {
    try {
      const old = store.get("chatThread", req.params.id);
      if (!old || old.scope !== req.params.scope)
        throw Error("Chat not found.");
      store.put("chatThread", old.id, { ...old, archivedAt: null });
      library.touch();
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  r.delete("/library/:scope/threads/:id", (req, res, next) => {
    try {
      library.removeThread(req.params.scope, req.params.id);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  r.post("/library/:scope/projects", (req, res, next) => {
    try {
      const scope = z.enum(["life", "finance"]).parse(req.params.scope),
        v = z
          .object({
            name: title,
            description: z.string().max(6000).default(""),
            shared: z.boolean().default(false),
          })
          .strict()
          .parse(req.body);
      const now = new Date().toISOString(),
        row = {
          id: randomUUID(),
          name: v.name,
          description: v.description,
          scope: v.shared ? "shared" : scope,
          createdAt: now,
          updatedAt: now,
        };
      store.put("chatProject", row.id, row);
      res.json(row);
    } catch (e) {
      next(e);
    }
  });
  r.put("/library/:scope/projects/:id", (req, res, next) => {
    try {
      const old = store.get("chatProject", req.params.id);
      if (!old || ![req.params.scope, "shared"].includes(old.scope))
        throw Error("Project not found.");
      const v = z
        .object({ name: title, description: z.string().max(6000).default("") })
        .strict()
        .parse(req.body);
      store.put("chatProject", old.id, {
        ...old,
        ...v,
        updatedAt: new Date().toISOString(),
      });
      library.touch();
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  r.delete("/library/:scope/projects/:id", (req, res, next) => {
    try {
      const old = store.get("chatProject", req.params.id);
      if (!old || ![req.params.scope, "shared"].includes(old.scope))
        throw Error("Project not found.");
      store.batch(() => {
        store.put("chatProject", old.id, {
          ...old,
          archivedAt: new Date().toISOString(),
        });
        for (const t of library.active("chatThread"))
          if (t.projectId === old.id)
            store.put("chatThread", t.id, { ...t, projectId: null });
      });
      library.touch();
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  r.get(
    "/memory/search",
    wrap(async (req, res) => {
      const v = z
        .object({
          q: z.string().max(1000).default(""),
          scope: z.enum(["all", "life", "finance", "shared"]).default("all"),
          kind: z
            .enum(["all", "fact", "conversation", "document"])
            .default("all"),
          from: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .or(z.literal(""))
            .default(""),
          to: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .or(z.literal(""))
            .default(""),
          projectId: z.string().default(""),
          retired: z.enum(["true", "false"]).default("false"),
        })
        .parse(req.query);
      const result = await library.search(v.q, {
        ...v,
        includeRetired: v.retired === "true",
        limit: 250,
      });
      const all = library.memoryEntries();
      const byDay = {};
      for (const m of all) {
        const day = memoryDay(m.createdAt);
        if (day) byDay[day] = (byDay[day] || 0) + 1;
      }
      res.json({
        ...result,
        counts: {
          total: all.length,
          facts: all.filter((m) => m.kind === "fact").length,
          conversations: all.filter((m) => m.kind === "conversation").length,
        },
        byDay,
        projects: library.active("chatProject"),
        threads: library.active("chatThread"),
      });
    }),
  );
  r.post("/memory/facts", (req, res, next) => {
    try {
      const v = z
        .object({
          text: z.string().trim().min(1).max(12000),
          scope: scopes,
          threadId: z.string().nullable().optional(),
          projectId: z.string().nullable().optional(),
          tags: z.array(z.string().max(60)).max(12).default([]),
          pinned: z.boolean().default(true),
          sourceMemoryId: z.string().max(300).optional(),
        })
        .strict()
        .parse(req.body);
      if (v.threadId) {
        const t = store.get("chatThread", v.threadId);
        if (
          !t ||
          (![v.scope, "shared"].includes(t.scope) && v.scope !== "shared")
        )
          throw Error("Memory source is not available.");
      }
      const source = v.sourceMemoryId
        ? store.get("memoryEpisode", v.sourceMemoryId) ||
          store.get("memory", v.sourceMemoryId)
        : null;
      if (v.sourceMemoryId && !source) throw Error("Source memory not found.");
      res.json(
        library.saveFact({
          ...v,
          threadId: source?.threadId || v.threadId || null,
          projectId: source?.projectId || v.projectId || null,
          verified: true,
          source: source
            ? {
                type: "memory",
                id: source.id,
                quote: source.text.slice(0, 1500),
              }
            : { type: "manual" },
        }),
      );
    } catch (e) {
      next(e);
    }
  });
  r.put("/memory/facts/:id", (req, res, next) => {
    try {
      const old = store.get("memory", req.params.id);
      if (!old) throw Error("Memory not found.");
      const v = z
        .object({
          text: z.string().trim().min(1).max(12000),
          scope: scopes,
          pinned: z.boolean(),
          tags: z.array(z.string().max(60)).max(12).optional(),
        })
        .strict()
        .parse(req.body);
      store.put("memoryRevision", randomUUID(), {
        ...old,
        revisedAt: new Date().toISOString(),
      });
      res.json(library.saveFact({ ...v, verified: true }, old.id));
    } catch (e) {
      next(e);
    }
  });
  r.post("/memory/:id/retire", (req, res, next) => {
    try {
      const old = store.get("memory", req.params.id);
      if (!old) throw Error("Only saved facts can be retired.");
      store.put("memory", old.id, {
        ...old,
        validTo: new Date().toISOString(),
      });
      library.touch();
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  r.post("/memory/:id/restore", (req, res, next) => {
    try {
      const old = store.get("memory", req.params.id);
      if (!old) throw Error("Memory not found.");
      store.put("memory", old.id, { ...old, validTo: null });
      library.touch();
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  r.get("/library/:scope/threads/:id/export", (req, res, next) => {
    try {
      const t = library.thread(req.params.scope, req.params.id);
      res
        .set("Content-Disposition", 'attachment; filename="chat-export.json"')
        .json({
          version: 1,
          thread: t,
          messages: store.list("chat").filter((m) => m.threadId === t.id),
          memories: library.memoryEntries().filter((m) => m.threadId === t.id),
        });
    } catch (e) {
      next(e);
    }
  });
  r.get("/memory/export", (_req, res) =>
    res
      .set("Content-Disposition", 'attachment; filename="memory-export.json"')
      .json({
        version: 1,
        exportedAt: new Date().toISOString(),
        threads: store.list("chatThread"),
        projects: store.list("chatProject"),
        messages: store.list("chat"),
        memories: [...store.list("memoryEpisode"), ...store.list("memory")],
        revisions: store.list("memoryRevision"),
      }),
  );
  return r;
}
