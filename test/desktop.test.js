import { test } from "node:test";
import assert from "node:assert/strict";
import { createDesktopAccess } from "../server/desktop-access.js";
test("desktop access requires the app session and limits bank browsers to authorization routes", () => {
  const access = createDesktopAccess("desktop-secret");
  assert.equal(access.authorize("", "/api/state"), null);
  assert.equal(access.authorize("fg-desktop=wrong", "/api/state"), null);
  assert.equal(
    access.authorize("fg-desktop=desktop-secret", "/api/state").kind,
    "desktop",
  );
  const ticket = access.createTicket("item-1"),
    browser = access.redeemTicket(ticket);
  assert.ok(browser);
  assert.equal(access.redeemTicket(ticket), null);
  assert.equal(
    access.authorize(`fg-desktop=${browser}`, "/api/desktop/link-info").itemId,
    "item-1",
  );
  for (const path of [
    "/api/state",
    "/",
    "/api/budgets",
    "/api/preferences",
    "/api/subscriptions/review",
    "/api/import",
    "/api/provider/config",
    "/api/connections/item-1/disconnect",
  ])
    assert.equal(access.authorize(`fg-desktop=${browser}`, path), null);
  access.revokeBrowser(`fg-desktop=${browser}`);
  assert.equal(
    access.authorize(`fg-desktop=${browser}`, "/api/provider/link"),
    null,
  );
});
test("desktop handoff tickets and browser sessions expire", () => {
  let time = 0;
  const access = createDesktopAccess("secret", { now: () => time });
  const expired = access.createTicket();
  time = 60_001;
  assert.equal(access.redeemTicket(expired), null);
  const browser = access.redeemTicket(access.createTicket());
  time += 30 * 60_000 + 1;
  assert.equal(
    access.authorize(`fg-desktop=${browser}`, "/desktop-connect"),
    null,
  );
});

test("desktop OAuth omits custom redirects for new and reconnect flows while browser redirects remain explicit", async () => {
  const { linkTokenParams } = await import("../server/plaid.js");
  const config = { redirectUri: "http://localhost:4310/oauth/callback" };
  for (const item of [null, { accessToken: "test-access-token" }]) {
    const desktop = linkTokenParams(config, item, { desktop: true });
    assert.equal("redirect_uri" in desktop, false);
    assert.equal(
      linkTokenParams(config, item).redirect_uri,
      config.redirectUri,
    );
    if (item) {
      assert.equal(desktop.access_token, item.accessToken);
      assert.equal("products" in desktop, false);
    } else assert.deepEqual(desktop.products, ["transactions"]);
  }
});

test("bank sessions bind their connection and CSRF, serialize calls and reject replay", () => {
  const access = createDesktopAccess("desktop-secret");
  const browser = access.redeemTicket(access.createTicket("item-1"));
  const cookie = `fg-desktop=${browser}`;
  assert.equal(access.authorize(cookie, "/api/provider/link", "GET"), null);
  assert.throws(() => access.beginOperation(cookie, "complete"), /authorizing/);
  assert.throws(
    () => access.beginOperation(cookie, "link", "item-2"),
    /different bank/,
  );
  assert.throws(() => access.beginOperation(cookie, "sync", "item-1"), /Start/);
  const finish = access.beginOperation(cookie, "link", "item-1");
  assert.throws(
    () => access.beginOperation(cookie, "link", "item-1"),
    /already running/,
  );
  finish(true);
  finish(false);
  assert.throws(
    () => access.beginOperation(cookie, "exchange"),
    /different bank|not permitted/,
  );
  access.beginOperation(cookie, "sync", "item-1")(true);
  assert.throws(
    () => access.beginOperation(cookie, "sync", "item-1"),
    /already complete/,
  );
  access.beginOperation(cookie, "complete")(true);
  access.revokeBrowser(cookie);
  assert.equal(access.authorize(cookie, "/api/desktop/link-info"), null);
  const newCookie = `fg-desktop=${access.redeemTicket(access.createTicket())}`;
  assert.throws(
    () => access.beginOperation(newCookie, "sync"),
    /not permitted/,
  );
  for (let i = 0; i < 12; i++) access.beginOperation(newCookie, "link")();
  assert.throws(
    () => access.beginOperation(newCookie, "link"),
    (e) => e.status === 429,
  );
});

test("browser development uses an expiring one-use bootstrap and private session", async () => {
  const { createBrowserAccess } = await import("../server/desktop-access.js");
  let time = 0;
  const access = createBrowserAccess({ now: () => time });
  assert.equal(access.authorize(), false);
  assert.equal(access.redeem("wrong"), null);
  const token = access.redeem(access.ticket);
  assert.equal(access.redeem(access.ticket), null);
  assert.equal(access.authorize(`other=x; fg-browser=${token}`), true);
  assert.equal(access.authorize(`fg-browser=${token}x`), false);
  const expired = createBrowserAccess({ now: () => time });
  time += 5 * 60_000;
  assert.equal(expired.redeem(expired.ticket), null);
});

test("provider transport rejects payment and arbitrary endpoints before sending credentials", async () => {
  const { plaid } = await import("../server/plaid.js");
  for (const path of [
    "transfer/create",
    "payment_initiation/payment/create",
    "https://other.example/",
    "../accounts/get",
  ])
    await assert.rejects(
      plaid({}, path, {}),
      (error) => error.code === "OPERATION_BLOCKED",
    );
});
