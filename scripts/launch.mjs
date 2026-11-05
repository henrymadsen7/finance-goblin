import { spawn, execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  openSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const local = join(root, ".local");
mkdirSync(local, { recursive: true, mode: 0o700 });
const https =
  process.argv.includes("--https") || existsSync(join(local, "https.enabled"));
const url = `${https ? "https" : "http"}://localhost:4310`;
const server = join(root, "server/index.js");
const record = join(local, "server-process.json");
let existing;
try {
  existing = JSON.parse(readFileSync(record, "utf8"));
} catch {}
if (existing) {
  let command = "";
  try {
    command = execFileSync(
      "/bin/ps",
      ["-p", String(existing.pid), "-o", "command="],
      { encoding: "utf8" },
    );
  } catch {}
  if (command.includes(server)) {
    if (process.argv.includes("--stop")) {
      process.kill(existing.pid, "SIGTERM");
      unlinkSync(record);
      console.log("Finance Goblin stopped.");
      process.exit(0);
    }
    if (existing.https === https) {
      console.log(`Finance Goblin is running at ${url}`);
      if (!process.argv.includes("--no-open"))
        spawn("/usr/bin/open", [url], { stdio: "ignore" });
      process.exit(0);
    }
    process.kill(existing.pid, "SIGTERM");
    for (let n = 0; n < 30; n++) {
      try {
        process.kill(existing.pid, 0);
        await new Promise((r) => setTimeout(r, 100));
      } catch {
        break;
      }
    }
  }
}
if (process.argv.includes("--stop")) {
  console.log("No owned Finance Goblin process is running.");
  process.exit(0);
}
const env = { ...process.env, PORT: "4310" };
if (https) {
  env.LOCAL_TLS_CERT = join(local, "certs/localhost.pem");
  env.LOCAL_TLS_KEY = join(local, "certs/localhost-key.pem");
}
const log = openSync(join(local, "server.log"), "a", 0o600);
const child = spawn(process.execPath, [server], {
  cwd: root,
  env,
  detached: true,
  stdio: ["ignore", log, log],
});
child.unref();
writeFileSync(record, JSON.stringify({ pid: child.pid, https }), {
  mode: 0o600,
});
for (let n = 0; n < 40; n++) {
  try {
    process.kill(child.pid, 0);
  } catch {
    throw new Error(
      "The dashboard could not start. Check dashboard/.local/server.log.",
    );
  }
  // TLS readiness is a socket check; browser trust is never bypassed.
  const net = await import("node:net");
  const ready = await new Promise((resolve) => {
    const socket = net.connect(4310, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
  if (ready) {
    console.log(`Finance Goblin is running at ${url}`);
    if (!process.argv.includes("--no-open"))
      spawn("/usr/bin/open", [url], { stdio: "ignore" });
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 100));
}
throw new Error(
  "The local server did not become ready. Check dashboard/.local/server.log.",
);
