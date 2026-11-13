import { z } from "zod";
import { createHash } from "node:crypto";
import { schemas, sourceSchema } from "./domain.js";
const capturedSource = sourceSchema.extend({
  kind: z.literal("screen"),
  url: z
    .string()
    .url()
    .refine((v) => v.startsWith("https://")),
  evidence: z.string().min(1).max(12000),
});
export const bundleSchema = z
  .object({
    version: z.literal(1),
    courses: z
      .array(
        z
          .object({
            course: schemas.course,
            source: capturedSource,
            tasks: z
              .array(
                schemas.task
                  .omit({ courseId: true, projectId: true, personId: true })
                  .extend({ source: capturedSource.optional() }),
              )
              .max(3000),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
const hash = (value) =>
  createHash("sha256").update(value).digest("hex").slice(0, 32);
export function prepareSchoolBundle(input) {
  const data = bundleSchema.parse(input),
    seenCourses = new Set(),
    seenTasks = new Set();
  const courses = data.courses.map((entry) => {
    if (!entry.course.url) throw Error("Each course needs its source URL.");
    const id =
      "screen-course:" + hash(entry.course.url + "|" + entry.course.code);
    if (seenCourses.has(id)) throw Error("Duplicate course in capture.");
    seenCourses.add(id);
    const tasks = entry.tasks.map((task) => {
      const source = task.source || entry.source,
        taskId =
          "school:" +
          hash(id + "|" + (source.externalId || source.url + "|" + task.title));
      if (seenTasks.has(taskId))
        throw Error("Duplicate assignment in capture.");
      seenTasks.add(taskId);
      return {
        ...task,
        id: taskId,
        source,
        courseId: id,
        projectId: null,
        personId: null,
      };
    });
    return { ...entry, id, tasks };
  });
  return { courses, count: seenTasks.size };
}
export function applySchoolBundle(domain, plan) {
  domain.store.batch(() => {
    for (const entry of plan.courses) {
      const old = domain.store.get("course", entry.id),
        course = domain.save("course", entry.course, entry.id, {
          create: true,
        });
      domain.store.put("course", entry.id, {
        ...course,
        source: old?.source?.kind === "manual" ? old.source : entry.source,
      });
      for (const task of entry.tasks) {
        const { id, ...input } = task,
          previous = domain.store.get("task", id);
        domain.save(
          "task",
          { ...input, status: previous?.status || task.status },
          id,
          { create: true },
        );
      }
      domain.store.put("import", entry.id, {
        id: entry.id,
        label: entry.source.label,
        observedAt: entry.source.observedAt,
        count: entry.tasks.length,
        source: entry.source,
      });
    }
  });
  return { courses: plan.courses.length, imported: plan.count };
}
