import type { Account, Transaction } from "./types";

export function selectAccounts(
  accounts: Account[],
  bank = "all",
  account = "all",
) {
  return accounts.filter(
    (a) =>
      (bank === "all" || a.institution === bank) &&
      (account === "all" || a.id === account),
  );
}
export function selectTransactions(
  transactions: Transaction[],
  accounts: Account[],
  start: string,
  end: string,
) {
  const ids = new Set(
    accounts
      .filter((a) => a.currency === "USD" || a.source === "demo")
      .map((a) => a.id),
  );
  return transactions.filter(
    (t) => ids.has(t.accountId) && t.date >= start && t.date <= end,
  );
}
export function accountSummary(accounts: Account[]) {
  const usd = accounts.filter(
    (a) => a.currency === "USD" || a.source === "demo",
  );
  const known = usd.filter((a) => a.balance !== null);
  const net = known.reduce(
    (sum, a) =>
      sum + (["credit", "loan"].includes(a.type) ? -a.balance! : a.balance!),
    0,
  );
  const cash = known
    .filter(
      (a) =>
        a.type === "depository" || (a.type === "ledger" && a.balance! >= 0),
    )
    .reduce((sum, a) => sum + a.balance!, 0);
  const cashAccounts = usd.filter(
    (a) =>
      a.type === "depository" || (a.type === "ledger" && (a.balance || 0) >= 0),
  );
  const availableCash = cashAccounts.reduce(
    (sum, a) => sum + (a.available ?? a.balance ?? 0),
    0,
  );
  const creditAccounts = usd.filter((a) => a.type === "credit");
  const creditDebt = creditAccounts.reduce(
    (sum, a) => sum + Math.max(0, a.balance ?? 0),
    0,
  );
  return {
    availableCash,
    cashCount: cashAccounts.length,
    cashKnownCount: cashAccounts.filter(
      (a) => a.available != null || a.balance != null,
    ).length,
    availableReported:
      cashAccounts.length > 0 && cashAccounts.every((a) => a.available != null),
    creditDebt,
    creditCount: creditAccounts.length,
    creditKnownCount: creditAccounts.filter((a) => a.balance != null).length,
    net,
    cash,
    knownCount: known.length,
    incomplete: known.length !== accounts.length,
  };
}

export function categorySpending(rows: Transaction[]) {
  const map = new Map<
    string,
    { amount: number; count: number; pending: number }
  >();
  for (const t of rows) {
    if (!["expense", "refund"].includes(t.type)) continue;
    const value = map.get(t.category) || { amount: 0, count: 0, pending: 0 };
    if (t.pending) value.pending += Math.abs(t.amount);
    else {
      value.amount -= t.amount;
      value.count++;
    }
    map.set(t.category, value);
  }
  return [...map]
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}
