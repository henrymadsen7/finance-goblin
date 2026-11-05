import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Inspect tracked application files only; never read a user's local vault.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const prefix = relative(repository, root).split("\\").join("/");
const files = execFileSync("git", ["ls-files", "-z", "--", prefix || "."], {
  cwd: repository,
})
  .toString()
  .split("\0")
  .filter(Boolean);
const blocked =
  /(^|\/)(\.local|node_modules|dist|coverage|\.git)(\/|$)|(^|\/)\.env(\.|$)|\.(sqlite(?:-\w+)?|db(?:-\w+)?|key|pem|p12|pfx|log|ics|csv|tsv|ofx|qfx|qif|dmg|zip)$/i;
const signatures = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\baccess-(?:production|development|sandbox)-[a-f0-9-]{30,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\/Users\/[A-Za-z0-9._-]+\//,
];
const failures = [];
for (const path of files) {
  if (blocked.test(path) && !path.endsWith(".env.example"))
    failures.push(`${path}: private/generated file type`);
  const content = readFileSync(resolve(repository, path));
  if (
    !content.includes(0) &&
    signatures.some((rule) => rule.test(content.toString("utf8")))
  )
    failures.push(`${path}: credential or personal-machine path pattern`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Checked ${files.length} tracked application files; no blocked files or credential patterns found. This is a limited pattern check, not a security audit.`,
  );
