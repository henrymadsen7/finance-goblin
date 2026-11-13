import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
export function createEmbedder() {
  let child = null,
    buffer = "",
    serial = 0;
  const waiting = new Map();
  const fail = () => {
    for (const p of waiting.values()) {
      clearTimeout(p.timer);
      p.reject(
        Error(
          "Local semantic search unavailable. Text search remains available.",
        ),
      );
    }
    waiting.clear();
    child = null;
  };
  function launch() {
    buffer = "";
    child = spawn(
      join(
        process.env.FINANCE_HERMES_ROOT ||
          join(homedir(), ".hermes/hermes-agent"),
        "venv/bin/python",
      ),
      [join(dirname(fileURLToPath(import.meta.url)), "embedding_worker.py")],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const proc = child;
    const failed = () => {
      if (child === proc) {
        proc.kill();
        fail();
      }
    };
    proc.stderr.resume();
    proc.on("error", failed);
    proc.on("close", failed);
    proc.stdin.on("error", failed);
    proc.stdout.on("data", (d) => {
      if (child !== proc) return;
      buffer += d;
      if (buffer.length > 3000000) {
        return failed();
      }
      let n;
      while ((n = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, n);
        buffer = buffer.slice(n + 1);
        try {
          const r = JSON.parse(line);
          const p = waiting.get(r.id);
          if (p) {
            waiting.delete(r.id);
            clearTimeout(p.timer);
            r.error ? p.reject(Error(r.error)) : p.resolve(r.vectors);
          } else if (r.error) failed();
        } catch {
          failed();
        }
      }
    });
  }
  return {
    embed(texts) {
      if (!texts.length) return Promise.resolve([]);
      if (!child) launch();
      return new Promise((resolve, reject) => {
        const id = ++serial;
        const timer = setTimeout(() => {
          waiting.delete(id);
          reject(Error("Local embeddings timed out."));
          child?.kill();
        }, 45000);
        waiting.set(id, { resolve, reject, timer });
        child.stdin.write(JSON.stringify({ id, texts }) + "\n");
      });
    },
    close() {
      child?.kill();
      fail();
    },
  };
}
