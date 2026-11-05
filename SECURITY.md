# Security policy

## Reporting

Use [GitHub private vulnerability reporting](https://github.com/henrymadsen7/finance-goblin/security/advisories/new) when enabled. If that option is unavailable, open an issue asking for a private reporting channel without disclosing the vulnerability. Do not attach a vault, key, bank export, real transaction, OAuth ticket, credential, or unredacted log. There is no guaranteed response time or bug-bounty program.

## Supported versions

This is a development preview. Security fixes target the current default branch. No independently audited or notarized public release is available yet.

## Trust model

The desktop app is intended for one person using a trusted operating-system account. Its renderer is sandboxed and isolated from Node. A per-launch HttpOnly session gates the loopback API; short-lived browser sessions are limited to bank authorization. Host, origin, CSRF and framing checks reduce exposure to ordinary hostile websites.

Records use AES-256-GCM with an owner-only key file beside the database. This is encryption at rest, not a hardware-backed keychain or protection from another program running as the same user. Back up both the database and key privately, enable full-disk encryption, and lock the computer. There is no application passcode or Touch ID gate.

Plaid and an optional Actual server receive the data needed for their configured integrations. No analytics or cloud database is included. Hide amounts is visual masking; it is not data deletion and does not sanitize exports. Developer browser mode has a weaker boundary than the desktop session and should be used with synthetic data.

The app cannot initiate a payment, transfer, trade, or AutoPay enrollment. Payment dates are user-entered plans, not verified payment status. Provider updates and balances can lag the bank.

## Before sharing anything

Review screenshots and logs manually. Never upload `.local`, the operating-system application-data folder, `vault.key`, database files, environment files, certificate keys, CSV exports or calendar exports. If a secret is exposed, revoke it at its issuer; removing a Git commit is not sufficient.
