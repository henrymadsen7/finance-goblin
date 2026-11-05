import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importCSV, normalizePlaid, summarize } from "../server/domain.js";
import { createStore } from "../server/store.js";
import { plaid, syncItem, ProviderError } from "../server/plaid.js";
const makeStore = (t) => {
  const dir = mkdtempSync(join(tmpdir(), "fg-test-"));
  const s = createStore(dir);
  t.after(() => {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { s, dir };
};
test("operating totals exclude transfers and pending, refunds reduce spending", () => {
  const rows = [
    { type: "income", amount: 500000, pending: false },
    { type: "expense", amount: -20000, pending: false },
    { type: "refund", amount: 4000, pending: false },
    { type: "transfer", amount: -400000, pending: false },
    { type: "transfer", amount: 400000, pending: false },
    { type: "expense", amount: -10000, pending: true },
    { type: "income", amount: 9000, pending: true },
  ];
  assert.deepEqual(summarize(rows), {
    income: 500000,
    expenses: 16000,
    net: 484000,
    pending: 19000,
  });
});
test("CSV handles BOM, quotes, exact cents, references and deterministic dedup IDs", () => {
  const csv =
    '\ufeffdate,payee,amount,account,type,reference\n2026-11-01,"Coffee, Inc.",-10.23,Checking,expense,1\n2026-11-01,"Coffee, Inc.",-10.23,Checking,expense,2';
  const rows = importCSV(csv);
  assert.equal(rows[0].amount, -1023);
  assert.equal(rows[0].payee, "Coffee, Inc.");
  assert.notEqual(rows[0].id, rows[1].id);
  assert.equal(rows[0].id, importCSV(csv)[0].id);
});
test("CSV rejects invalid dates, missing fields and more than two decimals", () => {
  for (const csv of [
    "date,payee,amount,account\n2026-02-30,Test,-1,Checking",
    "date,payee,amount,account\n2026-11-01,Test,-1.001,Checking",
    "date,payee,amount\n2026-11-01,Test,-1",
  ])
    assert.throws(() => importCSV(csv));
});
test("Plaid amount signs and transfer categorization are normalized", () => {
  const t = {
    transaction_id: "t1",
    date: "2026-11-01",
    name: "Example",
    account_id: "a1",
    amount: 27.32,
    pending: false,
    personal_finance_category: { primary: "FOOD_AND_DRINK" },
  };
  assert.deepEqual(
    { ...normalizePlaid(t), id: undefined },
    {
      id: undefined,
      date: "2026-11-01",
      payee: "Example",
      amount: -2732,
      accountId: "a1",
      category: "Food & drink",
      type: "expense",
      pending: false,
    },
  );
  assert.equal(
    normalizePlaid({
      ...t,
      amount: -100,
      personal_finance_category: { primary: "TRANSFER_IN" },
    }).type,
    "transfer",
  );
  assert.equal(normalizePlaid({ ...t, amount: -10 }).type, "refund");
});
test("vault encrypts records, persists and rolls back failed atomic writes", (t) => {
  const { s, dir } = makeStore(t);
  s.put("config", "plaid", { secret: "private-bank-secret-unique" });
  assert.equal(s.get("config", "plaid").secret, "private-bank-secret-unique");
  assert.equal(
    readFileSync(join(dir, "finance.sqlite")).includes(
      Buffer.from("private-bank-secret-unique"),
    ),
    false,
  );
  assert.equal(statSync(join(dir, "vault.key")).mode & 0o777, 0o600);
  assert.throws(() =>
    s.batch(() => {
      s.put("transaction", "x", { amount: 10 });
      throw Error("fail");
    }),
  );
  assert.equal(s.get("transaction", "x"), null);
});
test("sync pages atomically; replaces pending records and applies removals", async (t) => {
  const { s } = makeStore(t);
  const item = {
    id: "i1",
    accessToken: "secret",
    institution: "Test",
    cursor: "old",
  };
  s.put("item", "i1", item);
  s.put("transaction", "pending", { id: "pending" });
  s.put("transaction", "removed", { id: "removed" });
  let n = 0;
  await syncItem(s, item, async (path, body) => {
    if (path === "accounts/get")
      return {
        accounts: [
          {
            account_id: "a1",
            name: "Checking",
            mask: "1234",
            type: "depository",
            balances: {
              current: 100,
              available: 82.45,
              iso_currency_code: "USD",
            },
          },
        ],
      };
    n++;
    assert.equal(body.cursor, n === 1 ? "old" : "page2");
    return n === 1
      ? {
          added: [
            {
              transaction_id: "posted",
              pending_transaction_id: "pending",
              date: "2026-11-01",
              name: "Coffee",
              amount: 5,
              account_id: "a1",
              pending: false,
            },
          ],
          modified: [],
          removed: [],
          next_cursor: "page2",
          has_more: true,
        }
      : {
          added: [],
          modified: [],
          removed: [{ transaction_id: "removed" }],
          next_cursor: "done",
          has_more: false,
        };
  });
  assert.equal(s.get("transaction", "pending"), null);
  assert.equal(s.get("transaction", "removed"), null);
  assert.equal(s.get("transaction", "posted").amount, -500);
  assert.equal(s.get("item", "i1").cursor, "done");
  assert.equal(s.get("account", "a1").balance, 10000);
  assert.equal(s.get("account", "a1").available, 8245);
});
test("failed pagination does not partially commit or advance cursor", async (t) => {
  const { s } = makeStore(t);
  const item = { id: "i", cursor: "old" };
  s.put("item", "i", item);
  let n = 0;
  await assert.rejects(
    syncItem(s, item, async () => {
      n++;
      if (n === 2) throw Error("offline");
      return {
        added: [{ transaction_id: "uncommitted" }],
        modified: [],
        removed: [],
        next_cursor: "next",
        has_more: true,
      };
    }),
  );
  assert.equal(s.get("item", "i").cursor, "old");
  assert.equal(s.get("transaction", "uncommitted"), null);
  assert.equal(s.get("item", "i").error, "offline");
});
test("pagination mutation retries from the original cursor", async (t) => {
  const { s } = makeStore(t);
  const cursors = [];
  let n = 0;
  await syncItem(s, { id: "i", cursor: "original" }, async (path, b) => {
    if (path === "accounts/get") return { accounts: [] };
    cursors.push(b.cursor);
    n++;
    if (n === 2)
      throw new ProviderError(
        "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION",
        "retry",
      );
    return {
      added: [],
      modified: [],
      removed: [],
      next_cursor: n === 1 ? "intermediate" : "done",
      has_more: n === 1,
    };
  });
  assert.deepEqual(cursors, ["original", "intermediate", "original"]);
  assert.equal(s.get("item", "i").cursor, "done");
});

test("unregistered OAuth redirect errors explain the required dashboard setting without exposing credentials", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({
      error_code: "INVALID_FIELD",
      error_message:
        "OAuth redirect URI must be configured in the developer dashboard.",
    }),
  });
  try {
    await assert.rejects(
      plaid(
        {
          environment: "sandbox",
          clientId: "test-client",
          secret: "test-secret",
        },
        "link/token/create",
        {},
      ),
      (e) => {
        assert.equal(e.code, "INVALID_FIELD");
        assert.match(e.message, /Allowed redirect URIs/);
        assert.equal(e.message.includes("test-secret"), false);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Plaid entertainment is not inferred to be a recurring subscription; migration preserves other sources and budgets", async (t) => {
  const { migratePlaidCategories } = await import("../server/migrations.js");
  const { s } = makeStore(t);
  assert.equal(
    normalizePlaid({
      transaction_id: "bowling",
      account_id: "plaid-account",
      date: "2026-11-01",
      name: "Bowling",
      amount: 10,
      personal_finance_category: { primary: "ENTERTAINMENT" },
    }).category,
    "Entertainment",
  );
  s.put("account", "plaid-account", { id: "plaid-account", source: "plaid" });
  s.put("account", "actual-account", {
    id: "actual-account",
    source: "actual",
  });
  s.put("transaction", "p", {
    id: "p",
    accountId: "plaid-account",
    category: "Subscriptions",
    amount: -1000,
  });
  s.put("transaction", "a", {
    id: "a",
    accountId: "actual-account",
    category: "Subscriptions",
    amount: -1000,
  });
  s.put("preferences", "budgets", { Subscriptions: 2000 });
  migratePlaidCategories(s);
  migratePlaidCategories(s);
  assert.equal(s.get("transaction", "p").category, "Entertainment");
  assert.equal(s.get("transaction", "p").amount, -1000);
  assert.equal(s.get("transaction", "a").category, "Subscriptions");
  assert.deepEqual(s.get("preferences", "budgets"), { Subscriptions: 2000 });
});
