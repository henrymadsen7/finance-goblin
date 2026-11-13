import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { createStore } from "../server/store.js";
import {
  createLifeDomain,
  priorityScore,
  dateOnly,
  schemas,
} from "../server/life/domain.js";
import { importConnect } from "../server/life/connect.js";
import {
  parseCalendar,
  zonedInstant,
  replaceCalendar,
} from "../server/life/calendar.js";
import { createLifeRouter } from "../server/life/router.js";
import { isPublicAddress, publicText } from "../server/life/network.js";
import {
  createAssistantRouter,
  parseReply,
} from "../server/assistant/index.js";
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "life-test-")),
    store = createStore(dir),
    life = createLifeDomain(store);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { dir, store, life };
}
const source = {
  kind: "screen",
  label: "Synthetic Canvas",
  url: "https://school.example/courses/1",
  observedAt: "2026-11-12T19:00:00Z",
  evidence: "Assignment due November 20; time not shown.",
  timeZone: "America/Denver",
};
test("Life validates linked records and exact dates, preserves unknown times, and encrypts its records", (t) => {
  const { dir, store, life } = setup(t),
    course = life.save("course", { name: "Synthetic course" });
  for (const extra of [
    { courseId: "missing" },
    { dueDate: "2026-02-30" },
    { dueTime: "23:59" },
    { timeZone: "Wrong/Zone" },
  ])
    assert.throws(() => life.save("task", { title: "Invalid", ...extra }));
  assert.throws(() =>
    life.save("event", {
      title: "Backwards",
      start: "2026-11-12T12:00:00Z",
      end: "2026-11-11T12:00:00Z",
    }),
  );
  const task = life.save("task", {
    title: "Private assignment",
    courseId: course.id,
    dueDate: "2026-11-20",
    source,
  });
  assert.deepEqual(task.source, source);
  assert.equal(task.dueTime, null);
  assert.throws(() => life.archive("course", course.id));
  assert.equal(
    readFileSync(join(dir, "finance.sqlite")).includes(
      Buffer.from("Private assignment"),
    ),
    false,
  );
  const mail = life.save("task", {
    title: "From email",
    source: { ...source, kind: "google" },
  });
  assert.doesNotThrow(() =>
    life.save("task", { title: mail.title, status: "done" }, mail.id),
  );
  life.archive("task", task.id);
  assert.ok(!life.snapshot().tasks.some((r) => r.id === task.id));
  assert.ok(store.get("task", task.id).deletedAt);
});
test("Connect retains IDs, notes, project links and source evidence; repeats preserve edits and malformed imports roll back", (t) => {
  const { life } = setup(t),
    data = {
      contacts: [{ id: "p1", name: "Example Person", fields: "{}" }],
      notes: [{ id: "n1", contact_id: "p1", body: "Original note" }],
      interactions: [
        {
          id: "i1",
          contact_id: "p1",
          summary: "Conversation",
          happened_on: "2026-11-10",
        },
      ],
      projects: [{ id: "project1", name: "Project" }],
      project_contacts: [{ project_id: "project1", contact_id: "p1" }],
      sources: [{ contact_id: "p1", raw: "Evidence" }],
    };
  assert.equal(importConnect(life, data).added, 1);
  life.save("contact", { name: "Edited" }, "p1");
  assert.equal(importConnect(life, data).preserved, 1);
  assert.equal(life.list("contact")[0].name, "Edited");
  assert.equal(life.list("note").length, 2);
  assert.deepEqual(life.list("project")[0].people, ["p1"]);
  assert.equal(life.list("contact")[0].connectEvidence[0].raw, "Evidence");
  assert.throws(() =>
    importConnect(life, {
      contacts: [
        { id: "p2", name: "Rollback" },
        { id: null, name: "Invalid" },
      ],
    }),
  );
  assert.equal(life.list("contact").length, 1);
});
test("iCalendar handles cancelled recurring instances, moved exceptions and cancelled masters; replacements are repeat-safe", (t) => {
  const { life } = setup(t),
    ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:weekly",
      "DTSTART:20261109T100000Z",
      "DTEND:20261109T110000Z",
      "RRULE:FREQ=DAILY;COUNT=3",
      "SUMMARY:Class",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:weekly",
      "RECURRENCE-ID:20261110T100000Z",
      "DTSTART:20261110T100000Z",
      "DTEND:20261110T110000Z",
      "STATUS:CANCELLED",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:weekly",
      "RECURRENCE-ID:20261111T100000Z",
      "DTSTART:20261111T120000Z",
      "DTEND:20261111T130000Z",
      "SUMMARY:Moved class",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
  const options = {
      id: "a",
      label: "Synthetic",
      now: new Date("2026-11-12T12:00:00Z"),
    },
    rows = parseCalendar(ics, options);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].start, "2026-11-11T12:00:00.000Z");
  assert.equal(rows[1].title, "Moved class");
  replaceCalendar(life, "a", rows);
  replaceCalendar(life, "a", rows);
  assert.equal(life.list("event").length, 2);
  assert.throws(() => parseCalendar("<html>Sign in</html>", options));
  assert.equal(life.list("event").length, 2);
  assert.equal(
    parseCalendar(
      ics.replace("SUMMARY:Class", "STATUS:CANCELLED\r\nSUMMARY:Class"),
      options,
    ).length,
    0,
  );
});
test("date-only priority and floating calendar times retain Denver boundaries across DST", () => {
  assert.equal(
    priorityScore(
      { priority: "normal", status: "todo", dueDate: "2026-03-09" },
      "2026-03-08",
    ),
    55,
  );
  assert.equal(
    zonedInstant("2026-11-12T23:59:00", "America/Denver"),
    "2026-11-13T06:59:00.000Z",
  );
  assert.equal(
    zonedInstant("2026-07-12T23:59:00", "America/Denver"),
    "2026-07-13T05:59:00.000Z",
  );
  assert.equal(dateOnly.safeParse("2026-02-29").success, false);
});
test("calendar requests reject private networks and non-HTTPS before fetching", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.2.3.4",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "100.64.1.1",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("1.1.1.1"), true);
  await assert.rejects(() => publicText("http://example.com/calendar"));
  await assert.rejects(() => publicText("https://127.0.0.1/calendar"));
});
async function serve(t, router) {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use(router);
  app.use((e, req, res, next) => res.status(400).json({ error: e.message }));
  const s = app.listen(0, "127.0.0.1");
  await new Promise((r) => s.once("listening", r));
  t.after(() => new Promise((r) => s.close(r)));
  const url = `http://127.0.0.1:${s.address().port}`;
  return async (path, data, method = "POST") => {
    const r = await fetch(url + path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });
    return { status: r.status, data: await r.json() };
  };
}
test("school captures require previews, deduplicate and preserve completion; safe snapshots exclude credentials", async (t) => {
  const { store, life } = setup(t),
    service = createLifeRouter(store, {
      origin: "http://localhost:4300",
      csrf: "test",
    });
  t.after(service.close);
  const call = await serve(t, service.router),
    course = life.save("course", { name: "Example course" }),
    payload = {
      courseId: course.id,
      source,
      rows: [{ title: "Example assignment", dueDate: "2026-11-20" }],
    };
  const preview = await call("/school/preview", payload);
  assert.equal(preview.status, 200);
  assert.equal(life.list("task").length, 0);
  assert.equal(
    (await call("/school/import", { ticket: preview.data.ticket })).status,
    200,
  );
  assert.equal(
    (await call("/school/import", { ticket: preview.data.ticket })).status,
    400,
  );
  const row = life.list("task")[0],
    input = Object.fromEntries(
      Object.keys(schemas.task.shape)
        .filter((k) => row[k] !== undefined)
        .map((k) => [k, row[k]]),
    );
  life.save("task", { ...input, status: "done" }, row.id);
  const again = await call("/school/preview", {
    ...payload,
    rows: [{ title: "Example assignment", dueDate: "2026-11-21" }],
  });
  assert.equal(
    (await call("/school/import", { ticket: again.data.ticket })).status,
    200,
  );
  assert.equal(life.list("task").length, 1);
  assert.equal(life.list("task")[0].dueDate, "2026-11-21");
  assert.equal(life.list("task")[0].status, "done");
  store.put("connection", "g", {
    id: "g",
    token: "NEVER-SERVE",
    refreshToken: "PRIVATE",
    clientSecret: "PRIVATE",
    label: "Example",
    provider: "google",
  });
  assert.equal(
    JSON.stringify((await call("/state", undefined, "GET")).data).includes(
      "NEVER-SERVE",
    ),
    false,
  );
});
test("assistant scopes isolate history, memory and documents; context is opt-in, proposals apply once and finance stays read-only", async (t) => {
  const { life } = setup(t),
    dir = mkdtempSync(join(tmpdir(), "assistant-test-")),
    store = createStore(dir);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const sent = [],
    finance = {
      list: (k) =>
        k === "account" ? [{ id: "private-account", balance: 12000 }] : [],
      get: () => null,
    },
    runner = async (p) => {
      sent.push(p);
      return {
        text: JSON.stringify({
          answer: "Synthetic answer",
          actions: [
            {
              type: "create_task",
              title: "Proposed task",
              dueDate: "2026-11-20",
            },
          ],
        }),
      };
    };
  const call = await serve(
    t,
    createAssistantRouter({ store, life, financeStore: finance, runner }),
  );
  await call("/life/memory", { text: "Life-only memory" });
  await call("/finance/memory", { text: "Finance-only memory" });
  const chat = await call("/life/chat", {
    message: "Help me plan",
    shareContext: false,
  });
  assert.equal(chat.status, 200);
  assert.equal(JSON.parse(sent[0].prompt).context, null);
  assert.ok(sent[0].prompt.includes("Life-only memory"));
  assert.ok(!sent[0].prompt.includes("Finance-only memory"));
  assert.equal(life.list("task").length, 0);
  const action = chat.data.actions[0];
  assert.equal(
    (await call(`/finance/actions/${action.id}/apply`, {})).status,
    400,
  );
  assert.equal(
    (await call(`/life/actions/${action.id}/apply`, {})).status,
    200,
  );
  assert.equal(
    (await call(`/life/actions/${action.id}/apply`, {})).status,
    400,
  );
  assert.equal(life.list("task").length, 1);
  await call("/finance/chat", {
    message: "Look at finance",
    shareContext: true,
    financeMode: "demo",
  });
  assert.ok(!sent[1].prompt.includes("private-account"));
  await call("/finance/chat", {
    message: "Look at finance",
    shareContext: true,
    financeMode: "live",
  });
  assert.ok(sent[2].prompt.includes("private-account"));
  assert.ok(
    !JSON.stringify((await call("/finance", undefined, "GET")).data).includes(
      "Help me plan",
    ),
  );
  const doc = await call("/life/documents", {
    name: "note.txt",
    mime: "text/plain",
    base64: Buffer.from("Private document").toString("base64"),
  });
  assert.equal(doc.status, 200);
  assert.equal(
    (
      await call("/finance/chat", {
        message: "Read it",
        documentIds: [doc.data.id],
      })
    ).status,
    400,
  );
  assert.equal(
    parseReply('{"answer":"No","actions":[{"type":"send_payment"}]}').actions
      .length,
    0,
  );
});

