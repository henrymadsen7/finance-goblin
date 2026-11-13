import { summarize } from "../domain.js";
const terms = (text) =>
  text
    .toLowerCase()
    .match(/[\p{L}\p{N}]{3,}/gu)
    ?.filter(
      (t) =>
        !new Set([
          "the",
          "and",
          "for",
          "with",
          "from",
          "what",
          "this",
          "that",
          "have",
          "about",
          "show",
          "please",
          "help",
          "does",
          "your",
          "into",
          "could",
          "would",
          "life",
          "finance",
        ]).has(t),
    ) || [];
export function selectRelevant(rows, query, limit, { fallback = true } = {}) {
  const tokens = terms(query);
  const ranked = rows
    .map((row, index) => {
      const text = JSON.stringify(row).toLowerCase();
      return {
        row,
        index,
        score: tokens.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0),
      };
    })
    .filter((r) => fallback || r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked.slice(0, limit).map((r) => r.row);
}
export function lifeContext(life, query) {
  const state = life.snapshot(),
    contacts = state.contacts.map(({ connectEvidence, ...r }) => r),
    selectedContacts = selectRelevant(contacts, query, 40, { fallback: false });
  const related = new Set(selectedContacts.map((p) => p.id));
  return {
    scope: "life",
    asOf: new Date().toISOString(),
    coverage:
      "Relevant matches plus a bounded overview. Counts describe all active records; supplied lists may be partial. Screen captures are snapshots, not current LMS verification.",
    counts: {
      courses: state.courses.length,
      projects: state.projects.length,
      tasks: state.tasks.length,
      contacts: contacts.length,
      events: state.events.length,
    },
    courses: state.courses,
    projects: selectRelevant(state.projects, query, 40),
    tasks: selectRelevant(
      [...state.tasks].sort((a, b) =>
        (a.dueDate || "9999").localeCompare(b.dueDate || "9999"),
      ),
      query,
      120,
    ),
    contacts: selectedContacts,
    notes: selectRelevant(
      state.notes.filter(
        (n) =>
          related.has(n.personId) ||
          terms(query).some((t) => n.body.toLowerCase().includes(t)),
      ),
      query,
      40,
    ),
    events: selectRelevant(
      [...state.events].sort((a, b) => a.start.localeCompare(b.start)),
      query,
      60,
    ),
    driveFiles: selectRelevant(life.list("driveFile"), query, 25),
    messages: selectRelevant(life.list("message"), query, 20),
    sources: state.connections,
    imports: state.imports,
  };
}
export function financeContext(store, mode, query) {
  if (mode === "demo")
    return {
      notice:
        "Sample finance mode. Real financial records are excluded. Switch to live mode for actual account context.",
    };
  const accounts = store.list("account"),
    ids = new Set(
      accounts.filter((a) => a.currency === "USD").map((a) => a.id),
    ),
    transactions = store
      .list("transaction")
      .filter((t) => ids.has(t.accountId)),
    months = new Map();
  for (const t of transactions) {
    const month = t.date?.slice(0, 7);
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(t);
  }
  return {
    scope: "finance",
    asOf: new Date().toISOString(),
    currency: "USD",
    amountUnit: "integer cents",
    coverage:
      "Accounts are complete. Monthly totals cover all stored USD transactions; transaction evidence below is a relevant subset. Exclude transfers and pending from posted operating spending; refunds reduce expenses. Balances may be unknown or stale.",
    accounts,
    budgets: store.get("preferences", "budgets") || {},
    monthlyTotals: [...months]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, rows]) => ({ month, ...summarize(rows) })),
    transactionCount: transactions.length,
    transactions: selectRelevant(
      [...transactions].sort((a, b) => b.date.localeCompare(a.date)),
      query,
      150,
    ),
  };
}
