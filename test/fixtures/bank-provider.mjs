// Node --import harness for integration tests. No real credentials or requests.
import { createStore } from "../../server/store.js";
const store = createStore(process.env.FINANCE_DATA_DIR);
store.put("config", "plaid", {
  environment: "sandbox",
  clientId: "synthetic-client",
  secret: "synthetic-secret",
});
for (const id of ["first", "second"])
  store.put("item", id, {
    id,
    accessToken: `synthetic-access-${id}`,
    institution: `Test ${id}`,
    cursor: "",
    lastSync: null,
    error: null,
  });
store.close();
globalThis.fetch = async (value, options) => {
  const url = new URL(value);
  if (url.origin !== "https://sandbox.plaid.com")
    throw Error("Unexpected test network access");
  const body = JSON.parse(options.body);
  let result;
  switch (url.pathname) {
    case "/link/token/create":
      result = { link_token: "synthetic-link-token" };
      break;
    case "/item/public_token/exchange":
      result = { item_id: "new", access_token: "synthetic-access-new" };
      break;
    case "/transactions/sync":
      result = {
        added: [],
        modified: [],
        removed: [],
        next_cursor: "next",
        has_more: false,
      };
      break;
    case "/accounts/get":
      result = { accounts: [] };
      break;
    default:
      throw Error("Unexpected provider operation");
  }
  if (body.secret !== "synthetic-secret") throw Error("Unexpected credential");
  return { ok: true, json: async () => result };
};
