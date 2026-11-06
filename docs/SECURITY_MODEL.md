# Connection security

Finance Goblin is a single-user, local desktop development preview. These controls reduce specific risks; they are not a certification, penetration test, or promise that an account cannot be hacked.

## What happens when connecting

1. The desktop creates a random, one-use bank handoff valid for 60 seconds. It opens the system browser, keeping the financial dashboard in the app.
2. Plaid Link loads from its official CDN. For supported OAuth institutions, authentication and consent occur at the bank. Finance Goblin does not collect a bank password, MFA code, card PIN or security answer. Review the bank’s address and requested permissions yourself.
3. The local service exchanges the short-lived public token with Plaid over validated HTTPS. Long-lived access tokens and provider secrets never enter the renderer or its browser storage. They remain encrypted locally. Plaid receives the information needed for the integration; local-first does not mean banks and providers receive nothing.
4. The browser gets a separate session valid at most 30 minutes, with its own CSRF token. It can authorize one new connection or reconnect exactly the selected Item. It cannot read financial state, change configuration, disconnect accounts, access another Item or sync the entire workspace. Provider calls are serialized and limited to 12 attempts per session. Completion immediately invalidates the session and clears its cookie.
5. Link requests ask for Transactions, and the provider transport only permits institution lookup, linking, token exchange, transaction/balance retrieval and Item revocation. There are no payment, transfer, trading or AutoPay endpoints. Tokens are still sensitive: stolen tokens together with compromised Plaid credentials could expose financial information. Read-only is not risk-free.

Use **Connections → Disconnect** to revoke a Plaid Item and remove its local account/transaction projection. If a provider request fails, the app retains the connection so revocation can be retried. Bank/Plaid security settings can also be used to revoke consent. Merely uninstalling the app does not revoke remote consent.

## Storage and upgrade safety

- Record values and credentials are encrypted with AES-256-GCM, random nonces and authenticated record kind/ID. IDs, record counts and kinds remain visible in SQLite. Authentication detects modified or substituted ciphertext; it does not prevent a filesystem attacker deleting records or replacing the entire vault with an older valid copy.
- In the supported macOS desktop build, Electron’s asynchronous `safeStorage` API wraps the random vault key using **macOS Keychain**. `vault.key.os` holds the wrapped bytes, not a plaintext copy of the key. Database/key files are mode 0600; the vault directory is mode 0700. This is OS key protection, not a claim that every record or key is in Secure Enclave hardware.
- Upgrades rotate legacy keys instead of reusing them, so a retained development key cannot unlock the current database. They verify encryption/decryption, atomically write and synchronize an OS-protected recovery envelope containing both old and new keys, then authenticate/re-encrypt all records in one SQLite transaction. Secure deletion and database compaction remove retired ciphertext from the active database file. Only after commit and compaction is the recovery envelope replaced with the new key alone and the legacy plaintext `vault.key` removed. Interrupted migrations resume safely using that envelope; finalized desktop vaults reject unbound legacy ciphertext. A missing, locked, invalid or conflicting key stops startup without creating a new key for the old database. New installations never create a plaintext desktop vault key.
- Deleting a legacy file cannot guarantee erasure from SSD snapshots or earlier backups. Treat old backups as sensitive and manage them through your OS backup policy. Financial exports and calendar files are not vault-encrypted.
- The raw key and per-launch desktop secret are passed only in main-process memory. The renderer has no Node access; the Actual child does not receive the vault key or desktop secret through the environment. Plaintext financial data is necessarily present in app memory while in use.

### Recovery and updates

Keep a private, encrypted backup of your application data **and a recoverable matching macOS Keychain/OS account**. A copied `finance.sqlite` plus `vault.key.os` alone is not a portable backup: another Mac/OS identity may be unable to unwrap it. There is no portable password-encrypted vault export or maintainer recovery key yet. If the OS key is lost, restoring a working OS/Keychain backup or reconnecting banks into a separate fresh workspace may be necessary; local-only preferences/annotations may be unrecoverable.

The preview is locally ad-hoc signed. macOS may ask to authorize Keychain access again after a rebuild because the signing identity is not stable. Review the app identity yourself; never disable Keychain checks or bypass Gatekeeper. A public binary needs stable Developer ID signing, notarization and independent upgrade/recovery testing. Do not downgrade a migrated vault to older builds that expect a plaintext key. A vault error is not an instruction to delete files or generate a replacement key.

## Local API and renderer

The service binds only to `127.0.0.1`. Desktop requests require a random per-launch HttpOnly cookie held in an **in-memory** Electron session. Host validation, same-origin fetch checks, per-session CSRF on writes, frame denial, no-store responses and restrictive CSP reduce website-based attacks. The dashboard’s CSP permits local scripts/connections; the isolated bank page additionally allows Plaid’s documented CDN/API endpoints and uses a per-response script nonce. Camera, microphone, geolocation, payment and USB permissions are denied. External app navigation is blocked; approved HTTPS links open in the system browser.

Developer browser mode requires a one-use launch link printed privately in the terminal; it expires after five minutes. It uses a separate `.local` vault with a local plaintext wrapping key, not Keychain, and is intended for synthetic data. Production Plaid configuration and existing Production browser vaults are rejected; real bank linking belongs in the protected desktop app. Do not share launch/handoff URLs, expose the port through tunnels, or bind a modified service publicly.

## Separate users and remaining risks

There is no shared Finance Goblin cloud database or bundled maintainer Plaid secret. Each person uses their own installation, OS account, vault, Plaid account and bank consent. This design provides no tenant authentication, authorization, hosted secret manager or isolation between users sharing one app/OS login. Hosting this code for multiple people requires a separate security architecture and review; a public GitHub repository does not make that safe automatically.

The unlocked app has access to your finances. There is no app passcode, Touch ID gate, background lock or guarantee against malware, administrative access, browser compromise, supply-chain attacks, provider/bank compromise, social engineering or theft of an unlocked computer. Actual server permissions and security are controlled by that server; its API credentials are not scoped by Finance Goblin into a new read-only bank credential. Keep macOS/app dependencies updated, enable FileVault and bank MFA, and lock your computer.

## Validation and maintenance

Automated tests use synthetic data and fake provider calls. Security cases cover unauthenticated API access, Host/origin/CSRF checks, separate browser CSRF secrets, one-use/expired tickets, Item binding, operation ordering/concurrency/replay limits, browser revocation, vault tampering, legacy migrations, key rotation, interrupted rotation recovery, rejection of retained old key copies, lost keys and unavailable Keychain. The installed macOS build must additionally be checked against real Keychain and existing local data. These checks are not a substitute for an independent penetration test.

CI runs checks/tests/build and a known-vulnerability dependency audit on changes and weekly; Dependabot proposes updates. Source pattern checks and maintainer secret scans reduce accidental publication risks but are not exhaustive. Report security concerns through [the private disclosure process](../SECURITY.md).

Implementation references: [Plaid token handling](https://plaid.com/docs/launch-checklist/), [Plaid Link CSP](https://plaid.com/docs/link/web/), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage), [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).
