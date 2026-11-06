import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createStore } from "../server/store.js";
import { defaultPreferences } from "../shared/preferences.js";
import { preferencesSchema, readPreferences } from "../server/preferences.js";
import {
  paymentCycle,
  calendarReminders,
  bankPaymentLinks,
} from "../src/payment-dates.ts";
import { accountSummary, categorySpending } from "../src/finance.ts";
test("available deposit funds, credit debt and purchases are distinct and missing balances remain unknown", () => {
  const result = accountSummary([
    {
      id: "cash",
      type: "depository",
      currency: "USD",
      balance: 100000,
      available: 90000,
    },
    {
      id: "card",
      type: "credit",
      currency: "USD",
      balance: 20000,
      available: 480000,
    },
    { id: "overpaid", type: "credit", currency: "USD", balance: -1000 },
    {
      id: "unknown",
      type: "depository",
      currency: "USD",
      balance: null,
      available: null,
    },
  ]);
  assert.equal(result.availableCash, 90000);
  assert.equal(result.cash, 100000);
  assert.equal(result.creditDebt, 20000);
  assert.equal(result.net, 81000);
  assert.equal(result.cashKnownCount, 1);
  assert.equal(result.cashCount, 2);
  assert.equal(result.availableReported, false);
  const zero = accountSummary([
    { type: "depository", currency: "USD", balance: 10000, available: 0 },
  ]);
  assert.equal(zero.availableCash, 0);
  assert.equal(zero.availableReported, true);
});
test("category totals count posted purchases and refunds once while pending and transfers stay separate", () => {
  const rows = [
    { category: "Food", type: "expense", amount: -2500, pending: false },
    { category: "Food", type: "refund", amount: 500, pending: false },
    { category: "Food", type: "expense", amount: -700, pending: true },
    { category: "Food", type: "transfer", amount: -99999, pending: false },
  ];
  assert.deepEqual(categorySpending(rows), [
    { name: "Food", amount: 2000, count: 2, pending: 700 },
  ]);
});
test("payment dates respect Denver date boundaries, short months, leap years and year rollover", () => {
  const rule = {
    accountId: "test",
    dueDay: 15,
    leadDays: 1,
    autoPayConfirmed: false,
  };
  assert.deepEqual(
    paymentCycle(rule, new Date("2026-11-15T02:00:00Z"), "America/Denver"),
    {
      today: "2026-11-14",
      due: "2026-11-15",
      target: "2026-11-14",
      needsCheck: true,
    },
  );
  assert.equal(
    paymentCycle(rule, new Date("2026-11-16T19:00:00Z"), "America/Denver").due,
    "2026-12-15",
  );
  assert.equal(
    paymentCycle(
      { ...rule, dueDay: 31 },
      new Date("2027-02-01T19:00:00Z"),
      "America/Denver",
    ).target,
    "2027-02-27",
  );
  assert.equal(
    paymentCycle(
      { ...rule, dueDay: 31 },
      new Date("2028-02-01T19:00:00Z"),
      "America/Denver",
    ).due,
    "2028-02-29",
  );
  assert.equal(
    paymentCycle(
      { ...rule, dueDay: 1 },
      new Date("2026-12-31T19:00:00Z"),
      "America/Denver",
    ).target,
    "2026-12-31",
  );
});
test("portable reminders preserve local 9 AM, monthly recurrence, alarm lead and safe UTF-8 content folding", () => {
  const rule = {
    accountId: "test",
    dueDay: 31,
    leadDays: 1,
    autoPayConfirmed: false,
  };
  const content = calendarReminders(
    [rule],
    { test: "Delta, SkyMiles; " + "é".repeat(100) + "\nEND:VEVENT" },
    "America/Denver",
    new Date("2027-02-01T19:00:00Z"),
  );
  const unfolded = content.replace(/\r\n /g, "");
  assert.match(unfolded, /DTSTART;TZID=America\/Denver:20270228T090000/);
  assert.match(
    unfolded,
    /RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1/,
  );
  assert.match(unfolded, /TRIGGER:-P1D/);
  assert.match(unfolded, /Delta\\, SkyMiles\\;/);
  assert.equal(unfolded.split("\r\nEND:VEVENT").length - 1, 1);
  for (const line of content.split("\r\n"))
    assert.ok(Buffer.byteLength(line) <= 75);
  assert.equal(bankPaymentLinks("Unrecognized bank"), null);
  assert.match(
    bankPaymentLinks("Bank of America").login,
    /^https:\/\/secure\.bankofamerica\.com\//,
  );
});
test("preferences reject CSS injection, duplicate widgets, invalid time zones and malformed dates", () => {
  const copy = () => structuredClone(defaultPreferences);
  assert.ok(preferencesSchema.safeParse(copy()).success);
  for (const mutate of [
    (p) => (p.appearance.accent = "red;display:none"),
    (p) => (p.widgets = ["cash", "cash"]),
    (p) => (p.timeZone = "Not/AZone"),
    (p) =>
      (p.payments = [
        { accountId: "card", dueDay: 32, leadDays: 1, autoPayConfirmed: false },
      ]),
  ]) {
    const p = copy();
    mutate(p);
    assert.equal(preferencesSchema.safeParse(p).success, false);
  }
});
test("removed cards do not leave payment plans that block future settings changes", () => {
  const saved = structuredClone(defaultPreferences);
  saved.payments = ["connected", "disconnected", "debit"].map((accountId) => ({
    accountId,
    dueDay: 15,
    leadDays: 1,
    autoPayConfirmed: false,
  }));
  const store = {
    get(kind, id) {
      if (kind === "preferences") return saved;
      return id === "connected"
        ? { type: "credit" }
        : id === "debit"
          ? { type: "depository" }
          : null;
    },
  };
  assert.deepEqual(
    readPreferences(store).payments.map((p) => p.accountId),
    ["connected"],
  );
});
test("settings API persists validated colors, widget order and credit-card plans without accepting debit schedules", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "fg-preferences-")),
    base = "http://localhost:14321";
  const seed = createStore(dir);
  seed.put("account", "card", {
    id: "card",
    type: "credit",
    currency: "USD",
    balance: 0,
  });
  seed.put("account", "debit", {
    id: "debit",
    type: "depository",
    currency: "USD",
    balance: 0,
  });
  seed.put("transaction", "subscription-expense", {
    id: "subscription-expense",
    date: "2026-10-01",
    accountId: "card",
    type: "expense",
    pending: false,
    amount: -2000,
  });
  seed.put("transaction", "subscription-pending", {
    id: "subscription-pending",
    type: "expense",
    pending: true,
    amount: -2000,
  });
  seed.close();
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: "14321", FINANCE_DATA_DIR: dir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    rmSync(dir, { recursive: true, force: true });
  });
  const launchURL = await new Promise((resolve, reject) => {
    child.stdout.on("data", (d) => {
      const match = d.toString().match(/running at (https?:\/\/\S+)/);
      if (match) resolve(match[1]);
    });
    child.on("exit", () => reject(Error("Preferences test service failed")));
  });
  assert.equal((await globalThis.fetch(base + "/api/state")).status, 401);
  const bootstrap = await globalThis.fetch(launchURL, { redirect: "manual" });
  const browserCookie = bootstrap.headers.get("set-cookie").split(";")[0];
  const fetch = (input, init = {}) =>
    globalThis.fetch(input, {
      ...init,
      headers: { Cookie: browserCookie, ...init.headers },
    });
  const state = await (await fetch(base + "/api/state")).json();
  const next = {
    ...state.preferences,
    profileName: "Test profile",
    widgets: ["credit", "cash"],
    appearance: { ...state.preferences.appearance, accent: "#112233" },
    payments: [
      { accountId: "card", dueDay: 15, leadDays: 1, autoPayConfirmed: false },
    ],
  };
  const post = (body) =>
    fetch(base + "/api/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Finance-CSRF": state.csrf,
      },
      body: JSON.stringify(body),
    });
  assert.equal((await post(next)).status, 200);
  assert.deepEqual(
    (await (await fetch(base + "/api/state")).json()).preferences,
    next,
  );
  assert.equal(
    (
      await post({
        ...next,
        payments: [{ ...next.payments[0], accountId: "debit" }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post({
        ...next,
        appearance: { ...next.appearance, accent: "url(evil)" },
      })
    ).status,
    400,
  );
  const stored = createStore(dir);
  assert.deepEqual(stored.get("preferences", "dashboard"), next);
  stored.close();
  const review = {
    transactionId: "subscription-expense",
    decision: "confirmed",
    category: "Software",
    billingUrl: "https://example.com/account",
  };
  const postReview = (body) =>
    fetch(base + "/api/subscriptions/review", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Finance-CSRF": state.csrf,
      },
      body: JSON.stringify(body),
    });
  assert.equal((await postReview(review)).status, 200);
  assert.equal(
    (await postReview({ ...review, decision: "dismissed" })).status,
    200,
  );
  for (const invalid of [
    { ...review, transactionId: "missing" },
    { ...review, transactionId: "subscription-pending" },
    { ...review, billingUrl: "javascript:alert(1)" },
  ])
    assert.equal((await postReview(invalid)).status, 400);
  const reloaded = (await (await fetch(base + "/api/state")).json())
    .preferences;
  assert.equal(reloaded.profileName, next.profileName);
  assert.deepEqual(reloaded.payments, next.payments);
  assert.deepEqual(reloaded.appearance, next.appearance);
  assert.deepEqual(reloaded.subscriptionReviews, [
    { ...review, decision: "dismissed" },
  ]);
  const persisted = createStore(dir);
  assert.deepEqual(
    persisted.get("preferences", "dashboard").subscriptionReviews,
    reloaded.subscriptionReviews,
  );
  assert.equal(
    persisted.get("transaction", "subscription-expense").amount,
    -2000,
  );
  persisted.close();
});
