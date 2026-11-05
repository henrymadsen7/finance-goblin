export type Transaction = {
  id: string;
  date: string;
  payee: string;
  amount: number;
  accountId: string;
  category: string;
  type: "income" | "expense" | "transfer" | "refund";
  pending: boolean;
  cleared?: boolean;
};
export type Account = {
  id: string;
  name: string;
  institution: string;
  mask?: string;
  type: string;
  balance: number | null;
  available?: number | null;
  currency?: string;
  source: string;
  asOf?: string;
};
declare global {
  interface Window {
    financeDesktop?: {
      onAction: (callback: (action: string) => void) => () => void;
    };
  }
}
export type State = {
  preferences?: import("../shared/preferences.js").Preferences;
  desktop?: boolean;
  accounts: Account[];
  transactions: Transaction[];
  budgets: Record<string, number>;
  csrf: string;
  mode: "demo" | "live";
  syncing: boolean;
  provider: {
    configured: boolean;
    environment: string | null;
    redirectUri: string | null;
  };
  connections: {
    id: string;
    institution: string;
    lastSync: string | null;
    error: string | null;
    errorCode?: string;
  }[];
  actual?: {
    configured: boolean;
    serverURL?: string;
    budgetId?: string;
    lastSync?: string;
    error?: string;
  };
  serverTime: string;
  origin: string;
};
export type Daily = {
  date: string;
  income: number;
  expense: number;
  pending: number;
  net: number;
};
export const money = (cents: number, compact = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: compact ? 0 : 2,
  }).format(cents / 100);
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function totals(rows: Transaction[]) {
  let income = 0,
    expense = 0,
    pending = 0;
  for (const t of rows) {
    if (t.pending) {
      pending += Math.abs(t.amount);
      continue;
    }
    if (t.type === "income") income += t.amount;
    if (["expense", "refund"].includes(t.type)) expense -= t.amount;
  }
  return { income, expense, pending, net: income - expense };
}
export function daily(
  rows: Transaction[],
  start: string,
  end: string,
): Daily[] {
  const days: Daily[] = [];
  for (
    let d = new Date(`${start}T12:00:00`);
    localDate(d) <= end;
    d.setDate(d.getDate() + 1)
  ) {
    const date = localDate(d);
    days.push({ date, ...totals(rows.filter((t) => t.date === date)) });
  }
  return days;
}
