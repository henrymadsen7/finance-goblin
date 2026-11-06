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