test("school bundles apply course/assignment links atomically and retain stable IDs on repeated review", async (t) => {
  const { life } = setup(t),
    { prepareSchoolBundle, applySchoolBundle } =
      await import("../server/life/school.js");
  const capture = {
    version: 1,
    courses: [
      {
        course: {
          name: "Example",
          code: "EX1",
          url: "https://school.example/courses/1",
        },
        source,
        tasks: [
          {
            title: "Example assignment",
            dueDate: "2026-11-20",
            timeZone: "",
            dueTime: "23:59",
          },
        ],
      },
    ],
  };
  const plan = prepareSchoolBundle(capture);
  assert.equal(life.list("course").length, 0);
  applySchoolBundle(life, plan);
  applySchoolBundle(life, plan);
  assert.equal(life.list("course").length, 1);
  assert.equal(life.list("task").length, 1);
  assert.equal(life.list("task")[0].courseId, life.list("course")[0].id);
  assert.equal(life.list("task")[0].timeZone, "");
  const invalid = structuredClone(capture);
  invalid.courses[0].tasks.push({
    title: "Invalid linked date",
    dueDate: "2026-02-31",
  });
  assert.throws(() => prepareSchoolBundle(invalid));
  assert.equal(life.list("task").length, 1);
});

test("assistant context retrieves named contacts beyond the first page and computes financial totals from all stored USD records", async (t) => {
  const { life } = setup(t),
    { lifeContext, financeContext } =
      await import("../server/assistant/context.js");
  for (let i = 0; i < 200; i++)
    life.save("contact", {
      name: `Person ${i}`,
      headline: i === 199 ? "Unique marine biologist" : "",
    });
  assert.ok(
    lifeContext(life, "marine biologist").contacts.some(
      (p) => p.name === "Person 199",
    ),
  );
  const finance = {
    list: (k) =>
      k === "account"
        ? [
            { id: "usd", currency: "USD" },
            { id: "eur", currency: "EUR" },
          ]
        : [
            {
              id: "a",
              accountId: "usd",
              date: "2026-11-10",
              type: "expense",
              amount: -500,
              pending: false,
            },
            {
              id: "b",
              accountId: "usd",
              date: "2026-11-10",
              type: "refund",
              amount: 100,
              pending: false,
            },
            {
              id: "c",
              accountId: "usd",
              date: "2026-11-10",
              type: "transfer",
              amount: -4000,
              pending: false,
            },
            {
              id: "d",
              accountId: "eur",
              date: "2026-11-10",
              type: "expense",
              amount: -10000,
              pending: false,
            },
          ],
    get: () => null,
  };
  const context = financeContext(finance, "live", "spending");
  assert.equal(context.monthlyTotals[0].expenses, 400);
  assert.equal(context.transactionCount, 3);
});

