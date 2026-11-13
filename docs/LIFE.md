# Life and Finance workspaces

The desktop application opens a shared entrance with Life and Finance Goblin choices. Workspace switching is available at the lower left. The entrance is optional on subsequent launches. Its procedural SVG scene is local and respects reduced motion.

Life includes Today, Calendar, Projects, School, People, Inbox, Memory and Settings. Tasks share canonical IDs across their project, course, Today and calendar appearances. A task's due date is distinct from a work session. Imported dates remain source records; dragged local work sessions never change an assignment deadline. Calendar deadlines are displayed as date markers; due time and source time zone appear in task details.

## Storage and boundaries

Life and assistant records use separate encrypted SQLite stores under the existing vault's `life/` and `assistant/` directories. In desktop mode, HKDF derives distinct keys from the OS-protected desktop vault key. Legacy-key rotation passes the corresponding previous derived keys through each store before the desktop recovery envelope is finalized. Development uses a separate local directory and local keys. Never point development at a real desktop vault.

All platform routes retain the existing Host/Origin/CSRF checks and private app/browser session. Temporary Plaid browser sessions cannot reach Life or assistant routes. Sharing a UI shell does not merge financial and personal records. The platform currently shares the owner app session and local service; it is not an OS process isolation boundary between workspaces.

## Connect

Settings can preview the owner's existing local Connect database read-only, or accept Connect's JSON export. Import preserves contact IDs, source evidence, notes, conversations, explicit relationships and project memberships. Repeats preserve Life edits; they do not overwrite or continuously synchronize the original database. The original Connect application remains usable.

The optional 2D/3D People graph uses original headline keyword categories and explicit relationship edges. It renders on interaction/resize rather than a perpetual animation loop. The searchable directory provides keyboard access to the same contacts.

## School without API keys

Create a course and capture reviewed assignments from signed-in Canvas/Learning Suite pages. Each capture records source URL, observation time and textual evidence. A preview is required before import. Existing local completion survives re-imports; unpublished, undated or subsequently changed work may be missing. Absence of a submission timestamp is not proof that an assignment was never submitted.

Per-course capture accepts tab-separated title, YYYY-MM-DD, optional HH:MM and type, or a JSON task array. Settings also accepts a version-1 multi-course JSON capture bundle; its schema is implemented in `server/life/school.js`. Titles and exact times are transcribed, never guessed. A blank task time zone means it was not verified. Captures are snapshots, not a live LMS scraper. Ask the authorized computer-use assistant to revisit the source pages when refreshing.

## Calendar and email sources

FullCalendar Standard provides month/week/list views. iCalendar file imports and HTTPS subscriptions expand recurrence over a bounded window (90 days back, 370 days forward), including cancellations and modified instances. HTTPS feeds are fetched server-side with pinned public DNS addresses, bounded redirects, timeouts and response size. Private network feed destinations are rejected. Feed URLs are encrypted and omitted from state responses. Refresh sources in Settings; errors retain the last complete data snapshot.

Google connections require the owner's own Desktop OAuth client with the Gmail/Calendar APIs enabled. Download the Desktop client JSON and use Import Google client JSON in Life Settings (or enter its client ID and secret), save, then authorize Calendar, Gmail, or Drive & Docs separately in the system browser. The flow uses PKCE, expiring one-use state and a loopback callback. Multiple accounts have distinct connection IDs. The app does not inherit credentials from Codex connectors.

Google Calendar refresh reads selected calendars in a bounded date window; Gmail shows the latest 50 inbox messages per account. Email task capture retains the original thread link. These integrations are read-only. No email sending, LMS submission, or provider event mutation is implemented. Disconnect removes local credentials and cached records; review provider access separately to revoke OAuth consent.

## Life appearance

Life Settings includes Midnight, Graphite and Paper presets, independent custom background/panel/text/secondary/accent/border colors, and a corner-radius control. Preview, save, cancel or reset without modifying Finance preferences. Appearance and time-zone updates merge in the encrypted Life settings record.

## Hermes assistant

Each workspace has a separate assistant history, explicitly saved memory, attachment library and local action proposals. It uses an independently installed Hermes runtime at `~/.hermes/hermes-agent` (override with `FINANCE_HERMES_ROOT`). Hermes must be configured for its ChatGPT/Codex subscription provider. Run `hermes model` if sign-in is needed. The initial model is `gpt-6-luna`; Assistant settings can choose another supported ChatGPT/Codex model.

