import { useState } from "react";
import {
  Plus,
  Folder,
  MessageSquare,
  Search,
  Archive,
  X,
  ChevronRight,
  Brain,
  Download,
} from "lucide-react";
export type ChatThread = {
  id: string;
  scope: string;
  title: string;
  projectId: string | null;
  updatedAt: string;
  includeOtherScopes?: boolean;
};
export type ChatProject = {
  id: string;
  scope: string;
  name: string;
  description: string;
};
export default function ChatSidebar({
  threads,
  archivedThreads,
  projects,
  active,
  scope,
  busy,
  onSelect,
  onNew,
  onProject,
  onRename,
  onArchive,
  onRestore,
  onProjectEdit,
  onMemory,
}: {
  threads: ChatThread[];
  archivedThreads: ChatThread[];
  projects: ChatProject[];
  active: string;
  scope: string;
  busy: boolean;
  onSelect: (id: string) => void;
  onNew: (projectId?: string) => void;
  onProject: (v: {
    name: string;
    description: string;
    shared: boolean;
  }) => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onProjectEdit: (p: ChatProject) => void;
  onMemory: () => void;
}) {
  const [query, setQuery] = useState(""),
    [create, setCreate] = useState(false),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [shared, setShared] = useState(false),
    [rename, setRename] = useState<string | null>(null),
    [draft, setDraft] = useState("");
  const matches = (t: ChatThread) =>
    t.title.toLowerCase().includes(query.toLowerCase());
  const row = (t: ChatThread) => (
    <div
      key={t.id}
      className={`chat-thread-row${active === t.id ? " active" : ""}`}
    >
      {rename === t.id ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) onRename(t.id, draft.trim());
            setRename(null);
          }}
        >
          <input
            aria-label="Chat title"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" disabled={busy}>
            Save
          </button>
          <button
            type="button"
            aria-label="Cancel rename"
            onClick={() => setRename(null)}
          >
            <X size={12} />
          </button>
        </form>
      ) : (
        <>
          <button
            className="chat-thread-select"
            disabled={busy}
            onClick={() => onSelect(t.id)}
            title={t.title}
          >
            <MessageSquare size={12} />
            <span>{t.title}</span>
          </button>
          <details className="chat-row-menu">
            <summary aria-label={`Options for ${t.title}`}>···</summary>
            <div>
              <button
                disabled={busy}
                onClick={() => {
                  setRename(t.id);
                  setDraft(t.title);
                }}
              >
                Rename
              </button>
              <a
                href={`/api/assistant/library/${scope}/threads/${encodeURIComponent(t.id)}/export`}
                download
              >
                Export chat
              </a>
              <button disabled={busy} onClick={() => onArchive(t.id)}>
                Archive
              </button>
            </div>
          </details>
        </>
      )}
    </div>
  );
  return (
    <aside
      className="chat-sidebar"
      aria-label="Chat projects and conversations"
    >
      <button
        className="chat-new-button"
        disabled={busy}
        onClick={() => onNew()}
      >
        <Plus size={15} /> New chat
      </button>
      <label className="chat-search">
        <Search size={13} />
        <input
          aria-label="Search chats"
          placeholder="Search chats"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="chat-sidebar-heading">
        <span>Projects</span>
        <button
          aria-label="New chat project"
          disabled={busy}
          onClick={() => setCreate((v) => !v)}
        >
          <Plus size={14} />
        </button>
      </div>
      {create && (
        <form
          className="chat-project-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onProject({ name: name.trim(), description, shared });
            setCreate(false);
            setName("");
            setDescription("");
          }}
        >
          <input
            aria-label="Project name"
            placeholder="Project name"
            autoFocus
            required
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            aria-label="Project instructions"
            placeholder="Context and instructions for chats in this project"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <label>
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => setShared(e.target.checked)}
            />{" "}
            Available in Life & Finance
          </label>
          <div>
            <button disabled={busy} type="submit">
              Create project
            </button>
            <button type="button" onClick={() => setCreate(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {projects.map((p) => (
        <details className="chat-project-group" key={p.id} open>
          <summary>
            <Folder size={13} />
            <span>{p.name}</span>
            <small>{p.scope === "shared" ? "Shared" : ""}</small>
          </summary>
          <div className="chat-project-actions">
            <button disabled={busy} onClick={() => onNew(p.id)}>
              <Plus size={12} /> New chat
            </button>
            <button disabled={busy} onClick={() => onProjectEdit(p)}>
              Edit project
            </button>
          </div>
          {threads.filter((t) => t.projectId === p.id && matches(t)).map(row)}
        </details>
      ))}
      {!projects.length && (
        <p className="chat-sidebar-empty">Group related chats in a project.</p>
      )}
      <div className="chat-sidebar-heading">
        <span>Recent</span>
      </div>
      {threads.filter((t) => !t.projectId && matches(t)).map(row)}
      {!!archivedThreads.length && (
        <details className="chat-archived">
          <summary>
            <Archive size={12} /> Archived chats
          </summary>
          {archivedThreads.map((t) => (
            <button key={t.id} disabled={busy} onClick={() => onRestore(t.id)}>
              Restore {t.title}
            </button>
          ))}
        </details>
      )}
      <button className="chat-memory-link" onClick={onMemory}>
        <Brain size={14} /> Memory library
      </button>
      <p className="chat-sidebar-foot">
        Chats and source excerpts stay in your encrypted vault.
      </p>
    </aside>
  );
}
