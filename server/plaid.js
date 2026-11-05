import { normalizePlaid } from "./domain.js";
export class ProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
// Desktop bank authorization runs in the user's full browser. Plaid's web
// popup flow does not require a custom redirect (unlike embedded mobile flows).
export function linkTokenParams(config, item, { desktop = false } = {}) {
  return {
    user: { client_user_id: "finance-goblin-local-owner" },
    client_name: "Finance Goblin",
    country_codes: ["US"],
    language: "en",
    ...(!desktop && config?.redirectUri
      ? { redirect_uri: config.redirectUri }
      : {}),
    ...(item
      ? { access_token: item.accessToken }
      : { products: ["transactions"] }),
  };
}
export async function plaid(config, path, body) {
  if (!config)
    throw new ProviderError(
      "NOT_CONFIGURED",
      "Add your Plaid API credentials in Connections first.",
    );
  const host = config.environment === "production" ? "production" : "sandbox";
  const response = await fetch(`https://${host}.plaid.com/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      secret: config.secret,
      ...body,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) {
    const messages = {
      ITEM_LOGIN_REQUIRED:
        "Your bank needs you to reconnect. Choose Reconnect in Connections.",
      PRODUCT_NOT_READY:
        "Your bank is preparing transaction history. Try syncing again shortly.",
      INSTITUTION_REGISTRATION_REQUIRED:
        "Enable this institution’s OAuth access in your Plaid dashboard.",
      UNAUTHORIZED_INSTITUTION:
        "Your Plaid plan does not have access to this bank yet.",
      INVALID_API_KEYS:
        "Plaid rejected these API credentials. Check the environment and keys.",
    };
    throw new ProviderError(
      result.error_code,
      result.error_code === "INVALID_FIELD" &&
        /OAuth redirect URI/i.test(result.error_message || "")
        ? "Add the app’s exact OAuth redirect URL under Build → API → Allowed redirect URIs in your Plaid dashboard, then try again."
        : messages[result.error_code] ||
            "The bank provider could not complete this request. Try again or check your Plaid dashboard.",
    );
  }
  return result;
}
export async function syncItem(
  store,
  item,
  request = (path, body) => plaid(store.get("config", "plaid"), path, body),
) {
  const start = item.cursor || "";
  for (let attempt = 0; attempt < 3; attempt++) {
    let cursor = start,
      hasMore = true;
    const added = [],
      modified = [],
      removed = [];
    try {
      while (hasMore) {
        const page = await request("transactions/sync", {
          access_token: item.accessToken,
          cursor,
          count: 500,
        });
        added.push(...page.added);
        modified.push(...page.modified);
        removed.push(...page.removed);
        cursor = page.next_cursor;
        hasMore = page.has_more;
      }
      const balances = await request("accounts/get", {
        access_token: item.accessToken,
      });
      store.batch(() => {
        for (const t of [...added, ...modified]) {
          if (t.pending_transaction_id)
            store.remove("transaction", t.pending_transaction_id);
          store.put("transaction", t.transaction_id, {
            ...normalizePlaid(t),
            itemId: item.id,
          });
        }
        for (const t of removed) store.remove("transaction", t.transaction_id);
        for (const a of balances.accounts)
          store.put("account", a.account_id, {
            id: a.account_id,
            itemId: item.id,
            name: a.name,
            institution: item.institution,
            mask: a.mask,
            type: a.type,
            balance:
              a.balances.current === null
                ? null
                : Math.round(a.balances.current * 100),
            available:
              a.balances.available == null
                ? null
                : Math.round(a.balances.available * 100),
            currency:
              a.balances.iso_currency_code ||
              a.balances.unofficial_currency_code ||
              null,
            source: "plaid",
            asOf: new Date().toISOString(),
          });
        store.put("item", item.id, {
          ...item,
          cursor,
          lastSync: new Date().toISOString(),
          error: null,
        });
      });
      return;
    } catch (e) {
      if (
        e.code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" &&
        attempt < 2
      )
        continue;
      store.put("item", item.id, {
        ...item,
        error: e.message,
        errorCode: e.code || "SYNC_FAILED",
      });
      throw e;
    }
  }
}
