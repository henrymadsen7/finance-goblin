# Security policy

## Reporting

Use [GitHub private vulnerability reporting](https://github.com/henrymadsen7/finance-goblin/security/advisories/new) when enabled. If that option is unavailable, open an issue asking for a private reporting channel without disclosing the vulnerability. Do not attach a vault, key, bank export, real transaction, OAuth ticket, credential, or unredacted log. There is no guaranteed response time or bug-bounty program.

## Supported versions

This is a development preview. Security fixes target the current default branch. No independently audited or notarized public release is available yet.

## Trust model

The desktop app is intended for one person using a trusted operating-system account. Its renderer is sandboxed and isolated from Node. A per-launch HttpOnly session gates the loopback API; short-lived browser sessions are limited to bank authorization. Host, origin, CSRF and framing checks reduce exposure to ordinary hostile websites.

Desktop records use AES-256-GCM with record identity authenticated as additional data. The random vault key is wrapped with Electron’s asynchronous OS encryption API using macOS Keychain; `vault.key.os` contains only the wrapped key. Existing plaintext key files are removed only after verified, atomic migration. The app refuses to open a protected vault without Keychain and never generates a replacement key for an existing database. Browser development uses an owner-only local key and a private launch session; real Plaid connections require the desktop app.

There is no application passcode, Touch ID gate, independent penetration test or guarantee against account compromise. Malware, an unlocked app, administrative access, malicious builds/dependencies, and provider compromise remain risks. Enable full-disk encryption, keep the OS/app updated, and lock the computer. Recovery requires the matching vault **and** macOS Keychain identity; copying the vault directory alone is not a portable backup. See [security model and recovery](docs/SECURITY_MODEL.md).

Plaid and an optional Actual server receive the data needed for their configured integrations. No analytics or cloud database is included. Hide amounts is visual masking; it is not data deletion and does not sanitize exports. Developer browser mode has a weaker storage boundary than desktop and should be used with synthetic data. Never share a launch or bank-handoff URL. Each person must use a separate local installation/OS account and their own Plaid credentials; do not expose this service publicly or use it as a hosted multi-user backend.

The app cannot initiate a payment, transfer, trade, or AutoPay enrollment. Payment dates are user-entered plans, not verified payment status. Provider updates and balances can lag the bank.

## Before sharing anything

Review screenshots and logs manually. Never upload `.local`, the operating-system application-data folder, `vault.key`, `vault.key.os`, database files, environment files, certificate keys, CSV exports or calendar exports. If a secret is exposed, revoke it at its issuer; removing a Git commit is not sufficient.
