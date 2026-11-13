export type Source = {
  kind: string;
  label: string;
  url?: string;
  observedAt: string;
  evidence?: string;
  timeZone?: string;
};
export type LifeRecord = {
  id: string;
  source?: Source;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};
export type Course = LifeRecord & {
  name: string;
  code: string;
  institution: string;
  platform: string;
  semester: string;
  color: string;
  url: string;
  notes: string;
};
export type Task = LifeRecord & {
  title: string;
  description: string;
  status: string;
  priority: string;
  dueDate: string | null;
  dueTime: string | null;
  timeZone: string;
  courseId: string | null;
  projectId: string | null;
  personId: string | null;
  estimateMinutes: number;
  type: string;
};
export type Project = LifeRecord & {
  name: string;
  description: string;
  status: string;
  people: string[];
  courseId: string | null;
  dueDate: string | null;
};
export type Person = LifeRecord & {
  name: string;
  headline: string;
  email: string;
  url: string;
  favorite: boolean;
  followup: string | null;
  fields: Record<string, string>;
};
export type LifeEvent = LifeRecord & {
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  location: string;
  description: string;
  courseId: string | null;
  projectId: string | null;
};
export type Note = LifeRecord & {
  personId: string;
  body: string;
  type: string;
  date?: string;
};
export type Connection = {
  id: string;
  label: string;
  provider: string;
  service?: string;
  status: string;
  lastSync?: string;
  error?: string;
};
export type InboxMessage = {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  url: string;
  source: Source;
};
export type LifeState = {
  courses: Course[];
  tasks: Task[];
  projects: Project[];
  events: LifeEvent[];
  contacts: Person[];
  notes: Note[];
  imports: { id: string; label: string; observedAt: string; count?: number }[];
  relationships: LifeRecord[];
  connections: Connection[];
  driveFiles: {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string | null;
    url: string;
    source: Source;
  }[];
  messages: InboxMessage[];
  csrf: string;
  connectAvailable: boolean;
  googleConfigured: boolean;
  preferences: {
    timeZone: string;
    appearance?: import("../../shared/life-appearance.js").LifeAppearance;
  };
};
export const ymd = (date = new Date(), timeZone = "America/Denver") =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export const dateLabel = (date: string | null) =>
  date
    ? new Date(date.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "No due date";
export async function request<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const state = await fetch("/api/life/state");
  if (!state.ok)
    throw Error("Could not reach your private workspace. Reopen the app.");
  const { csrf } = await state.json();
  const r = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", "X-Finance-CSRF": csrf },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const result = await r.json();
  if (!r.ok) throw Error(result.error || "Could not complete the request.");
  return result;
}