test("PDF intake extracts searchable text without forwarding original file bytes; mismatched images fail", async (t) => {
  const { life } = setup(t),
    dir = mkdtempSync(join(tmpdir(), "assistant-pdf-")),
    store = createStore(dir);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const stream =
      "BT /F1 16 Tf 72 720 Td (Synthetic deadline: November 20, 2026.) Tj ET",
    objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (const [i, o] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  }
  const start = pdf.length;
  pdf +=
    `xref\n0 6\n0000000000 65535 f \n` +
    offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  const sent = [],
    call = await serve(
      t,
      createAssistantRouter({
        store,
        life,
        financeStore: { list: () => [], get: () => null },
        runner: async (p) => {
          sent.push(p);
          return { text: '{"answer":"Synthetic deadline","actions":[]}' };
        },
      }),
    );
  const uploaded = await call("/life/documents", {
    name: "example.pdf",
    mime: "application/pdf",
    base64: Buffer.from(pdf).toString("base64"),
  });
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded.data));
  assert.equal(uploaded.data.status, "ready");
  assert.ok(
    store.get("document", uploaded.data.id).text.includes("November 20"),
  );
  assert.equal(
    (
      await call("/life/chat", {
        message: "Read this document",
        documentIds: [uploaded.data.id],
      })
    ).status,
    200,
  );
  assert.ok(sent[0].prompt.includes("November 20"));
  assert.ok(!sent[0].prompt.includes("%PDF-"));
  assert.equal(
    (
      await call("/life/documents", {
        name: "wrong.png",
        mime: "image/png",
        base64: Buffer.from("not a png").toString("base64"),
      })
    ).status,
    400,
  );
});

