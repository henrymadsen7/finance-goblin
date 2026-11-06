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
export function createStore(dir, { key: suppliedKey, previousKey } = {}) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const keyPath = join(dir, "vault.key");
  if (!suppliedKey) {
    if (existsSync(join(dir, "vault.key.os")))
      throw new Error(
        "Open this protected vault in the Finance Goblin desktop app.",
      );
    if (!existsSync(keyPath)) {
      if (existsSync(join(dir, "finance.sqlite")))
        throw new Error(
          "Missing vault key. Restore a matching private backup.",
        );
      writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: "wx" });
    }
    chmodSync(keyPath, 0o600);
  }
  const key = suppliedKey || readFileSync(keyPath);
  if (!Buffer.isBuffer(key) || key.length !== 32)
    throw new Error("Invalid vault key.");
  function encrypt(kind, id, value) {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", key, iv);
    c.setAAD(Buffer.from(JSON.stringify([kind, id])));
    const encrypted = Buffer.concat([
      c.update(JSON.stringify(value), "utf8"),
      c.final(),
    ]);
    return (
      "v2:" + Buffer.concat([iv, c.getAuthTag(), encrypted]).toString("base64")
    );
  }
  let recoveryKey = previousKey;
  let allowLegacy = !suppliedKey || !!previousKey;
  function decryptWithKey(kind, id, value, candidateKey) {
    const versioned = value.startsWith("v2:");
    if (!versioned && !allowLegacy)
      throw new Error(
        "Unbound legacy ciphertext is not permitted in this vault.",
      );
    const b = Buffer.from(versioned ? value.slice(3) : value, "base64");
    const c = createDecipheriv("aes-256-gcm", candidateKey, b.subarray(0, 12));
    if (versioned) c.setAAD(Buffer.from(JSON.stringify([kind, id])));
    c.setAuthTag(b.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([c.update(b.subarray(28)), c.final()]).toString(),
    );
  }
  function decrypt(kind, id, value) {
    try {
      return decryptWithKey(kind, id, value, key);
    } catch (error) {
      if (!recoveryKey) throw error;
      return decryptWithKey(kind, id, value, recoveryKey);
    }
  }
  const path = join(dir, "finance.sqlite");
  const db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec(
    "PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id));",
  );
  const putStmt = db.prepare(
    "INSERT INTO records(kind,id,value) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value",
  );
  try {
    db.exec("BEGIN IMMEDIATE");
    for (const row of db.prepare("SELECT kind,id,value FROM records").all()) {
      const value = decrypt(row.kind, row.id, row.value);
      if (previousKey || !row.value.startsWith("v2:"))
        putStmt.run(row.kind, row.id, encrypt(row.kind, row.id, value));
    }
    db.exec("COMMIT");
    recoveryKey = undefined;
    allowLegacy = false;
  } catch {
    db.exec("ROLLBACK");
    db.close();
    throw new Error(
      "Vault authentication failed. Restore a matching private backup; no records were changed.",
    );
  }
  if (previousKey) {
    try {
      db.exec("VACUUM");
    } catch {
      db.close();
      throw new Error(
        "Vault rotation committed but cleanup could not finish. Reopen the app to resume using the protected recovery envelope.",
      );
    }
  }
  const store = {
    put(kind, id, value) {
      putStmt.run(kind, id, encrypt(kind, id, value));
    },
    get(kind, id) {
      const r = db
        .prepare("SELECT value FROM records WHERE kind=? AND id=?")
        .get(kind, id);
      return r ? decrypt(kind, id, r.value) : null;
    },
    list(kind) {
      return db
        .prepare("SELECT id,value FROM records WHERE kind=?")
        .all(kind)
        .map((r) => decrypt(kind, r.id, r.value));
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
