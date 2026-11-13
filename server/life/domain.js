import { z } from "zod";
import { randomUUID } from "node:crypto";
const text = (n = 2000) => z.string().trim().max(n);
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Invalid date",
  );
export const sourceSchema = z
  .object({
    kind: z.enum(["manual", "screen", "connect", "google", "ical", "document"]),
    label: text(200),
    url: z
      .string()
      .url()
      .max(2000)
      .refine((v) => /^https?:/.test(v))
      .optional(),
    observedAt: z.iso.datetime(),
    externalId: text(300).optional(),
    evidence: text(12000).optional(),
    timeZone: text(100).optional(),
  })
  .strict();
const nullableId = text(300).nullable().default(null);
export const schemas = {
  course: z
    .object({
      name: text(200).min(1),
      code: text(60).default(""),
      institution: text(120).default(""),
      platform: text(120).default(""),
      semester: text(60).default(""),
      color: z
        .string()
        .regex(/^#[a-f\d]{6}$/i)
        .default("#a8c9ed"),
      url: z
        .union([
          z.literal(""),
          z
            .string()
            .url()
            .refine((v) => /^https?:/.test(v)),
        ])
        .default(""),
      notes: text(12000).default(""),
    })
    .strict(),
  project: z
    .object({
      name: text(200).min(1),
      description: text(12000).default(""),
      status: z.enum(["active", "paused", "done"]).default("active"),
      people: z.array(text(300)).max(200).default([]),
      courseId: nullableId,
      dueDate: dateOnly.nullable().default(null),
    })
    .strict(),
  task: z
    .object({
      title: text(300).min(1),
      description: text(12000).default(""),
      status: z.enum(["todo", "doing", "done"]).default("todo"),
      priority: z.enum(["low", "normal", "high"]).default("normal"),
      dueDate: dateOnly.nullable().default(null),
      dueTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .nullable()
        .default(null),
      timeZone: text(100).default("America/Denver"),
      courseId: nullableId,
      projectId: nullableId,
      personId: nullableId,
      estimateMinutes: z.number().int().min(0).max(60000).default(0),
      type: z
        .enum(["task", "assignment", "exam", "reading", "project"])
        .default("task"),
      source: sourceSchema.optional(),
    })
    .strict(),
  event: z
    .object({
      title: text(300).min(1),
      start: z
        .string()
        .max(50)
        .refine((v) => !Number.isNaN(Date.parse(v))),
      end: z
        .string()
        .max(50)
        .refine((v) => !Number.isNaN(Date.parse(v)))
        .nullable()
        .default(null),
      allDay: z.boolean().default(false),
      courseId: nullableId,
      projectId: nullableId,
      location: text(300).default(""),
      description: text(12000).default(""),
      source: sourceSchema.optional(),
    })
    .strict(),
  contact: z
    .object({
      name: text(200).min(1),
      headline: text(500).default(""),
      email: z.union([z.literal(""), z.string().email()]).default(""),
      url: z
        .union([
          z.literal(""),
          z
            .string()
            .url()
            .refine((v) => /^https?:/.test(v)),
        ])
        .default(""),
      favorite: z.boolean().default(false),
      followup: dateOnly.nullable().default(null),
      fields: z.record(z.string().max(100), text()).default({}),
    })
    .strict(),
  note: z
    .object({
      personId: text(300).min(1),
      body: text(12000).min(1),
      type: z.enum(["note", "conversation"]).default("note"),
      date: dateOnly.optional(),
    })
    .strict(),
};
export const entityKinds = Object.keys(schemas);
export function localDate(now = new Date(), timeZone = "America/Denver") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function priorityScore(task, today = localDate()) {
  // Calendar-day arithmetic uses UTC components of date-only values, never local DST hours.
  const days = task.dueDate
    ? Math.round(
        (Date.parse(task.dueDate + "T00:00:00Z") -
          Date.parse(today + "T00:00:00Z")) /
          86400000,
      )
    : null;
  return (
    (task.priority === "high" ? 30 : task.priority === "low" ? 0 : 10) +
    (days === null
      ? 0
      : days < 0
        ? 100
        : days === 0
          ? 70
          : days <= 3
            ? 45
            : days <= 7
              ? 20
              : 0) +
    (task.status === "doing" ? 5 : 0)
  );
}
export function createLifeDomain(store) {
  const list = (kind) => store.list(kind).filter((r) => !r.deletedAt);
  function validateLinks(kind, value) {
    for (const [field, target] of [
      ["courseId", "course"],
      ["projectId", "project"],
      ["personId", "contact"],
    ]) {
      if (value[field] && !list(target).some((r) => r.id === value[field]))
        throw Error(`Choose an existing ${target}.`);
    }
    if (value.people?.some((id) => !list("contact").some((p) => p.id === id)))
      throw Error("Choose existing people.");
    if (value.timeZone) {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value.timeZone });
      } catch {
        throw Error("Choose a valid time zone.");
      }
    }
    if (kind === "event" && value.end && value.end <= value.start)
      throw Error("Event end must be after its start.");
    if (kind === "task" && value.dueTime && !value.dueDate)
      throw Error("A due time needs a due date.");
  }
  function save(kind, input, id, { create = false } = {}) {
    if (!schemas[kind]) throw Error("Unknown record type.");
    const old = id ? store.get(kind, id) : null;
    if (id && ((!old && !create) || old?.deletedAt))
      throw Error("Record no longer exists.");
    if (kind === "event" && ["google", "ical"].includes(old?.source?.kind))
      throw Error("Edit this event at its original source.");
    const value = schemas[kind].parse(input);
    validateLinks(kind, value);
    const now = new Date().toISOString();
    const record = {
      ...old,
      ...value,
      id: id || randomUUID(),
      source: value.source ||
        old?.source || { kind: "manual", label: "You", observedAt: now },
      createdAt: old?.createdAt || now,
      updatedAt: now,
    };
    store.put(kind, record.id, record);
    return record;
  }
  function archive(kind, id) {
    if (!schemas[kind]) throw Error("Unknown record type.");
    const row = store.get(kind, id);
    if (!row || row.deletedAt) throw Error("Record no longer exists.");
    if (kind === "event" && ["google", "ical"].includes(row.source?.kind))
      throw Error(
        "Remove this event at its original source, or disconnect the source.",
      );
    if (
      kind === "course" &&
      [...list("task"), ...list("event"), ...list("project")].some(
        (r) => r.courseId === id,
      )
    )
      throw Error("Move this course’s work before archiving it.");
    if (kind === "project" && list("task").some((r) => r.projectId === id))
      throw Error("Move this project’s tasks before archiving it.");
    store.put(kind, id, { ...row, deletedAt: new Date().toISOString() });
  }
  function snapshot() {
    return {
      courses: list("course"),
      projects: list("project"),
      tasks: list("task"),
      events: list("event"),
      contacts: list("contact"),
      notes: list("note"),
      imports: list("import"),
      relationships: list("relationship"),
      documents: list("document").map(({ text, base64, ...r }) => r),
      connections: list("connection").map(
        ({ token, refreshToken, clientSecret, url, ...r }) => r,
      ),
      preferences: store.get("settings", "life") || {
        timeZone: "America/Denver",
      },
    };
  }
  return { store, list, save, archive, snapshot };
}
