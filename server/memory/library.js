import MiniSearch from "minisearch";
import { randomUUID, createHash } from "node:crypto";
import { createEmbedder } from "./semantic.js";
const stop = new Set(
  "about after again against also among another before being between could does doing during each from have here into just like more most much myself only other really same should some than that their them then there these they this those through very want were what when where which while with would your yours please hello thanks think know tell said will been because".split(
    " ",
  ),
);
export function memoryTags(text) {
  const words =
    text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]{3,}/gu) || [];
  const count = new Map();
  for (const w of words)
    if (!stop.has(w)) count.set(w, (count.get(w) || 0) + 1);
  return [...count]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 7)
    .map(([w]) => w);
}
export const memoryDay = (date) =>
  date
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Denver",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(date))
    : "";
const stamp = () => new Date().toISOString();
const hash = (text) => createHash("sha256").update(text).digest("hex");
export function createConversationLibrary(
  store,
  { embedder = createEmbedder() } = {},
) {
  let dirty = true,
    index = null,
    entries = [],
    vectors = new Map(),
    semanticStatus = "warming",
    indexing = null,
    closed = false;
  const active = (kind) =>
    store.list(kind).filter((r) => !r.archivedAt && !r.deletedAt);
  const projectById = (id) => (id ? store.get("chatProject", id) : null);
  function thread(scope, id) {
    const r = store.get("chatThread", id || `legacy-${scope}`);
    if (!r || r.scope !== scope || r.archivedAt)
      throw Error("Chat not found in this workspace.");
    return r;
  }
  function createThread(scope, { title = "New chat", projectId = null } = {}) {
    const p = projectById(projectId);
    if (
      projectId &&
      (!p || p.archivedAt || ![scope, "shared"].includes(p.scope))
    )
      throw Error("Project is not available in this workspace.");
    const now = stamp(),
      r = {
        id: randomUUID(),
        scope,
        title,
        projectId,
        createdAt: now,
        updatedAt: now,
        titleAuto: title === "New chat",
      };
    store.put("chatThread", r.id, r);
    dirty = true;
    return r;
  }
  function ensureLegacy(scope) {
    const id = `legacy-${scope}`,
      messages = store
        .list("chat")
        .filter((m) => m.scope === scope && !m.threadId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (messages.length && !store.get("chatThread", id)) {
      const now = stamp();
      store.put("chatThread", id, {
        id,
        scope,
        title: "Earlier conversations",
        projectId: null,
        createdAt: messages[0].createdAt || now,
        updatedAt: messages.at(-1).createdAt || now,
        titleAuto: false,
      });
    }
    for (const m of messages) store.put("chat", m.id, { ...m, threadId: id });
    if (
      !store.get("chatThread", id) &&
      !active("chatThread").some((t) => t.scope === scope)
    ) {
      const now = stamp();
      store.put("chatThread", id, {
        id,
        scope,
        title: "New chat",
        projectId: null,
        createdAt: now,
        updatedAt: now,
        titleAuto: true,
      });
    }
    dirty = true;
  }
  function defaultThread(scope) {
    ensureLegacy(scope);
    return (
      active("chatThread")
        .filter((t) => t.scope === scope)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ||
      createThread(scope)
    );
  }
  function capture(message) {
    if (!message.threadId) return;
    const t = store.get("chatThread", message.threadId);
    if (!t) return;
    const text = message.fullText || message.text || "";
    for (
      let offset = 0, part = 0;
      offset < text.length;
      offset += 1400, part++
    ) {
      const chunk = text.slice(offset, offset + 1600);
      const id = `episode:${message.id}:${part}`;
      if (store.get("memoryEpisode", id)) continue;
      store.put("memoryEpisode", id, {
        id,
        text: chunk,
        title: t.title,
        scope: message.scope,
        kind: "conversation",
        role: message.role,
        messageId: message.id,
        threadId: t.id,
        projectId: t.projectId,
        createdAt: message.createdAt,
        observedAt: message.createdAt,
        validFrom: message.createdAt,
        validTo: null,
        tags: memoryTags(chunk),
        source: { type: "message", id: message.id, role: message.role },
        part,
      });
    }
    dirty = true;
  }
  function afterMessage(message) {
    const t = thread(message.scope, message.threadId);
    store.put("chatThread", t.id, {
      ...t,
      title:
        t.titleAuto && message.role === "user"
          ? message.text.replace(/\s+/g, " ").slice(0, 72)
          : t.title,
      titleAuto: t.titleAuto && message.role !== "user",
      updatedAt: message.createdAt,
    });
    capture(message);
    void warm();
  }
  function captureDocument(doc) {
    if (!doc.text || doc.status === "needs-ocr") return;
    for (
      let offset = 0, part = 0;
      offset < doc.text.length;
      offset += 1400, part++
    ) {
      const text = doc.text.slice(offset, offset + 1600),
        id = `document:${doc.id}:${part}`;
      if (store.get("memoryEpisode", id)) continue;
      store.put("memoryEpisode", id, {
        id,
        text,
        title: doc.name,
        scope: doc.scope,
        kind: "document",
        role: "source",
        threadId: doc.threadId || null,
        projectId: null,
        createdAt: doc.createdAt,
        observedAt: doc.createdAt,
        validFrom: doc.createdAt,
        validTo: null,
        tags: memoryTags(text),
        source: { type: "document", id: doc.id, name: doc.name },
        part,
      });
    }
    dirty = true;
  }
  function removeDocument(id) {
    store.batch(() => {
      for (const entry of store.list("memoryEpisode")) {
        if (entry.source?.type !== "document" || entry.source.id !== id)
          continue;
        store.remove("memoryEpisode", entry.id);
        store.remove("memoryVector", entry.id);
      }
    });
    dirty = true;
  }
  function memoryEntries() {
    const threads = new Map(store.list("chatThread").map((t) => [t.id, t]));
    return [
      ...store.list("memoryEpisode"),
      ...store.list("memory").map((m) => ({
        ...m,
        kind: m.kind || "fact",
        tags: m.tags || memoryTags(m.text),
        validFrom: m.validFrom || m.createdAt,
        validTo: m.validTo || null,
      })),
    ]
      .filter(
        (m) =>
          !m.deletedAt &&
          !m.archivedAt &&
          (!m.threadId || !threads.get(m.threadId)?.archivedAt),
      )
      .map((m) => ({
        ...m,
        title:
          m.kind === "conversation"
            ? threads.get(m.threadId)?.title || m.title || "Conversation"
            : m.title || threads.get(m.threadId)?.title || "Saved memory",
        projectId: m.threadId
          ? threads.get(m.threadId)?.projectId || null
          : m.projectId || null,
        pinned: !!m.pinned,
        role: m.role || "user",
      }));
  }
  function refresh() {
    if (!dirty) return;
    entries = memoryEntries();
    index = new MiniSearch({
      fields: ["text", "title", "tags"],
      storeFields: ["id"],
      searchOptions: {
        boost: { text: 2, title: 1.5 },
        prefix: true,
        fuzzy: 0.15,
        combineWith: "OR",
      },
    });
    if (entries.length)
      index.addAll(entries.map((m) => ({ ...m, tags: m.tags.join(" ") })));
    vectors = new Map(
      store
        .list("memoryVector")
        .filter((v) => v.model === "minilm-l6-v2")
        .map((v) => [v.id, v]),
    );
    dirty = false;
  }
  async function warm() {
    if (indexing || closed) return indexing;
    refresh();
    const pendingEntries = [...entries];
    indexing = Promise.resolve()
      .then(async () => {
        try {
          for (let i = 0; i < pendingEntries.length && !closed; i += 24) {
            const batch = pendingEntries
              .slice(i, i + 24)
              .filter((m) => vectors.get(m.id)?.hash !== hash(m.text));
            if (!batch.length) continue;
            const values = await embedder.embed(batch.map((m) => m.text));
            if (closed) break;
            store.batch(() =>
              batch.forEach((m, j) => {
                const row = {
                  id: m.id,
                  hash: hash(m.text),
                  model: "minilm-l6-v2",
                  vector: values[j],
                };
                if (
                  store.get("memoryEpisode", m.id) ||
                  store.get("memory", m.id)
                ) {
                  store.put("memoryVector", m.id, row);
                  vectors.set(m.id, row);
                }
              }),
            );
          }
          semanticStatus = "ready";
        } catch {
          semanticStatus = "text-only";
        }
      })
      .finally(() => {
        indexing = null;
        if (
          !closed &&
          semanticStatus === "ready" &&
          (dirty ||
            entries.some((m) => vectors.get(m.id)?.hash !== hash(m.text)))
        )
          void warm();
      });
    return indexing;
  }
  async function search(
    query,
    {
      scope = "all",
      kind = "all",
      from = "",
      to = "",
      projectId = "",
      limit = 100,
      includeRetired = false,
    } = {},
  ) {
    refresh();
    let filtered = entries.filter(
      (m) =>
        (scope === "all" || m.scope === scope || m.scope === "shared") &&
        (kind === "all" || m.kind === kind) &&
        (!from || memoryDay(m.createdAt) >= from) &&
        (!to || memoryDay(m.createdAt) <= to) &&
        (!projectId || m.projectId === projectId) &&
        (includeRetired || !m.validTo),
    );
    const allowed = new Set(filtered.map((m) => m.id)),
      scores = new Map();
    if (query.trim()) {
      const hits = index.search(query).filter((h) => allowed.has(h.id));
      hits.forEach((h, i) => scores.set(h.id, 1 / (60 + i)));
      try {
        const [q] = await embedder.embed([query.slice(0, 12000)]);
        const semantic = filtered
          .map((m) => ({
            id: m.id,
            score:
              vectors.get(m.id)?.vector?.reduce((s, v, i) => s + v * q[i], 0) ||
              0,
          }))
          .filter((v) => v.score > 0.25)
          .sort((a, b) => b.score - a.score);
        semantic
          .slice(0, 100)
          .forEach((h, i) =>
            scores.set(h.id, (scores.get(h.id) || 0) + 1 / (60 + i)),
          );
      } catch {
        semanticStatus = "text-only";
      }
      filtered = filtered
        .filter((m) => scores.has(m.id))
        .sort(
          (a, b) =>
            (scores.get(b.id) || 0) - (scores.get(a.id) || 0) ||
            b.createdAt.localeCompare(a.createdAt),
        );
    } else
      filtered.sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          b.createdAt.localeCompare(a.createdAt),
      );
    void warm();
    return {
      rows: filtered
        .slice(0, limit)
        .map((m) => ({ ...m, relevance: scores.get(m.id) || null })),
      total: filtered.length,
      semanticStatus,
      coverage:
        "Full transcripts are retained; search returns relevant bounded excerpts, not every detail.",
    };
  }
  async function recall(
    query,
    {
      scope,
      threadId,
      projectId,
      excludeMessageId,
      includeOtherScopes = false,
    } = {},
  ) {
    const found = await search(query, {
      scope: includeOtherScopes ? "all" : scope,
      limit: 40,
    });
    const selected = found.rows
      .filter((m) => !excludeMessageId || m.messageId !== excludeMessageId)
      .sort(
        (a, b) =>
          Number(b.projectId === projectId && !!projectId) -
          Number(a.projectId === projectId && !!projectId),
      );
    const pins = memoryEntries().filter(
      (m) =>
        m.kind === "fact" &&
        m.pinned &&
        !m.validTo &&
        (!m.threadId || m.threadId !== threadId) &&
        (includeOtherScopes || m.scope === scope || m.scope === "shared"),
    );
    return [
      ...new Map(
        [...pins.slice(0, 12), ...selected].map((m) => [m.id, m]),
      ).values(),
    ].slice(0, 24);
  }
  function saveFact(input, id) {
    const old = id ? store.get("memory", id) : null;
    if (id && !old) throw Error("Memory not found.");
    const now = stamp();
    const row = {
      ...old,
      ...input,
      id: id || randomUUID(),
      kind: "fact",
      role: "user",
      createdAt: old?.createdAt || now,
      updatedAt: now,
      observedAt: old?.observedAt || now,
      validFrom: old?.validFrom || now,
      validTo: null,
      tags: input.tags?.length ? input.tags : memoryTags(input.text),
    };
    store.put("memory", row.id, row);
    dirty = true;
    void warm();
    return row;
  }
  function removeThread(scope, id) {
    const t = thread(scope, id);
    store.put("chatThread", id, { ...t, archivedAt: stamp() });
    dirty = true;
  }
  function migrate() {
    for (const m of store.list("memory"))
      if (m.pinned === undefined)
        store.put("memory", m.id, { ...m, pinned: true });
    for (const s of ["life", "finance"]) ensureLegacy(s);
    for (const m of store.list("chat")) capture(m);
    for (const d of store.list("document")) captureDocument(d);
    dirty = true;
    void warm();
  }
  function state(scope) {
    return {
      archivedThreads: store
        .list("chatThread")
        .filter((t) => t.scope === scope && t.archivedAt),
      threads: active("chatThread")
        .filter((t) => t.scope === scope)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      projects: active("chatProject").filter(
        (p) => p.scope === scope || p.scope === "shared",
      ),
      semanticStatus,
    };
  }
  return {
    store,
    active,
    thread,
    createThread,
    defaultThread,
    capture,
    captureDocument,
    removeDocument,
    afterMessage,
    memoryEntries,
    search,
    recall,
    saveFact,
    removeThread,
    state,
    migrate,
    touch() {
      dirty = true;
      void warm();
    },
    warm,
    close() {
      closed = true;
      embedder.close?.();
    },
  };
}
