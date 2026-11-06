import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

test("source guard rejects tracked secrets and data while leaving ignored local files unread", (t) => {
  const root = mkdtempSync(join(tmpdir(), "fg-source-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "scripts"));
  cpSync(
    new URL("../scripts/check-source.mjs", import.meta.url),
    join(root, "scripts/check-source.mjs"),
  );
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  writeFileSync(join(root, ".gitignore"), ".local/\n");
  mkdirSync(join(root, ".local"));
  writeFileSync(join(root, ".local/vault.key"), "local-only");
  writeFileSync(join(root, "README.md"), "Synthetic project data only");
  execFileSync("git", ["add", "."], { cwd: root });
  const check = () =>
    spawnSync(process.execPath, ["scripts/check-source.mjs"], {
      cwd: root,
      encoding: "utf8",
    });
  assert.equal(check().status, 0);
  for (const [path, content] of [
    ["leak.txt", "ghp_" + "A".repeat(36)],
    ["statement.csv", "date,payee,amount"],
    ["tls.pem", "synthetic certificate"],
    ["vault.key.os", "synthetic wrapped key"],
    ["leak.txt", ["", "Users", "someone", "private"].join("/")],
  ]) {
    writeFileSync(join(root, path), content);
    execFileSync("git", ["add", "--force", path], { cwd: root });
    const result = check();
    assert.equal(result.status, 1, path);
    assert.ok(result.stderr.includes(path));
    assert.ok(!result.stderr.includes(content), "never print matching content");
    execFileSync("git", ["rm", "--cached", "--force", path], { cwd: root });
    rmSync(join(root, path));
  }
});
