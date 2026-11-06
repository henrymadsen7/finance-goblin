import type { Account, Transaction } from "./types";
import type { SubscriptionReview } from "../shared/preferences.js";
import { merchantFor, normalizeMerchant } from "./subscription-merchants.ts";
import type { Merchant } from "./subscription-merchants.ts";
export type Subscription = {
  id: string;
  company: string;
  merchant?: Merchant;
  account: Account;
  category: string;
  transactions: Transaction[];
  months: number;
  latest: number;
  minimum: number;
  maximum: number;
  lastDate: string;
  nextDate: string;
  recent: boolean;
  variable: boolean;
  likely: boolean;
  review?: SubscriptionReview;
  decision: "confirmed" | "dismissed" | "auto";
};
const dayMs = 86400000;
const time = (date: string) => Date.parse(date + "T12:00:00Z");
const month = (date: string) =>
  Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
const day = (date: string) => Number(date.slice(8, 10));
const median = (v: number[]) => {
  const a = [...v].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};
export function nextMonthlyDate(dates: string[]) {
  const last = dates.at(-1)!;
  const [year, m] = last.split("-").map(Number);
  const anchor = median(dates.map(day));
  const end = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, m, Math.min(anchor, end), 12))
    .toISOString()
    .slice(0, 10);
}
export function detectSubscriptions(
  transactions: Transaction[],
  accounts: Account[],
  reviews: SubscriptionReview[] = [],
  today = new Date().toISOString().slice(0, 10),
): Subscription[] {
  const accountMap = new Map(
    accounts
      .filter((a) => a.currency === "USD" || a.source === "demo")
      .map((a) => [a.id, a]),
  );
  const groups = new Map<
    string,
    { account: Account; merchant?: Merchant; rows: Transaction[] }
  >();
  const seen = new Set<string>();
  for (const row of transactions) {
    if (
      seen.has(row.id) ||
      !accountMap.has(row.accountId) ||
      row.date > today ||
      row.pending ||
      row.type !== "expense" ||
      row.amount >= 0
    )
      continue;
    seen.add(row.id);
    const merchant = merchantFor(row.payee);
    const identity = merchant?.id || normalizeMerchant(row.payee);
    // Coincidental restaurant, fuel, shopping and travel visits are common.
    // Include those only when the biller/description explicitly names a plan.
    if (
      !merchant &&
      ["Food & drink", "Transport", "Shopping", "Travel"].includes(
        row.category,
      ) &&
      !/\b(subscription|membership|premium|monthly|dashpass|prime|plan|pass)\b/i.test(
        identity,
      )
    )
      continue;
    if (!identity) continue;
    const key = JSON.stringify([row.accountId, identity]);
    const group = groups.get(key) || {
      account: accountMap.get(row.accountId)!,
      merchant,
      rows: [],
    };
    group.rows.push(row);
    groups.set(key, group);
  }
  const result: Subscription[] = [];
  for (const group of groups.values()) {
    group.rows.sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    );
    const counts = new Map<number, number>();
    group.rows.forEach((t) =>
      counts.set(month(t.date), (counts.get(month(t.date)) || 0) + 1),
    );
    const multiple = [...counts.values()].some((n) => n > 1);
    // High-frequency spending is not a monthly subscription. Aggregators can
    // contain several independent monthly streams; match those by amount/date.
    if (Math.max(...counts.values()) > 4 && !group.merchant?.aggregate)
      continue;
    const chains: Transaction[][] = [];
    for (const row of group.rows) {
      const possible = chains
        .flatMap((chain, index) => {
          const prior = chain.at(-1)!;
          const gap = (time(row.date) - time(prior.date)) / dayMs;
          const phase = Math.abs(day(row.date) - day(prior.date));
          const amountGap =
            Math.abs(row.amount - prior.amount) /
            Math.max(1, Math.abs(prior.amount));
          if (
            month(row.date) - month(prior.date) !== 1 ||
            gap < 24 ||
            gap > 38 ||
            phase > 7
          )
            return [];
          if (
            multiple &&
            Math.abs(row.amount - prior.amount) >
              Math.max(25, Math.abs(prior.amount) * 0.06)
          )
            return [];
          return [{ index, cost: amountGap + phase / 30 }];
        })
        .sort((a, b) => a.cost - b.cost || a.index - b.index);
      if (possible.length) chains[possible[0].index].push(row);
      else chains.push([row]);
    }
    for (const chain of chains) {
      if (chain.length < 2) continue;
      const last = chain.at(-1)!;
      const amounts = chain.map((t) => -t.amount);
      const review = [...reviews]
        .reverse()
        .find((r) => chain.some((t) => t.id === r.transactionId));
      const minimum = Math.min(...amounts),
        maximum = Math.max(...amounts);
      const variable = maximum - minimum > Math.max(100, median(amounts) * 0.2);
      const category =
        review?.category ||
        group.merchant?.category ||
        last.category ||
        "Other";
      result.push({
        id: chain[0].id,
        company: group.merchant?.name || last.payee,
        merchant: group.merchant,
        account: group.account,
        category,
        transactions: chain,
        months: chain.length,
        latest: -last.amount,
        minimum,
        maximum,
        lastDate: last.date,
        nextDate: nextMonthlyDate(chain.map((t) => t.date)),
        recent: time(today) - time(last.date) <= 45 * dayMs,
        variable,
        likely:
          !variable &&
          (!!group.merchant ||
            chain.every((t) => t.category === "Subscriptions")),
        review,
        decision: review?.decision || "auto",
      });
    }
  }
  return result.sort(
    (a, b) =>
      b.latest - a.latest ||
      a.company.localeCompare(b.company) ||
      a.id.localeCompare(b.id),
  );
}
export function subscriptionTotals(rows: Subscription[]) {
  const included = rows.filter(
    (s) =>
      s.recent &&
      s.decision !== "dismissed" &&
      (s.decision === "confirmed" || s.likely),
  );
  const monthly = included.reduce((sum, s) => sum + s.latest, 0);
  return {
    monthly,
    yearly: monthly * 12,
    count: included.length,
    review: rows.filter((s) => s.decision === "auto" && !s.likely).length,
  };
}
