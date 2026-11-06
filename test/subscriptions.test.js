import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectSubscriptions,
  subscriptionTotals,
  nextMonthlyDate,
} from "../src/subscription-detection.ts";
import { normalizeMerchant, merchants } from "../src/subscription-merchants.ts";
import { safeBillingUrl } from "../shared/subscription-links.js";
import {
  preferencesSchema,
  subscriptionReviewSchema,
} from "../server/preferences.js";
import { defaultPreferences } from "../shared/preferences.js";
const account = {
  id: "a",
  name: "Test card",
  institution: "Test bank",
  type: "credit",
  currency: "USD",
  source: "plaid",
  balance: 0,
};
const tx = (date, amount = -1299, extra = {}) => ({
  id: date + ":" + amount,
  date,
  payee: "Spotify",
  category: "Entertainment",
  type: "expense",
  pending: false,
  amount,
  accountId: "a",
  ...extra,
});
const find = (rows, reviews = [], accounts = [account], today = "2026-11-05") =>
  detectSubscriptions(rows, accounts, reviews, today);
test("monthly detection requires at least two consecutive months and ignores pending, credits, transfers and future charges", () => {
  assert.equal(find([tx("2026-10-01")]).length, 0);
  assert.equal(find([tx("2026-10-01"), tx("2026-10-02")]).length, 0);
  assert.equal(find([tx("2026-09-01"), tx("2026-11-01")]).length, 0);
  assert.equal(find([tx("2026-10-31"), tx("2026-11-01")]).length, 0);
  for (const extra of [
    { pending: true },
    { type: "transfer" },
    { type: "refund", amount: 1299 },
    { type: "income", amount: 1299 },
    { amount: 0 },
  ])
    assert.equal(
      find([tx("2026-10-01"), tx("2026-11-01", -1299, extra)]).length,
      0,
    );
  assert.equal(find([tx("2026-11-01"), tx("2026-12-01")]).length, 0);
  const rows = find([tx("2026-09-01"), tx("2026-10-02"), tx("2026-11-01")]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].months, 3);
  assert.equal(rows[0].likely, true);
  assert.equal(rows[0].nextDate, "2026-12-01");
  assert.equal(subscriptionTotals(rows).monthly, 1299);
});
test("exact cents, duplicate IDs, account scope and currencies remain isolated", () => {
  const rows = [
    tx("2026-09-01"),
    tx("2026-10-01"),
    tx("2026-10-01"),
    tx("2026-09-02", -899, { accountId: "b", id: "b1" }),
    tx("2026-10-02", -899, { accountId: "b", id: "b2" }),
  ];
  const both = find(rows, [], [account, { ...account, id: "b" }]);
  assert.equal(both.length, 2);
  assert.equal(subscriptionTotals(both).monthly, 2198);
  assert.equal(find(rows)[0].transactions.length, 2);
  assert.equal(find(rows, [], [{ ...account, currency: "EUR" }]).length, 0);
  assert.equal(
    find(
      [tx("2026-09-01"), tx("2026-10-01", -1299, { accountId: "b" })],
      [],
      [account, { ...account, id: "b" }],
    ).length,
    0,
  );
});
test("unknown monthly bills require review and do not inflate subscription estimates", () => {
  const bills = find([
    tx("2026-09-05", -20000, { payee: "Utility bill", category: "Housing" }),
    tx("2026-10-05", -24000, { payee: "Utility bill", category: "Housing" }),
  ]);
  assert.equal(bills.length, 1);
  assert.equal(bills[0].likely, false);
  assert.equal(subscriptionTotals(bills).monthly, 0);
  assert.equal(subscriptionTotals(bills).review, 1);
  const variable = find([tx("2026-09-05", -1000), tx("2026-10-05", -4000)]);
  assert.equal(variable[0].variable, true);
  assert.equal(variable[0].likely, false);
});
test("high-frequency purchases are excluded and separate monthly plans at an aggregator are not combined", () => {
  const frequent = Array.from({ length: 12 }, (_, i) =>
    tx(
      `2026-${i < 6 ? "09" : "10"}-${String((i % 6) * 4 + 1).padStart(2, "0")}`,
      -1999,
      { payee: "Coffee shop" },
    ),
  );
  assert.equal(find(frequent).length, 0);
  const rows = ["09", "10", "11"].flatMap((m) => [
    tx(`2026-${m}-01`, -999, { payee: "APPLE.COM/BILL" }),
    tx(`2026-${m}-02`, -2999, { payee: "APPLE.COM/BILL" }),
  ]);
  const plans = find(rows);
  assert.equal(plans.length, 2);
  assert.deepEqual(
    plans.map((s) => s.latest).sort((a, b) => a - b),
    [999, 2999],
  );
  assert.ok(plans.every((s) => s.months === 3));
});
test("confirmation, category and billing annotations survive added older history; hiding and stale patterns stay out of totals", () => {
  const rows = [
    tx("2026-09-03", -1000, { payee: "Example membership" }),
    tx("2026-10-03", -1000, { payee: "Example membership" }),
  ];
  const review = {
    transactionId: rows[0].id,
    decision: "confirmed",
    category: "Fitness",
    billingUrl: "https://example.com/billing",
  };
  const result = find(
    [tx("2026-08-03", -1000, { payee: "Example membership" }), ...rows],
    [review],
  );
  assert.equal(result[0].decision, "confirmed");
  assert.equal(result[0].category, "Fitness");
  assert.equal(subscriptionTotals(result).monthly, 1000);
  assert.equal(subscriptionTotals(result).yearly, 12000);
  assert.equal(
    subscriptionTotals(find(rows, [{ ...review, decision: "dismissed" }]))
      .monthly,
    0,
  );
  const stale = find(rows, [review], [account], "2026-12-01");
  assert.equal(stale[0].recent, false);
  assert.equal(subscriptionTotals(stale).monthly, 0);
});
test("merchant normalization preserves company digits and known aliases without merging generic Amazon shopping", () => {
  assert.equal(normalizeMerchant("PAYPAL * SPOTIFY 123456789"), "spotify");
  assert.equal(normalizeMerchant("1Password"), "1password");
  const rows = find([
    tx("2026-09-02", -1299, { payee: "PAYPAL *SPOTIFY 123456789" }),
    tx("2026-10-02", -1299, { payee: "Spotify USA" }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].company, "Spotify");
  assert.equal(
    find([
      tx("2026-09-02", -1299, { payee: "Amazon", category: "Shopping" }),
      tx("2026-10-02", -1299, { payee: "Amazon", category: "Shopping" }),
    ]).length,
    0,
  );
  assert.equal(
    find([
      tx("2026-09-02", -1299, { payee: "Amazon Prime", category: "Shopping" }),
      tx("2026-10-02", -1299, { payee: "Amazon Prime", category: "Shopping" }),
    ])[0].likely,
    true,
  );
});
test("monthly date estimates clamp leap days, short months and year rollover", () => {
  assert.equal(nextMonthlyDate(["2026-01-31"]), "2026-02-28");
  assert.equal(nextMonthlyDate(["2024-01-31"]), "2024-02-29");
  assert.equal(nextMonthlyDate(["2026-12-31"]), "2027-01-31");
  assert.equal(
    find([tx("2026-01-31"), tx("2026-02-28")], [], [account], "2026-03-01")
      .length,
    1,
  );
});
test("legacy preferences preserve appearance and payment plans; billing links reject executable schemes and embedded credentials", () => {
  const legacy = structuredClone(defaultPreferences);
  delete legacy.subscriptionReviews;
  legacy.profileName = "Saved profile";
  const parsed = preferencesSchema.parse(legacy);
  assert.equal(parsed.profileName, "Saved profile");
  assert.deepEqual(parsed.subscriptionReviews, []);
  for (const billingUrl of [
    "javascript:alert(1)",
    "http://example.com",
    "file:///tmp/test",
    "https://user:password@example.com",
    "https://localhost/billing",
  ])
    assert.equal(
      subscriptionReviewSchema.safeParse({
        transactionId: "x",
        decision: "auto",
        billingUrl,
      }).success,
      false,
    );
  for (const m of merchants) {
    assert.ok(safeBillingUrl(m.billing));
    assert.ok(safeBillingUrl(m.help));
  }
});
