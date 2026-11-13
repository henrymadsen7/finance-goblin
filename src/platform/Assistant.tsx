import { useState, useEffect, useRef } from "react";
import {
  MessageCircle,
  X,
  Send,
  ArrowUp,
  ChevronDown,
  Shield,
  Paperclip,
  Plus,
  Trash2,
  Settings2,
  ArrowUpRight,
  FileText,
  Check,
  LoaderCircle,
  Mic,
  Square,
  Maximize2,
  Minimize2,
  Grip,
  Volume2,
  VolumeX,
} from "lucide-react";
import ChatSidebar from "./ChatSidebar";
import type { ChatThread, ChatProject } from "./ChatSidebar";
import MemoryView from "./MemoryView";
import { Menu, FolderPlus, Brain, MessagesSquare } from "lucide-react";
import ModelPicker from "./ModelPicker";
import ChatAppearance from "./ChatAppearance";
import {
  chatAppearanceVariables,
  defaultChatAppearance,
} from "../../shared/chat-appearance.js";
import type { ChatAppearance as Appearance } from "../../shared/chat-appearance.js";
import type { CSSProperties } from "react";
import useVoiceDraft from "./useVoiceDraft";
import FilePicker from "./FilePicker";
import { request } from "./types";
type Action = {
  id: string;
  action: {
    type: string;
    title?: string;
    name?: string;
    body?: string;
    dueDate?: string | null;
    [key: string]: unknown;
  };
};
type Chat = {
  id: string;
  role: string;
  text: string;
  createdAt: string;
  actions?: Action[];
  documentNames?: string[];
  sharedContext?: boolean;
  contextTruncated?: boolean;
  answerTruncated?: boolean;
  fullText?: string;
  memorySources?: {
    id: string;
    title: string;
    scope: string;
    threadId?: string;
    createdAt: string;
    role: string;
    excerpt: string;
  }[];
};
type Document = {
  id: string;
  name: string;
  mime: string;
  status: string;
  size: number;
};
type State = {
  appearance: Appearance;
  installed: boolean;
  model: string;
  reasoning: string;
  maxTokens: number;
  contextTokens: number;
  messages: Chat[];
  thread: ChatThread;
  threads: ChatThread[];
  archivedThreads: ChatThread[];
  projects: ChatProject[];
  memories: { id: string; text: string }[];
  documents: Document[];
};
export default function Assistant({ scope }: { scope: "life" | "finance" }) {
  const [appearancePreview, setAppearancePreview] = useState<Appearance | null>(
    null,
  );
  const [open, setOpen] = useState(
      () => sessionStorage.getItem(`assistant-autoopen-${scope}`) === "true",
    ),
    [state, setState] = useState<State | null>(null),
    [message, setMessage] = useState(""),
    [share, setShare] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [settings, setSettings] = useState(false),
    [memory, setMemory] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [applied, setApplied] = useState<string[]>([]),
    [model, setModel] = useState("");
  const activeRef = useRef(
    localStorage.getItem(`assistant-active-thread-${scope}`) || "",
  );
  const loadSequence = useRef(0);
  const drafts = useRef<Record<string, string>>({});
  const [sidebar, setSidebar] = useState(false),
    [memoryOpen, setMemoryOpen] = useState(false),
    [projectEditor, setProjectEditor] = useState<ChatProject | null>(null);
  const [projectName, setProjectName] = useState(""),
    [projectDescription, setProjectDescription] = useState("");
  const [expanded, setExpanded] = useState(false),
    [size, setSize] = useState({ width: 480, height: 720 }),
    [speaking, setSpeaking] = useState<string | null>(null);
  const [completeAnswers, setCompleteAnswers] = useState<string[]>([]);
  const previews = useRef<Record<string, string>>({});
  useEffect(
    () => () => Object.values(previews.current).forEach(URL.revokeObjectURL),
    [],
  );
  const drag = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const voice = useVoiceDraft(scope, open, setMessage, setError);
  const panel = useRef<HTMLElement>(null);
  const readAloud = (chat: Chat) => {
    if (speaking === chat.id) {
      speechSynthesis.cancel();
      setSpeaking(null);
      return;
    }
    speechSynthesis.cancel();
    const text = chat.text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*#`]/g, "");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeaking(null);
    utterance.onerror = () => setSpeaking(null);
    setSpeaking(chat.id);
    speechSynthesis.speak(utterance);
  };
  useEffect(() => {
    if (!open) {
      voice.cancel();
      if (speaking) {
        speechSynthesis.cancel();
        setSpeaking(null);
      }
    }
  }, [open]);
  useEffect(
    () => () => {
      if (window.speechSynthesis) speechSynthesis.cancel();
    },
    [],
  );
  useEffect(() => {
    if (!expanded || !open) return;
    const trap = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setExpanded(false);
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = panel.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]",
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    input.current?.focus();
    return () => document.removeEventListener("keydown", trap);
  }, [expanded, open]);
  const end = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (input.current) {
      input.current.style.height = "auto";
      input.current.style.height = `${Math.min(180, Math.max(62, input.current.scrollHeight))}px`;
    }
  }, [message, open]);
  const load = async (id = activeRef.current) => {
    const sequence = ++loadSequence.current;
    const r = await fetch(
      `/api/assistant/${scope}${id ? "?thread=" + encodeURIComponent(id) : ""}`,
    );
    const data = await r.json();
    if (!r.ok) {
      if (id) {
        activeRef.current = "";
        return load("");
      }
      throw Error(data.error || "Could not load assistant.");
    }
    if (sequence !== loadSequence.current) return;
    setState(data);
    setModel(data.model);
    activeRef.current = data.thread.id;
    localStorage.setItem(`assistant-active-thread-${scope}`, data.thread.id);
  };
  const selectThread = async (id: string) => {
    drafts.current[activeRef.current] = message;
    activeRef.current = id;
    setMessage(drafts.current[id] || "");
    setSelected([]);
    setSettings(false);
    setMemoryOpen(false);
    if (!expanded) setSidebar(false);
    await load(id);
  };
  useEffect(() => {
    if (expanded) setSidebar(true);
  }, [expanded]);
  useEffect(() => {
    const jump = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d.scope !== scope) return;
      setOpen(true);
      void selectThread(d.threadId).catch((e) => setError(e.message));
    };
    window.addEventListener("assistant-open-thread", jump);
    sessionStorage.removeItem(`assistant-autoopen-${scope}`);
    return () => window.removeEventListener("assistant-open-thread", jump);
  }, [scope]);
  useEffect(() => {
    if (open) {
      void load().catch((e) => setError(e.message));
      input.current?.focus();
    }
  }, [open, scope]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "instant", block: "nearest" });
  }, [state?.messages.length, busy, expanded]);
  const work = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || busy || voice.active) return;
    const text = message;
    setMessage("");
    await work(async () => {
      await request(`/api/assistant/${scope}/chat`, {
        message: text,
        threadId: activeRef.current,
        shareContext: share,
        documentIds: selected,
        financeMode:
          localStorage.getItem("fg-mode") === "live" ? "live" : "demo",
      });
    });
  };
  const upload = async (file: File) => {
    if (file.size > 3_000_000) throw Error("Choose a file under 3 MB.");
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    let mime = file.type;
    if (!mime && /\.md$/i.test(file.name)) mime = "text/markdown";
    const d = await request<Document>(`/api/assistant/${scope}/documents`, {
      name: file.name,
      mime,
      base64,
      threadId: activeRef.current,
    });
    if (file.type.startsWith("image/"))
      previews.current[d.id] = URL.createObjectURL(file);
    setSelected((s) => [...s, d.id].slice(-4));
  };
  return (
    <>
      <button
        className={`assistant-launch ${open ? "is-open" : ""}`}
        aria-label={`Open ${scope} assistant`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MessageCircle size={19} />
        <span>Ask</span>
      </button>
      {open && (
        <section
          ref={panel}
          className={`assistant-panel${expanded ? " is-expanded" : ""}`}
          style={
            {
              ...chatAppearanceVariables(
                appearancePreview || state?.appearance || defaultChatAppearance,
              ),
              ...(expanded
                ? {}
                : {
                    width: `min(${size.width}px, calc(100vw - 24px))`,
                    height: `min(${size.height}px, calc(100dvh - 40px))`,
                  }),
            } as CSSProperties
          }
          aria-label={`${scope} assistant`}
        >
          {!expanded && (
            <button
              className="assistant-resize"
              aria-label="Resize assistant; use arrow keys or drag"
              title="Drag to resize"
              onKeyDown={(e) => {
                if (
                  ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    e.key,
                  )
                ) {
                  e.preventDefault();
                  setSize((s) => ({
                    width: Math.max(
                      340,
                      Math.min(
                        innerWidth - 40,
                        s.width +
                          (e.key === "ArrowLeft"
                            ? 24
                            : e.key === "ArrowRight"
                              ? -24
                              : 0),
                      ),
                    ),
                    height: Math.max(
                      420,
                      Math.min(
                        innerHeight - 40,
                        s.height +
                          (e.key === "ArrowUp"
                            ? 24
                            : e.key === "ArrowDown"
                              ? -24
                              : 0),
                      ),
                    ),
                  }));
                }
              }}
              onPointerDown={(e) => {
                const r = panel.current!.getBoundingClientRect();
                drag.current = {
                  x: e.clientX,
                  y: e.clientY,
                  width: r.width,
                  height: r.height,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
                e.preventDefault();
              }}
              onPointerMove={(e) => {
                if (drag.current) {
                  const d = drag.current;
                  setSize({
                    width: Math.max(
                      340,
                      Math.min(innerWidth - 40, d.width + d.x - e.clientX),
                    ),
                    height: Math.max(
                      420,
                      Math.min(innerHeight - 40, d.height + d.y - e.clientY),
                    ),
                  });
                }
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
            >
              <Grip size={13} />
            </button>
          )}
          <header>
            <div>
              <button
                aria-label="Toggle chat sidebar"
                aria-expanded={sidebar}
                onClick={() => setSidebar((v) => !v)}
              >
                <Menu size={17} />
              </button>
              <span className="assistant-symbol">
                <MessageCircle size={18} />
              </span>
              <span>
                <strong>
                  {scope === "life" ? "Life" : "Finance"} assistant
                </strong>
                <small>Hermes · ChatGPT</small>
              </span>
            </div>
            <div>
              <button
                aria-label="New chat"
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    const t = await request<ChatThread>(
                      `/api/assistant/library/${scope}/threads`,
                      {},
                    );
                    await selectThread(t.id);
                  })
                }
              >
                <Plus size={17} />
              </button>
              <button
                aria-label={
                  expanded
                    ? "Restore assistant size"
                    : "Expand assistant to full page"
                }
                title={expanded ? "Restore size" : "Full page"}
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              </button>
              <button
                aria-label="Assistant settings"
                onClick={() => setSettings(!settings)}
              >
                <Settings2 size={17} />
              </button>
              <button
                aria-label="Close assistant"
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
          </header>
          <div
            className={`assistant-conversation-layout${sidebar ? " with-sidebar" : ""}`}
          >
            {sidebar && (
              <ChatSidebar
                threads={state?.threads || []}
                archivedThreads={state?.archivedThreads || []}
                projects={state?.projects || []}
                active={state?.thread?.id || ""}
                scope={scope}
                busy={busy}
                onSelect={(id) =>
                  void selectThread(id).catch((e) => setError(e.message))
                }
                onNew={(projectId) =>
                  void work(async () => {
                    const t = await request<ChatThread>(
                      `/api/assistant/library/${scope}/threads`,
                      { projectId: projectId || null },
                    );
                    await selectThread(t.id);
                  })
                }
                onProject={(v) =>
                  void work(() =>
                    request(`/api/assistant/library/${scope}/projects`, v),
                  )
                }
                onRename={(id, title) =>
                  void work(() =>
                    request(
                      `/api/assistant/library/${scope}/threads/${encodeURIComponent(id)}`,
                      { title },
                      "PUT",
                    ),
                  )
                }
                onArchive={(id) =>
                  void work(async () => {
                    await request(
                      `/api/assistant/library/${scope}/threads/${encodeURIComponent(id)}`,
                      undefined,
                      "DELETE",
                    );
                    if (activeRef.current === id) {
                      activeRef.current = "";
                      setMessage("");
                    }
                  })
                }
                onRestore={(id) =>
                  void work(async () => {
                    await request(
                      `/api/assistant/library/${scope}/threads/${encodeURIComponent(id)}/restore`,
                      {},
                    );
                    await selectThread(id);
                  })
                }
                onProjectEdit={(p) => {
                  setProjectEditor(p);
                  setProjectName(p.name);
                  setProjectDescription(p.description);
                }}
                onMemory={() => {
                  setMemoryOpen(true);
                  if (!expanded) setSidebar(false);
                }}
              />
            )}
            <div className="assistant-conversation-main">
              <div className="assistant-thread-bar">
                <strong>
                  {memoryOpen ? "Memory" : state?.thread?.title || "New chat"}
                </strong>
                <div>
                  {!memoryOpen && (
                    <select
                      aria-label="Chat project"
                      disabled={busy}
                      value={state?.thread?.projectId || ""}
                      onChange={(e) =>
                        void work(() =>
                          request(
                            `/api/assistant/library/${scope}/threads/${encodeURIComponent(activeRef.current)}`,
                            { projectId: e.target.value || null },
                            "PUT",
                          ),
                        )
                      }
                    >
                      <option value="">General chat</option>
                      {state?.projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    aria-label={
                      memoryOpen ? "Back to chat" : "Open memory library"
                    }
                    onClick={() => setMemoryOpen((v) => !v)}
                  >
                    {memoryOpen ? (
                      <MessagesSquare size={15} />
                    ) : (
                      <Brain size={15} />
                    )}
                  </button>
                </div>
              </div>
              {memoryOpen ? (
                <div className="assistant-memory-body">
                  <MemoryView
                    workspace={scope}
                    onOpenChat={(id, target) => {
                      if (target === scope) void selectThread(id);
                      else
                        window.dispatchEvent(
                          new CustomEvent("assistant-open-thread", {
                            detail: { threadId: id, scope: target },
                          }),
                        );
                    }}
                  />
                </div>
              ) : (
                <>
                  {settings ? (
                    <div className="assistant-settings">
                      <ChatAppearance
                        scope={scope}
                        saved={state?.appearance}
                        onPreview={setAppearancePreview}
                        onSaved={load}
                      />
                      <label className="assistant-memory-scope">
                        <input
                          type="checkbox"
                          checked={state?.thread?.includeOtherScopes || false}
                          onChange={(e) =>
                            void work(() =>
                              request(
                                `/api/assistant/library/${scope}/threads/${encodeURIComponent(activeRef.current)}`,
                                { includeOtherScopes: e.target.checked },
                                "PUT",
                              ),
                            )
                          }
                        />{" "}
                        Recall relevant memories from both Life and Finance in
                        this chat
                      </label>
                      <p>
                        Choose your model, reasoning and token budgets from the
                        picker beside the microphone.
                      </p>
                      <h3>
                        Remember for {scope === "life" ? "Life" : "Finance"}
                      </h3>
                      <p>
                        These notes are included with your messages in this
                        workspace only.
                      </p>
                      {state?.memories.map((m) => (
                        <div className="assistant-memory" key={m.id}>
                          <p>
                            <MessageText text={m.text} />
                          </p>
                          <button
                            aria-label="Remove memory"
                            disabled={busy}
                            onClick={() =>
                              void work(() =>
                                request(
                                  `/api/assistant/${scope}/memory/${m.id}`,
                                  undefined,
                                  "DELETE",
                                ),
                              )
                            }
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void work(async () => {
                            await request(`/api/assistant/${scope}/memory`, {
                              text: memory,
                            });
                            setMemory("");
                          });
                        }}
                      >
                        <label>
                          Memory
                          <textarea
                            value={memory}
                            onChange={(e) => setMemory(e.target.value)}
                            maxLength={3000}
                          />
                        </label>
                        <button
                          className="life-button"
                          disabled={busy || !memory.trim()}
                        >
                          <Plus size={14} />
                          Remember
                        </button>
                      </form>
                      <h3>Documents</h3>
                      {state?.documents.map((d) => (
                        <div className="assistant-memory" key={d.id}>
                          <p>
                            {d.name}
                            <small>
                              {d.status === "needs-ocr"
                                ? "Needs OCR; upload page images"
                                : "Ready"}
                            </small>
                          </p>
                          <button
                            aria-label={`Remove ${d.name}`}
                            disabled={busy}
                            onClick={() =>
                              void work(async () => {
                                await request(
                                  `/api/assistant/${scope}/documents/${d.id}`,
                                  undefined,
                                  "DELETE",
                                );
                                setSelected((s) =>
                                  s.filter((id) => id !== d.id),
                                );
                              })
                            }
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      <button
                        className="life-button"
                        disabled={busy}
                        onClick={() =>
                          void work(async () => {
                            await request(
                              `/api/assistant/library/${scope}/threads/${encodeURIComponent(activeRef.current)}`,
                              undefined,
                              "DELETE",
                            );
                            activeRef.current = "";
                            setMessage("");
                          })
                        }
                      >
                        <Trash2 size={14} /> Archive this conversation
                      </button>
                    </div>
                  ) : (
                    <div
                      className="assistant-messages"
                      role="log"
                      aria-live="polite"
                    >
                      {!state?.messages.length && (
                        <div className="assistant-empty">
                          <MessageCircle size={27} />
                          <h3>A second perspective.</h3>
                          <p>
                            Ask about this workspace, read a document, or work
                            through a plan.
                          </p>
                          <button
                            onClick={() =>
                              setMessage(
                                scope === "life"
                                  ? "Help me plan my week from the tasks and deadlines I share."
                                  : "Help me understand my spending from the financial context I share.",
                              )
                            }
                          >
                            {scope === "life"
                              ? "Plan my week"
                              : "Understand my spending"}
                            <ArrowUpRight size={14} />
                          </button>
                        </div>
                      )}
                      {state?.messages.map((m) => (
                        <article
                          key={m.id}
                          className={`assistant-message ${m.role}`}
                        >
                          <small>
                            {m.role === "user" ? "You" : "Hermes"}
                            {m.sharedContext
                              ? " · workspace context shared"
                              : ""}
                          </small>
                          <p>
                            <MessageText
                              text={
                                completeAnswers.includes(m.id)
                                  ? m.fullText || m.text
                                  : m.text
                              }
                            />
                          </p>
                          {m.documentNames?.length ? (
                            <span className="life-muted">
                              {m.documentNames.join(", ")}
                            </span>
                          ) : null}
                          {!!m.memorySources?.length && (
                            <details className="assistant-memory-sources">
                              <summary>
                                {m.memorySources.length} memory excerpts
                                considered
                              </summary>
                              {m.memorySources.map((source) => (
                                <button
                                  key={source.id}
                                  disabled={busy}
                                  onClick={() => {
                                    if (!source.threadId) setMemoryOpen(true);
                                    else if (source.scope === scope)
                                      void selectThread(source.threadId);
                                    else
                                      window.dispatchEvent(
                                        new CustomEvent(
                                          "assistant-open-thread",
                                          {
                                            detail: {
                                              threadId: source.threadId,
                                              scope: source.scope,
                                            },
                                          },
                                        ),
                                      );
                                  }}
                                >
                                  <strong>{source.title}</strong>
                                  <small>
                                    {new Date(
                                      source.createdAt,
                                    ).toLocaleString()}{" "}
                                    ·{" "}
                                    {source.role === "assistant"
                                      ? "Hermes"
                                      : "You"}
                                  </small>
                                  <span>{source.excerpt}</span>
                                </button>
                              ))}
                            </details>
                          )}
                          {m.role === "assistant" &&
                            "speechSynthesis" in window && (
                              <button
                                className="assistant-read-aloud"
                                aria-label={
                                  speaking === m.id
                                    ? "Stop reading aloud"
                                    : "Read reply aloud"
                                }
                                onClick={() => readAloud(m)}
                              >
                                {speaking === m.id ? (
                                  <VolumeX size={14} />
                                ) : (
                                  <Volume2 size={14} />
                                )}{" "}
                                {speaking === m.id ? "Stop" : "Listen"}
                              </button>
                            )}
                          {m.answerTruncated && m.fullText && (
                            <button
                              className="assistant-read-aloud"
                              onClick={() =>
                                setCompleteAnswers((s) =>
                                  s.includes(m.id)
                                    ? s.filter((id) => id !== m.id)
                                    : [...s, m.id],
                                )
                              }
                            >
                              {completeAnswers.includes(m.id)
                                ? "Show limited answer"
                                : "Show complete saved answer"}
                            </button>
                          )}
                          {m.answerTruncated && (
                            <small>
                              Answer reached your local token limit. Increase
                              Max answer tokens for longer replies.
                            </small>
                          )}
                          {m.contextTruncated && (
                            <small>
                              Context exceeded the limit; the supplied snapshot
                              was truncated.
                            </small>
                          )}
                          {m.actions?.map((a) => (
                            <div className="assistant-proposal" key={a.id}>
                              <span>{a.action.type.replaceAll("_", " ")}</span>
                              <strong>
                                {a.action.title ||
                                  a.action.name ||
                                  a.action.body}
                              </strong>
                              {a.action.dueDate && (
                                <small>{a.action.dueDate}</small>
                              )}
                              <details>
                                <summary>Review details</summary>
                                <pre>{JSON.stringify(a.action, null, 2)}</pre>
                              </details>
                              <button
                                className="life-button"
                                disabled={busy || applied.includes(a.id)}
                                onClick={() =>
                                  void work(async () => {
                                    await request(
                                      `/api/assistant/${scope}/actions/${a.id}/apply`,
                                      {},
                                    );
                                    setApplied((s) => [...s, a.id]);
                                    window.dispatchEvent(
                                      new Event("life-records-changed"),
                                    );
                                  })
                                }
                              >
                                {applied.includes(a.id) ? (
                                  <>
                                    <Check size={14} />
                                    Applied
                                  </>
                                ) : (
                                  "Apply to Life"
                                )}
                              </button>
                            </div>
                          ))}
                        </article>
                      ))}
                      {busy && (
                        <p className="assistant-thinking" role="status">
                          <LoaderCircle size={14} />
                          Working…
                        </p>
                      )}
                      <div ref={end} />
                    </div>
                  )}
                  {error && (
                    <div className="assistant-error" role="alert">
                      {error}
                    </div>
                  )}
                  {!state?.installed && state && (
                    <p className="assistant-error">
                      Hermes isn’t installed on this machine. Install the
                      official Nous Research Hermes agent, then sign in.
                    </p>
                  )}
                  <form
                    className="assistant-composer assistant-composer-card"
                    onSubmit={(e) => void send(e)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file && !busy && !voice.active)
                        void work(() => upload(file));
                    }}
                  >
                    {!!selected.length && (
                      <div className="assistant-attachment-previews">
                        {state?.documents
                          .filter((d) => selected.includes(d.id))
                          .map((d) => (
                            <div
                              className="assistant-attachment-preview"
                              key={d.id}
                            >
                              {previews.current[d.id] ? (
                                <img
                                  src={previews.current[d.id]}
                                  alt={d.name}
                                />
                              ) : (
                                <span className="assistant-file-symbol">
                                  <FileText size={25} />
                                </span>
                              )}
                              <span title={d.name}>{d.name}</span>
                              <button
                                type="button"
                                aria-label={`Remove attachment ${d.name}`}
                                onClick={() =>
                                  setSelected((s) =>
                                    s.filter((id) => id !== d.id),
                                  )
                                }
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                      </div>
                    )}
                    <textarea
                      ref={input}
                      aria-label="Message assistant"
                      rows={2}
                      placeholder="Message Hermes…"
                      value={message}
                      onChange={(e) => {
                        setMessage(e.target.value);
                        e.currentTarget.style.height = "auto";
                        e.currentTarget.style.height = `${Math.min(180, Math.max(62, e.currentTarget.scrollHeight))}px`;
                      }}
                      onPaste={(e) => {
                        const file = Array.from(e.clipboardData.files).find(
                          (f) => f.type.startsWith("image/"),
                        );
                        if (file && !busy && !voice.active) {
                          e.preventDefault();
                          void work(() => upload(file));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          void send(e as unknown as React.FormEvent);
                        }
                      }}
                    />
                    {voice.active && (
                      <div className="assistant-voice-status" role="status">
                        {voice.recording
                          ? `Recording · ${voice.seconds}s / 60s`
                          : voice.starting
                            ? "Waiting for microphone…"
                            : "Transcribing locally…"}
                        {voice.recording && (
                          <button type="button" onClick={voice.cancel}>
                            Discard
                          </button>
                        )}
                      </div>
                    )}
                    <div className="assistant-compose-actions">
                      <div className="assistant-compose-tools">
                        <details className="assistant-composer-menu">
                          <summary
                            aria-label="Add attachment"
                            title="Add attachment"
                          >
                            <Plus size={18} />
                          </summary>
                          <div className="assistant-composer-popover">
                            <FilePicker
                              label="Upload file"
                              className="assistant-upload-option"
                              accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp"
                              disabled={busy || voice.active}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void work(() => upload(file));
                                e.target.value = "";
                                e.target
                                  .closest("details")
                                  ?.removeAttribute("open");
                              }}
                            >
                              <Paperclip size={15} /> Upload file
                            </FilePicker>
                            {!!state?.documents.length && (
                              <div className="assistant-library">
                                <small>Previously uploaded</small>
                                {state.documents.map((d) => (
                                  <label key={d.id}>
                                    <input
                                      type="checkbox"
                                      checked={selected.includes(d.id)}
                                      disabled={
                                        busy ||
                                        voice.active ||
                                        d.status === "needs-ocr" ||
                                        (!selected.includes(d.id) &&
                                          selected.length >= 4)
                                      }
                                      onChange={(e) =>
                                        setSelected((s) =>
                                          e.target.checked
                                            ? [...s, d.id]
                                            : s.filter((id) => id !== d.id),
                                        )
                                      }
                                    />
                                    <FileText size={13} />
                                    <span>{d.name}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        </details>
                        <details
                          className={`assistant-composer-menu assistant-data-menu${share ? " is-sharing" : ""}`}
                        >
                          <summary title="Choose what Hermes can read">
                            <Shield size={12} />
                            <span>
                              {share
                                ? `${scope === "life" ? "Life" : "Finance"} data`
                                : "Data off"}
                            </span>
                            <ChevronDown size={10} />
                          </summary>
                          <div className="assistant-composer-popover assistant-context">
                            <label>
                              <input
                                type="checkbox"
                                checked={share}
                                onChange={(e) => setShare(e.target.checked)}
                              />
                              {scope === "life"
                                ? "Use my Life & Google data"
                                : "Use my Finance data"}
                            </label>
                            <p>
                              {scope === "life"
                                ? "Relevant Life records and requested Google content are sent to your ChatGPT model for this message. No screen sharing."
                                : "Relevant financial records are sent to your ChatGPT model for this message."}
                            </p>
                            <small>
                              Selected attachments and saved memories are
                              separate.
                            </small>
                          </div>
                        </details>
                      </div>
                      <div className="assistant-compose-right">
                        <ModelPicker
                          scope={scope}
                          busy={busy || voice.active}
                          value={{
                            model: state?.model || "gpt-6-luna",
                            reasoning: state?.reasoning || "low",
                            maxTokens: state?.maxTokens || 3000,
                            contextTokens: state?.contextTokens || 32000,
                          }}
                          onSaved={load}
                        />
                        <button
                          type="button"
                          className={`assistant-mic${voice.recording ? " is-recording" : ""}`}
                          aria-label={
                            voice.recording
                              ? "Stop recording and transcribe"
                              : "Record voice message"
                          }
                          title="Speak · local transcription"
                          disabled={
                            busy || voice.transcribing || voice.starting
                          }
                          onClick={() =>
                            voice.recording ? voice.stop() : void voice.start()
                          }
                        >
                          {voice.recording ? (
                            <Square size={15} />
                          ) : (
                            <Mic size={16} />
                          )}
                        </button>
                        <button
                          type="submit"
                          aria-label="Send message"
                          disabled={
                            busy ||
                            voice.active ||
                            !message.trim() ||
                            !state?.installed
                          }
                        >
                          <ArrowUp size={17} />
                        </button>
                      </div>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
          {projectEditor && (
            <div className="assistant-project-edit">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void work(async () => {
                    await request(
                      `/api/assistant/library/${scope}/projects/${encodeURIComponent(projectEditor.id)}`,
                      { name: projectName, description: projectDescription },
                      "PUT",
                    );
                    setProjectEditor(null);
                  });
                }}
              >
                <h3>Edit chat project</h3>
                <label>
                  Name
                  <input
                    required
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                  />
                </label>
                <label>
                  Project context
                  <textarea
                    rows={6}
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                  />
                </label>
                <div>
                  <button type="submit" disabled={busy}>
                    Save
                  </button>
                  <button type="button" onClick={() => setProjectEditor(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void work(async () => {
                        await request(
                          `/api/assistant/library/${scope}/projects/${encodeURIComponent(projectEditor.id)}`,
                          undefined,
                          "DELETE",
                        );
                        setProjectEditor(null);
                      })
                    }
                  >
                    Archive project
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function MessageText({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https:\/\/[^)\s]+\))/g)
        .map((part, i) => {
          if (part.startsWith("**") && part.endsWith("**"))
            return <strong key={i}>{part.slice(2, -2)}</strong>;
          const link = part.match(/^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/);
          return link ? (
            <a key={i} href={link[2]} target="_blank" rel="noreferrer">
              {link[1]}
            </a>
          ) : (
            part
          );
        })}
    </>
  );
}
