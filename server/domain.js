import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";
import { z } from "zod";
export const categories = [
  "Housing",
  "Food & drink",
  "Shopping",
  "Transport",
  "Subscriptions",
  "Entertainment",
  "Health",
  "Travel",
  "Income",
  "Other",
];
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Use a valid date (YYYY-MM-DD)",
  );
export const transactionSchema = z.object({
  id: z.string().min(1),
  date: day,
  payee: z.string().min(1).max(200),
  amount: z.number().int().safe(),
  accountId: z.string().min(1),
  category: z.string().max(100),
  type: z.enum(["income", "expense", "transfer", "refund"]),
  pending: z.boolean(),
  cleared: z.boolean().optional(),
});
export function normalizePlaid(t) {
  const primary = t.personal_finance_category?.primary || "";
  const maps = {
    RENT_AND_UTILITIES: "Housing",
    FOOD_AND_DRINK: "Food & drink",
    GENERAL_MERCHANDISE: "Shopping",
    TRANSPORTATION: "Transport",
    TRAVEL: "Travel",
    MEDICAL: "Health",
    ENTERTAINMENT: "Entertainment",
    INCOME: "Income",
  };
  const amount = -Math.round(t.amount * 100);
  return transactionSchema.parse({
    id: t.transaction_id,
    date: t.date,
    payee: t.merchant_name || t.name || "Unknown payee",
    amount,
    accountId: t.account_id,
    category: maps[primary] || "Other",
    type: /TRANSFER|LOAN_PAYMENTS/.test(primary)
      ? "transfer"
      : primary === "INCOME"
        ? "income"
        : amount > 0
          ? "refund"
          : "expense",
    pending: !!t.pending,
  });
}
export function importCSV(text) {
  const rows = parse(text, {
    columns: (headers) => {
      const normalized = headers.map((h) => h.trim().toLowerCase());
      if (
        !["date", "payee", "amount", "account"].every((h) =>
          normalized.includes(h),
        )
      )
        throw new Error(
          "CSV headers must include date, payee, amount and account.",
        );
      if (new Set(normalized).size !== normalized.length)
        throw new Error("CSV headers must be unique.");
      return normalized;
    },
    skip_empty_lines: true,
    trim: true,
    bom: true,
    max_record_size: 20000,
  });
  if (!rows.length) throw new Error("No transactions found in this CSV.");
  if (rows.length > 10000)
    throw new Error("Import up to 10,000 rows at a time.");
  return rows.map((r, i) => {
    if (!r.date || !r.payee || !r.amount || !r.account)
      throw new Error(
        `Row ${i + 2}: date, payee, amount and account are required.`,
      );
    if (!/^-?\d+(\.\d{1,2})?$/.test(r.amount))
      throw new Error(
        `Row ${i + 2}: amount must be a signed number with at most two decimal places.`,
      );
    const amount = Math.round(Number(r.amount) * 100);
    const type = r.type || (amount > 0 ? "income" : "expense");
    const accountId =
      "csv-" +
      createHash("sha256").update(r.account).digest("hex").slice(0, 16);
    const id =
      "csv-" +
      createHash("sha256")
        .update(
          JSON.stringify([
            r.date,
            r.payee,
            amount,
            r.account,
            r.reference || "",
          ]),
        )
        .digest("hex");
    try {
      return {
        ...transactionSchema.parse({
          id,
          date: r.date,
          payee: r.payee,
          amount,
          accountId,
          category: r.category || "Other",
          type,
          pending: r.status === "pending",
        }),
        accountName: r.account,
      };
    } catch {
      throw new Error(
        `Row ${i + 2}: invalid date, type or amount. Types: income, expense, transfer, refund.`,
      );
    }
  });
}
export function summarize(transactions) {
  let income = 0,
    expenses = 0,
    pending = 0;
  for (const t of transactions) {
    if (t.pending) {
      pending += Math.abs(t.amount);
      continue;
    }
    if (t.type === "income") income += t.amount;
    if (t.type === "expense" || t.type === "refund") expenses -= t.amount;
  }
  return { income, expenses, net: income - expenses, pending };
}
export function demoData(now = new Date()) {
  const accounts = [
    {
      id: "demo-boa",
      name: "Everyday Checking",
      institution: "Bank of America",
      mask: "4821",
      type: "depository",
      balance: 1842638,
      source: "demo",
    },
    {
      id: "demo-savings",
      name: "Advantage Savings",
      institution: "Bank of America",
      mask: "0916",
      type: "depository",
      balance: 3250000,
      source: "demo",
    },
    {
      id: "demo-amex",
      name: "Platinum Card",
      institution: "American Express",
      mask: "1008",
      type: "credit",
      balance: 248632,
      source: "demo",
    },
  ];
  const merchants = [
    ["Whole Foods Market", "Food & drink", 8452],
    ["Blue Bottle Coffee", "Food & drink", 680],
    ["Apple", "Subscriptions", 2999],
    ["Uber", "Transport", 2430],
    ["Sweetgreen", "Food & drink", 1865],
    ["Amazon", "Shopping", 6740],
    ["Equinox", "Health", 21500],
    ["Figma", "Subscriptions", 1500],
    ["Trader Joe’s", "Food & drink", 4832],
    ["Spotify", "Subscriptions", 1299],
    ["Shell", "Transport", 5270],
    ["Airbnb", "Travel", 28400],
  ];
  const transactions = [];
  for (let offset = 0; offset < 100; offset++) {
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - offset,
      12,
    ).toLocaleDateString("en-CA");
    const n = offset % 4 === 0 ? 3 : 2;
    for (let j = 0; j < n; j++) {
      const m = merchants[(offset * 7 + j * 3) % merchants.length];
      transactions.push({
        id: `demo-${offset}-${j}`,
        date,
        payee: m[0],
        category: m[1],
        amount: -m[2] - ((offset * 17) % 900),
        type: "expense",
        accountId: j === 0 ? "demo-boa" : "demo-amex",
        pending: offset === 0 && j === 1,
      });
    }
    if (offset % 14 === 3)
      transactions.push({
        id: `pay-${offset}`,
        date,
        payee: "Acme Studio · Payroll",
        category: "Income",
        amount: 625000,
        type: "income",
        accountId: "demo-boa",
        pending: false,
      });
    if (offset % 30 === 4)
      transactions.push({
        id: `rent-${offset}`,
        date,
        payee: "Monthly rent",
        category: "Housing",
        amount: -245000,
        type: "expense",
        accountId: "demo-boa",
        pending: false,
      });
    if (offset % 30 === 8)
      transactions.push({
        id: `transfer-${offset}`,
        date,
        payee: "Amex card payment",
        category: "Transfer",
        amount: -150000,
        type: "transfer",
        accountId: "demo-boa",
        pending: false,
      });
  }
  return {
    accounts,
    transactions,
    budgets: {
      "Food & drink": 65000,
      Shopping: 50000,
      Transport: 25000,
      Subscriptions: 15000,
      Housing: 250000,
      Health: 30000,
      Travel: 75000,
      Other: 20000,
    },
  };
}
