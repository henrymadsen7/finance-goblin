const button = document.getElementById("connect"),
  status = document.getElementById("status"),
  error = document.getElementById("error");
let info, handler;
async function api(path, body) {
  const r = await fetch("/api/" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Finance-CSRF": info.csrf,
    },
    body: JSON.stringify(body || {}),
  });
  const result = await r.json();
  if (!r.ok)
    throw new Error(result.error || "Unable to complete the connection.");
  return result;
}
async function connect(receivedRedirectUri) {
  error.textContent = "";
  button.disabled = true;
  try {
    let token = receivedRedirectUri
      ? sessionStorage.getItem("fg-desktop-link-token")
      : null;
    if (!token) {
      const result = await api("provider/link", { itemId: info.itemId });
      token = result.linkToken;
      sessionStorage.setItem("fg-desktop-link-token", token);
    }
    if (!window.Plaid)
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
        script.onload = resolve;
        script.onerror = () =>
          reject(
            new Error("Could not load Plaid. Check your internet connection."),
          );
        document.head.appendChild(script);
      });
    handler = window.Plaid.create({
      token,
      ...(receivedRedirectUri ? { receivedRedirectUri } : {}),
      onSuccess: async (publicToken, metadata) => {
        try {
          if (info.itemId) await api("sync");
          else {
            const result = await api("provider/exchange", {
              publicToken,
              institution: metadata.institution?.name || "Connected bank",
            });
            if (result.warning) error.textContent = result.warning;
          }
          await api("desktop/link-complete");
          sessionStorage.removeItem("fg-desktop-link-token");
          history.replaceState(null, "", "/desktop-connect");
          status.textContent =
            "Bank connected. Return to the Finance Goblin desktop app; your accounts are ready to explore.";
          button.textContent = "You can close this tab";
          button.disabled = true;
        } catch (e) {
          error.textContent = e.message;
          button.disabled = false;
        } finally {
          handler?.destroy();
        }
      },
      onExit: (err) => {
        if (err)
          error.textContent =
            err.display_message || "The connection was not completed.";
        button.disabled = false;
        handler?.destroy();
      },
    });
    handler.open();
  } catch (e) {
    error.textContent = e.message;
    button.disabled = false;
  }
}
button.addEventListener("click", () => void connect());
try {
  const r = await fetch("/api/desktop/link-info");
  if (!r.ok)
    throw new Error(
      "This authorization session expired. Open Connect a bank again in Finance Goblin.",
    );
  info = await r.json();
  status.textContent =
    "Continue to Plaid to choose your bank and authorize read-only financial access.";
  document.getElementById("environment").textContent =
    info.environment === "sandbox"
      ? "SANDBOX · Test accounts only"
      : "PRODUCTION · Your real financial accounts";
  button.disabled = false;
  if (location.pathname === "/oauth/callback") void connect(location.href);
} catch (e) {
  error.textContent = e.message;
  status.textContent = "Open a new bank connection from the desktop app.";
}
