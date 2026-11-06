# Release preparation

The GitHub repository is a source preview. Visibility, an MIT license, and passing tests do not imply a security audit or a signed public binary. Keep the repository private until the maintainer completes the public-source review.

## Source release

- Review every tracked file and the entire repository history for credentials, personal identifiers, real financial data, private screenshots and exports. Use `npm run check:source` plus an independent secret scanner such as Gitleaks; pattern scans cannot establish that arbitrary text is non-sensitive.
- Publish only the standalone Finance Goblin application. Its original development workspace also contains private Surf-Finance code with no license grant; that code and history are outside this application's MIT license and must not be exported.
- Verify a fresh checkout with `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm run check:source` and `npm audit`.
- Confirm a new workspace starts with generated sample data and no connected institutions, API keys, personal profile or due dates. Confirm real-account mode is empty before setup.
- Check keyboard navigation, glass/opaque fallbacks, light/dark themes, narrow windows, chart inspectors, and bank/account/category scope.
- Enable private vulnerability reporting if available. Review issue templates, notices, license, repository description and supported platforms.
- Make the repository public only after the owner approves publication. Tag releases deliberately; no workflow automatically publishes binaries or changes visibility.

## Desktop binary release

The current builder supports Apple Silicon macOS only. It compiles the app icon using Swift, rebuilds Actual's native SQLite dependency for Electron and locally signs the bundle. The installed application stores its vault separately from the bundle.

Before distributing a downloadable application, obtain an independent security review, add stable Developer ID signing and notarization, verify Keychain migration/recovery and app identity across updates, verify a fresh Mac installation and upgrade, include licenses, produce checksums and a dependency inventory, and validate OAuth with independent users' own provider accounts. Never bundle a vault or a maintainer's API keys. Do not instruct users to bypass Gatekeeper or certificate warnings. Intel macOS, Windows and Linux installers are not supported or tested yet.

Bank access uses each user's own Plaid account and institution permissions; Sandbox is synthetic. Provider eligibility, limits, billing and OAuth support are controlled by the provider. Actual integration needs an existing user-owned Actual server. A real Actual ledger has not yet been tested in this project.
