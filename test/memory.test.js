import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import express from "express";
import { createStore } from "../server/store.js";
import {
  createConversationLibrary,
  memoryDay,
} from "../server/memory/library.js";
import { createAssistantRouter } from "../server/assistant/index.js";
import { createLifeDomain } from "../server/life/domain.js";
const embedder = {
  embed: async (texts) => texts.map(() => Array(384).fill(0)),
  close() {},
};
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "memory-test-"));
  const store = createStore(dir);
  const library = createConversationLibrary(store, { embedder });
  t.after(() => {
    library.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { store, library, dir };
}
async function serve(t, router) {
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use((e, _req, res, _next) => res.status(400).json({ error: e.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  return async (path, body, method = "POST") => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}` + path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: await r.json() };
  };
}
test("Legacy transcripts migrate idempotently, retain complete text, and stay encrypted at rest", async (t) => {
  const { store, library, dir } = setup(t);
  const text = "Unusual private planning detail ".repeat(180);
  store.put("chat", "old", {
    id: "old",
    scope: "life",
    role: "user",
    text,
    createdAt: "2026-11-12T16:00:00Z",
  });
  library.migrate();
  const once = store.list("memoryEpisode").length;
  library.migrate();
  assert.equal(store.list("memoryEpisode").length, once);
  assert.ok(once > 1);
  assert.equal(store.get("chat", "old").text, text);
  assert.equal(store.get("chat", "old").threadId, "legacy-life");
  assert.ok(
    !readFileSync(join(dir, "finance.sqlite")).includes(
      Buffer.from("Unusual private planning detail"),
    ),
  );
  const found = await library.search("Unusual planning", { scope: "life" });
  assert.ok(found.rows.some((m) => m.messageId === "old"));
});
test("Hybrid retrieval enforces scope, includes Shared pins and preserves retired fact history", async (t) => {
  const { store, library } = setup(t);
  library.migrate();
  library.saveFact({
    text: "Life-only favorite activity is surfing",
    scope: "life",
    pinned: true,
    verified: true,
  });
  library.saveFact({
    text: "Finance-only portfolio preference",
    scope: "finance",
    pinned: true,
    verified: true,
  });
  const shared = library.saveFact({
    text: "Shared preference: concise explanations",
    scope: "shared",
    pinned: true,
    verified: true,
  });
  const life = await library.recall("preferences", {
    scope: "life",
    threadId: "legacy-life",
  });
  assert.ok(life.some((m) => m.scope === "shared"));
  assert.ok(!life.some((m) => m.scope === "finance"));
  const both = await library.recall("portfolio", {
    scope: "life",
    includeOtherScopes: true,
  });
  assert.ok(both.some((m) => m.scope === "finance"));
  store.put("memory", shared.id, {
    ...shared,
    validTo: "2026-11-12T18:00:00Z",
  });
  library.touch();
  assert.ok(
    !(await library.search("concise", { scope: "all" })).rows.some(
      (m) => m.id === shared.id,
    ),
  );
  assert.ok(
    (await library.search("concise", { includeRetired: true })).rows.some(
      (m) => m.id === shared.id,
    ),
  );
  assert.equal(memoryDay("2026-11-13T01:00:00Z"), "2026-11-12");
});
test("Chat projects, independent threads, archived restoration and sourced facts round-trip through APIs", async (t) => {
  const { store } = setup(t),
    sent = [];
  const router = createAssistantRouter({
    store,
    life: createLifeDomain(store),
    financeStore: store,
    memoryEmbedding: embedder,
    runner: async (p) => {
      sent.push(p);
      return {
        text: JSON.stringify({
          answer: "Synthetic reply",
          actions: [],
          memories: [],
        }),
      };
    },
  });
  t.after(router.memoryClose);
  const call = await serve(t, router);
  const project = (
    await call("/library/life/projects", {
      name: "School planning",
      description: "Use reliable due dates",
      shared: true,
    })
  ).data;
  assert.ok(
    (await call("/library/finance", undefined, "GET")).data.projects.some(
      (p) => p.id === project.id,
    ),
  );
  const one = (await call("/library/life/threads", { projectId: project.id }))
      .data,
    two = (await call("/library/life/threads", {})).data;
  await call("/life/chat", {
    threadId: one.id,
    message: "My first project note is about ocean waves.",
  });
  await call("/life/chat", {
    threadId: two.id,
    message: "This is a separate general chat.",
  });
  const first = (await call("/life?thread=" + one.id, undefined, "GET")).data;
  assert.equal(first.messages.length, 2);
  assert.ok(!first.messages.some((m) => m.text.includes("separate general")));
  assert.equal(
    (await call("/finance?thread=" + one.id, undefined, "GET")).status,
    400,
  );
  assert.ok(
    JSON.parse(sent[0].prompt).project.instructions.includes(
      "reliable due dates",
    ),
  );
  await call("/library/life/threads/" + one.id, undefined, "DELETE");
  assert.ok(store.list("chat").some((m) => m.threadId === one.id));
  assert.ok(
    (await call("/library/life", undefined, "GET")).data.archivedThreads.some(
      (t) => t.id === one.id,
    ),
  );
  await call("/library/life/threads/" + one.id + "/restore", {});
  assert.equal(
    (await call("/life?thread=" + one.id, undefined, "GET")).data.messages
      .length,
    2,
  );
  const memory = (
    await call("/memory/facts", {
      text: "Prefer planning ahead",
      scope: "shared",
      pinned: true,
      tags: ["planning"],
    })
  ).data;
  assert.equal(
    (
      await call(
        "/memory/facts/" + memory.id,
        { text: "Prefer planning on Sunday", scope: "shared", pinned: true },
        "PUT",
      )
    ).status,
    200,
  );
  assert.ok(
    store
      .list("memoryRevision")
      .some((m) => m.text === "Prefer planning ahead"),
  );
  const searched = await call("/memory/search?q=Sunday", undefined, "GET");
  assert.ok(searched.data.rows.some((m) => m.id === memory.id));
  const exported = (await call("/memory/export", undefined, "GET")).data;
  assert.ok(exported.messages.length >= 4);
  assert.ok(!JSON.stringify(exported).includes("memoryVector"));
});
test("Recall finds older conversations beyond the recent message window, and extraction requires exact source evidence", async (t) => {
  const { store } = setup(t),
    sent = [];
  const router = createAssistantRouter({
    store,
    life: createLifeDomain(store),
    financeStore: store,
    memoryEmbedding: embedder,
    runner: async (p) => {
      sent.push(p);
      return {
        text: JSON.stringify({
          answer: "Noted",
          actions: [],
          memories: [
            {
              text: "Likes watercolor painting",
              evidence: "I enjoy watercolor painting",
              tags: ["painting"],
            },
            {
              text: "Invented personal assertion",
              evidence: "This quotation does not exist",
            },
          ],
        }),
      };
    },
  });
  t.after(router.memoryClose);
  const call = await serve(t, router);
  const t1 = (await call("/library/life/threads", {})).data;
  await call("/life/chat", {
    threadId: t1.id,
    message: "I enjoy watercolor painting on weekends.",
  });
  const t2 = (await call("/library/life/threads", {})).data;
  await call("/life/chat", {
    threadId: t2.id,
    message: "What did I say about watercolor painting?",
  });
  const prompt = JSON.parse(sent.at(-1).prompt);
  assert.ok(prompt.recalledMemories.some((m) => m.text.includes("weekends")));
  assert.ok(!prompt.history.some((m) => m.text.includes("weekends")));
  assert.ok(
    store
      .list("memory")
      .some(
        (m) =>
          m.text === "Likes watercolor painting" &&
          m.source.quote === "I enjoy watercolor painting",
      ),
  );
  assert.ok(
    !store.list("memory").some((m) => m.text === "Invented personal assertion"),
  );
});
test("Failed model turns retain the user message, and complete answers survive local display caps", async (t) => {
  const { store } = setup(t);
  let fail = true;
  const router = createAssistantRouter({
    store,
    life: createLifeDomain(store),
    financeStore: store,
    memoryEmbedding: embedder,
    runner: async () => {
      if (fail) throw Error("Synthetic provider failure");
      return {
        text: JSON.stringify({
          answer: "long answer ".repeat(6000),
          actions: [],
        }),
      };
    },
  });
  t.after(router.memoryClose);
  const call = await serve(t, router);
  const thread = (await call("/library/life/threads", {})).data;
  assert.equal(
    (
      await call("/life/chat", {
        threadId: thread.id,
        message: "Keep this failed prompt",
      })
    ).status,
    400,
  );
  assert.ok(
    store.list("chat").some((m) => m.text === "Keep this failed prompt"),
  );
  fail = false;
  const answer = (
    await call("/life/chat", {
      threadId: thread.id,
      message: "A long reply please",
    })
  ).data;
  assert.ok(answer.answerTruncated);
  assert.ok(store.get("chat", answer.id).fullText.length > answer.text.length);
  assert.equal(
    store.get("chat", answer.id).fullText,
    "long answer ".repeat(6000),
  );
  assert.ok(
    store.list("memoryEpisode").filter((m) => m.messageId === answer.id)
      .length > 1,
  );
});
test("Semantic indexing restarts after an empty library and removed documents stop being recalled", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "memory-semantic-"));
  const store = createStore(dir);
  const embedding = {
    embed: async (texts) =>
      texts.map((text) =>
        text.includes("surfing") || text.includes("ocean") ? [1, 0] : [0, 1],
      ),
    close() {},
  };
  const library = createConversationLibrary(store, { embedder: embedding });
  t.after(() => {
    library.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  await library.warm();
  library.saveFact({ text: "I enjoy surfing", scope: "life" });
  await library.warm();
  const found = await library.search("ocean", { scope: "life" });
  assert.ok(found.rows.some((m) => m.text === "I enjoy surfing"));
  assert.equal(found.semanticStatus, "ready");
  library.captureDocument({
    id: "removable",
    name: "Test document",
    scope: "life",
    text: "The dragonfruit reference document",
    createdAt: "2026-11-12T18:00:00Z",
  });
  await library.warm();
  assert.ok(
    (await library.search("dragonfruit")).rows.some(
      (m) => m.source?.id === "removable",
    ),
  );
  library.removeDocument("removable");
  assert.ok(
    !(await library.search("dragonfruit")).rows.some(
      (m) => m.source?.id === "removable",
    ),
  );
  assert.ok(
    !store
      .list("memoryVector")
      .some((m) => m.id.startsWith("document:removable:")),
  );
});
