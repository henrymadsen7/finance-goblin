import { useState, useEffect, useRef, lazy, Suspense } from "react";
import {
  Brain,
  Search,
  Plus,
  X,
  Pin,
  ExternalLink,
  RefreshCw,
  Download,
  Check,
} from "lucide-react";
import { request } from "./types";
const MemoryGraph = lazy(() => import("./MemoryGraph"));
export type MemoryEntry = {
  id: string;
  text: string;
  title: string;
  scope: string;
  kind: string;
  role: string;
  tags: string[];
  createdAt: string;
  observedAt?: string;
  updatedAt?: string;
  validFrom?: string;
  validTo?: string | null;
  threadId?: string | null;
  projectId?: string | null;
  messageId?: string;
  pinned?: boolean;
  verified?: boolean;
  generated?: boolean;
  source?: { type: string; id?: string; quote?: string; name?: string };
};
type Library = {
  rows: MemoryEntry[];
  total: number;
  semanticStatus: string;
  coverage: string;
  counts: { total: number; facts: number; conversations: number };
  byDay: Record<string, number>;
  projects: { id: string; name: string }[];
  threads: { id: string; title: string; scope: string }[];
};
export default function MemoryView({
  workspace,
  onOpenChat,
}: {
  workspace: "life" | "finance";
  onOpenChat?: (threadId: string, scope: string) => void;
}) {
  const detailDialog = useRef<HTMLDialogElement>(null);
  const [draftSource, setDraftSource] = useState<MemoryEntry | null>(null);
  const [data, setData] = useState<Library | null>(null),
    [query, setQuery] = useState(""),
    [scope, setScope] = useState("all"),
    [kind, setKind] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [project, setProject] = useState(""),
    [retired, setRetired] = useState(false),
    [view, setView] = useState<"list" | "2d" | "3d">("list"),
    [selected, setSelected] = useState<MemoryEntry | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [editing, setEditing] = useState(false),
    [text, setText] = useState(""),
    [factScope, setFactScope] = useState(workspace as string),
    [pinned, setPinned] = useState(true),
    [tags, setTags] = useState("");
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      const p = new URLSearchParams({
        q: query,
        scope,
        kind,
        from,
        to,
        projectId: project,
        retired: String(retired),
      });
      fetch("/api/assistant/memory/search?" + p)
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw Error(d.error || "Could not load memory");
          if (current) {
            setData(d);
            setError("");
          }
        })
        .catch((e) => current && setError(e.message));
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, scope, kind, from, to, project, retired, revision]);
  useEffect(() => {
    if (!selected && !editing) return;
    const previous = document.activeElement as HTMLElement;
    detailDialog.current?.showModal();
    return () => previous?.focus();
  }, [selected, editing]);
  const mutate = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const edit = (entry: MemoryEntry | null) => {
    setSelected(entry);
    setDraftSource(null);
    setText(entry?.text || "");
    setFactScope(entry?.scope || workspace);
    setPinned(entry?.pinned ?? true);
    setTags(entry?.tags?.join(", ") || "");
    setEditing(true);
  };
  const open = (entry: MemoryEntry) => {
    setSelected(entry);
    setEditing(false);
  };
  const days = Object.entries(data?.byDay || {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-40),
    max = Math.max(1, ...days.map(([, n]) => n));
  return (
    <div className={`memory-view memory-workspace-${workspace}`}>
      <div className="memory-heading">
        <div>
          <span className="memory-eyebrow">Across Life & Finance</span>
          <h2>
            <Brain size={24} /> Memory
          </h2>
          <p>
            Find what you discussed, when it happened, and where it came from.
          </p>
        </div>
        <div className="memory-actions">
          <a
            className="life-button"
            href="/api/assistant/memory/export"
            download
          >
            <Download size={14} /> Export
          </a>
          <button className="life-button primary" onClick={() => edit(null)}>
            <Plus size={14} /> Save memory
          </button>
        </div>
      </div>
      {error && (
        <p className="memory-error" role="alert">
          {error}
        </p>
      )}
      <div className="memory-summary">
        <span>
          <strong>{data?.counts.total || 0}</strong> entries
        </span>
        <span>
          <strong>{data?.counts.facts || 0}</strong> saved facts
        </span>
        <span>
          Search:{" "}
          {data?.semanticStatus === "ready"
            ? "Text + local semantic"
            : data?.semanticStatus === "warming"
              ? "Text · semantic indexing"
              : "Text · semantic unavailable"}
        </span>
        <button
          aria-label="Refresh memory"
          onClick={() => setRevision((n) => n + 1)}
        >
          <RefreshCw size={13} />
        </button>
      </div>
      <section className="memory-timeline" aria-label="Memory entries by day">
        {days.length ? (
          days.map(([day, count]) => (
            <button
              key={day}
              title={`${day}: ${count} entries`}
              aria-label={`${day}: ${count} memory entries`}
              className={from === day && to === day ? "selected" : ""}
              onClick={() => {
                setFrom(day);
                setTo(day);
              }}
            >
              <i style={{ height: `${Math.max(5, (count / max) * 44)}px` }} />
              <span>{day.slice(5)}</span>
            </button>
          ))
        ) : (
          <p>Days with saved conversations appear here.</p>
        )}
      </section>
      <div className="memory-filters">
        <label className="memory-search">
          <Search size={15} />
          <input
            aria-label="Search memories"
            placeholder="Search memories, people, topics…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Memory workspace"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="all">Life + Finance</option>
          <option value="life">Life + Shared</option>
          <option value="finance">Finance + Shared</option>
          <option value="shared">Shared only</option>
        </select>
        <select
          aria-label="Memory type"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="all">All entries</option>
          <option value="fact">Saved facts</option>
          <option value="conversation">Conversation excerpts</option>
          <option value="document">Documents</option>
        </select>
        <select
          aria-label="Memory project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">All chat projects</option>
          {data?.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label>
          From
          <input
            aria-label="Memory start date"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            aria-label="Memory end date"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="memory-retired">
          <input
            type="checkbox"
            checked={retired}
            onChange={(e) => setRetired(e.target.checked)}
          />{" "}
          Include retired facts
        </label>
        {(query || from || to || project) && (
          <button
            className="life-text-button"
            onClick={() => {
              setQuery("");
              setFrom("");
              setTo("");
              setProject("");
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      <div className="memory-view-toolbar">
        <div className="memory-tabs" role="group" aria-label="Memory views">
          {(["list", "2d", "3d"] as const).map((v) => (
            <button
              aria-pressed={view === v}
              key={v}
              onClick={() => setView(v)}
            >
              {v === "list" ? "Search & list" : v.toUpperCase()}
            </button>
          ))}
        </div>
        <span>
          {data?.total || 0} matches
          {data && data.total > data.rows.length
            ? ` · showing ${data.rows.length}`
            : ""}
        </span>
      </div>
      {view !== "list" && data && (
        <>
          <Suspense fallback={<p>Opening memory map…</p>}>
            <MemoryGraph
              entries={data.rows.slice(0, 180)}
              mode={view}
              onSelect={(id) => {
                const m = data.rows.find((m) => m.id === id);
                if (m) open(m);
              }}
            />
          </Suspense>
          <p className="memory-map-note">
            Map shows up to 180 matching entries. Links mark shared chats,
            projects, or keywords; keyword links are associations, not verified
            facts. Use the list for complete excerpts and keyboard access.
          </p>
        </>
      )}
      {view === "list" && (
        <div className="memory-results">
          {data?.rows.map((m) => (
            <button
              key={m.id}
              className="memory-result"
              onClick={() => open(m)}
            >
              <div>
                <span className={`memory-badge ${m.scope}`}>{m.scope}</span>
                <span>
                  {m.kind === "fact"
                    ? m.verified
                      ? "Saved fact"
                      : "Extracted · review"
                    : m.kind === "document"
                      ? "Document"
                      : `${m.role === "assistant" ? "Hermes" : "You"} · conversation`}
                </span>
                {m.pinned && <Pin size={12} />}
                <time>{new Date(m.createdAt).toLocaleString()}</time>
              </div>
              <strong>{m.title}</strong>
              <p>
                {m.text.slice(0, 420)}
                {m.text.length > 420 ? "…" : ""}
              </p>
              <small>
                {m.tags.slice(0, 6).join(" · ")}
                {m.validTo ? " · Retired" : ""}
              </small>
            </button>
          ))}
          {data && !data.rows.length && (
            <div className="memory-empty">
              <Brain size={28} />
              <h3>No matching memories</h3>
              <p>
                Conversations are retained automatically. Save a preference or
                start a chat to build your library.
              </p>
            </div>
          )}
        </div>
      )}
      {(selected || editing) && (
        <dialog
          ref={detailDialog}
          className="memory-detail-backdrop"
          onCancel={(e) => {
            e.preventDefault();
            setSelected(null);
            setEditing(false);
          }}
          onClick={() => {
            setSelected(null);
            setEditing(false);
          }}
        >
          <section
            className="memory-detail"
            role="dialog"
            aria-modal="true"
            aria-label={editing ? "Save memory" : "Memory details"}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h3>{editing ? "Save memory" : selected?.title}</h3>
              <button
                aria-label="Close memory details"
                onClick={() => {
                  setSelected(null);
                  setEditing(false);
                }}
              >
                <X size={18} />
              </button>
            </header>
            {editing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate(async () => {
                    await request(
                      `/api/assistant/memory/facts${selected?.kind === "fact" ? "/" + encodeURIComponent(selected.id) : ""}`,
                      {
                        text,
                        scope: factScope,
                        pinned,
                        ...(selected?.kind === "fact"
                          ? {}
                          : draftSource
                            ? { sourceMemoryId: draftSource.id }
                            : {}),
                        tags: tags
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean),
                      },
                      selected?.kind === "fact" ? "PUT" : "POST",
                    );
                    setSelected(null);
                    setEditing(false);
                  });
                }}
              >
                <label>
                  Memory
                  <textarea
                    aria-label="Memory text"
                    required
                    rows={7}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </label>
                <label>
                  Available in
                  <select
                    aria-label="Saved memory workspace"
                    value={factScope}
                    onChange={(e) => setFactScope(e.target.value)}
                  >
                    <option value="life">Life</option>
                    <option value="finance">Finance</option>
                    <option value="shared">Both workspaces</option>
                  </select>
                </label>
                <label>
                  Topics (comma separated)
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                  />
                </label>
                <label className="memory-retired">
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={(e) => setPinned(e.target.checked)}
                  />{" "}
                  Pin for future conversations
                </label>
                <button
                  className="life-button primary"
                  disabled={busy}
                  type="submit"
                >
                  Save memory
                </button>
              </form>
            ) : (
              selected && (
                <>
                  <p className="memory-detail-meta">
                    {selected.scope} · {selected.kind} · {selected.role} ·{" "}
                    {new Date(selected.createdAt).toLocaleString()}
                  </p>
                  <div className="memory-full-text">{selected.text}</div>
                  <p className="memory-detail-meta">
                    Topics: {selected.tags.join(", ") || "None"}
                  </p>
                  {selected.source?.quote && (
                    <blockquote>
                      Source quote: {selected.source.quote}
                    </blockquote>
                  )}
                  <p className="memory-detail-meta">
                    Recorded {selected.observedAt || selected.createdAt}
                    {selected.updatedAt
                      ? ` · Updated ${selected.updatedAt}`
                      : ""}
                    {selected.validTo ? ` · Retired ${selected.validTo}` : ""}
                  </p>
                  <div className="memory-actions">
                    {selected.threadId && (
                      <button
                        className="life-button"
                        onClick={() => {
                          if (onOpenChat)
                            onOpenChat(
                              selected.threadId!,
                              data?.threads.find(
                                (t) => t.id === selected.threadId,
                              )?.scope || selected.scope,
                            );
                          else
                            window.dispatchEvent(
                              new CustomEvent("assistant-open-thread", {
                                detail: {
                                  threadId: selected.threadId,
                                  scope:
                                    data?.threads.find(
                                      (t) => t.id === selected.threadId,
                                    )?.scope || selected.scope,
                                },
                              }),
                            );
                          setSelected(null);
                        }}
                      >
                        <ExternalLink size={13} /> Open source chat
                      </button>
                    )}
                    {selected.kind === "fact" ? (
                      <>
                        <button
                          className="life-button"
                          onClick={() => edit(selected)}
                        >
                          Edit / confirm
                        </button>
                        <button
                          className="life-button"
                          disabled={busy}
                          onClick={() =>
                            void mutate(async () => {
                              await request(
                                `/api/assistant/memory/${encodeURIComponent(selected.id)}/${selected.validTo ? "restore" : "retire"}`,
                                {},
                              );
                              setSelected(null);
                            })
                          }
                        >
                          {selected.validTo ? "Restore fact" : "Retire fact"}
                        </button>
                      </>
                    ) : (
                      <button
                        className="life-button"
                        onClick={() => {
                          edit(null);
                          setText(selected.text);
                          setDraftSource(selected);
                          setFactScope(selected.scope);
                        }}
                      >
                        Save excerpt as a fact
                      </button>
                    )}
                  </div>
                  <small>
                    Conversation excerpts preserve what was said. Assistant
                    responses and extracted facts are not independently
                    verified.
                  </small>
                </>
              )
            )}
          </section>
        </dialog>
      )}
    </div>
  );
}
