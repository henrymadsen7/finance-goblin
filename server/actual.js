import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
export function readActual(config) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("./actual-worker.js", import.meta.url))],
      {
        stdio: ["pipe", "pipe", "ignore"],
        env: {
          ...process.env,
          ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
        },
      },
    );
    const chunks = [];
    let size = 0;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, 90000);
    child.stdout.on("data", (d) => {
      size += d.length;
      if (size > 30_000_000) {
        child.kill();
        return;
      }
      chunks.push(d);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(
        new Error(
          "Could not start the Actual connector. Check the Node.js installation.",
        ),
      );
    });
    child.on("close", () => {
      clearTimeout(timer);
      if (timedOut)
        return reject(
          new Error(
            "Actual did not respond within 90 seconds. Check that your server is available.",
          ),
        );
      try {
        const result = JSON.parse(Buffer.concat(chunks).toString());
        if (result.error) reject(new Error(result.error));
        else resolve(result);
      } catch {
        reject(
          new Error(
            "Actual connector could not start. Run npm install and ensure its native dependencies are built.",
          ),
        );
      }
    });
    child.stdin.end(JSON.stringify(config));
  });
}
export async function syncActual(store, config) {
  const result = await readActual(config);
  store.batch(() => {
    for (const kind of ["account", "transaction"])
      for (const row of store.list(kind))
        if (row.itemId === "actual") store.remove(kind, row.id);
    for (const a of result.accounts) store.put("account", a.id, a);
    for (const t of result.transactions) store.put("transaction", t.id, t);
    store.put("config", "actual", {
      ...config,
      lastSync: new Date().toISOString(),
      error: null,
    });
  });
}
