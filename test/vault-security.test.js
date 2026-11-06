import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { randomBytes, createCipheriv } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../server/store.js";
import { loadVaultKey } from "../desktop/vault-key.cjs";
const temporary = (t) => {
  const dir = mkdtempSync(join(tmpdir(), "fg-vault-security-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
// A fake OS service, not a claim that base64 provides encryption. Real macOS
// Keychain round trips are checked separately in the installed desktop app.
const keychain = () => ({
  isAsyncEncryptionAvailable: async () => true,
  encryptStringAsync: async (value) => Buffer.from("os-test:" + value),
  decryptStringAsync: async (value) => {
    if (!value.toString().startsWith("os-test:"))
      throw Error("Keychain denied access");
    return { result: value.toString().slice(8), shouldReEncrypt: false };
  },
});
test("Keychain migration preserves every record and removes the legacy key only after verification", async (t) => {
  const dir = temporary(t);
  let store = createStore(dir);
  store.put("config", "plaid", { secret: "synthetic-private-value" });
  store.put("preferences", "dashboard", { profileName: "Test" });
  store.close();
  const original = readFileSync(join(dir, "vault.key"));
  const key = await loadVaultKey(dir, keychain(), "darwin");
  assert.deepEqual(key, original);
  assert.equal(existsSync(join(dir, "vault.key")), false);
  assert.equal(statSync(join(dir, "vault.key.os")).mode & 0o777, 0o600);
  assert.deepEqual(await loadVaultKey(dir, keychain(), "darwin"), key);
  store = createStore(dir, { key });
  assert.equal(store.get("config", "plaid").secret, "synthetic-private-value");
  assert.equal(store.get("preferences", "dashboard").profileName, "Test");
  store.close();
  assert.throws(() => createStore(dir), /desktop app/);
});
test("unavailable or corrupt Keychain never falls back or replaces an existing key", async (t) => {
  const dir = temporary(t),
    legacy = randomBytes(32),
    file = join(dir, "vault.key");
  writeFileSync(file, legacy);
  await assert.rejects(
    loadVaultKey(
      dir,
      { ...keychain(), isAsyncEncryptionAvailable: async () => false },
      "darwin",
    ),
    /Unlock/,
  );
  assert.deepEqual(readFileSync(file), legacy);
  await assert.rejects(
    loadVaultKey(
      dir,
      {
        ...keychain(),
        decryptStringAsync: async () => ({ result: "0".repeat(64) }),
      },
      "darwin",
    ),
    /verification/,
  );
  assert.deepEqual(readFileSync(file), legacy);
  assert.equal(existsSync(join(dir, "vault.key.os")), false);
  writeFileSync(join(dir, "vault.key.os"), "corrupt");
  await assert.rejects(loadVaultKey(dir, keychain(), "darwin"), /denied/);
  assert.deepEqual(readFileSync(file), legacy);
  await assert.rejects(loadVaultKey(dir, keychain(), "linux"), /macOS/);
});
test("new protected vaults never create plaintext keys; lost keys fail closed", async (t) => {
  const dir = temporary(t),
    key = await loadVaultKey(dir, keychain(), "darwin");
  assert.equal(existsSync(join(dir, "vault.key")), false);
  const store = createStore(dir, { key });
  store.put("item", "a", { id: "a" });
  store.close();
  unlinkSync(join(dir, "vault.key.os"));
  await assert.rejects(
    loadVaultKey(dir, keychain(), "darwin"),
    /missing its key/,
  );
  assert.throws(() => createStore(dir), /Missing vault key/);
  assert.equal(existsSync(join(dir, "vault.key")), false);
});
test("legacy ciphertext upgrades atomically and record substitution fails authentication", (t) => {
  const dir = temporary(t),
    key = randomBytes(32),
    path = join(dir, "finance.sqlite");
  writeFileSync(join(dir, "vault.key"), key);
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify({ id: "a", amount: 100 })),
    cipher.final(),
  ]);
  let db = new DatabaseSync(path);
  db.exec(
    "CREATE TABLE records(kind TEXT,id TEXT,value TEXT,PRIMARY KEY(kind,id))",
  );
  db.prepare("INSERT INTO records VALUES(?,?,?)").run(
    "account",
    "a",
    Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64"),
  );
  db.close();
  let store = createStore(dir);
  assert.equal(store.get("account", "a").amount, 100);
  store.close();
  db = new DatabaseSync(path);
  const value = db.prepare("SELECT value FROM records").get().value;
  assert.match(value, /^v2:/);
  db.prepare("INSERT INTO records VALUES(?,?,?)").run("config", "plaid", value);
  db.close();
  assert.throws(() => createStore(dir), /authentication failed/);
  db = new DatabaseSync(path);
  db.prepare("DELETE FROM records WHERE kind='config'").run();
  db.close();
  store = createStore(dir);
  assert.equal(store.get("account", "a").amount, 100);
  store.close();
});
