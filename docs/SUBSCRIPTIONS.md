# Subscription tracking

Open **Activity → Subscriptions**. This view analyzes all loaded USD history for the selected bank/account, independently of the ordinary Activity date filter. It updates after each local snapshot refresh and bank sync, without using a paid recurring-transactions product or sending merchants to an AI service.

## What counts as a monthly pattern

The local detector needs at least two posted expenses at the same merchant and account in consecutive calendar months, 24–38 days apart, with posting days within seven calendar days of one another. It excludes pending transactions, refunds, income, transfers, future records, and duplicate transaction IDs. Known aliases can unify biller descriptions. Accounts remain separate, so similar charges on two cards are not silently merged.

Ordinary food, fuel, shopping and travel purchases are excluded unless a known biller or explicit plan/membership descriptor identifies them. High-frequency merchant activity is excluded, except supported aggregators whose separate streams are matched by timing and similar amounts. These are conservative heuristics, not a bank-confirmed subscription feed: some patterns may be missed or wrongly suggested. Annual/quarterly plans and subscriptions with only one loaded charge are not detected.

**Likely subscription** means a known biller or consistently subscription-categorized monthly charges with relatively stable amounts. Other recurring charges go to **Needs review**, not the default subscription list or projected totals. Variable charges can still appear for review. Confirming is your annotation, not evidence supplied by a merchant.

## Review and explore

- Filter by company, category, bank/account, and status; group by company or category, or sort by amount and next estimate.
- **Confirm subscription** includes a reviewed pattern in estimates. **Not a subscription** hides it locally; the Hidden filter lets you restore it.
- **Details & charge history** shows matching posted records. Change the subscription-only category or save your own HTTPS billing URL. Original bank categories and transactions are unchanged.
- **Estimated monthly** uses the latest charge of visible recent likely/confirmed streams. **Yearly projection** multiplies that estimate by twelve, without assuming an annual contract. Category bars use the same estimate.
- A pattern is recent if its last charge was within 45 days. **Not recently seen** is history, not proof that a subscription was canceled. The next expected date uses the median observed billing day and clamps short months; it can be in the past if a charge has not appeared. It is never guaranteed by the merchant.

Annotations are encrypted in the local preferences record and anchored to a matching transaction. They survive older-history backfills when the anchor remains present. Removing the anchor transaction can remove the association. Sample-mode reviews exist only in the renderer and never write to real preferences.

## Billing and cancellation

**Billing & plan** opens a known official account page or your custom HTTPS URL. **Cancel instructions** opens official help. The app never sends cancellation requests, changes a paid plan, stores merchant passwords, or claims that hiding a card canceled it. App Store / Google Play purchases must be managed with the actual billing platform. Aggregator descriptions such as Apple or OpenAI may refer to different products; review receipts and set the correct custom billing URL when necessary.

Known destinations are reviewed against the following official sources (2026-11-05). Account pages can require sign-in and links may change; no live account is checked by this catalog.

| Biller                | Official instructions                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Apple billed services | [Apple subscription help](https://support.apple.com/en-us/118428)                                                    |
| Google Play           | [Manage Google Play subscriptions](https://support.google.com/googleplay/answer/7018481)                             |
| Spotify               | [Cancel or change Premium](https://support.spotify.com/us/article/cancel-premium/)                                   |
| Netflix               | [Manage or cancel Netflix](https://help.netflix.com/en/node/407)                                                     |
| OpenAI / ChatGPT      | [Cancel a ChatGPT subscription](https://help.openai.com/en/articles/7232927-canceling-your-chatgpt-subscription)     |
| Anthropic / Claude    | [Claude subscription help](https://support.claude.com/en/articles/8325617-cancel-your-pro-max-or-ultra-subscription) |
| Adobe                 | [Manage or cancel an Adobe plan](https://helpx.adobe.com/manage-account/using/cancel-subscription.html)              |
| Figma                 | [Change a Figma plan](https://help.figma.com/hc/en-us/articles/360046216313-Upgrade-or-downgrade-your-plan)          |
| Cursor                | [Cursor billing](https://docs.cursor.com/account/billing)                                                            |
| Notion                | [Change a Notion plan](https://www.notion.com/help/upgrade-or-downgrade-your-plan)                                   |
| Amazon Prime          | [Amazon's Prime cancellation guide](https://www.aboutamazon.com/news/retail/how-to-cancel-amazon-prime-membership)   |
| EōS Fitness           | [Official FAQ and member account link](https://www.eosfitness.com/faq)                                               |

Add public vendor aliases and reviewed destinations in `src/subscription-merchants.ts`; never add a maintainer's real transaction descriptions, amounts, credentials, or private account links. Tests cover false positives, scope, duplicate IDs, multiple plans, date boundaries, annotations, legacy settings, and URL validation.
