import { cpSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, ".local"),
  target = join(homedir(), "Library/Application Support/Finance Goblin/vault");
if (existsSync(join(target, "finance.sqlite")))
  throw new Error(
    "Desktop vault already exists; refusing to overwrite your finances.",
  );
if (
  !existsSync(join(source, "finance.sqlite")) ||
  !existsSync(join(source, "vault.key"))
) {
  console.log(
    "No legacy vault to migrate. The app will create a fresh workspace.",
  );
  process.exit(0);
}
mkdirSync(target, { recursive: true, mode: 0o700 });
chmodSync(target, 0o700);
for (const name of ["finance.sqlite", "vault.key"]) {
  cpSync(join(source, name), join(target, name));
  chmodSync(join(target, name), 0o600);
}
if (existsSync(join(source, "https.enabled"))) {
  for (const name of ["certs", "https.enabled"])
    cpSync(join(source, name), join(target, name), { recursive: true });
}
console.log(
  "Copied the existing encrypted vault into the desktop workspace. The original is preserved.",
);
