import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  lazy,
  Suspense,
} from "react";
import {
  Leaf,
  Sun,
  CalendarDays,
  Folder,
  GraduationCap,
  Users,
  Inbox,
  Settings,
  Plus,
  Search,
  ArrowUpRight,
  ChevronRight,
  Check,
  RefreshCw,
  Download,
  Upload,
  Trash2,
  X,
  Star,
  Clock,
  ExternalLink,
  FileText,
  CheckCircle2,
} from "lucide-react";
import MemoryView from "./MemoryView";
import { Brain } from "lucide-react";
import FilePicker from "./FilePicker";
import useLifeNavigation from "./useLifeNavigation";
import Appearance, { applyLifeAppearance } from "./Appearance";
import { defaultLifeAppearance } from "../../shared/life-appearance.js";
import { GlassChrome } from "../Glass";
import { request, ymd, dateLabel } from "./types";
import type {
  LifeState,
  LifeRecord,
  Task,
  Project,
  Course,
  Person,
  LifeEvent,
  Source,
  InboxMessage,
} from "./types";
const Calendar = lazy(() => import("./Calendar"));
const NetworkGraph = lazy(() => import("./NetworkGraph"));
import { CIRCLES, classify } from "../../shared/connect-categories.js";
const pages = [
  { name: "Today", icon: Sun },
  { name: "Calendar", icon: CalendarDays },
  { name: "Projects", icon: Folder },
  { name: "School", icon: GraduationCap },
  { name: "People", icon: Users },
  { name: "Inbox", icon: Inbox },
  { name: "Memory", icon: Brain },
  { name: "Settings", icon: Settings },
];
const recordFields: Record<string, string[]> = {
  course: [
    "name",
    "code",
    "institution",
    "platform",
    "semester",
    "color",
    "url",
    "notes",
  ],
  task: [
    "title",
    "description",
    "status",
    "priority",
    "dueDate",
    "dueTime",
    "timeZone",
    "courseId",
    "projectId",
    "personId",
    "estimateMinutes",
    "type",
    "source",
  ],
  project: ["name", "description", "status", "people", "courseId", "dueDate"],
  event: [
    "title",
    "start",
    "end",
    "allDay",
    "courseId",
    "projectId",
    "location",
    "description",
    "source",
  ],
  contact: [
    "name",
    "headline",
    "email",
    "url",
    "favorite",
    "followup",
    "fields",
  ],
};
const editable = (kind: string, row: LifeRecord) =>
  Object.fromEntries(
    recordFields[kind]
      .filter((k) => row[k] !== undefined)
      .map((k) => [k, row[k]]),
  );
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
function SourceLabel({
  source,
  linked = false,
}: {
  source?: Source;
  linked?: boolean;
}) {
  if (!source) return null;
  return (
    <span className="life-source">
      {source.url && linked ? (
        <a href={source.url} target="_blank" rel="noreferrer">
          {source.label}
          <ExternalLink size={11} />
        </a>
      ) : (
        source.label
      )}
      {source.kind !== "manual" && (
        <span>
          {" "}
          · {source.kind === "screen" ? "Captured" : "Checked"}{" "}
          {new Date(source.observedAt).toLocaleDateString()}
        </span>
      )}
    </span>
  );
}
function Empty({
  title,
  description,
  action,
  label,
}: {
  title: string;
  description?: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="life-empty">
      <span className="life-empty-icon">
        <Leaf size={24} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && (
        <button className="life-button primary" onClick={action}>
          <Plus size={15} />
          {label || "Add"}
        </button>
      )}
    </div>
  );
}
export default function Life() {
  const [state, setState] = useState<LifeState | null>(null),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const { route, navigate } = useLifeNavigation();
  const page = route.page,
    course = route.course;
  const person = state?.contacts.find((p) => p.id === route.person) || null;
  const project = state?.projects.find((p) => p.id === route.project) || null;
  const [editorDraft, setEditorDraft] = useState<{
    kind: string;
    row?: LifeRecord;
    defaults?: Record<string, unknown>;
  } | null>(null);
  const editor = route.edit
    ? (() => {
        if (
          editorDraft &&
          !editorDraft.row &&
          route.edit === `${editorDraft.kind}:new`
        )
          return editorDraft;
        const [kind, ...parts] = route.edit.split(":");
        const id = parts.join(":");
        const rows =
          kind === "task"
            ? state?.tasks
            : kind === "course"
              ? state?.courses
              : kind === "project"
                ? state?.projects
                : kind === "contact"
                  ? state?.contacts
                  : kind === "event"
                    ? state?.events
                    : [];
        const row = rows?.find((r) => r.id === id);
        return row
          ? { kind, row, defaults: undefined }
          : id === "new"
            ? { kind, row: undefined, defaults: undefined }
            : null;
      })()
    : null;
  const setPage = (next: string) => {
    setQuery("");
    navigate({
      page: next,
      course: null,
      person: null,
      project: null,
      edit: null,
    });
  };
  const setCourse = (id: string | null) => navigate({ course: id, edit: null });
  const setPerson = (p: Person | null) => navigate({ person: p?.id || null });
  const setProject = (p: Project | null) =>
    navigate({ project: p?.id || null });
  const setEditor = (e: typeof editorDraft) => {
    setEditorDraft(e);
    navigate({ edit: e ? `${e.kind}:${e.row?.id || "new"}` : null });
  };
  const [completed, setCompleted] = useState(false),
    [taskLimit, setTaskLimit] = useState(8),
    [network, setNetwork] = useState(false);
  const refresh = useCallback(async () => {
    const r = await fetch("/api/life/state");
    if (!r.ok) throw Error("Your local workspace could not load.");
    setState(await r.json());
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(errorText(e)));
    const timer = setInterval(
      () => void refresh().catch((e) => setError(errorText(e))),
      60000,
    );
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const update = () => void refresh().catch((e) => setError(errorText(e)));
    window.addEventListener("life-records-changed", update);
    return () => window.removeEventListener("life-records-changed", update);
  }, [refresh]);
  useEffect(() => {
    const desktop = window.financeDesktop;
    return desktop?.onAction((a) => {
      if (a === "settings") setPage("Settings");
    });
  }, []);
  useEffect(() => {
    setQuery("");
  }, [page]);
  const act = async (fn: () => Promise<unknown>, message?: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      if (message) setNotice(message);
    } catch (e) {
      setError(errorText(e));
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const safeAct = (fn: () => Promise<unknown>, message?: string) =>
    void act(fn, message).catch(() => {});
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    applyLifeAppearance(state?.preferences.appearance || defaultLifeAppearance);
  }, [state?.preferences.appearance]);
  const add = (kind: string, defaults: Record<string, unknown> = {}) =>
    setEditor({ kind, defaults });
  const today = ymd(
      new Date(),
      state?.preferences.timeZone || "America/Denver",
    ),
    courses = new Map(state?.courses.map((c) => [c.id, c]) || []),
    projects = new Map(state?.projects.map((p) => [p.id, p]) || []);
  const matches = (r: LifeRecord) =>
    JSON.stringify(r).toLowerCase().includes(query.toLowerCase());
  const activeTasks = (state?.tasks || [])
    .filter((t) => t.status !== "done" && matches(t))
    .sort(
      (a, b) =>
        (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
        Number(b.priority === "high") - Number(a.priority === "high"),
    );
  const tasks = (state?.tasks || [])
    .filter(
      (t) =>
        (completed || t.status !== "done") &&
        (!course || t.courseId === course) &&
        (!project || t.projectId === project.id) &&
        matches(t),
    )
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const toggleTask = (task: Task) =>
    safeAct(() =>
      request(
        `/api/life/records/task/${encodeURIComponent(task.id)}`,
        {
          ...editable("task", task),
          status: task.status === "done" ? "todo" : "done",
        },
        "PUT",
      ),
    );
  const taskList = (rows: Task[], empty = "Nothing due here.") => (
    <div className="life-task-list">
      {rows.length ? (
        rows.map((t) => (
          <div
            className={`life-task ${t.status === "done" ? "is-done" : ""}`}
            key={t.id}
          >
            <button
              className="life-task-check"
              aria-label={`${t.status === "done" ? "Reopen" : "Complete"} ${t.title}`}
              onClick={() => toggleTask(t)}
              disabled={busy}
            >
              {t.status === "done" && <Check size={13} />}
            </button>
            <button
              className="life-task-title"
              onClick={() => setEditor({ kind: "task", row: t })}
            >
              <strong>{t.title}</strong>
              <span>
                {t.courseId
                  ? courses.get(t.courseId)?.code ||
                    courses.get(t.courseId)?.name
                  : t.projectId
                    ? projects.get(t.projectId)?.name
                    : t.type === "task"
                      ? "Personal"
                      : t.type}
                {t.estimateMinutes > 0 && ` · ${t.estimateMinutes} min`}
              </span>
              <SourceLabel source={t.source} />
            </button>
            <span
              className={`life-due ${t.dueDate && t.dueDate < today && t.status !== "done" ? "overdue" : ""}`}
            >
              {dateLabel(t.dueDate)}
              {t.dueTime && (
                <small>
                  {t.dueTime} · {t.timeZone || "Time zone not recorded"}
                </small>
              )}
            </span>
            {t.priority === "high" && (
              <span className="life-priority" aria-label="High priority" />
            )}
          </div>
        ))
      ) : (
        <p className="life-inline-empty">{empty}</p>
      )}
    </div>
  );
  if (!state)
    return (
      <div className="platform-loading" role="status">
        {error || "Opening your workspace…"}
        {error && (
          <button
            onClick={() => void refresh().catch((e) => setError(errorText(e)))}
          >
            Try again
          </button>
        )}
      </div>
    );
  const currentCourse = state.courses.find((c) => c.id === course);
  return (
    <div className="life-app">
      <aside className="life-sidebar">
        <button
          className="life-brand"
          onClick={() => {
            setPage("Today");
            setCourse(null);
          }}
        >
          <span>
            <Leaf size={19} />
          </span>
          Life
        </button>
        <nav aria-label="Life navigation">
          {pages.map((p) => (
            <div key={p.name}>
              <button
                className={page === p.name ? "active" : ""}
                onClick={() => {
                  setPage(p.name);
                  setCourse(null);
                }}
              >
                {page === p.name && <GlassChrome radius={12} />}
                <p.icon size={17} />
                {p.name}
                {p.name === "School" && state.courses.length > 0 && (
                  <span className="life-nav-count">{state.courses.length}</span>
                )}
              </button>
              {p.name === "School" &&
                page === "School" &&
                state.courses.map((c) => (
                  <button
                    className={`life-course-nav ${course === c.id ? "selected" : ""}`}
                    key={c.id}
                    onClick={() => setCourse(c.id)}
                  >
                    <i style={{ background: c.color }} />
                    {c.code || c.name}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="life-sidebar-foot">
          <span className="life-status-dot" />
          On this Mac<small>{state.preferences.timeZone}</small>
        </div>
      </aside>
      <div className="life-main">
        <header className="life-topbar">
          <span>
            Life <ChevronRight size={13} /> {page}
            {currentCourse && (
              <>
                {" "}
                <ChevronRight size={13} />
                {currentCourse.code || currentCourse.name}
              </>
            )}
          </span>
          <div>
            <span className="life-search">
              <Search size={15} />
              <input
                aria-label={`Search ${page.toLowerCase()}`}
                placeholder="Search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </span>
            <button
              className="life-icon-button"
              aria-label="Refresh Life"
              disabled={busy}
              onClick={() => safeAct(refresh)}
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        <main className="life-content">
          <div
            className="life-page-title"
            style={page === "Memory" ? { display: "none" } : undefined}
          >
            <div>
              <p>
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  timeZone: state.preferences.timeZone,
                })}
              </p>
              <h1>{currentCourse?.name || page}</h1>
              {currentCourse && (
                <span className="life-muted">
                  {currentCourse.institution} · {currentCourse.platform}
                </span>
              )}
            </div>
            <div className="life-actions">
              {page === "Today" && (
                <button
                  className="life-button primary"
                  onClick={() => add("task")}
                >
                  <Plus size={16} />
                  Task
                </button>
              )}
              {page === "Calendar" && (
                <button
                  className="life-button primary"
                  onClick={() => add("event")}
                >
                  <Plus size={16} />
                  Event
                </button>
              )}
              {page === "Projects" && (
                <button
                  className="life-button primary"
                  onClick={() => add("project")}
                >
                  <Plus size={16} />
                  Project
                </button>
              )}
              {page === "School" && (
                <>
                  <button className="life-button" onClick={() => add("course")}>
                    <Plus size={16} />
                    Course
                  </button>
                  {course && (
                    <button
                      className="life-button primary"
                      onClick={() =>
                        add("task", { courseId: course, type: "assignment" })
                      }
                    >
                      <Plus size={16} />
                      Assignment
                    </button>
                  )}
                </>
              )}
              {page === "People" && (
                <button
                  className="life-button primary"
                  onClick={() => add("contact")}
                >
                  <Plus size={16} />
                  Person
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="life-alert" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {page === "Memory" && <MemoryView workspace="life" />}
          {page === "Today" && (
            <>
              <section className="life-today-hero">
                <div>
                  <span className="life-eyebrow">Your day</span>
                  <h2>
                    {activeTasks.filter((t) => t.dueDate === today).length
                      ? `${activeTasks.filter((t) => t.dueDate === today).length} things due today.`
                      : "Nothing due today."}
                  </h2>
                  <p>
                    {activeTasks.filter((t) => t.dueDate && t.dueDate < today)
                      .length
                      ? `${activeTasks.filter((t) => t.dueDate && t.dueDate < today).length} past-due ${activeTasks.filter((t) => t.dueDate && t.dueDate < today).length === 1 ? "item needs" : "items need"} a look.`
                      : "Your calendar and priorities, together."}
                  </p>
                  <button
                    className="life-text-button"
                    onClick={() => setPage("Calendar")}
                  >
                    Open calendar <ArrowUpRight size={16} />
                  </button>
                </div>
                <div className="life-orbit" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <Leaf size={29} />
                </div>
              </section>
              <div className="life-two-column">
                <section className="life-card">
                  <div className="life-card-title">
                    <h2>Up next</h2>
                    <button
                      className="life-text-button"
                      onClick={() => add("task")}
                    >
                      Add task <Plus size={14} />
                    </button>
                  </div>
                  {taskList(
                    activeTasks.slice(0, taskLimit),
                    "Add a task or capture your school deadlines to get started.",
                  )}
                  {activeTasks.length > 8 && (
                    <button
                      className="life-text-button"
                      onClick={() =>
                        setTaskLimit(taskLimit === 8 ? activeTasks.length : 8)
                      }
                    >
                      {taskLimit === 8
                        ? `Show all ${activeTasks.length} tasks`
                        : "Show fewer tasks"}
                    </button>
                  )}
                </section>
                <div className="life-card-stack">
                  <section className="life-card">
                    <div className="life-card-title">
                      <h2>On the calendar</h2>
                      <CalendarDays size={17} />
                    </div>
                    {state.events
                      .filter((e) => e.start.slice(0, 10) >= today)
                      .sort((a, b) => a.start.localeCompare(b.start))
                      .slice(0, 4)
                      .map((e) => (
                        <button
                          className="life-agenda-row"
                          key={e.id}
                          onClick={() => setEditor({ kind: "event", row: e })}
                        >
                          <span className="life-agenda-date">
                            {dateLabel(e.start)}
                          </span>
                          <span>
                            <strong>{e.title}</strong>
                            <SourceLabel source={e.source} />
                          </span>
                          <ChevronRight size={14} />
                        </button>
                      ))}
                    {!state.events.some(
                      (e) => e.start.slice(0, 10) >= today,
                    ) && (
                      <p className="life-inline-empty">
                        No upcoming events. Add one or connect a calendar.
                      </p>
                    )}
                  </section>
                  <section className="life-card">
                    <div className="life-card-title">
                      <h2>Keep in touch</h2>
                      <Users size={17} />
                    </div>
                    {state.contacts
                      .filter((p) => p.followup && p.followup <= today)
                      .slice(0, 4)
                      .map((p) => (
                        <button
                          className="life-agenda-row"
                          key={p.id}
                          onClick={() => {
                            setPage("People");
                            setTimeout(() => setPerson(p), 0);
                          }}
                        >
                          <span className="life-avatar">
                            {p.name.slice(0, 1)}
                          </span>
                          <span>
                            <strong>{p.name}</strong>
                            <small>{dateLabel(p.followup)}</small>
                          </span>
                          <ChevronRight size={14} />
                        </button>
                      ))}
                    {!state.contacts.some(
                      (p) => p.followup && p.followup <= today,
                    ) && (
                      <p className="life-inline-empty">
                        Follow-up dates from People appear here.
                      </p>
                    )}
                  </section>
                </div>
              </div>
              <section className="life-card">
                <div className="life-card-title">
                  <h2>Projects in motion</h2>
                  <button
                    className="life-text-button"
                    onClick={() => setPage("Projects")}
                  >
                    All projects <ArrowUpRight size={15} />
                  </button>
                </div>
                <div className="life-project-strip">
                  {state.projects
                    .filter((p) => p.status === "active")
                    .slice(0, 4)
                    .map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setPage("Projects");
                          setTimeout(() => setProject(p), 0);
                        }}
                      >
                        <Folder size={18} />
                        <strong>{p.name}</strong>
                        <small>
                          {
                            state.tasks.filter(
                              (t) =>
                                t.projectId === p.id && t.status !== "done",
                            ).length
                          }{" "}
                          open tasks
                        </small>
                      </button>
                    ))}
                </div>
                {!state.projects.length && (
                  <p className="life-inline-empty">
                    Give a project its own place, with tasks and people
                    attached.
                  </p>
                )}
              </section>
            </>
          )}
          {page === "Calendar" && (
            <section className="life-card">
              <Suspense fallback={<p>Opening calendar…</p>}>
                <Calendar
                  state={{
                    ...state,
                    events: state.events.filter(matches),
                    tasks: state.tasks.filter(matches),
                  }}
                  onSelect={(kind, row) => setEditor({ kind, row })}
                  onAdd={(date) => add("event", { start: date })}
                  onMove={async (e, start, end) => {
                    await act(() =>
                      request(
                        `/api/life/records/event/${encodeURIComponent(e.id)}`,
                        { ...editable("event", e), start, end },
                        "PUT",
                      ),
                    );
                  }}
                />
              </Suspense>
            </section>
          )}
          {page === "Projects" &&
            (project ? (
              <>
                <button
                  className="life-text-button"
                  onClick={() => setProject(null)}
                >
                  ← All projects
                </button>
                <section className="life-card">
                  <div className="life-card-title">
                    <h2>{project.name}</h2>
                    <button
                      className="life-button"
                      onClick={() =>
                        setEditor({ kind: "project", row: project })
                      }
                    >
                      Edit project
                    </button>
                  </div>
                  <p className="life-description">{project.description}</p>
                  <div className="life-chips">
                    {project.people.map((id) => {
                      const p = state.contacts.find((p) => p.id === id);
                      return p ? <span key={id}>{p.name}</span> : null;
                    })}
                  </div>
                  <div className="life-card-title">
                    <h2>Tasks</h2>
                    <button
                      className="life-button"
                      onClick={() => add("task", { projectId: project.id })}
                    >
                      <Plus size={15} />
                      Task
                    </button>
                  </div>
                  {taskList(tasks)}
                </section>
              </>
            ) : state.projects.length ? (
              <div className="life-project-grid">
                {state.projects.filter(matches).map((p) => {
                  const all = state.tasks.filter((t) => t.projectId === p.id),
                    done = all.filter((t) => t.status === "done").length;
                  return (
                    <button
                      className="life-card life-project-card"
                      key={p.id}
                      onClick={() => setProject(p)}
                    >
                      <div className="life-card-title">
                        <Folder size={22} />
                        <span className="life-pill">{p.status}</span>
                      </div>
                      <h2>{p.name}</h2>
                      <p>{p.description || "No description yet."}</p>
                      <div className="life-progress">
                        <span
                          style={{
                            width: `${all.length ? (done / all.length) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <div className="life-project-meta">
                        <span>
                          {done}/{all.length} tasks
                        </span>
                        <span>{p.people.length} people</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <section className="life-card">
                <Empty
                  title="Make room for a project"
                  description="Collect the tasks, dates, and people behind it."
                  action={() => add("project")}
                  label="Create project"
                />
              </section>
            ))}
          {page === "School" && (
            <>
              {!course && (
                <div className="life-course-grid">
                  {state.courses.filter(matches).map((c) => (
                    <button
                      className="life-card life-course-card"
                      key={c.id}
                      onClick={() => setCourse(c.id)}
                    >
                      <span
                        className="life-course-icon"
                        style={{ color: c.color, background: c.color + "12" }}
                      >
                        <GraduationCap size={24} />
                      </span>
                      <small>
                        {c.institution} · {c.platform}
                      </small>
                      <h2>{c.code || c.name}</h2>
                      <p>{c.name}</p>
                      <div className="life-project-meta">
                        <span>
                          {
                            state.tasks.filter(
                              (t) => t.courseId === c.id && t.status !== "done",
                            ).length
                          }{" "}
                          open
                        </span>
                        <ChevronRight size={17} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {!state.courses.length && (
                <section className="life-card">
                  <Empty
                    title="Your courses, in one place"
                    description="Add a course, then review assignments captured from Canvas or Learning Suite."
                    action={() => add("course")}
                    label="Add course"
                  />
                </section>
              )}
              {currentCourse && (
                <>
                  <div className="life-course-tools">
                    <button
                      className="life-text-button"
                      onClick={() =>
                        setEditor({ kind: "course", row: currentCourse })
                      }
                    >
                      Edit course
                    </button>
                    {currentCourse.url && (
                      <a
                        className="life-text-button"
                        href={currentCourse.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open {currentCourse.platform || "course"}
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                  <SchoolCapture course={currentCourse} onDone={refresh} />
                  <section className="life-card">
                    <div className="life-card-title">
                      <h2>Assignments & exams</h2>
                      <label className="life-checkbox">
                        <input
                          type="checkbox"
                          checked={completed}
                          onChange={(e) => setCompleted(e.target.checked)}
                        />
                        Show completed
                      </label>
                    </div>
                    {taskList(tasks)}
                    {state.imports
                      .filter((i) => i.id === course)
                      .map((i) => (
                        <p className="life-muted" key={i.id}>
                          Last capture:{" "}
                          {new Date(i.observedAt).toLocaleString()}. This is a
                          reviewed snapshot, not live LMS synchronization.
                        </p>
                      ))}
                  </section>
                  {currentCourse.notes && (
                    <section className="life-card">
                      <h2>Course notes</h2>
                      <p className="life-description">{currentCourse.notes}</p>
                    </section>
                  )}
                </>
              )}
            </>
          )}
          {page === "People" && (
            <>
              {!state.contacts.length ? (
                <section className="life-card">
                  <Empty
                    title="Bring your people with you"
                    description="Import Connect to preserve your contacts, notes, conversations, and project links."
                    action={() => setPage("Settings")}
                    label="Import Connect"
                  />
                </section>
              ) : (
                <section className="life-card">
                  <div className="life-card-title">
                    <h2>{state.contacts.length.toLocaleString()} people</h2>
                    <button
                      className="life-text-button"
                      onClick={() => setNetwork(!network)}
                    >
                      {network ? "Hide network" : "Show network"}
                    </button>
                    <span className="life-muted">
                      {state.contacts.filter((p) => p.favorite).length}{" "}
                      favorites
                    </span>
                  </div>
                  {network && (
                    <PeopleNetwork
                      state={state}
                      query={query}
                      onSelect={setPerson}
                    />
                  )}
                  <div className="life-people-list">
                    {state.contacts
                      .filter(matches)
                      .sort(
                        (a, b) =>
                          Number(b.favorite) - Number(a.favorite) ||
                          a.name.localeCompare(b.name),
                      )
                      .slice(0, 200)
                      .map((p) => (
                        <button key={p.id} onClick={() => setPerson(p)}>
                          <span className="life-avatar">
                            {p.name
                              .split(" ")
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join("")}
                          </span>
                          <span>
                            <strong>{p.name}</strong>
                            <small>
                              {p.headline || p.email || "No headline recorded"}
                            </small>
                          </span>
                          {p.favorite && <Star size={14} />}
                          <ChevronRight size={15} />
                        </button>
                      ))}
                  </div>
                  {state.contacts.filter(matches).length > 200 && (
                    <p className="life-muted">
                      Showing the first 200 results. Search to narrow your
                      directory.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
          {page === "Inbox" && (
            <section className="life-card">
              <div className="life-card-title">
                <h2>Inbox</h2>
                <button
                  className="life-button"
                  onClick={() => setPage("Settings")}
                >
                  Manage accounts
                </button>
              </div>
              {!state.messages.length ? (
                <Empty
                  title="A focused place for email"
                  description="Connect Gmail in Settings. You’ll see the latest 50 inbox messages per account and can turn one into a task."
                />
              ) : (
                state.messages
                  .filter((m) =>
                    JSON.stringify(m)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((m) => (
                    <article className="life-mail" key={m.id}>
                      <div>
                        <span>{m.from}</span>
                        <time>
                          {m.date ? new Date(m.date).toLocaleDateString() : ""}
                        </time>
                      </div>
                      <h3>
                        <a href={m.url} target="_blank" rel="noreferrer">
                          {m.subject}
                          <ExternalLink size={12} />
                        </a>
                      </h3>
                      <p>{m.snippet}</p>
                      <button
                        className="life-text-button"
                        onClick={() =>
                          add("task", {
                            title: m.subject,
                            description: `${m.snippet}\n\nEmail: ${m.url}`,
                            source: { ...m.source, url: m.url },
                          })
                        }
                      >
                        Create task <Plus size={14} />
                      </button>
                    </article>
                  ))
              )}
            </section>
          )}
          {page === "Settings" && (
            <LifeSettings state={state} act={act} refresh={refresh} />
          )}
        </main>
      </div>
      {notice && (
        <div className="life-toast" role="status">
          {notice}
        </div>
      )}
      {editor && (
        <RecordEditor
          kind={editor.kind}
          row={editor.row}
          defaults={editor.defaults}
          state={state}
          onClose={() => setEditor(null)}
          onSave={async (data) => {
            await act(
              () =>
                request(
                  `/api/life/records/${editor.kind}${editor.row ? "/" + encodeURIComponent(editor.row.id) : ""}`,
                  data,
                  editor.row ? "PUT" : "POST",
                ),
              "Saved",
            );
            setEditor(null);
            setPerson(null);
            setProject(null);
          }}
          onArchive={
            editor.row
              ? async () => {
                  await act(
                    () =>
                      request(
                        `/api/life/records/${editor.kind}/${encodeURIComponent(editor.row!.id)}`,
                        undefined,
                        "DELETE",
                      ),
                    "Archived",
                  );
                  setEditor(null);
                }
              : undefined
          }
        />
      )}
      {person && (
        <PersonDetail
          person={state.contacts.find((p) => p.id === person.id) || person}
          state={state}
          onClose={() => setPerson(null)}
          onEdit={() => {
            setEditor({ kind: "contact", row: person });
            setPerson(null);
          }}
          onNote={async (body) => {
            await act(() =>
              request("/api/life/records/note", {
                personId: person.id,
                body,
                type: "conversation",
                date: today,
              }),
            );
          }}
        />
      )}
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      className="life-dialog"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="life-dialog-head">
        <h2>{title}</h2>
        <button
          className="life-icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function RecordEditor({
  kind,
  row,
  defaults,
  state,
  onClose,
  onSave,
  onArchive,
}: {
  kind: string;
  row?: LifeRecord;
  defaults?: Record<string, unknown>;
  state: LifeState;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onArchive?: () => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => ({
      ...{
        timeZone: state.preferences.timeZone,
        ...(kind === "course"
          ? { platform: "Canvas · BYU", color: "#a8c9ed" }
          : {}),
      },
      ...(row ? editable(kind, row) : {}),
      ...defaults,
    })),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));
  const input = (
    key: string,
    label: string,
    type = "text",
    required = false,
  ) => (
    <label>
      {label}
      <input
        name={key}
        type={type}
        required={required}
        onInput={(e) =>
          set(
            key,
            type === "number"
              ? Number(e.currentTarget.value)
              : e.currentTarget.value,
          )
        }
        value={String(values[key] ?? "")}
        onChange={(e) =>
          set(key, type === "number" ? Number(e.target.value) : e.target.value)
        }
        {...(type === "number" ? { min: 0, max: 60000 } : {})}
      />
    </label>
  );
  const select = (
    key: string,
    label: string,
    options: { id: string; name: string }[],
    nullable = true,
  ) => (
    <label>
      {label}
      <select
        value={String(values[key] ?? "")}
        onChange={(e) => set(key, e.target.value || null)}
      >
        {nullable && <option value="">None</option>}
        {options.map((o) => (
          <option value={o.id} key={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
  const readonly = !!row && ["google", "ical"].includes(row.source?.kind || "");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = Object.fromEntries(
        recordFields[kind]
          .filter((k) => values[k] !== undefined)
          .map((k) => [k, values[k]]),
      );
      for (const k of [
        "dueDate",
        "dueTime",
        "followup",
        "courseId",
        "projectId",
        "personId",
        "end",
      ])
        if (data[k] === "") data[k] = null;
      if (kind === "event") {
        for (const k of ["start", "end"])
          if (data[k] && !values.allDay)
            data[k] = new Date(String(data[k])).toISOString();
      }
      await onSave(data);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const localInput = (key: string) => {
    const raw = String(values[key] || "");
    if (!raw) return "";
    if (raw.length <= 16) return raw;
    const d = new Date(raw);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  return (
    <Modal title={`${row ? "Edit" : "New"} ${kind}`} onClose={onClose}>
      <form className="life-form" onSubmit={submit}>
        <fieldset disabled={busy || readonly}>
          {["task", "event"].includes(kind)
            ? input("title", "Title", "text", true)
            : input("name", "Name", "text", true)}
          {kind === "task" && (
            <>
              <div className="life-form-row">
                {input("dueDate", "Due date", "date")}
                {input("dueTime", "Due time (optional)", "time")}
              </div>
              {input("timeZone", "Course time zone")}
              <div className="life-form-row">
                {select(
                  "type",
                  "Type",
                  ["task", "assignment", "exam", "reading", "project"].map(
                    (id) => ({ id, name: id }),
                  ),
                  false,
                )}
                {select(
                  "priority",
                  "Priority",
                  ["normal", "high", "low"].map((id) => ({ id, name: id })),
                  false,
                )}
              </div>
              {select(
                "status",
                "Status",
                [
                  { id: "todo", name: "To do" },
                  { id: "doing", name: "In progress" },
                  { id: "done", name: "Done" },
                ],
                false,
              )}
              {input("estimateMinutes", "Estimated minutes", "number")}
            </>
          )}
          {kind === "course" && (
            <>
              <div className="life-form-row">
                {input("code", "Course code")}
                {input("semester", "Semester")}
              </div>
              {input("institution", "School")}
              {select(
                "platform",
                "Platform",
                [
                  "Canvas · BYU",
                  "Learning Suite · BYU",
                  "Canvas · Saddleback",
                  "Other",
                ].map((id) => ({ id, name: id })),
                false,
              )}
              {input("url", "Course website", "url")}
              {input("color", "Course color", "color")}
            </>
          )}
          {kind === "project" && (
            <>
              {select(
                "status",
                "Status",
                ["active", "paused", "done"].map((id) => ({ id, name: id })),
                false,
              )}
              {input("dueDate", "Target date", "date")}
              <label>
                People
                <select
                  multiple
                  value={(values.people as string[]) || []}
                  onChange={(e) =>
                    set(
                      "people",
                      Array.from(e.target.selectedOptions, (o) => o.value),
                    )
                  }
                >
                  {state.contacts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <small>Use Command or Control to select multiple people.</small>
              </label>
            </>
          )}
          {kind === "event" && (
            <>
              <label className="life-checkbox">
                <input
                  type="checkbox"
                  checked={!!values.allDay}
                  onChange={(e) => set("allDay", e.target.checked)}
                />
                All day
              </label>
              <div className="life-form-row">
                <label>
                  Start
                  <input
                    required
                    onInput={(e) => set("start", e.currentTarget.value)}
                    type={values.allDay ? "date" : "datetime-local"}
                    value={
                      values.allDay
                        ? String(values.start || "").slice(0, 10)
                        : localInput("start")
                    }
                    onChange={(e) => set("start", e.target.value)}
                  />
                </label>
                <label>
                  End{values.allDay ? " (exclusive)" : ""}
                  <input
                    onInput={(e) => set("end", e.currentTarget.value || null)}
                    type={values.allDay ? "date" : "datetime-local"}
                    value={
                      values.allDay
                        ? String(values.end || "").slice(0, 10)
                        : localInput("end")
                    }
                    onChange={(e) => set("end", e.target.value || null)}
                  />
                </label>
              </div>
              {input("location", "Location")}
            </>
          )}
          {["task", "project", "event"].includes(kind) &&
            select(
              "courseId",
              "Course",
              state.courses.map((c) => ({
                id: c.id,
                name: c.code ? `${c.code} · ${c.name}` : c.name,
              })),
            )}
          {["task", "event"].includes(kind) &&
            select(
              "projectId",
              "Project",
              state.projects.map((p) => ({ id: p.id, name: p.name })),
            )}
          {kind === "task" &&
            select(
              "personId",
              "Related person",
              state.contacts.map((p) => ({ id: p.id, name: p.name })),
            )}
          {kind === "contact" && (
            <>
              {input("headline", "Headline")}
              {input("email", "Email", "email")}
              {input("url", "Profile link", "url")}
              {input("followup", "Next follow-up", "date")}
              <label className="life-checkbox">
                <input
                  type="checkbox"
                  checked={!!values.favorite}
                  onChange={(e) => set("favorite", e.target.checked)}
                />
                Favorite
              </label>
            </>
          )}
          {kind !== "contact" && (
            <label>
              {kind === "course" ? "Notes" : "Details"}
              <textarea
                rows={4}
                value={String(
                  values[kind === "course" ? "notes" : "description"] || "",
                )}
                onChange={(e) =>
                  set(
                    kind === "course" ? "notes" : "description",
                    e.target.value,
                  )
                }
              />
            </label>
          )}
        </fieldset>
        {row?.source && (
          <div className="life-source-detail">
            <SourceLabel source={row.source} linked />
            {row.source.evidence && (
              <details>
                <summary>Source evidence</summary>
                <p>{row.source.evidence}</p>
              </details>
            )}
          </div>
        )}
        {readonly && (
          <p className="life-muted">
            This event is read-only. Make changes at its source.
          </p>
        )}
        {error && (
          <p className="life-alert" role="alert">
            {error}
          </p>
        )}
        <div className="life-dialog-actions">
          {onArchive && !readonly && (
            <button
              type="button"
              className="life-button danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void onArchive().catch((e) => {
                  setError(errorText(e));
                  setBusy(false);
                });
              }}
            >
              Archive
            </button>
          )}
          <span />
          {readonly ? (
            <button
              type="button"
              className="life-button primary"
              onClick={onClose}
            >
              Close
            </button>
          ) : (
            <>
              <button type="button" className="life-button" onClick={onClose}>
                Cancel
              </button>
              <button className="life-button primary" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}
function PersonDetail({
  person,
  state,
  onClose,
  onEdit,
  onNote,
}: {
  person: Person;
  state: LifeState;
  onClose: () => void;
  onEdit: () => void;
  onNote: (body: string) => Promise<void>;
}) {
  const [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={person.name} onClose={onClose}>
      <div className="life-person-detail">
        <p>{person.headline}</p>
        <div className="life-person-links">
          {person.email && (
            <a href={`mailto:${person.email}`}>{person.email}</a>
          )}
          {person.url && (
            <a href={person.url} target="_blank" rel="noreferrer">
              Profile <ExternalLink size={13} />
            </a>
          )}
          <button className="life-text-button" onClick={onEdit}>
            Edit details
          </button>
        </div>
        {person.followup && (
          <p className="life-muted">Follow up {dateLabel(person.followup)}</p>
        )}
        <SourceLabel source={person.source} linked />
        <div className="life-chips">
          {state.projects
            .filter((p) => p.people.includes(person.id))
            .map((p) => (
              <span key={p.id}>{p.name}</span>
            ))}
        </div>
        <h3>Notes & conversations</h3>
        {state.notes
          .filter((n) => n.personId === person.id)
          .sort((a, b) =>
            (b.date || b.createdAt || "").localeCompare(
              a.date || a.createdAt || "",
            ),
          )
          .map((n) => (
            <article className="life-note" key={n.id}>
              <small>
                {dateLabel(n.date || n.createdAt || null)} · {n.type}
              </small>
              <p>{n.body}</p>
            </article>
          ))}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await onNote(note);
              setNote("");
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Record a conversation
            <textarea
              required
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button
            className="life-button primary"
            disabled={busy || !note.trim()}
          >
            Save conversation
          </button>
        </form>
      </div>
    </Modal>
  );
}
function SchoolCapture({
  course,
  onDone,
}: {
  course: Course;
  onDone: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [url, setUrl] = useState(course.url),
    [text, setText] = useState(""),
    [timeZone, setTimeZone] = useState("America/Denver"),
    [preview, setPreview] = useState<{
      ticket: string;
      rows: (Task & { existing: boolean })[];
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setUrl(course.url);
    setText("");
    setPreview(null);
    setOpen(false);
  }, [course.id]);
  const review = async () => {
    setBusy(true);
    setError("");
    try {
      let rows: unknown[];
      if (text.trim().startsWith("[")) rows = JSON.parse(text);
      else
        rows = text
          .trim()
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => {
            const [title, dueDate, dueTime, type] = line.split("\t");
            return {
              title: title.trim(),
              dueDate: dueDate?.trim() || null,
              dueTime: dueTime?.trim() || null,
              type: type?.trim() || "assignment",
              timeZone,
            };
          });
      const result = await request<{
        ticket: string;
        rows: (Task & { existing: boolean })[];
      }>("/api/life/school/preview", {
        courseId: course.id,
        source: {
          kind: "screen",
          label: `${course.institution} · ${course.platform}`,
          url,
          observedAt: new Date().toISOString(),
          timeZone,
          evidence: text.slice(0, 12000),
        },
        rows,
      });
      setPreview(result);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="life-card life-capture">
      <button
        className="life-capture-heading"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>
          <Upload size={17} />
          <strong>Capture school deadlines</strong>
        </span>
        <ChevronRight className={open ? "rotate" : ""} size={17} />
      </button>
      {open && (
        <div className="life-form">
          <p className="life-muted">
            Review dates read from your signed-in course page. Captures stay
            labeled with their source and checked date.
          </p>
          <label>
            Source page URL
            <input
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <label>
            Course time zone
            <input
              value={timeZone}
              onChange={(e) => {
                setTimeZone(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <label>
            Assignments
            <textarea
              rows={6}
              placeholder={
                "Title\t2026-11-20\t23:59\tassignment\nExam\t2026-12-10\t\texam"
              }
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setPreview(null);
              }}
            />
            <small>
              One row per item, with tab-separated title, YYYY-MM-DD, optional
              HH:MM, and type. A JSON array of task records is also accepted.
              Leave missing dates/times blank.
            </small>
          </label>
          {preview && (
            <div className="life-import-preview">
              <h3>Review {preview.rows.length} items</h3>
              {preview.rows.map((r, i) => (
                <div key={i}>
                  <strong>{r.title}</strong>
                  <span>
                    {dateLabel(r.dueDate)} {r.dueTime || "· Time not recorded"}{" "}
                    {r.existing ? "· Updates existing capture" : ""}
                  </span>
                </div>
              ))}
              <p className="life-muted">
                Completion is tracked locally; importing a deadline does not
                verify LMS submission.
              </p>
            </div>
          )}
          {error && (
            <p className="life-alert" role="alert">
              {error}
            </p>
          )}
          <div className="life-actions">
            {!preview ? (
              <button
                className="life-button"
                disabled={busy || !text.trim() || !url}
                onClick={() => void review()}
              >
                {busy ? "Checking…" : "Preview capture"}
              </button>
            ) : (
              <button
                className="life-button primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await request("/api/life/school/import", {
                      ticket: preview.ticket,
                    });
                    await onDone();
                    setPreview(null);
                    setText("");
                    setOpen(false);
                  } catch (e) {
                    setError(errorText(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Import reviewed items
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
function LifeSettings({
  state,
  act,
  refresh,
}: {
  state: LifeState;
  act: (fn: () => Promise<unknown>, message?: string) => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [connectPreview, setConnectPreview] = useState<{
      ticket: string;
      contacts: number;
      projects: number;
      notes: number;
      sample: { name: string; headline: string }[];
    } | null>(null),
    [calendarPreview, setCalendarPreview] = useState<{
      ticket: string;
      count: number;
    } | null>(null),
    [schoolPreview, setSchoolPreview] = useState<{
      ticket: string;
      count: number;
      courses: {
        name: string;
        count: number;
        source: Source;
        titles: {
          title: string;
          dueDate: string | null;
          dueTime: string | null;
          timeZone: string;
        }[];
      }[];
    } | null>(null);
  const [docPreview, setDocPreview] = useState<{
    title: string;
    text: string;
    truncated: boolean;
    source: Source;
    url: string;
  } | null>(null);
  const [fileQuery, setFileQuery] = useState("");
  const [label, setLabel] = useState(""),
    [feedURL, setFeedURL] = useState(""),
    [zone, setZone] = useState(state.preferences.timeZone),
    [clientId, setClientId] = useState(""),
    [clientSecret, setClientSecret] = useState("");
  const work = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const readFile = async (file: File) => {
    if (file.size > 3_000_000) throw Error("Choose a file under 3 MB.");
    return file.text();
  };
  return (
    <div className="life-settings">
      <Appearance saved={state.preferences.appearance} refresh={refresh} />
      {error && (
        <p className="life-alert" role="alert">
          {error}
        </p>
      )}
      <section className="life-card">
        <div className="life-card-title">
          <h2>Connect</h2>
          <Users size={18} />
        </div>
        <p>
          Keep your contacts, conversations, notes, and project links. The
          original Connect database stays unchanged. Repeat imports preserve
          records already in Life.
        </p>
        <div className="life-actions">
          <button
            className="life-button primary"
            disabled={busy || !state.connectAvailable}
            onClick={() =>
              void work(async () =>
                setConnectPreview(
                  await request("/api/life/connect/preview", {}),
                ),
              )
            }
          >
            Preview local Connect
          </button>
          <FilePicker
            label="Choose Connect JSON"
            accept="application/json,.json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                void work(async () =>
                  setConnectPreview(
                    await request("/api/life/connect/preview", {
                      data: JSON.parse(await readFile(f)),
                    }),
                  ),
                );
              e.target.value = "";
            }}
          />
        </div>
        {!state.connectAvailable && (
          <p className="life-muted">
            Local Connect database not found. Use its JSON export.
          </p>
        )}
        {connectPreview && (
          <div className="life-import-preview">
            <h3>
              {connectPreview.contacts.toLocaleString()} contacts ·{" "}
              {connectPreview.projects} projects · {connectPreview.notes}{" "}
              notes/conversations
            </h3>
            {connectPreview.sample.map((p, i) => (
              <div key={i}>
                <strong>{p.name}</strong>
                <span>{p.headline}</span>
              </div>
            ))}
            <button
              className="life-button primary"
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  await act(
                    () =>
                      request("/api/life/connect/import", {
                        ticket: connectPreview.ticket,
                      }),
                    "Connect imported",
                  );
                  setConnectPreview(null);
                })
              }
            >
              Import reviewed Connect data
            </button>
          </div>
        )}
      </section>
      <section className="life-card">
        <div className="life-card-title">
          <h2>School captures</h2>
          <GraduationCap size={18} />
        </div>
        <p>
          Import a reviewed course capture from Canvas or Learning Suite. Each
          assignment retains its source page, observed date, and exact time
          where available.
        </p>
        <FilePicker
          label="Choose school capture JSON"
          accept=".json,application/json"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f)
              void work(async () =>
                setSchoolPreview(
                  await request(
                    "/api/life/school/bundle/preview",
                    JSON.parse(await readFile(f)),
                  ),
                ),
              );
            e.target.value = "";
          }}
        />
        {schoolPreview && (
          <div className="life-import-preview">
            <h3>
              {schoolPreview.courses.length} courses · {schoolPreview.count}{" "}
              items
            </h3>
            {schoolPreview.courses.map((c, i) => (
              <details key={i}>
                <summary>
                  {c.name} · {c.count} items
                </summary>
                <SourceLabel source={c.source} linked />
                {c.titles.map((t, j) => (
                  <p className="life-muted" key={j}>
                    {t.title} — {t.dueDate || "Date unknown"}{" "}
                    {t.dueTime
                      ? `${t.dueTime} ${t.timeZone}`
                      : "· Time unknown"}
                  </p>
                ))}
              </details>
            ))}
            <button
              className="life-button primary"
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  await act(
                    () =>
                      request("/api/life/school/bundle/import", {
                        ticket: schoolPreview.ticket,
                      }),
                    "School captures imported",
                  );
                  setSchoolPreview(null);
                })
              }
            >
              Import reviewed courses & assignments
            </button>
          </div>
        )}
      </section>
      <section className="life-card">
        <div className="life-card-title">
          <h2>Calendars</h2>
          <CalendarDays size={18} />
        </div>
        <p>
          Subscribe to an iCalendar feed or import an .ics file. Feed URLs stay
          encrypted. Imported events cover the previous 90 days and next 370
          days.
        </p>
        <div className="life-form">
          <div className="life-form-row">
            <label>
              Calendar name
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="School calendar"
              />
            </label>
            <label>
              Time zone
              <input value={zone} onChange={(e) => setZone(e.target.value)} />
            </label>
          </div>
          <label>
            Private feed URL
            <input
              type="url"
              value={feedURL}
              onChange={(e) => setFeedURL(e.target.value)}
              placeholder="https://…"
            />
          </label>
          <div className="life-actions">
            <button
              className="life-button"
              disabled={busy || !label || !feedURL}
              onClick={() =>
                void work(async () => {
                  await act(
                    () =>
                      request("/api/life/calendar/feed", {
                        label,
                        url: feedURL,
                        timeZone: zone,
                      }),
                    "Calendar connected",
                  );
                  setFeedURL("");
                })
              }
            >
              Connect feed
            </button>
            <FilePicker
              label="Choose .ics file"
              accept=".ics,text/calendar"
              disabled={busy || !label}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  void work(async () =>
                    setCalendarPreview(
                      await request("/api/life/calendar/preview", {
                        text: await readFile(f),
                        label,
                        timeZone: zone,
                      }),
                    ),
                  );
                e.target.value = "";
              }}
            />
          </div>
          {calendarPreview && (
            <div className="life-import-preview">
              <p>{calendarPreview.count} occurrences ready to import.</p>
              <button
                className="life-button primary"
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    await act(
                      () =>
                        request("/api/life/calendar/import", {
                          ticket: calendarPreview.ticket,
                        }),
                      "Calendar imported",
                    );
                    setCalendarPreview(null);
                  })
                }
              >
                Import reviewed calendar
              </button>
            </div>
          )}
        </div>
      </section>
      <section className="life-card">
        <div className="life-card-title">
          <h2>Google accounts</h2>
          <Inbox size={18} />
        </div>
        <p>
          Connect Calendar, Gmail, and Drive & Docs separately. Account data is
          read-only. Each account appears below after sign-in.
        </p>
        {!state.googleConfigured ? (
          <details>
            <summary>Set up Google connection</summary>
            <form
              className="life-form"
              onSubmit={(e) => {
                e.preventDefault();
                void work(async () => {
                  await act(
                    () =>
                      request("/api/life/google/config", {
                        clientId,
                        clientSecret,
                      }),
                    "Google client saved",
                  );
                  setClientSecret("");
                });
              }}
            >
              <p className="life-muted">
                Register a Desktop app in your own Google Cloud project. Client
                configuration is encrypted locally. Passwords stay with Google.
              </p>
              <ol className="life-google-steps">
                <li>
                  Open{" "}
                  <a
                    href="https://console.cloud.google.com/projectcreate"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google Cloud
                  </a>{" "}
                  and select or create a project for Life.
                </li>
                <li>
                  Enable{" "}
                  <a
                    href="https://console.cloud.google.com/apis/library/gmail.googleapis.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Gmail API
                  </a>{" "}
                  and{" "}
                  <a
                    href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google Calendar API
                  </a>
                  .
                </li>
                <li>
                  In{" "}
                  <a
                    href="https://console.cloud.google.com/auth/overview"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google Auth Platform
                  </a>
                  , set up Branding (Life), Audience (External for personal
                  Gmail), and add your own account under Test users.
                </li>
                <li>
                  Under Clients, create an OAuth client with application type{" "}
                  <strong>Desktop app</strong>. Download its JSON and import it
                  below. Then save and connect each service.
                </li>
              </ol>
              <p className="life-muted">
                Google may require reauthorization after seven days while an
                external app is in Testing. A school administrator may restrict
                third-party apps.
              </p>
              <FilePicker
                label="Import Google client JSON"
                accept="application/json,.json"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void work(async () => {
                      const json = JSON.parse(await readFile(file));
                      const c = json.installed;
                      if (
                        !c ||
                        typeof c.client_id !== "string" ||
                        !c.client_id.endsWith(".apps.googleusercontent.com")
                      )
                        throw Error(
                          "Choose the Desktop app client JSON downloaded from Google Cloud.",
                        );
                      setClientId(c.client_id);
                      setClientSecret(c.client_secret || "");
                    });
                  e.target.value = "";
                }}
              />
              <label>
                Client ID
                <input
                  required
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                />
              </label>
              <label>
                Client secret
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <button className="life-button" disabled={busy}>
                Save Google client
              </button>
            </form>
          </details>
        ) : (
          <div className="life-actions">
            {["calendar", "gmail", "drive"].map((service) => (
              <button
                className="life-button"
                key={service}
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    const r = await request<{ url: string }>(
                      "/api/life/google/authorize",
                      { service },
                    );
                    window.open(r.url, "_blank", "noopener,noreferrer");
                  })
                }
              >
                Connect{" "}
                {service === "gmail"
                  ? "Gmail"
                  : service === "drive"
                    ? "Drive & Docs"
                    : "Google Calendar"}
                <ArrowUpRight size={14} />
              </button>
            ))}
            <button className="life-text-button" onClick={() => void refresh()}>
              Check sign-in result <RefreshCw size={13} />
            </button>
          </div>
        )}
      </section>
      <section className="life-card">
        <h2>Connected sources</h2>
        {state.connections.length ? (
          state.connections.map((c) => (
            <div className="life-connection" key={c.id}>
              <div>
                <strong>{c.label}</strong>
                <small>
                  {c.provider} {c.service || ""} · {c.status}
                  {c.lastSync
                    ? ` · Checked ${new Date(c.lastSync).toLocaleString()}`
                    : " · Not synced yet"}
                </small>
                {c.error && <p className="life-alert">{c.error}</p>}
              </div>
              <button
                className="life-icon-button"
                aria-label={`Refresh ${c.label}`}
                disabled={busy || c.provider === "ical-file"}
                onClick={() =>
                  void work(() =>
                    act(
                      () =>
                        request(
                          `/api/life/connections/${encodeURIComponent(c.id)}/sync`,
                          {},
                        ),
                      "Source refreshed",
                    ),
                  )
                }
              >
                <RefreshCw size={15} />
              </button>
              <button
                className="life-icon-button"
                aria-label={`Disconnect ${c.label}`}
                disabled={busy}
                onClick={() =>
                  void work(() =>
                    act(
                      () =>
                        request(
                          `/api/life/connections/${encodeURIComponent(c.id)}`,
                          undefined,
                          "DELETE",
                        ),
                      "Disconnected locally",
                    ),
                  )
                }
              >
                <X size={16} />
              </button>
            </div>
          ))
        ) : (
          <p className="life-inline-empty">No external sources connected.</p>
        )}
        <p className="life-muted">
          Refresh sources here. A failed refresh keeps the last complete
          snapshot. Disconnect removes its cached events, messages and file
          listings from Life; it does not delete anything at the provider.
        </p>
      </section>
      <section className="life-card">
        <h2>Drive & Docs</h2>
        <p>
          Read-only access to your 100 most recently modified Drive files.
          Connect Drive & Docs above, then refresh that source. Google Docs text
          loads only when you choose Read document; it stays out of assistant
          context.
        </p>
        <label className="life-form">
          Search synced files
          <input
            aria-label="Search Drive files"
            value={fileQuery}
            onChange={(e) => setFileQuery(e.target.value)}
          />
        </label>
        {(state.driveFiles || [])
          .filter((f) => f.name.toLowerCase().includes(fileQuery.toLowerCase()))
          .map((f) => (
            <div className="life-connection" key={f.id}>
              <div>
                <strong>{f.name}</strong>
                <small>
                  {f.mimeType === "application/vnd.google-apps.document"
                    ? "Google Docs"
                    : f.mimeType}{" "}
                  ·{" "}
                  {f.modifiedTime
                    ? new Date(f.modifiedTime).toLocaleDateString()
                    : "Date unknown"}
                </small>
                <SourceLabel source={f.source} />
              </div>
              <a
                className="life-button"
                href={f.url}
                target="_blank"
                rel="noreferrer"
              >
                Open in Drive
              </a>
              {f.mimeType === "application/vnd.google-apps.document" && (
                <button
                  className="life-button"
                  disabled={busy}
                  onClick={() =>
                    void work(async () =>
                      setDocPreview(
                        await request("/api/life/google/docs/read", {
                          fileId: f.id,
                        }),
                      ),
                    )
                  }
                >
                  Read document
                </button>
              )}
            </div>
          ))}
        {!state.driveFiles?.length && (
          <p className="life-inline-empty">No Drive files synced yet.</p>
        )}
        {docPreview && (
          <Modal title={docPreview.title} onClose={() => setDocPreview(null)}>
            <div className="life-doc-preview">
              <SourceLabel source={docPreview.source} />
              <pre>{docPreview.text || "No readable body text returned."}</pre>
              {docPreview.truncated && (
                <p>
                  Preview limited to the first 200,000 characters. Open the
                  original for the complete document.
                </p>
              )}
              <a
                className="life-button"
                href={docPreview.url}
                target="_blank"
                rel="noreferrer"
              >
                Open original in Drive
              </a>
            </div>
          </Modal>
        )}
      </section>
      <section className="life-card">
        <h2>Workspace & backup</h2>
        <div className="life-form">
          <label>
            Home time zone
            <input value={zone} onChange={(e) => setZone(e.target.value)} />
          </label>
          <div className="life-actions">
            <button
              className="life-button"
              disabled={busy}
              onClick={() =>
                void work(() =>
                  act(
                    () => request("/api/life/preferences", { timeZone: zone }),
                    "Time zone saved",
                  ),
                )
              }
            >
              Save time zone
            </button>
            <a
              className="life-button"
              href="/api/life/export"
              download="life-backup.json"
            >
              <Download size={15} />
              Export Life data
            </a>
          </div>
          <p className="life-muted">
            Export includes personal records and source evidence, without
            connection credentials or assistant history. Store it privately.
          </p>
        </div>
      </section>
    </div>
  );
}

function PeopleNetwork({
  state,
  query,
  onSelect,
}: {
  state: LifeState;
  query: string;
  onSelect: (p: Person) => void;
}) {
  const [mode, setMode] = useState<"2d" | "3d">("3d"),
    [category, setCategory] = useState("all");
  const people = useMemo(
    () =>
      state.contacts
        .map((p) => ({ ...p, ...classify(p.headline) }))
        .filter(
          (p) =>
            (category === "all" || p.circles.includes(category)) &&
            `${p.name} ${p.headline}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        ),
    [state.contacts, query, category],
  );
  const circles = useMemo(
    () =>
      CIRCLES.map((c) => ({
        ...c,
        count: people.filter((p) => p.circles.includes(c.id)).length,
      })),
    [people],
  );
  const relations = useMemo(
    () =>
      state.relationships.map((r) => ({
        id: r.id,
        from_id: String(r.from_id),
        to_id: String(r.to_id),
      })),
    [state.relationships],
  );
  return (
    <div className="life-network">
      <div className="life-actions">
        <button
          className="life-button"
          onClick={() => setMode(mode === "3d" ? "2d" : "3d")}
        >
          {mode}
        </button>
        <select
          aria-label="Network category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">All categories</option>
          {CIRCLES.map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <Suspense fallback={<p>Opening network…</p>}>
        <NetworkGraph
          people={people}
          circles={circles}
          relationships={relations}
          mode={mode}
          reset={0}
          onSelect={(id) => {
            const p = state.contacts.find((p) => p.id === id);
            if (p) onSelect(p);
          }}
          onCircle={setCategory}
        />
      </Suspense>
      <p className="life-muted">
        Category spokes reflect headline keywords. Person-to-person lines show
        only relationships explicitly recorded in Connect. The directory below
        provides keyboard access.
      </p>
    </div>
  );
}
