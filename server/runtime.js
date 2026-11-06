// Main-process bootstrap only. Secrets are never put in process.env or IPC.
let settings = {};
export function configureRuntime(value) {
  if (Object.keys(settings).length)
    throw new Error("Runtime already configured.");
  settings = Object.freeze({ ...value });
}
export function runtimeSettings() {
  return settings;
}