test("Life appearance preferences validate colors and merge without erasing the time zone or Finance settings", async (t) => {
  const { store } = setup(t),
    service = createLifeRouter(store, { origin: "http://localhost:4300" });
  t.after(service.close);
  const call = await serve(t, service.router);
  const { defaultLifeAppearance } =
    await import("../shared/life-appearance.js");
  store.put("settings", "preferences", { marker: "finance" });
  assert.equal(
    (await call("/preferences", { timeZone: "America/Los_Angeles" })).status,
    200,
  );
  assert.equal(
    (
      await call("/preferences", {
        appearance: { ...defaultLifeAppearance, accent: "#123456" },
      })
    ).status,
    200,
  );
  assert.equal(store.get("settings", "life").timeZone, "America/Los_Angeles");
  assert.equal(
    (await call("/preferences", { timeZone: "America/Denver" })).data.appearance
      .accent,
    "#123456",
  );
  for (const appearance of [
    { ...defaultLifeAppearance, accent: "url(https://bad.example)" },
    { ...defaultLifeAppearance, radius: 999 },
  ])
    assert.equal((await call("/preferences", { appearance })).status, 400);
  assert.deepEqual(store.get("settings", "preferences"), { marker: "finance" });
});

test("Drive authorization uses read-only access, refresh is isolated and atomic, and Docs tabs are readable only through synced files", async (t) => {
  const { store, life } = setup(t);
  const { createGoogle } = await import("../server/life/google.js");
  store.put("settings", "google", {
    clientId: "synthetic.apps.googleusercontent.com",
  });
  store.put("connection", "drive-test", {
    id: "drive-test",
    service: "drive",
    provider: "google",
    label: "synthetic@example.com",
    token: "test-only",
    expiresAt: Date.now() + 3600000,
  });
  store.put("message", "keep", { id: "keep", connectionId: "gmail-test" });
  let fail = false;
  const google = createGoogle(life, "http://localhost:4300", {
    fetcher: async (url) => {
      if (fail) return { ok: false };
      if (url.startsWith("https://www.googleapis.com/drive/v3/files?"))
        return {
          ok: true,
          json: async () => ({
            files: [
              {
                id: "doc-1",
                name: "Synthetic school plan",
                mimeType: "application/vnd.google-apps.document",
                modifiedTime: "2026-11-12T12:00:00Z",
              },
            ],
            nextPageToken: "more",
          }),
        };
      assert.equal(
        url,
        "https://docs.googleapis.com/v1/documents/doc-1?includeTabsContent=true",
      );
      return {
        ok: true,
        json: async () => ({
          title: "Synthetic school plan",
          tabs: [
            {
              documentTab: {
                body: {
                  content: [
                    {
                      paragraph: {
                        elements: [
                          { textRun: { content: "Read the syllabus.\n" } },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
        }),
      };
    },
  });
  const url = new URL(google.begin("drive"));
  assert.equal(
    url.searchParams.get("scope"),
    "openid email https://www.googleapis.com/auth/drive.readonly",
  );
  assert.throws(() => google.begin("unknown"));
  await google.sync("drive-test");
  const files = store.list("driveFile");
  assert.equal(files.length, 1);
  const doc = await google.readDoc(files[0].id);
  assert.equal(doc.text, "Read the syllabus.\n");
  await assert.rejects(() => google.readDoc("unlisted-file"));
  fail = true;
  await assert.rejects(() => google.sync("drive-test"));
  assert.equal(store.list("driveFile").length, 1);
  assert.ok(store.get("message", "keep"));
  assert.ok(!JSON.stringify(life.snapshot()).includes("test-only"));
  const service = createLifeRouter(store, { origin: "http://localhost:4300" });
  t.after(service.close);
  const call = await serve(t, service.router);
  assert.equal(
    (await call("/state", undefined, "GET")).data.driveFiles.length,
    1,
  );
  await call("/connections/drive-test", undefined, "DELETE");
  assert.equal(store.list("driveFile").length, 0);
  assert.ok(store.get("message", "keep"));
});

test("Life routes preserve course, modal and project identities across Back/Forward URLs", async () => {
  const { readLifeRoute, lifeRouteURL } =
    await import("../shared/life-navigation.js");
  const base = "http://localhost:4300/?workspace=life";
  const school = lifeRouteURL(base, {
    page: "School",
    course: null,
    person: null,
    project: null,
    edit: null,
  });
  const course = lifeRouteURL(school, {
    ...readLifeRoute(school),
    course: "ECON:110",
  });
  const assignment = lifeRouteURL(course, {
    ...readLifeRoute(course),
    edit: "task:import:1",
  });
  assert.equal(readLifeRoute(school).course, null);
  assert.equal(readLifeRoute(course).course, "ECON:110");
  assert.equal(readLifeRoute(assignment).edit, "task:import:1");
  assert.equal(readLifeRoute(assignment).page, "School");
  assert.equal(readLifeRoute(base + "zip&page=invalid").page, "Today");
});

test("Live Google reads require opted-in Life context; Finance and unshared chat never query Google", async (t) => {
  const { life, store } = setup(t);
  let reads = 0,
    plans = 0;
  store.put("connection", "google-test", {
    id: "google-test",
    provider: "google",
    service: "drive",
    label: "synthetic@example.com",
    token: "never-send-token",
  });
  const sent = [];
  const runner = async (p) => {
    sent.push(p);
    if (p.system.startsWith("Plan read-only")) {
      plans++;
      return {
        text: JSON.stringify({
          reads: [{ type: "drive_search", query: "syllabus" }],
        }),
      };
    }
    return { text: JSON.stringify({ answer: "Answer", actions: [] }) };
  };
  const google = {
    assistantRead: async (read) => {
      reads++;
      assert.equal(read.type, "drive_search");
      return {
        results: [
          {
            title: "Synthetic syllabus",
            text: "Exam November 20",
            url: "https://docs.google.com/document/d/synthetic",
          },
        ],
      };
    },
  };
  const call = await serve(
    t,
    createAssistantRouter({ store, life, financeStore: store, runner, google }),
  );
  await call("/life/chat", {
    message: "Find the syllabus",
    shareContext: false,
  });
  await call("/finance/chat", {
    message: "Find the syllabus",
    shareContext: true,
  });
  assert.equal(reads, 0);
  assert.equal(plans, 0);
  const result = await call("/life/chat", {
    message: "Find the syllabus",
    shareContext: true,
  });
  assert.equal(result.status, 200);
  assert.equal(reads, 1);
  assert.equal(plans, 1);
  assert.ok(sent.at(-1).prompt.includes("Exam November 20"));
  assert.ok(
    !sent
      .map((p) => p.prompt)
      .join("")
      .includes("never-send-token"),
  );
  const { googleReadPlan } =
    await import("../server/assistant/google-context.js");
  assert.throws(() =>
    googleReadPlan.parse({
      reads: [{ type: "send_email", query: "malicious" }],
    }),
  );
});

test("Named Google Docs resolve their stored IDs directly instead of relying on model-generated identifiers", async (t) => {
  const { life, store } = setup(t);
  store.put("connection", "g", {
    id: "g",
    provider: "google",
    service: "drive",
  });
  store.put("driveFile", "g:real-id", {
    id: "g:real-id",
    name: "Ch 3 Notes",
    mimeType: "application/vnd.google-apps.document",
  });
  const { googleContext } =
    await import("../server/assistant/google-context.js");
  const result = await googleContext({
    life,
    message: "Read the connected Google Doc named Ch 3 Notes.",
    history: [],
    runner: () => {
      throw Error("No planning call needed");
    },
    google: {
      assistantRead: async (read) => {
        assert.equal(read.fileId, "g:real-id");
        return { document: { title: "Ch 3 Notes", text: "Verified text" } };
      },
    },
  });
  assert.equal(result.results[0].document.text, "Verified text");
});

test("Voice transcription accepts bounded audio in either scope, rejects spoofed files and never persists audio", async (t) => {
  const { life, store } = setup(t);
  let called = 0;
  const call = await serve(
    t,
    createAssistantRouter({
      store,
      life,
      financeStore: store,
      transcriber: async () => {
        called++;
        return { text: "Synthetic voice draft" };
      },
    }),
  );
  const fakeWebm = Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    Buffer.alloc(20),
  ]).toString("base64");
  for (const scope of ["life", "finance"]) {
    const result = await call(`/${scope}/transcribe`, {
      base64: fakeWebm,
      mime: "audio/webm",
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.text, "Synthetic voice draft");
  }
  assert.equal(
    (
      await call("/life/transcribe", {
        base64: Buffer.from("Not an audio recording").toString("base64"),
        mime: "audio/webm",
      })
    ).status,
    400,
  );
  assert.equal(called, 2);
  assert.equal(store.list("document").length, 0);
  assert.equal(store.list("chat").length, 0);
});

test("Inline model settings persist per workspace, validate supported capabilities, and reach the runner", async (t) => {
  const { store, life } = setup(t);
  const sent = [];
  const runner = async (p) => {
    if (p.catalog)
      return {
        models: [
          {
            id: "gpt-6-luna",
            name: "Luna",
            reasoning: ["low", "medium"],
            contextWindow: 272000,
          },
          {
            id: "gpt-test",
            name: "Test",
            reasoning: ["high"],
            contextWindow: 32000,
          },
        ],
      };
    sent.push(p);
    return { text: JSON.stringify({ answer: "ok", actions: [] }) };
  };
  const call = await serve(
    t,
    createAssistantRouter({ store, life, financeStore: store, runner }),
  );
  assert.equal(
    (
      await call("/life/settings", {
        model: "gpt-6-luna",
        reasoning: "medium",
        maxTokens: 1024,
        contextTokens: 8000,
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/life", undefined, "GET")).data.reasoning,
    "medium",
  );
  assert.equal(
    (await call("/finance", undefined, "GET")).data.reasoning,
    "low",
  );
  for (const invalid of [
    { model: "unknown" },
    { model: "gpt-6-luna", reasoning: "max" },
    { model: "gpt-6-luna", contextTokens: 9999999 },
    { model: "gpt-test", reasoning: "high", contextTokens: 32000 },
  ])
    assert.equal((await call("/life/settings", invalid)).status, 400);
  await call("/life/chat", { message: "Hello", shareContext: false });
  assert.equal(sent[0].reasoning, "medium");
  assert.equal(sent[0].maxTokens, 1024);
  assert.equal(sent[0].model, "gpt-6-luna");
  assert.equal(
    (await call("/life/models", undefined, "GET")).data.models.length,
    2,
  );
});

test("Context budgets trim structured evidence and history without breaking JSON or losing the current question", async () => {
  const { packPrompt, capAnswer, tokenCount } =
    await import("../server/assistant/model-settings.js");
  const result = packPrompt(
    {
      history: [{ text: "old ".repeat(10000) }],
      memories: [],
      documents: [],
      context: {
        tasks: Array.from({ length: 80 }, (_, i) => ({
          title: "Task " + i,
          description: "evidence ".repeat(100),
        })),
        google: { document: { text: "Live fact" } },
      },
      message: "Keep this question",
    },
    "System",
    4000,
  );
  const parsed = JSON.parse(result.prompt);
  assert.equal(parsed.message, "Keep this question");
  assert.equal(parsed.context.google.document.text, "Live fact");
  assert.ok(result.truncated);
  assert.ok(result.inputTokens <= 4000);
  const capped = capAnswer("answer ".repeat(5000), 256);
  assert.ok(capped.truncated);
  assert.ok(tokenCount(capped.text) <= 256);
});
