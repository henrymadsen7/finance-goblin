const { randomBytes, timingSafeEqual } = require("node:crypto");
const { join } = require("node:path");
const {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  openSync,
  fsyncSync,
  closeSync,
  chmodSync,
} = require("node:fs");

// A verified OS-protected recovery envelope precedes database re-keying. Keep
// both keys until the database transaction commits, then retire the old key.
async function loadVaultKey(dir, safeStorage, platform = process.platform) {
  if (platform !== "darwin")
    throw new Error(
      "Protected desktop vaults currently require macOS Keychain.",
    );
  if (!(await safeStorage.isAsyncEncryptionAvailable()))
    throw new Error(
      "Unlock macOS Keychain and reopen Finance Goblin. Your vault has not been changed.",
    );
  const protectedPath = join(dir, "vault.key.os"),
    legacyPath = join(dir, "vault.key");
  const decode = (text) => {
    if (typeof text !== "string" || !/^[a-f0-9]{64}$/.test(text))
      throw new Error(
        "Invalid protected vault key. Restore your private backup; do not delete the vault.",
      );
    return Buffer.from(text, "hex");
  };
  async function persist(envelope) {
    const plaintext = JSON.stringify(envelope);
    const encrypted = await safeStorage.encryptStringAsync(plaintext);
    if ((await safeStorage.decryptStringAsync(encrypted)).result !== plaintext)
      throw new Error(
        "Keychain verification failed. Your existing vault key was preserved.",
      );
    const temporary =
      protectedPath + "." + randomBytes(8).toString("hex") + ".tmp";
    try {
      writeFileSync(temporary, encrypted, { mode: 0o600, flag: "wx" });
      const fd = openSync(temporary, "r");
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, protectedPath);
      const directory = openSync(dir, "r");
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
      if (
        (await safeStorage.decryptStringAsync(readFileSync(protectedPath)))
          .result !== plaintext
      )
        throw new Error("Protected vault key verification failed.");
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
  let envelope,
    oldKey,
    rotateProvider = false;
  if (existsSync(protectedPath)) {
    chmodSync(protectedPath, 0o600);
    const decrypted = await safeStorage.decryptStringAsync(
      readFileSync(protectedPath),
    );
    rotateProvider = decrypted.shouldReEncrypt;
    if (/^[a-f0-9]{64}$/.test(decrypted.result))
      oldKey = decode(decrypted.result);
    else {
      try {
        envelope = JSON.parse(decrypted.result);
      } catch {
        throw new Error(
          "Invalid protected vault key envelope. Restore a matching private backup.",
        );
      }
      if (envelope?.version !== 2)
        throw new Error("Unsupported protected vault key format.");
      decode(envelope.key);
      if (envelope.previousKey !== undefined) decode(envelope.previousKey);
    }
  } else if (existsSync(legacyPath)) {
    oldKey = readFileSync(legacyPath);
    if (oldKey.length !== 32)
      throw new Error("Invalid vault key. Your original file was preserved.");
  } else if (existsSync(join(dir, "finance.sqlite"))) {
    throw new Error(
      "This vault is missing its key. Restore a matching private backup; do not create a replacement key.",
    );
  }
  if (!envelope) {
    envelope = {
      version: 2,
      key: randomBytes(32).toString("hex"),
      ...(oldKey ? { previousKey: oldKey.toString("hex") } : {}),
    };
    await persist(envelope);
  } else if (rotateProvider) await persist(envelope);
  const key = decode(envelope.key),
    previousKey = envelope.previousKey
      ? decode(envelope.previousKey)
      : undefined;
  if (existsSync(legacyPath)) {
    const legacy = readFileSync(legacyPath);
    if (
      legacy.length !== 32 ||
      ![key, previousKey]
        .filter(Boolean)
        .some((k) => timingSafeEqual(k, legacy))
    )
      throw new Error(
        "Conflicting vault keys. Restore a matching private backup; neither key was deleted.",
      );
  }
  return {
    key,
    previousKey,
    // Call ONLY after opening/authenticating/re-keying every database record in
    // one committed transaction. Before this, the envelope permits crash recovery.
    async finalize() {
      if (previousKey) await persist({ version: 2, key: key.toString("hex") });
      if (existsSync(legacyPath)) unlinkSync(legacyPath);
      previousKey?.fill(0);
    },
  };
}
module.exports = { loadVaultKey };
