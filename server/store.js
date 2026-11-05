import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { join } from "node:path";
export function createStore(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const keyPath = join(dir, "vault.key");
  if (!existsSync(keyPath))
    writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: "wx" });
  chmodSync(keyPath, 0o600);
  const key = readFileSync(keyPath);
  function encrypt(value) {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      c.update(JSON.stringify(value), "utf8"),
      c.final(),
    ]);
    return Buffer.concat([iv, c.getAuthTag(), encrypted]).toString("base64");
  }
  function decrypt(value) {
    const b = Buffer.from(value, "base64");
    const c = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
    c.setAuthTag(b.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([c.update(b.subarray(28)), c.final()]).toString(),
    );
  }
  const path = join(dir, "finance.sqlite");
  const db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec(
    "PRAGMA journal_mode=DELETE; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id));",
  );
  const putStmt = db.prepare(
    "INSERT INTO records(kind,id,value) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value",
  );
  const store = {
    put(kind, id, value) {
      putStmt.run(kind, id, encrypt(value));
    },
    get(kind, id) {
      const r = db
        .prepare("SELECT value FROM records WHERE kind=? AND id=?")
        .get(kind, id);
      return r ? decrypt(r.value) : null;
    },
    list(kind) {
      return db
        .prepare("SELECT value FROM records WHERE kind=?")
        .all(kind)
        .map((r) => decrypt(r.value));
    },
    remove(kind, id) {
      db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
    },
    batch(fn) {
      db.exec("BEGIN IMMEDIATE");
      try {
        fn();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    close() {
      db.close();
    },
  };
  return store;
}
