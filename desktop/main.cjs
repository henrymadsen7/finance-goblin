const {
  app,
  BrowserWindow,
  Menu,
  session,
  shell,
  dialog,
  nativeImage,
  safeStorage,
} = require("electron");
const { randomBytes } = require("node:crypto");
const { join, resolve } = require("node:path");
const {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
} = require("node:fs");
const { pathToFileURL } = require("node:url");
app.setName("Finance Goblin");
const isPrimary = app.requestSingleInstanceLock();
if (!isPrimary) app.quit();
let window, service, origin, appSession;
const root = resolve(__dirname, "..");
const userData = app.getPath("userData");
const dataDir = join(userData, "vault");
const preferencesPath = join(userData, "window.json");
let saved = {};
try {
  saved = JSON.parse(readFileSync(preferencesPath, "utf8"));
} catch {}
function safeExternal(value) {
  try {
    const url = new URL(value);
    if (url.origin === origin)
      return (
        url.pathname === "/desktop/bank-authorize" &&
        /^[a-f0-9]{64}$/.test(url.searchParams.get("ticket") || "")
      );
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
function openExternal(value) {
  if (safeExternal(value)) void shell.openExternal(value);
}
function sendAction(action) {
  if (window && !window.isDestroyed())
    window.webContents.send("finance:action", action);
}
function createWindow() {
  if (window && !window.isDestroyed()) {
    window.show();
    window.focus();
    return;
  }
  const dimensions = {
    width: Math.max(1024, Math.min(saved.width || 1440, 2000)),
    height: Math.max(700, Math.min(saved.height || 1000, 1400)),
  };
  window = new BrowserWindow({
    ...dimensions,
    minWidth: 980,
    minHeight: 680,
    title: "Finance Goblin",
    backgroundColor: "#101310",
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 20 },
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      partition: "finance-goblin",
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  window.on("ready-to-show", () => window.show());
  window.on("resize", () => {
    if (window && !window.isDestroyed() && !window.isFullScreen()) {
      const b = window.getBounds();
      writeFileSync(
        preferencesPath,
        JSON.stringify({ width: b.width, height: b.height }),
        { mode: 0o600 },
      );
    }
  });
  window.on("closed", () => (window = null));
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== origin) {
      event.preventDefault();
      openExternal(url);
    }
  });
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.webContents.on(
    "did-fail-load",
    (_, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3)
        dialog.showErrorBox(
          "Finance Goblin could not open",
          "The local workspace could not load. Quit and reopen the app. If local HTTPS was enabled, check that its certificate is trusted.",
        );
    },
  );
  void window.loadURL(origin);
}
function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Finance Goblin",
        submenu: [
          { role: "about" },
          { type: "separator" },
          {
            label: "Settings…",
            accelerator: "CmdOrCtrl+,",
            click: () => {
              createWindow();
              sendAction("settings");
            },
          },
          {
            label: "Hide amounts",
            accelerator: "CmdOrCtrl+Shift+H",
            click: () => sendAction("hide-amounts"),
          },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      { role: "editMenu" },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      { role: "windowMenu" },
      {
        role: "help",
        submenu: [
          {
            label: "Setup and privacy guide",
            click: () => void shell.openPath(join(root, "README.md")),
          },
          {
            label: "Open local data folder",
            click: () => void shell.openPath(userData),
          },
          {
            label: "Plaid dashboard",
            click: () => openExternal("https://dashboard.plaid.com/"),
          },
        ],
      },
    ]),
  );
}
app.on("second-instance", () => {
  if (app.isReady()) createWindow();
});
app.on("activate", () => {
  if (app.isReady() && service) createWindow();
});
app.on("before-quit", () => {
  service?.stopService();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
if (isPrimary)
  app.whenReady().then(async () => {
    try {
      mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      chmodSync(userData, 0o700);
      const icon = join(__dirname, "icon.png");
      if (existsSync(icon)) app.dock?.setIcon(nativeImage.createFromPath(icon));
      const token = randomBytes(32).toString("hex");
      const tls = existsSync(join(dataDir, "https.enabled"));
      process.env.PORT = "4310";
      process.env.FINANCE_DATA_DIR = dataDir;
      const { loadVaultKey } = require("./vault-key.cjs");
      const vaultKey = await loadVaultKey(dataDir, safeStorage);
      const { configureRuntime } = await import(
        pathToFileURL(join(root, "server/runtime.js")).href
      );
      configureRuntime({
        vaultKey,
        desktopSecret: token,
        keyProtection: "macos-keychain",
      });
      delete process.env.FINANCE_DESKTOP_SESSION;
      if (tls) {
        process.env.LOCAL_TLS_CERT = join(dataDir, "certs/localhost.pem");
        process.env.LOCAL_TLS_KEY = join(dataDir, "certs/localhost-key.pem");
      }
      origin = `${tls ? "https" : "http"}://localhost:4310`;
      service = await import(pathToFileURL(join(root, "server/index.js")).href);
      await new Promise((resolve, reject) => {
        if (service.httpServer.listening) return resolve();
        service.httpServer.once("listening", resolve);
        service.httpServer.once("error", reject);
      });
      appSession = session.fromPartition("finance-goblin");
      appSession.setPermissionRequestHandler((contents, permission, callback) =>
        callback(false),
      );
      appSession.setPermissionCheckHandler(() => false);
      appSession.webRequest.onHeadersReceived((details, callback) => {
        if (details.url.startsWith(origin + "/"))
          callback({
            responseHeaders: {
              ...details.responseHeaders,
              "Content-Security-Policy": [
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
              ],
            },
          });
        else callback({});
      });
      await appSession.cookies.set({
        url: origin,
        name: "fg-desktop",
        value: token,
        httpOnly: true,
        secure: tls,
        sameSite: "strict",
        path: "/",
      });
      const { desktopEvents } = await import(
        pathToFileURL(join(root, "server/desktop-access.js")).href
      );
      desktopEvents.on("bank-linked", () => {
        createWindow();
        sendAction("bank-linked");
        app.dock?.bounce("informational");
      });
      app.setAboutPanelOptions({
        applicationName: "Finance Goblin",
        applicationVersion: "1.0.0",
        version: "Desktop",
        copyright: "Finance Goblin · basedagent",
        iconPath: icon,
      });
      buildMenu();
      createWindow();
    } catch (error) {
      dialog.showErrorBox(
        "Finance Goblin could not start",
        error.code === "EADDRINUSE"
          ? "Another application is using the local finance service. Quit the older Finance Goblin server and reopen this app."
          : String(
              error.message || "Unable to start the private local workspace.",
            ),
      );
      app.quit();
    }
  });
