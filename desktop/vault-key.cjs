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

// No plaintext fallback: a locked/unavailable Keychain must never create a new
// identity for an existing vault. Keep legacy keys until round-trip verification.
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
    if (!/^[a-f0-9]{64}$/.test(text))
      throw new Error(
        "Invalid protected vault key. Restore your private backup; do not delete the vault.",
      );
    return Buffer.from(text, "hex");
  };
  async function persist(key) {
    const encrypted = await safeStorage.encryptStringAsync(key.toString("hex"));
    const check = decode(
      (await safeStorage.decryptStringAsync(encrypted)).result,
    );
    if (!timingSafeEqual(key, check))
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
      const saved = decode(
        (await safeStorage.decryptStringAsync(readFileSync(protectedPath)))
          .result,
      );
      if (!timingSafeEqual(key, saved))
        throw new Error("Protected vault key verification failed.");
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
  let key;
  if (existsSync(protectedPath)) {
    chmodSync(protectedPath, 0o600);
    const decrypted = await safeStorage.decryptStringAsync(
      readFileSync(protectedPath),
    );
    key = decode(decrypted.result);
    if (decrypted.shouldReEncrypt) await persist(key);
    if (
      existsSync(legacyPath) &&
      !timingSafeEqual(key, readFileSync(legacyPath))
    )
      throw new Error(
        "Conflicting vault keys. Restore a matching private backup; neither key was deleted.",
      );
  } else {
    if (existsSync(legacyPath)) key = readFileSync(legacyPath);
    else {
      if (existsSync(join(dir, "finance.sqlite")))
        throw new Error(
          "This vault is missing its key. Restore a matching private backup; do not create a replacement key.",
        );
      key = randomBytes(32);
    }
    if (key.length !== 32)
      throw new Error("Invalid vault key. Your original file was preserved.");
    await persist(key);
  }
  if (existsSync(legacyPath)) unlinkSync(legacyPath);
  return key;
}
module.exports = { loadVaultKey };