The app never copies OAuth tokens into the browser or its vault. Prompts travel to Hermes via stdin. Hermes resolves its own authentication and sends selected context to the configured model. Workspace data is included only when Share context is checked. Selected attachments and saved workspace memory are included in the turn. Live workspace records use bounded deterministic retrieval. Saved conversation memory combines keyword and optional local semantic retrieval; see [memory storage, source attribution and recall limits](MEMORY.md). Finance sample mode excludes real finance records. USD financial totals are calculated server-side from stored transactions, with amounts labeled as integer cents.

PDF.js extracts text from searchable PDFs (3 MB / 120 pages maximum); scanned PDFs are marked as needing OCR rather than silently treated as readable. PNG/JPEG/WebP images are passed as inline images to the model. Text and Markdown uploads are supported. At most four documents are included per turn. Removing an attachment removes its document search excerpts from future retrieval; historical conversations mentioning it remain saved. Removing a saved fact retires it from recall. Archiving a chat preserves its transcripts and supports restoration.

The adapter disables global Hermes memory, custom plugins, MCP refresh, context-file injection, background review, trajectory persistence, session persistence and provider request-body debug dumps. It checks that no system tools are enabled. Its supported actions are validated, reviewable local task/project/note proposals. Finance remains read-only. Uploaded text cannot grant shell, browser, payment, message-sending or coursework-submission authority. This intentionally does not expose the owner's unrestricted Hermes gateway through the finance app.

## Verification

Run `npm run check`, `npm test`, `npm run build`, `npm run check:source`, and `npm audit`. Tests use temporary stores, synthetic providers and an injected assistant runner. Real inference checks require the owner's installed/authenticated Hermes. Desktop builds continue to use the existing packaging command; user vaults are outside the application bundle.

### Drive & Docs

Connect Drive & Docs in Settings using the existing Desktop OAuth client. The `drive.readonly` scope supports both Drive file listing and Google Docs reads; both APIs must be enabled. Refresh imports the latest 100 non-trashed file metadata records, not the entire Drive. Read document loads Google Docs body text (including tabs) on demand, limited to 200,000 characters. Text is displayed locally and not automatically sent to an assistant. Other file formats open at Google Drive. Disconnect removes the local listing and credentials.

### Assistant Google reads and navigation

With Share Life context enabled, Hermes plans up to four validated read-only Google lookups before answering. Server-side credentials provide Gmail search/body reads (five messages per account), Drive filename search (ten files and at most two Docs previews), explicit synced Docs reads, and upcoming Calendar searches. Document text is bounded per lookup. Results carry source URLs and observation times; errors stay visible as missing evidence. Finance chat and chat without shared context never query Google. The adapter still exposes no shell, unrestricted browser, email sending, or Google mutation authority.

Life tabs, course/project/person details and record editors use browser history and URL identifiers. Mouse back/forward, Cmd+[ / Cmd+], Alt+Left / Alt+Right, and browser history restore those views. Workspace selection also participates in history.

### Chat layout and voice

Both assistants provide a full-page toggle and a keyboard-accessible drag handle at the upper-left corner. Escape restores the floating panel. The composer stays separate from the scrolling conversation.

Use my Life & Google data authorizes relevant workspace records and requested read-only Google lookups for that message; it does not share the screen. Saved workspace memories and selected attachments remain independent.

Speak records microphone audio for at most 60 seconds; Stop transcribes it locally with the installed faster-whisper runtime and cached base model. macOS prompts for microphone permission on first use. Audio is held in memory, never saved or sent to a cloud transcription provider. The transcript becomes an editable draft and is sent to ChatGPT only when the owner presses Send. Discard/closing the panel stops recording. Listen reads a reply using the device speech synthesizer.

### Inline model settings

The model label beside the microphone opens an inline popover for live account model discovery, supported reasoning effort, max answer tokens (256–32,000), and input context budget (4,000–500,000 within the selected model limit). Settings are encrypted and scoped independently to Life and Finance. Apply changes without leaving the chat; they affect the next turn. Hermes retains OAuth credentials. Reasoning goes to the model transport. The ChatGPT subscription transport does not send a generation cap, so max answer tokens is explicitly a local returned-answer cap, not a provider billing or reasoning cap. Input packing uses an o200k token estimate, trims older history and broad snapshots before live evidence, and reserves estimated space for images. Model context windows are reported from the live account catalog and cannot be enlarged by the input budget.

### Chat colors and window movement

Open Ask → Assistant settings → Chat appearance for Glass, White, Black, or custom background/accent colors. Preview immediately, then save to apply the choice to both assistants; text and panel colors adapt automatically.

In the desktop app, drag the empty top edge to move the window from any workspace. Empty areas of the Life header and assistant header also drag the native window; interactive controls retain normal mouse behavior.
