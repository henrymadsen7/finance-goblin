// Earlier versions labeled every Plaid ENTERTAINMENT transaction as a
// subscription. This app has never supported manual recategorization; that
// label on Plaid-owned records therefore identifies the old mapping exactly.
// CSV, Actual, user budget limits, and the original bank records are untouched.
export function migratePlaidCategories(store) {
  const id = "plaid-entertainment-v1";
  if (store.get("migration", id)) return;
  const plaidAccounts = new Set(
    store
      .list("account")
      .filter((a) => a.source === "plaid")
      .map((a) => a.id),
  );
  store.batch(() => {
    for (const t of store.list("transaction")) {
      if (plaidAccounts.has(t.accountId) && t.category === "Subscriptions")
        store.put("transaction", t.id, { ...t, category: "Entertainment" });
    }
    store.put("migration", id, { complete: true });
  });
}
