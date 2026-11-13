import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
export function connectPath() {
  return (
    process.env.FINANCE_CONNECT_DB ||
    join(homedir(), "Desktop", "Connect", "data", "connect.sqlite")
  );
}
export function readConnect(path = connectPath()) {
  if (!existsSync(path))
    throw Error(
      "Connect database not found. Import a Connect JSON export instead.",
    );
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return {
      version: 1,
      contacts: db.prepare("SELECT * FROM contacts").all(),
      notes: db.prepare("SELECT * FROM notes").all(),
      interactions: db.prepare("SELECT * FROM interactions").all(),
      projects: db.prepare("SELECT * FROM projects").all(),
      projectContacts: db.prepare("SELECT * FROM project_contacts").all(),
      relationships: db.prepare("SELECT * FROM relationships").all(),
      sources: db.prepare("SELECT * FROM sources").all(),
    };
  } finally {
    db.close();
  }
}
export function importConnect(domain, data, label = "Connect") {
  data = data?.tables || data;
  if (!data || !Array.isArray(data.contacts) || data.contacts.length > 30000)
    throw Error("Choose a Connect JSON export.");
  const now = new Date().toISOString(),
    source = { kind: "connect", label, observedAt: now };
  const parseFields = (c) =>
    typeof c.fields === "string" ? JSON.parse(c.fields) : c.fields || {};
  let added = 0,
    preserved = 0;
  domain.store.batch(() => {
    for (const c of data.contacts) {
      if (
        typeof c.id !== "string" ||
        typeof c.name !== "string" ||
        c.name.length > 200
      )
        throw Error("Invalid Connect contact.");
      if (domain.store.get("contact", c.id)) {
        preserved++;
        continue;
      }
      const fields = parseFields(c);
      domain.store.put("contact", c.id, {
        id: c.id,
        name: c.name,
        headline: c.headline || "",
        email: fields.email || "",
        url: c.profile_url || c.profileUrl || "",
        favorite: !!c.favorite,
        followup: fields.nextFollowup || null,
        fields,
        source,
        createdAt: c.created_at || now,
        updatedAt: c.updated_at || now,
        connectEvidence: (data.sources || []).filter(
          (s) => s.contact_id === c.id,
        ),
      });
      added++;
    }
    for (const p of data.projects || [])
      if (!domain.store.get("project", p.id))
        domain.store.put("project", p.id, {
          id: p.id,
          name: p.name,
          description: p.description || "",
          status: p.status || "active",
          people: (data.projectContacts || data.project_contacts || [])
            .filter((r) => r.project_id === p.id)
            .map((r) => r.contact_id),
          courseId: null,
          dueDate: null,
          source,
          createdAt: p.created_at || now,
          updatedAt: now,
        });
    for (const n of [
      ...(data.notes || []).map((n) => ({ ...n, type: "note" })),
      ...(data.interactions || []).map((n) => ({
        ...n,
        type: "conversation",
        body: n.summary,
        date: n.happened_on,
      })),
    ])
      if (!domain.store.get("note", n.id))
        domain.store.put("note", n.id, {
          id: n.id,
          personId: n.contact_id,
          body: n.body,
          type: n.type,
          date: n.date || n.created_at?.slice(0, 10),
          source,
          createdAt: n.created_at || now,
          updatedAt: now,
        });
    for (const r of data.relationships || [])
      if (!domain.store.get("relationship", r.id))
        domain.store.put("relationship", r.id, { ...r, source });
    domain.store.put("import", "connect", {
      id: "connect",
      label,
      added,
      preserved,
      observedAt: now,
      source,
    });
  });
  return { added, preserved };
}
