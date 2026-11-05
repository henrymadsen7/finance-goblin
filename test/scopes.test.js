import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectAccounts,
  selectTransactions,
  accountSummary,
} from "../src/finance.ts";
import { totals } from "../src/types.ts";
const accounts = [
  {
    id: "checking",
    institution: "Bank of America",
    type: "depository",
    currency: "USD",
    balance: 100000,
    source: "plaid",
  },
  {
    id: "visa",
    institution: "Bank of America",
    type: "credit",
    currency: "USD",
    balance: 20000,
    source: "plaid",
  },
  {
    id: "amex",
    institution: "American Express",
    type: "credit",
    currency: "USD",
    balance: 30000,
    source: "plaid",
  },
  {
    id: "eur",
    institution: "Other bank",
    type: "depository",
    currency: "EUR",
    balance: 999999,
    source: "actual",
  },
  {
    id: "csv",
    institution: "CSV import",
    type: "unknown",
    currency: "USD",
    balance: null,
    source: "csv",
  },
];
const transactions = [
  {
    id: "income",
    accountId: "checking",
    date: "2026-11-01",
    type: "income",
    amount: 50000,
    pending: false,
  },
  {
    id: "spend",
    accountId: "visa",
    date: "2026-11-02",
    type: "expense",
    amount: -10000,
    pending: false,
  },
  {
    id: "amex-spend",
    accountId: "amex",
    date: "2026-11-02",
    type: "expense",
    amount: -5000,
    pending: false,
  },
  {
    id: "refund",
    accountId: "amex",
    date: "2026-11-03",
    type: "refund",
    amount: 1000,
    pending: false,
  },
  {
    id: "pending",
    accountId: "amex",
    date: "2026-11-03",
    type: "expense",
    amount: -2000,
    pending: true,
  },
  {
    id: "card-payment",
    accountId: "checking",
    date: "2026-11-03",
    type: "transfer",
    amount: -10000,
    pending: false,
  },
  {
    id: "card-payment-counterpart",
    accountId: "visa",
    date: "2026-11-03",
    type: "transfer",
    amount: 10000,
    pending: false,
  },
  {
    id: "foreign",
    accountId: "eur",
    date: "2026-11-03",
    type: "income",
    amount: 999999,
    pending: false,
  },
  {
    id: "previous-period",
    accountId: "checking",
    date: "2026-10-01",
    type: "income",
    amount: 999999,
    pending: false,
  },
];
const rows = (accts) =>
  selectTransactions(transactions, accts, "2026-11-01", "2026-11-05");
test("combined KPIs reconcile to bank KPIs without transfer double counting, pending or foreign amounts", () => {
  const boa = selectAccounts(accounts, "Bank of America"),
    amex = selectAccounts(accounts, "American Express");
  assert.deepEqual(totals(rows(boa)), {
    income: 50000,
    expense: 10000,
    pending: 0,
    net: 40000,
  });
  assert.deepEqual(totals(rows(amex)), {
    income: 0,
    expense: 4000,
    pending: 2000,
    net: -4000,
  });
  assert.deepEqual(totals(rows(accounts)), {
    income: 50000,
    expense: 14000,
    pending: 2000,
    net: 36000,
  });
  assert.equal(accountSummary(boa).net, 80000);
  assert.equal(accountSummary(amex).net, -30000);
  assert.equal(accountSummary(accounts).net, 50000);
  assert.equal(accountSummary(accounts).cash, 100000);
  assert.equal(accountSummary(accounts).incomplete, true);
});
test("single-account selection scopes both net balance and transaction totals, and cannot leak another bank", () => {
  const visa = selectAccounts(accounts, "Bank of America", "visa");
  assert.equal(accountSummary(visa).net, -20000);
  assert.equal(totals(rows(visa)).expense, 10000);
  assert.deepEqual(selectAccounts(accounts, "American Express", "visa"), []);
  const unknown = selectAccounts(accounts, "CSV import");
  assert.equal(accountSummary(unknown).knownCount, 0);
  assert.equal(accountSummary(unknown).incomplete, true);
});
