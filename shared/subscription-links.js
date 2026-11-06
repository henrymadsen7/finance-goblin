// Links are opened by the user; the app never sends cancellation requests.
export function safeBillingUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !/^(localhost|127\.|0\.|\[?::1\]?)/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}
