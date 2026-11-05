# Contributing

Finance Goblin is a local personal-finance desktop app. Use generated sample data for development, screenshots, bug reports, and tests. Never contribute a real vault, bank export, API key, account identifier, access token, or screenshot of someone's finances.

## Development

Use Node.js 24 and npm. Run these commands from the application directory:

```sh
npm ci
npm run dev
```

The development browser uses its own `.local` directory. Do not point tests or development processes at a real desktop vault. Quit the desktop app before development to free port 4310. For desktop development, run `npm run build` followed by `npm run desktop`.

Before a pull request:

```sh
npm run check
npm test
npm run build
npm run check:source
npm audit
```

Tests use temporary directories and fake providers; they require no real bank credentials. Add meaningful tests when changing financial calculations, provider normalization, storage, authorization, or date logic. UI changes should include a screenshot using sample data and a short account of keyboard and narrow-window checks.

## Design and financial rules

- Use integer cents, explicit currencies, and the existing scope helpers. Do not count transfers or pending activity in posted spending.
- Preserve unknown balances. Available credit is not cash. A current card balance is not the statement amount due.
- Use the existing palette variables, semantic controls, accessible names, and reduced-transparency fallbacks.
- Keep provider secrets in the local service. Do not add telemetry, remote rendering, or public network listeners without an explicit design discussion.
- Preserve pagination atomicity, consent boundaries, and failure visibility. Never silently replace real data with sample data.

Keep pull requests focused. Describe the concrete behavior change and validation. Contributions to this standalone application are provided under its MIT license; preserve third-party notices. Report vulnerabilities through [the security policy](SECURITY.md), rather than a public issue.
