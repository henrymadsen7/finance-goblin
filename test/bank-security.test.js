import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

test("bank handoff cannot switch connections, read other banks, exchange twice or outlive completion", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "fg-bank-security-")),
    base = "http://localhost:14322",
    cookie = "fg-desktop=synthetic-desktop-session";
  const child = spawn(
    process.execPath,
    ["--import", "./test/fixtures/bank-provider.mjs", "server/index.js"],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        PORT: "14322",
        FINANCE_DATA_DIR: dir,
        FINANCE_DESKTOP_SESSION: "synthetic-desktop-session",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
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
    child.on("exit", () => reject(Error("Security fixture failed to start")));
  });
  const state = await (
    await fetch(base + "/api/state", { headers: { Cookie: cookie } })
  ).json();
  const post = (path, data, auth = cookie, csrf = state.csrf) =>
    fetch(base + "/api/" + path, {
      method: "POST",
      headers: {
        Cookie: auth,
        "Content-Type": "application/json",
        "X-Finance-CSRF": csrf,
      },
      body: JSON.stringify(data),
    });
  const handoff = async (itemId) => {
    const { url } = await (
      await post("desktop/bank-link", itemId ? { itemId } : {})
    ).json();
    const response = await fetch(url, { redirect: "manual" });
    const auth = response.headers.get("set-cookie").split(";")[0];
    const info = await (
      await fetch(base + "/api/desktop/link-info", {
        headers: { Cookie: auth },
      })
    ).json();
    return { auth, csrf: info.csrf };
  };
  const reconnect = await handoff("first");
  const bankPost = (path, body = {}) =>
    post(path, body, reconnect.auth, reconnect.csrf);
  assert.notEqual(reconnect.csrf, state.csrf);
  assert.equal(
    (
      await post(
        "provider/link",
        { itemId: "first" },
        reconnect.auth,
        state.csrf,
      )
    ).status,
    403,
  );
  assert.equal(
    (await bankPost("provider/link", { itemId: "second" })).status,
    403,
  );
  assert.equal((await bankPost("provider/link")).status, 403);
  assert.equal((await bankPost("desktop/link-complete")).status, 403);
  assert.equal((await bankPost("sync")).status, 403);
  assert.equal(
    (await bankPost("provider/link", { itemId: "first" })).status,
    200,
  );
  assert.equal(
    (
      await bankPost("provider/exchange", {
        publicToken: "synthetic-public-token",
        institution: "Test",
      })
    ).status,
    403,
  );
  const refreshed = await bankPost("sync");
  assert.equal(refreshed.status, 200);
  assert.equal(
    JSON.stringify(await refreshed.json()).includes("Test second"),
    false,
  );
  const next = await (
    await fetch(base + "/api/state", { headers: { Cookie: cookie } })
  ).json();
  assert.ok(next.connections.find((c) => c.id === "first").lastSync);
  assert.equal(next.connections.find((c) => c.id === "second").lastSync, null);
  assert.equal(
    (await bankPost("provider/link", { itemId: "first" })).status,
    403,
  );
  const complete = await bankPost("desktop/link-complete");
  assert.equal(complete.status, 200);
  assert.match(complete.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/);
  assert.equal((await bankPost("sync")).status, 401);
  assert.equal(
    (
      await fetch(base + "/api/desktop/link-info", {
        headers: { Cookie: reconnect.auth },
      })
    ).status,
    401,
  );
  const fresh = await handoff();
  assert.notEqual(fresh.csrf, reconnect.csrf);
  const freshPost = (path, body = {}) =>
    post(path, body, fresh.auth, fresh.csrf);
  assert.equal((await freshPost("sync")).status, 403);
  assert.equal((await freshPost("provider/link")).status, 200);
  const body = {
    publicToken: "synthetic-public-token",
    institution: "Test new",
  };
  assert.equal((await freshPost("provider/exchange", body)).status, 200);
  assert.equal((await freshPost("provider/exchange", body)).status, 403);
  assert.equal((await freshPost("desktop/link-complete")).status, 200);
  assert.equal((await freshPost("desktop/link-complete")).status, 401);
  assert.equal(
    (await fetch(base + "/api/state", { headers: { Cookie: fresh.auth } }))
      .status,
    401,
  );
});
