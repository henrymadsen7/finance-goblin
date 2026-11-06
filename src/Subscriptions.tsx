import { useMemo, useState } from "react";
import {
  ExternalLink,
  Check,
  EyeOff,
  RotateCcw,
  Search,
  RefreshCw,
  Settings2,
} from "lucide-react";
import type { Account, Transaction } from "./types";
import type { SubscriptionReview } from "../shared/preferences.js";
import { safeBillingUrl } from "../shared/subscription-links.js";
import {
  detectSubscriptions,
  subscriptionTotals,
} from "./subscription-detection";
import type { Subscription } from "./subscription-detection";
const date = (value: string) =>
  new Date(value + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
function SubscriptionCard({
  item,
  fmt,
  busy,
  onSave,
}: {
  item: Subscription;
  fmt: (n: number) => string;
  busy: boolean;
  onSave: (review: SubscriptionReview) => Promise<void>;
}) {
  const [category, setCategory] = useState(item.category),
    [url, setUrl] = useState(item.review?.billingUrl || ""),
    [error, setError] = useState("");
  const save = async (
    decision: SubscriptionReview["decision"],
    edit = false,
  ) => {
    setError("");
    const billingUrl = edit ? url.trim() : item.review?.billingUrl;
    if (billingUrl && !safeBillingUrl(billingUrl)) {
      setError("Use an HTTPS billing URL without embedded credentials.");
      return;
    }
    try {
      await onSave({
        transactionId: item.review?.transactionId || item.id,
        decision,
        category: edit ? category.trim() : item.category,
        ...(billingUrl ? { billingUrl } : {}),
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const billing = item.review?.billingUrl || item.merchant?.billing;
  return (
    <article className="panel subscription-card">
      <div className="subscription-card-head">
        <div className="subscription-company">
          <span className="subscription-initial" aria-hidden="true">
            {item.company[0]}
          </span>
          <div>
            <h3>{item.company}</h3>
            <span>
              {item.account.name} · {item.account.institution}
            </span>
          </div>
        </div>
        <span
          className={`subtle-chip ${item.decision === "confirmed" ? "green" : item.likely ? "" : "yellow"}`}
        >
          {item.decision === "dismissed"
            ? "Hidden"
            : item.decision === "confirmed"
              ? "Confirmed by you"
              : item.likely
                ? "Likely subscription"
                : "Needs review"}
        </span>
      </div>
      <div className="subscription-price">
        <strong>{fmt(item.latest)}</strong>
        <span>/ month{item.variable ? " · varies" : ""}</span>
        <span className="subscription-category">{item.category}</span>
      </div>
      <div className="subscription-facts">
        <span>{item.months} consecutive months</span>
        <span>Last charge {date(item.lastDate)}</span>
        <span>
          {item.recent ? "Next estimate" : "Previously expected"}{" "}
          {date(item.nextDate)}
        </span>
      </div>
      {item.variable && (
        <p className="subscription-caution">
          Observed charges range from {fmt(item.minimum)} to {fmt(item.maximum)}
          . Review the receipt before treating this as a fixed subscription.
        </p>
      )}
      {item.merchant?.aggregate && (
        <p className="subscription-caution">
          This biller can cover multiple products or app-store purchases. Check
          the receipt for the exact subscription and billing platform.
        </p>
      )}
      <div className="subscription-links">
        {billing && safeBillingUrl(billing) && (
          <a className="button" href={billing} target="_blank" rel="noreferrer">
            Billing & plan <ExternalLink size={13} />
          </a>
        )}
        {item.merchant && (
          <a
            className="text-button"
            href={item.merchant.help}
            target="_blank"
            rel="noreferrer"
          >
            Cancel instructions <ExternalLink size={12} />
          </a>
        )}
        {!billing && (
          <span className="muted">Add a billing link in Details.</span>
        )}
      </div>
      <div className="subscription-review">
        {item.decision === "dismissed" ? (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void save("auto")}
          >
            <RotateCcw size={13} />
            Restore suggestion
          </button>
        ) : (
          <>
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                void save(item.decision === "confirmed" ? "auto" : "confirmed")
              }
            >
              <Check size={13} />
              {item.decision === "confirmed"
                ? "Undo confirmation"
                : "Confirm subscription"}
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void save("dismissed")}
            >
              <EyeOff size={13} />
              Not a subscription
            </button>
          </>
        )}
      </div>
      <details className="subscription-details">
        <summary>
          <Settings2 size={13} />
          Details & charge history
        </summary>
        <div className="subscription-history">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Bank description</th>
                <th>Charged</th>
              </tr>
            </thead>
            <tbody>
              {[...item.transactions]
                .reverse()
                .slice(0, 12)
                .map((t) => (
                  <tr key={t.id}>
                    <td>{date(t.date)}</td>
                    <td>{t.payee}</td>
                    <td>{fmt(-t.amount)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {item.transactions.length > 12 && (
            <p>12 most recent matching charges shown.</p>
          )}
        </div>
        <form
          className="subscription-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void save(item.decision, true);
          }}
        >
          <label>
            Subscription category
            <input
              required
              maxLength={80}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
          <label>
            Custom billing link
            <input
              type="url"
              placeholder={
                item.merchant?.billing || "https://example.com/billing"
              }
              value={url}
              maxLength={2000}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <button className="button" disabled={busy}>
            Save details
          </button>
        </form>
      </details>
      {error && (
        <p className="subscription-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
export function Subscriptions({
  transactions,
  accounts,
  bankAccounts,
  account,
  onAccount,
  reviews,
  onSave,
  fmt,
  busy,
  today,
  colors,
}: {
  transactions: Transaction[];
  accounts: Account[];
  bankAccounts: Account[];
  account: string;
  onAccount: (value: string) => void;
  reviews: SubscriptionReview[];
  onSave: (r: SubscriptionReview) => Promise<void>;
  fmt: (n: number) => string;
  busy: boolean;
  today: string;
  colors: string[];
}) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("all"),
    [status, setStatus] = useState("subscriptions"),
    [groupBy, setGroupBy] = useState("company"),
    [sort, setSort] = useState("amount");
  const detected = useMemo(
    () => detectSubscriptions(transactions, accounts, reviews, today),
    [transactions, accounts, reviews, today],
  );
  const categories = [...new Set(detected.map((s) => s.category))].sort();
  const activeCategory = categories.includes(category) ? category : "all";
  const scoped = detected.filter(
    (s) =>
      (activeCategory === "all" || s.category === activeCategory) &&
      `${s.company} ${s.transactions.map((t) => t.payee).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const reviewCount = scoped.filter(
    (s) => s.recent && s.decision === "auto" && !s.likely,
  ).length;
  const filtered = scoped.filter((s) =>
    status === "hidden"
      ? s.decision === "dismissed"
      : s.decision !== "dismissed" &&
        (status === "history"
          ? !s.recent
          : status === "review"
            ? s.recent && !s.likely && s.decision !== "confirmed"
            : status === "subscriptions"
              ? s.recent && (s.likely || s.decision === "confirmed")
              : s.recent),
  );
  const totals = subscriptionTotals(filtered);
  const monthlyCategories = [...new Set(filtered.map((s) => s.category))]
    .map((name) => ({
      name,
      ...subscriptionTotals(filtered.filter((s) => s.category === name)),
    }))
    .filter((c) => c.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly);
  const max = Math.max(...monthlyCategories.map((c) => c.monthly), 1);
  const ordered = [...filtered].sort((a, b) =>
    sort === "company"
      ? a.company.localeCompare(b.company)
      : sort === "next"
        ? a.nextDate.localeCompare(b.nextDate)
        : b.latest - a.latest,
  );
  const groups = new Map<string, Subscription[]>();
  for (const item of ordered) {
    const key = groupBy === "category" ? item.category : item.company;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  const scopedIds = new Set(accounts.map((a) => a.id));
  const dates = transactions
    .filter((t) => scopedIds.has(t.accountId) && t.date <= today)
    .map((t) => t.date)
    .sort();
  return (
    <section className="subscriptions-view" aria-label="Subscriptions">
      <div className="subscriptions-heading">
        <div>
          <h2>Subscriptions</h2>
          <p>
            Monthly patterns across all loaded history
            {dates.length
              ? ` · ${date(dates[0])} – ${date(dates.at(-1)!)}`
              : ""}
          </p>
        </div>
        <span className="subtle-chip">
          <RefreshCw size={12} />
          Updates with bank sync
        </span>
      </div>
      <div className="subscriptions-toolbar">
        <label className="subscription-search">
          <Search size={15} />
          <input
            aria-label="Search subscriptions by company"
            placeholder="Search company"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Subscription account"
          value={account}
          onChange={(e) => onAccount(e.target.value)}
        >
          <option value="all">All accounts</option>
          {bankAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Subscription category"
          value={categories.includes(category) ? category : "all"}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Subscription status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="subscriptions">Subscriptions</option>
          <option value="current">All current patterns</option>
          <option value="review">Needs review</option>
          <option value="history">Not recently seen</option>
          <option value="hidden">Hidden</option>
        </select>
        <select
          aria-label="Sort subscriptions"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="amount">Highest amount</option>
          <option value="company">Company A–Z</option>
          <option value="next">Next estimate</option>
        </select>
      </div>
      <div className="subscription-kpis">
        <div className="panel">
          <span>Estimated monthly</span>
          <strong>{fmt(totals.monthly)}</strong>
        </div>
        <div className="panel">
          <span>Yearly projection</span>
          <strong>{fmt(totals.yearly)}</strong>
        </div>
        <div className="panel">
          <span>Likely / confirmed</span>
          <strong>{totals.count}</strong>
        </div>
        <button
          className="panel subscription-review-kpi"
          onClick={() => setStatus("review")}
        >
          <span>Needs review</span>
          <strong>{reviewCount}</strong>
        </button>
      </div>
      <p className="subscription-estimate-note">
        Estimates use the latest charge of recent likely or confirmed
        subscriptions. Review candidates and older patterns are excluded.
        Cancellation and plan changes happen at the merchant.
      </p>
      {monthlyCategories.length > 0 && (
        <section className="panel subscription-category-chart">
          <div className="panel-head">
            <h2>Monthly by category</h2>
          </div>
          <div>
            {monthlyCategories.map((c, i) => (
              <button
                key={c.name}
                aria-pressed={category === c.name}
                onClick={() =>
                  setCategory(category === c.name ? "all" : c.name)
                }
              >
                <span>
                  {c.name}
                  <strong>{fmt(c.monthly)}</strong>
                </span>
                <i>
                  <b
                    style={{
                      width: `${(c.monthly / max) * 100}%`,
                      background: colors[i % colors.length],
                    }}
                  />
                </i>
                <small role="tooltip">
                  {c.count} likely / confirmed · {fmt(c.monthly)} estimated
                  monthly
                </small>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="subscription-group-controls">
        <span>
          {filtered.length} matching{" "}
          {filtered.length === 1 ? "pattern" : "patterns"}
        </span>
        <div
          className="segmented"
          role="group"
          aria-label="Group subscriptions"
        >
          {["company", "category"].map((value) => (
            <button
              key={value}
              className={groupBy === value ? "active" : ""}
              aria-pressed={groupBy === value}
              onClick={() => setGroupBy(value)}
            >
              By {value}
            </button>
          ))}
        </div>
      </div>
      <div
        className={
          groupBy === "company"
            ? "subscription-company-groups"
            : "subscription-category-groups"
        }
      >
        {[...groups].map(([name, items]) => (
          <section className="subscription-group" key={name}>
            <h3>
              {name}
              <span>
                {items.length} {items.length === 1 ? "pattern" : "patterns"}
              </span>
            </h3>
            <div className="subscription-grid">
              {items.map((item) => (
                <SubscriptionCard
                  key={
                    item.id +
                    ":" +
                    (item.review?.category || "") +
                    ":" +
                    (item.review?.billingUrl || "")
                  }
                  item={item}
                  fmt={fmt}
                  busy={busy}
                  onSave={onSave}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      {!filtered.length && (
        <div className="panel subscription-empty">
          <RefreshCw size={28} />
          <h3>No matching monthly patterns</h3>
          <p>
            {detected.length
              ? "Try another category, company, or status."
              : "Detection needs at least two posted charges in consecutive months, roughly 24–38 days apart. Sync or import more history to find matches."}
          </p>
          <button
            className="button"
            onClick={() => {
              setSearch("");
              setCategory("all");
              setStatus("subscriptions");
            }}
          >
            Reset filters
          </button>
        </div>
      )}
      <details className="subscription-method">
        <summary>How detection works</summary>
        <p>
          Monthly candidates require at least two posted expenses at the same
          company and account in consecutive months, 24–38 days apart, within
          seven calendar days of the prior charge. Ordinary food, fuel, shopping
          and travel purchases are excluded unless the biller or description
          identifies a plan. High-frequency shopping is excluded. Multiple
          charges at one company are separated by amount and timing. Pending
          charges, income, transfers and refunds never establish a recurring
          pattern. Only loaded USD activity is analyzed; the Activity date
          filter does not limit this view.
        </p>
        <p>
          Known billers or consistently subscription-categorized charges with
          stable amounts are labeled likely; other recurring payments need your
          review. A pattern is recent when last seen within 45 days. Older
          patterns are not proof of cancellation. Next dates and yearly costs
          are estimates, not merchant-confirmed schedules. Confirmation and
          categories are your local annotations; bank transactions are
          unchanged. Hiding a pattern does not cancel it. App-store and
          third-party billing may need to be managed through that billing
          platform.
        </p>
      </details>
    </section>
  );
}
