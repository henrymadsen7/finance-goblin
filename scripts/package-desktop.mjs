import { packager } from "@electron/packager";
import { rebuild } from "@electron/rebuild";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  renameSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { homedir } from "node:os";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = manifest.devDependencies.electron;
if (process.platform !== "darwin" || process.arch !== "arm64")
  throw new Error(
    "Desktop packaging currently supports Apple Silicon macOS only.",
  );
const stage = join(root, ".local/desktop-stage");
const output = join(homedir(), "Library/Caches/Finance Goblin/Build");
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true, mode: 0o700 });
for (const dir of ["dist", "server", "public", "desktop", "shared"])
  cpSync(join(root, dir), join(stage, dir), { recursive: true });
cpSync(join(root, "README.md"), join(stage, "README.md"));
for (const file of [
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "package-lock.json",
])
  cpSync(join(root, file), join(stage, file));
cpSync(join(root, "docs"), join(stage, "docs"), { recursive: true });
cpSync(
  join(root, "THIRD_PARTY_NOTICES.md"),
  join(stage, "THIRD_PARTY_NOTICES.md"),
);
writeFileSync(
  join(stage, "package.json"),
  JSON.stringify({
    ...manifest,
    name: "finance-goblin",
    productName: "Finance Goblin",
    version: manifest.version,
    description: "Your private personal-finance desktop workspace",
    author: manifest.author,
    license: manifest.license,
    private: true,
    type: "module",
    main: "desktop/main.cjs",
    dependencies: manifest.dependencies,
    overrides: manifest.overrides,
  }),
);
console.log("Installing bundled runtime dependencies…");
execFileSync(
  "npm",
  ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
  { cwd: stage, stdio: "inherit" },
);
console.log("Building Actual’s native SQLite module for Electron…");
await rebuild({
  buildPath: stage,
  electronVersion: version,
  arch: "arm64",
  onlyModules: ["better-sqlite3"],
  force: true,
});
const assets = join(root, ".local/desktop-assets");
mkdirSync(assets, { recursive: true });
const png = join(assets, "icon.png");
execFileSync("/usr/bin/swift", [join(root, "desktop/create-icon.swift"), png], {
  stdio: "inherit",
});
cpSync(png, join(stage, "desktop/icon.png"));
const iconset = join(assets, "FinanceGoblin.iconset");
mkdirSync(iconset, { recursive: true });
for (const size of [16, 32, 128, 256, 512])
  for (const scale of [1, 2])
    execFileSync(
      "/usr/bin/sips",
      [
        "-z",
        String(size * scale),
        String(size * scale),
        png,
        "--out",
        join(iconset, `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`),
      ],
      { stdio: "ignore" },
    );
const icon = join(assets, "FinanceGoblin.icns");
execFileSync("/usr/bin/iconutil", ["-c", "icns", iconset, "-o", icon]);
console.log("Packaging the standalone Mac application…");
const result = await packager({
  dir: stage,
  out: output,
  name: "Finance Goblin",
  platform: "darwin",
  arch: "arm64",
  electronVersion: version,
  appBundleId: "com.basedagent.finance-goblin",
  appCategoryType: "public.app-category.finance",
  appVersion: "1.0.0",
  buildVersion: "1",
  icon,
  overwrite: true,
  asar: false,
  prune: false,
  extendInfo: {
    NSMicrophoneUsageDescription:
      "Record a voice message for local transcription in the assistant. Audio is not saved.",
    NSHumanReadableCopyright: "Finance Goblin · basedagent",
    NSHighResolutionCapable: true,
    NSRequiresAquaSystemAppearance: false,
    NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
  },
  quiet: false,
});
const bundle = join(result[0], "Finance Goblin.app");
// Remove Finder's icon metadata from our newly generated bundle before signing.
// Preserve quarantine and every other security-related attribute.
try {
  execFileSync("/usr/bin/xattr", ["-d", "com.apple.FinderInfo", bundle], {
    stdio: "ignore",
  });
} catch {}
try {
  execFileSync("/usr/bin/xattr", ["-d", "com.apple.ResourceFork", bundle], {
    stdio: "ignore",
  });
} catch {}

execFileSync(
  "/usr/bin/codesign",
  ["--force", "--deep", "--sign", "-", bundle],
  { stdio: "inherit" },
);
execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", bundle], {
  stdio: "inherit",
});
console.log(`Built: ${bundle}`);
if (process.argv.includes("--install")) {
  const target = join(homedir(), "Applications/Finance Goblin.app");
  if (existsSync(target)) {
    if (!process.argv.includes("--replace"))
      throw new Error(
        "Quit Finance Goblin, then install again with --install --replace to update it. Your vault is stored separately.",
      );
    const id = execFileSync(
      "/usr/bin/plutil",
      [
        "-extract",
        "CFBundleIdentifier",
        "raw",
        "-o",
        "-",
        join(target, "Contents/Info.plist"),
      ],
      { encoding: "utf8" },
    ).trim();
    if (id !== "com.basedagent.finance-goblin")
      throw new Error(
        "Refusing to replace an application with a different bundle identifier.",
      );
    let running = false;
    try {
      execFileSync(
        "/usr/bin/pgrep",
        ["-f", "^" + target + "/Contents/MacOS/Finance Goblin"],
        { stdio: "ignore" },
      );
      running = true;
    } catch {}
    if (running)
      throw new Error(
        "Quit Finance Goblin with Command-Q before installing the update.",
      );
    const previous = join(output, "Previous-" + Date.now() + ".app");
    renameSync(target, previous);
    console.log(`Previous build preserved: ${previous}`);
  }
  mkdirSync(dirname(target), { recursive: true });
  cpSync(bundle, target, { recursive: true, verbatimSymlinks: true });
  try {
    execFileSync("/usr/bin/xattr", ["-d", "com.apple.FinderInfo", target], {
      stdio: "ignore",
    });
  } catch {}
  execFileSync(
    "/usr/bin/codesign",
    ["--verify", "--deep", "--strict", target],
    { stdio: "inherit" },
  );

  console.log(`Installed: ${target}`);
}
