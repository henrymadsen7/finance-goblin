// Isolated read client. No create/update/delete/import/bank-sync methods are called.
import * as api from "@actual-app/api";
import { mkdtempSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transactionSchema } from "./domain.js";
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const config = JSON.parse(Buffer.concat(chunks).toString());
const cache = mkdtempSync(join(tmpdir(), "finance-goblin-actual-"));
chmodSync(cache, 0o700);
const output = process.stdout.write.bind(process.stdout);
// Actual's engine can log during startup; never forward logs or ledger contents.
console.log = () => {};
console.warn = () => {};
console.error = () => {};
try {
  await api.init({
    dataDir: cache,
    serverURL: config.serverURL,
    password: config.password,
  });
  await api.downloadBudget(
    config.budgetId,
    config.encryptionPassword
      ? { password: config.encryptionPassword }
      : undefined,
  );
  const [rawAccounts, rawCategories, payees] = await Promise.all([
    api.getAccounts(),
    api.getCategories(),
    api.getPayees(),
  ]);
  const preferences = await api.getPreferences();
  const currency = preferences.defaultCurrencyCode || "USD";
  const cats = new Map(rawCategories.map((c) => [c.id, c]));
  const payeeMap = new Map(payees.map((p) => [p.id, p]));
  const transactions = [],
    accounts = [];
  const end = new Date().toISOString().slice(0, 10);
  for (const a of rawAccounts.filter((a) => !a.closed)) {
    const id = "actual-" + a.id;
    const balance = await api.getAccountBalance(a.id);
    accounts.push({
      id,
      name: a.name,
      institution: "Actual Budget",
      type: "ledger",
      balance,
      currency,
      source: "actual",
      itemId: "actual",
      asOf: new Date().toISOString(),
    });
    const rows = await api.getTransactions(a.id, "1900-01-01", end);
    const seen = new Set();
    const visit = (t) => {
      if (seen.has(t.id)) return;
      seen.add(t.id);
      if (t.is_parent || t.subtransactions?.length) {
        for (const sub of t.subtransactions || [])
          visit({
            ...sub,
            account: sub.account || t.account,
            date: sub.date || t.date,
            payee: sub.payee || t.payee,
          });
        return;
      }
      const category = cats.get(t.category);
      const payee = payeeMap.get(t.payee || t.payee_id);
      const transfer = !!(
        t.starting_balance_flag ||
        t.transfer_id ||
        payee?.transfer_acct ||
        /starting balance/i.test(category?.name || payee?.name || "")
      );
      const type = transfer
        ? "transfer"
        : category?.is_income
          ? "income"
          : t.amount > 0
            ? "refund"
            : "expense";
      transactions.push({
        ...transactionSchema.parse({
          id: "actual-" + t.id,
          date: t.date,
          payee: payee?.name || t.imported_payee || "Unknown payee",
          amount: t.amount || 0,
          accountId: id,
          category: category?.name || "Other",
          type,
          pending: false,
          cleared: !!t.cleared,
        }),
        itemId: "actual",
      });
    };
    for (const t of rows) visit(t);
  }
  await api.shutdown();
  output(JSON.stringify({ accounts, transactions }));
} catch {
  output(
    JSON.stringify({
      error:
        "Unable to read Actual. Check the server URL, server password, Sync ID, and budget encryption password.",
    }),
  );
  process.exitCode = 1;
} finally {
  try {
    await api.shutdown();
  } catch {}
  rmSync(cache, { recursive: true, force: true });
}
