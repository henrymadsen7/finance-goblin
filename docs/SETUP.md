# Connections, data, and privacy

## Bank of America and American Express

Open **Connections → Settings and imports → Set up Plaid**. Obtain keys in your own [Plaid dashboard](https://dashboard.plaid.com/signup); enter secrets in the local app, not chat or source files.

1. Start with Sandbox keys and the Sandbox environment. Use Plaid's test institutions. Sandbox is not a real-bank connection.
2. For real accounts, enable Production/OAuth access for your account and institution in Plaid. Current Trial-plan and institution rules are provider-controlled; see [Plaid Trial](https://support.plaid.com/hc/en-us/articles/39994173227159-What-is-the-Plaid-Trial-plan) and [OAuth setup](https://plaid.com/docs/link/oauth/). Both Bank of America and American Express use OAuth. Account eligibility and successful linking must be verified with your own accounts.
3. The desktop app authorizes through your full browser using Plaid’s [web popup OAuth flow](https://plaid.com/docs/link/oauth/#redirect-uris-and-desktop--mobile-web). It does not send a custom redirect URI and requires no localhost certificate or Plaid callback allowlist. Keep the bank authorization page open until linking finishes. Production access and bank consent are still required.

   The optional standalone browser version retains custom redirects. For that version, allowlist `http://localhost:4310/oauth/callback` for Sandbox; Production custom redirects require trusted HTTPS and `https://localhost:4310/oauth/callback`.

4. Choose **Connect a bank**, authorize at your bank, and return to the app. The browser page reports completion and brings the desktop app forward. Reconnect uses Plaid update mode when consent expires. Disconnect revokes the provider Item and removes its local projection.

### Manual HTTPS setup

The app supports TLS directly. Use a trusted certificate tool such as [mkcert](https://github.com/FiloSottile/mkcert) to create a localhost certificate. Installing a local CA changes your trust store and must be done by the computer owner. Do not bypass browser certificate warnings.

After you have installed and trusted mkcert yourself:

```sh
mkdir -p .local/certs
mkcert -cert-file .local/certs/localhost.pem -key-file .local/certs/localhost-key.pem localhost 127.0.0.1
LOCAL_TLS_CERT="$PWD/.local/certs/localhost.pem" LOCAL_TLS_KEY="$PWD/.local/certs/localhost-key.pem" npm start
```

Stop the HTTP server first. Visit **https://localhost:4310**, allowlist `https://localhost:4310/oauth/callback` in Plaid, and enter that redirect URL in the app. Never commit certificate private keys. The browser development version can be started with the TLS environment above.

### Freshness and synchronization

The dashboard refreshes the local snapshot every minute. The server retrieves available provider updates every 30 minutes while running; **Sync now** also retrieves available updates. The app uses cursor-based `/transactions/sync`, safely retries pagination mutations, atomically commits each Item, processes removals/modifications, and replaces pending transactions when posted records arrive. Balances are retrieved through `/accounts/get` and are not guaranteed real-time. On-demand `/transactions/refresh` is deliberately not called; it is a separately enabled/billed provider product. See [Plaid transaction freshness](https://support.plaid.com/hc/en-us/articles/15373384920599-Do-the-transactions-get-and-transactions-sync-endpoints-provide-real-time-data).

## Actual Budget

Open **Connections → Settings and imports → Connect Actual**. Enter your running Actual server URL, server password, budget **Sync ID** (Settings → Advanced), and encryption password if enabled. Remote servers require HTTPS. Localhost HTTP is permitted.

The connector uses `@actual-app/api` 26.11.0 in an isolated process. It downloads a temporary working copy, reads accounts/categories/payees/transactions/balances, then shuts down the client and removes the temporary directory. A hard process kill or power loss can leave that owner-only temporary cache; the normal success/error paths remove it. FileVault protects local disk contents.

The dashboard does not edit Actual transactions or budgets and does not invoke Actual bank-import methods. Bank imports, account reconciliation and envelope budgeting remain in Actual. Its current budget currency preference determines the imported account currency; if unset, USD is assumed. Actual's `cleared` flag is shown as **uncleared**, never misrepresented as bank-pending status. Starting balances and recognized transfers are excluded from income/expense totals; split parents are excluded and their categorized children are counted once.

If you don't have an Actual server, install one from the [official guide](https://actualbudget.org/docs/install/). No second Actual server was installed by this project.

## CSV

Use **Import CSV → Download CSV template**. Required headers are `date,payee,amount,account`. Optional headers are `category,type,status,reference`.

- Dates: `YYYY-MM-DD`; amounts: signed USD decimals with up to two decimal places. Spending is negative; income is positive.
- `type`: `income`, `expense`, `refund`, or `transfer`. Default is income for positive amounts and expense for negative amounts. Explicitly label refunds and card payments/transfers.
- `status`: `pending` or `posted` (default).
- `reference`: a stable bank transaction ID when available. Deduplication matches date/payee/amount/account/reference. Identical legitimate transactions need distinct references.
- Preview does not write records. Confirmed imports go into your real workspace, even if sample mode was active. Import is capped at 4 MB in the UI and 10,000 rows. CSV-only balances remain **unknown**, not inferred from activity.

Use one source per real account. Importing the same bank via CSV and Plaid/Actual can double count it; cross-provider deduplication is not inferred.

## Financial rules

All internal amounts are integer cents. Green indicates income/refunds, red indicates expenses, yellow indicates pending activity. Pending activity and transfers do not contribute to posted income/expense totals. Refunds reduce expenses. Positive non-income bank inflows are treated as refunds rather than guessed to be salary. Plaid’s broad entertainment category is labeled Entertainment; the app does not infer recurring subscriptions from it. The prior Plaid-only Subscriptions mapping is migrated locally to Entertainment without changing amounts, other providers, or user budget limits. Plaid categorization can be incomplete; review classifications against your statements. This version does not offer transaction recategorization.

Dashboard income, expenses, charts, and monthly budgets aggregate **USD only**. Other currencies remain visible on account cards and are excluded from USD totals. Net position is the sum of known USD balances, with credit/loan liabilities subtracted; this is not a complete net-worth statement when accounts or balances are missing. Balance retrieval time and institution sync failures are shown separately from transaction dates.

## Privacy boundary

- Electron, React, fonts, icons, chart code, data, and service run locally. No analytics. The Plaid script loads from its official CDN only when you choose to connect a bank.
- The server binds to `127.0.0.1`. Host validation, cross-site fetch rejection, CSRF headers on writes, no CORS, frame denial, and no-store responses protect the local API from ordinary website access.
- The desktop vault is `~/Library/Application Support/Finance Goblin/vault/finance.sqlite`. Record values (including credentials and financial data) use AES-256-GCM. The separate wrapping key is `vault.key` in the same directory; both are owner-only files, and the directory is mode 0700. Record IDs/kinds are not encrypted. The key lives on this computer, not in a hardware keychain. Back up both files securely; losing the key makes the vault unreadable.
- `.local`, `.env`, node_modules and build outputs are ignored by Git. Never upload the vault or logs to GitHub. No financial payloads or credentials are intentionally logged.
- The desktop renderer is sandboxed, with context isolation and Node integration disabled. A random per-launch HttpOnly session cookie gates the local API. Browser authorization uses a one-use, 60-second handoff ticket and a separate 30-minute session restricted to bank-link routes; it cannot read your dashboard or edit settings.
- This is a **single-user app for a trusted macOS login**, not a multi-user service. It does not implement Touch ID or a passcode. Other processes running as your user can read the local wrapping key. Enable FileVault and lock your Mac.
- Hide amounts is a visual convenience; it does not remove data from browser memory, accessibility in all chart internals, or CSV exports.

## Architecture and validation

Electron 45 desktop shell with bundled Node 24; React 19 + TypeScript + Vite 8; Three.js lazy-loaded for the 3D cash-flow scene, OrbitControls and raycasting; category spending bars; 2D fallback; Express 5 loopback API; Node built-in SQLite; Zod validation; official Actual client and Plaid HTTP API. No cloud database, telemetry, remote model, or public deployment.

```sh
npm run check
npm test
npm run build
npm audit
```

Tests cover desktop session isolation, scoped bank handoffs and expiry, financial arithmetic, exact CSV parsing/deduplication, vault encryption/rollback, bank-sync pagination/retries/removals/pending replacement, demo isolation, origin/Host/CSRF enforcement, imports, and budgets. Browser checks cover desktop/mobile layout, 3D rendering, filtering/search, navigation and dialogs. Production Plaid linking has been exercised with Bank of America and American Express; other institutions and account types need independent validation. A real Actual budget has not been connected or verified.

## Customize

`desktop/main.cjs`: native lifecycle, menus and window security. `server/desktop-access.js`: desktop and browser session scopes. `public/bank-link.js`: browser OAuth handoff. `src/customization.css`: user palette variables and dashboard modules. `src/theme.css`: base glass palette and responsive overrides. `src/styles.css`: base component layouts. `src/App.tsx`: pages and interactions. `src/Landscape.tsx`: 3D scene. `server/domain.js`: normalization and demo dataset. `server/plaid.js`: provider sync. `server/actual-worker.js`: bounded Actual projection. `server/store.js`: local encrypted records. `server/index.js`: routes, loopback policy, and optional TLS.
