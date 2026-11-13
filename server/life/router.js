import { Router } from "express";
import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { createLifeDomain, schemas, sourceSchema } from "./domain.js";
import { connectPath, readConnect, importConnect } from "./connect.js";
import { parseCalendar, replaceCalendar } from "./calendar.js";
import { publicText } from "./network.js";
import { prepareSchoolBundle, applySchoolBundle } from "./school.js";
import { defaultLifeAppearance } from "../../shared/life-appearance.js";
import { createGoogle } from "./google.js";
export function createLifeRouter(store, { origin, csrf } = {}) {
  const router = Router(),
    domain = createLifeDomain(store),
    google = createGoogle(domain, origin),
    pending = new Map(),
    syncing = new Set();
  const wrap = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
  router.get("/state", (_req, res) =>
    res.json({
      ...domain.snapshot(),
      messages: domain.list("message"),
      driveFiles: domain.list("driveFile"),
      csrf,
      connectAvailable: existsSync(connectPath()),
      googleConfigured: !!store.get("settings", "google")?.clientId,
    }),
  );
  router.get("/export", (_req, res) => {
    res.set("Content-Disposition", 'attachment; filename="life-backup.json"');
    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      ...domain.snapshot(),
      messages: domain.list("message"),
      driveFiles: domain.list("driveFile"),
    });
  });
  router.post("/records/:kind", (req, res, next) => {
    try {
      res.json(domain.save(req.params.kind, req.body));
    } catch (e) {
      next(e);
    }
  });
  router.put("/records/:kind/:id", (req, res, next) => {
    try {
      res.json(domain.save(req.params.kind, req.body, req.params.id));
    } catch (e) {
      next(e);
    }
  });
  router.delete("/records/:kind/:id", (req, res, next) => {
    try {
      domain.archive(req.params.kind, req.params.id);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  router.post("/preferences", (req, res, next) => {
    try {
      const data = z
        .object({
          timeZone: z.string().max(100).optional(),
          appearance: z
            .object({
              ...Object.fromEntries(
                Object.keys(defaultLifeAppearance)
                  .filter((k) => k !== "radius")
                  .map((k) => [k, z.string().regex(/^#[0-9a-fA-F]{6}$/)]),
              ),
              radius: z.number().int().min(6).max(30),
            })
            .strict()
            .optional(),
        })
        .strict()
        .parse(req.body);
      if (data.timeZone)
        new Intl.DateTimeFormat("en", { timeZone: data.timeZone });
      const next = {
        timeZone: "America/Denver",
        ...store.get("settings", "life"),
        ...data,
      };
      store.put("settings", "life", next);
      res.json(next);
    } catch (e) {
      next(e);
    }
  });
  router.post("/connect/preview", (req, res, next) => {
    try {
      const data = req.body?.data ? req.body.data : readConnect();
      const tables = data.tables || data;
      if (!Array.isArray(tables.contacts))
        throw Error("Choose a Connect export.");
      const ticket = randomUUID();
      pending.set(ticket, {
        kind: "connect",
        data: tables,
        expires: Date.now() + 600000,
      });
      res.json({
        ticket,
        contacts: tables.contacts.length,
        projects: tables.projects?.length || 0,
        notes: (tables.notes?.length || 0) + (tables.interactions?.length || 0),
        sample: tables.contacts
          .slice(0, 5)
          .map((c) => ({ name: c.name, headline: c.headline })),
        source: "Connect · read-only import",
      });
    } catch (e) {
      next(e);
    }
  });
  router.post("/connect/import", (req, res, next) => {
    try {
      const entry = pending.get(req.body.ticket);
      pending.delete(req.body.ticket);
      if (!entry || entry.kind !== "connect" || entry.expires < Date.now())
        throw Error("Preview expired. Review the import again.");
      res.json(importConnect(domain, entry.data));
    } catch (e) {
      next(e);
    }
  });
  router.post("/school/bundle/preview", (req, res, next) => {
    try {
      const plan = prepareSchoolBundle(req.body),
        ticket = randomUUID();
      pending.set(ticket, {
        kind: "school-bundle",
        plan,
        expires: Date.now() + 600000,
      });
      res.json({
        ticket,
        count: plan.count,
        courses: plan.courses.map((e) => ({
          name: e.course.name,
          code: e.course.code,
          count: e.tasks.length,
          source: e.source,
          titles: e.tasks.map((t) => ({
            title: t.title,
            dueDate: t.dueDate,
            dueTime: t.dueTime,
            timeZone: t.timeZone,
          })),
        })),
      });
    } catch (e) {
      next(e);
    }
  });
  router.post("/school/bundle/import", (req, res, next) => {
    try {
      const entry = pending.get(req.body.ticket);
      pending.delete(req.body.ticket);
      if (
        !entry ||
        entry.kind !== "school-bundle" ||
        entry.expires < Date.now()
      )
        throw Error("Preview expired. Review the capture again.");
      res.json(applySchoolBundle(domain, entry.plan));
    } catch (e) {
      next(e);
    }
  });
  const schoolSchema = z
    .object({
      courseId: z.string(),
      source: sourceSchema.extend({
        kind: z.literal("screen"),
        evidence: z.string().min(1).max(12000),
        url: z
          .string()
          .url()
          .refine((v) => /^https:\/\//.test(v)),
      }),
      rows: z
        .array(
          schemas.task.omit({
            courseId: true,
            projectId: true,
            personId: true,
            source: true,
          }),
        )
        .min(1)
        .max(3000),
    })
    .strict();
  router.post("/school/preview", (req, res, next) => {
    try {
      const data = schoolSchema.parse(req.body);
      if (!domain.list("course").some((c) => c.id === data.courseId))
        throw Error("Choose an existing course.");
      const seen = new Set();
      const rows = data.rows.map((row) => {
        const id =
          "school:" +
          createHash("sha256")
            .update(JSON.stringify([data.courseId, data.source.url, row.title]))
            .digest("hex")
            .slice(0, 32);
        if (seen.has(id))
          throw Error("Duplicate assignment names need separate source URLs.");
        seen.add(id);
        return {
          ...row,
          id,
          courseId: data.courseId,
          projectId: null,
          personId: null,
          source: data.source,
        };
      });
      const ticket = randomUUID();
      pending.set(ticket, {
        kind: "school",
        rows,
        expires: Date.now() + 600000,
      });
      res.json({
        ticket,
        rows: rows.map((r) => ({ ...r, existing: !!store.get("task", r.id) })),
        source: data.source,
      });
    } catch (e) {
      next(e);
    }
  });
  router.post("/school/import", (req, res, next) => {
    try {
      const entry = pending.get(req.body.ticket);
      pending.delete(req.body.ticket);
      if (!entry || entry.kind !== "school" || entry.expires < Date.now())
        throw Error("Preview expired. Review the capture again.");
      store.batch(() => {
        for (const r of entry.rows) {
          const old = store.get("task", r.id);
          domain.save(
            "task",
            Object.fromEntries(
              Object.entries({ ...r, status: old?.status || r.status }).filter(
                ([k]) => k !== "id",
              ),
            ),
            r.id,
            { create: true },
          );
        }
        store.put("import", entry.rows[0].courseId, {
          id: entry.rows[0].courseId,
          label: entry.rows[0].source.label,
          observedAt: entry.rows[0].source.observedAt,
          count: entry.rows.length,
          source: entry.rows[0].source,
        });
      });
      res.json({ imported: entry.rows.length });
    } catch (e) {
      next(e);
    }
  });
  router.post("/calendar/preview", (req, res, next) => {
    try {
      const data = z
          .object({
            text: z.string().max(3000000),
            label: z.string().trim().min(1).max(200),
            timeZone: z.string().max(100),
          })
          .parse(req.body),
        id = randomUUID(),
        rows = parseCalendar(data.text, { ...data, id }),
        ticket = randomUUID();
      pending.set(ticket, {
        kind: "calendar",
        rows,
        id,
        label: data.label,
        expires: Date.now() + 600000,
      });
      res.json({ ticket, count: rows.length, rows: rows.slice(0, 100) });
    } catch (e) {
      next(e);
    }
  });
  router.post("/calendar/import", (req, res, next) => {
    try {
      const entry = pending.get(req.body.ticket);
      pending.delete(req.body.ticket);
      if (!entry || entry.kind !== "calendar" || entry.expires < Date.now())
        throw Error("Preview expired.");
      replaceCalendar(domain, entry.id, entry.rows);
      store.put("connection", entry.id, {
        id: entry.id,
        provider: "ical-file",
        label: entry.label,
        status: "imported",
        lastSync: new Date().toISOString(),
      });
      res.json({ imported: entry.rows.length });
    } catch (e) {
      next(e);
    }
  });
  router.post(
    "/calendar/feed",
    wrap(async (req, res) => {
      const data = z
        .object({
          url: z.string().url(),
          label: z.string().trim().min(1).max(200),
          timeZone: z.string().max(100),
        })
        .parse(req.body);
      const id = randomUUID(),
        rows = parseCalendar(await publicText(data.url), { ...data, id });
      replaceCalendar(domain, id, rows);
      store.put("connection", id, {
        ...data,
        id,
        provider: "ical",
        status: "connected",
        lastSync: new Date().toISOString(),
      });
      res.json({ imported: rows.length });
    }),
  );
  router.post(
    "/connections/:id/sync",
    wrap(async (req, res) => {
      const id = req.params.id,
        c = store.get("connection", id);
      if (!c) throw Error("Connection not found.");
      if (syncing.has(id)) throw Error("This source is already refreshing.");
      syncing.add(id);
      try {
        if (c.provider === "google") await google.sync(id);
        else if (c.provider === "ical") {
          const rows = parseCalendar(await publicText(c.url), c);
          replaceCalendar(domain, id, rows);
          store.put("connection", id, {
            ...c,
            status: "connected",
            lastSync: new Date().toISOString(),
            error: null,
          });
        } else throw Error("Import the source file again to refresh it.");
        res.json({ ok: true });
      } catch {
        store.put("connection", id, {
          ...store.get("connection", id),
          status: "error",
          error: "Refresh failed. Last complete snapshot retained.",
        });
        throw Error("Refresh failed. Last complete snapshot retained.");
      } finally {
        syncing.delete(id);
      }
    }),
  );
  router.delete(
    "/connections/:id",
    wrap(async (req, res) => {
      const id = req.params.id;
      store.batch(() => {
        for (const kind of ["event", "message", "driveFile"])
          for (const row of store.list(kind))
            if (row.connectionId === id) store.remove(kind, row.id);
        store.remove("connection", id);
      });
      res.json({ ok: true });
    }),
  );
  router.post(
    "/google/docs/read",
    wrap(async (req, res) => {
      const { fileId } = z
        .object({ fileId: z.string().min(1).max(1000) })
        .strict()
        .parse(req.body);
      res.json(await google.readDoc(fileId));
    }),
  );
  router.post("/google/config", (req, res, next) => {
    try {
      const data = z
        .object({
          clientId: z
            .string()
            .trim()
            .regex(/^[\w.-]+\.apps\.googleusercontent\.com$/),
          clientSecret: z.string().max(500).optional(),
        })
        .strict()
        .parse(req.body);
      if (domain.list("connection").some((c) => c.provider === "google"))
        throw Error(
          "Disconnect Google accounts before changing the OAuth client.",
        );
      store.put("settings", "google", data);
      res.json({ ok: true, redirect: google.redirect });
    } catch (e) {
      next(e);
    }
  });
  router.post("/google/authorize", (req, res, next) => {
    try {
      res.json({ url: google.begin(req.body.service) });
    } catch (e) {
      next(e);
    }
  });
  const cleanTimer = setInterval(() => {
    for (const [id, p] of pending)
      if (p.expires < Date.now()) pending.delete(id);
  }, 60000);
  cleanTimer.unref();
  return { router, domain, google, close: () => clearInterval(cleanTimer) };
}
