const { contextBridge, ipcRenderer } = require("electron");
const allowed = new Set([
  "connections",
  "hide-amounts",
  "bank-linked",
  "settings",
]);
contextBridge.exposeInMainWorld(
  "financeDesktop",
  Object.freeze({
    onAction(callback) {
      if (typeof callback !== "function") return () => {};
      const listener = (_event, action) => {
        if (allowed.has(action)) callback(action);
      };
      ipcRenderer.on("finance:action", listener);
      return () => ipcRenderer.removeListener("finance:action", listener);
    },
  }),
);
