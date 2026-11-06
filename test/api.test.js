import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { request } from "node:http";
const port = 14319,
  url = `http://localhost:${port}`;
test("local API isolates demo data, enforces origin/CSRF, validates imports and saves budgets", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "fg-api-"));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(port), FINANCE_DATA_DIR: dir },
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
    child.on("exit", () => reject(Error("Test server failed to start")));
  });
  assert.equal((await globalThis.fetch(url + "/api/state")).status, 401);
  const bootstrap = await globalThis.fetch(launchURL, { redirect: "manual" });
  const browserCookie = bootstrap.headers.get("set-cookie").split(";")[0];
  const fetch = (input, init = {}) =>
    globalThis.fetch(input, {
      ...init,
      headers: { Cookie: browserCookie, ...init.headers },
    });
  const live = await (await fetch(url + "/api/state")).json();
  assert.equal(live.transactions.length, 0);
  const demo = await (await fetch(url + "/api/state?mode=demo")).json();
  assert.ok(demo.transactions.length > 100);
  const post = (path, body, extra = {}) =>
    fetch(url + "/api/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Finance-CSRF": live.csrf,
        ...extra,
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await fetch(url + "/api/state", {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    await new Promise((resolve) => {
      request(
        url + "/api/state",
        { headers: { Host: "evil.example" } },
        (r) => {
          r.resume();
          resolve(r.statusCode);
        },
      ).end();
    }),
    403,
  );
  assert.equal(
    (
      await fetch(url + "/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal((await post("import", { csv: "bad" })).status, 400);
  const csv =
    "date,payee,amount,account,category,type\n2026-11-01,Test Income,100.00,Test Checking,Income,income\n2026-11-02,Test Spending,-15.25,Test Checking,Other,expense";
  const preview = await (await post("import/preview", { csv })).json();
  assert.equal(preview.count, 2);
  assert.equal(
    (await (await fetch(url + "/api/state")).json()).transactions.length,
    0,
  );
  assert.equal((await (await post("import", { csv })).json()).count, 2);
  assert.equal((await (await post("import", { csv })).json()).count, 0);
  assert.equal(
    (await post("budgets", { budgets: { Other: 10000 } })).status,
    200,
  );
  const final = await (await fetch(url + "/api/state")).json();
  assert.equal(final.transactions.length, 2);
  assert.equal(final.accounts[0].balance, null);
  assert.equal(final.budgets.Other, 10000);
  assert.equal(JSON.stringify(final).includes("accessToken"), false);
});

test("desktop service rejects ordinary browser access and supports scoped one-time bank handoff", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "fg-desktop-api-")),
    desktopPort = 14320,
    base = `http://localhost:${desktopPort}`,
    secret = "test-desktop-session";
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(desktopPort),
      FINANCE_DATA_DIR: dir,
      FINANCE_DESKTOP_SESSION: secret,
    },
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
  await new Promise((resolve, reject) => {
    child.stdout.on("data", (d) => {
      if (d.toString().includes("running at")) resolve();
    });
    child.on("exit", () =>
      reject(Error("Desktop test service failed to start")),
    );
  });
  assert.equal((await fetch(base + "/api/state")).status, 401);
  assert.equal((await fetch(base + "/")).status, 401);
  const cookie = `fg-desktop=${secret}`;
  const state = await (
    await fetch(base + "/api/state", { headers: { Cookie: cookie } })
  ).json();
  assert.equal(state.desktop, true);
  const dashboardPage = await fetch(base + "/", {
    headers: { Cookie: cookie },
  });
  assert.match(
    dashboardPage.headers.get("content-security-policy"),
    /frame-src 'none'/,
  );
  assert.equal(
    dashboardPage.headers
      .get("content-security-policy")
      .includes("https://cdn.plaid.com"),
    false,
  );
  const r = await fetch(base + "/api/desktop/bank-link", {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-Finance-CSRF": state.csrf,
    },
    body: "{}",
  });
  const handoff = await r.json();
  const bootstrap = await fetch(handoff.url, { redirect: "manual" });
  assert.equal(bootstrap.status, 302);
  const browserCookie = bootstrap.headers.get("set-cookie").split(";")[0];
  assert.match(bootstrap.headers.get("set-cookie"), /HttpOnly/);
  assert.equal((await fetch(handoff.url, { redirect: "manual" })).status, 401);
  assert.equal(
    (await fetch(base + "/api/state", { headers: { Cookie: browserCookie } }))
      .status,
    401,
  );
  const info = await (
    await fetch(base + "/api/desktop/link-info", {
      headers: { Cookie: browserCookie },
    })
  ).json();
  assert.notEqual(info.csrf, state.csrf);
  assert.equal(info.csrf.length, 64);
  const bankPage = await fetch(base + "/desktop-connect", {
    headers: { Cookie: browserCookie },
  });
  assert.match(
    bankPage.headers.get("content-security-policy"),
    /frame-src https:\/\/cdn.plaid.com/,
  );
  const csp = bankPage.headers.get("content-security-policy");
  const nonce = csp.match(/'nonce-([^']+)'/)[1];
  assert.match(nonce, /^[A-Za-z0-9+/]{24}$/);
  assert.equal(nonce.includes("undefined"), false);
  assert.ok(
    (await bankPage.text()).includes(`name="fg-csp-nonce" content="${nonce}"`),
  );
  const secondPage = await fetch(base + "/desktop-connect", {
    headers: { Cookie: browserCookie },
  });
  assert.notEqual(secondPage.headers.get("content-security-policy"), csp);
  assert.equal(csp.includes("script-src 'unsafe-inline'"), false);

  assert.equal(
    (
      await fetch(base + "/api/desktop/link-complete", {
        method: "POST",
        headers: { Cookie: browserCookie, "X-Finance-CSRF": info.csrf },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/api/provider/config", {
        method: "POST",
        headers: {
          Cookie: browserCookie,
          "Content-Type": "application/json",
          "X-Finance-CSRF": state.csrf,
        },
        body: "{}",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(base + "/desktop-connect", {
        headers: { Cookie: browserCookie },
      })
    ).status,
    200,
  );
});
