export type Merchant = {
  id: string;
  name: string;
  category: string;
  match: RegExp;
  billing: string;
  help: string;
  aggregate?: boolean;
};
// Official vendor documentation and account destinations reviewed 2026-11-05.
// Aliases suggest a biller, not the particular product or account purchased.
export const merchants: Merchant[] = [
  {
    id: "amazon-prime",
    name: "Amazon Prime",
    category: "Entertainment",
    match: /^(amazon prime|amzn prime)\b/i,
    billing: "https://www.amazon.com/amazonprime",
    help: "https://www.aboutamazon.com/news/retail/how-to-cancel-amazon-prime-membership",
  },
  {
    id: "eos-fitness",
    name: "EōS Fitness",
    category: "Fitness",
    match: /^e[oō]s fitness\b/i,
    billing: "https://mico.myiclubonline.com/iclub/members/signin",
    help: "https://www.eosfitness.com/faq",
  },
  {
    id: "spotify",
    name: "Spotify",
    category: "Entertainment",
    match: /^spotify\b/i,
    billing: "https://www.spotify.com/account/subscription/manage/",
    help: "https://support.spotify.com/us/article/cancel-premium/",
  },
  {
    id: "netflix",
    name: "Netflix",
    category: "Entertainment",
    match: /^netflix\b/i,
    billing: "https://www.netflix.com/YourAccount",
    help: "https://help.netflix.com/en/node/407",
  },
  {
    id: "apple",
    name: "Apple billed services",
    category: "Entertainment",
    match: /^(apple(?:\s+com)?(?:\s+bill)?|itunes)\b/i,
    billing: "https://account.apple.com/account/manage/section/subscriptions",
    help: "https://support.apple.com/en-us/118428",
    aggregate: true,
  },
  {
    id: "google-play",
    name: "Google Play",
    category: "Software",
    match: /^google\s+play\b/i,
    billing: "https://play.google.com/store/account/subscriptions",
    help: "https://support.google.com/googleplay/answer/7018481",
    aggregate: true,
  },
  {
    id: "openai",
    name: "OpenAI / ChatGPT",
    category: "Software",
    match: /^(openai|chatgpt)\b/i,
    billing: "https://chatgpt.com/",
    help: "https://help.openai.com/en/articles/7232927-canceling-your-chatgpt-subscription",
    aggregate: true,
  },
  {
    id: "anthropic",
    name: "Anthropic / Claude",
    category: "Software",
    match: /^(anthropic|claude)\b/i,
    billing: "https://claude.ai/",
    help: "https://support.claude.com/en/articles/8325617-cancel-your-pro-max-or-ultra-subscription",
    aggregate: true,
  },
  {
    id: "adobe",
    name: "Adobe",
    category: "Software",
    match: /^adobe\b/i,
    billing: "https://account.adobe.com/",
    help: "https://helpx.adobe.com/manage-account/using/cancel-subscription.html",
  },
  {
    id: "figma",
    name: "Figma",
    category: "Software",
    match: /^figma\b/i,
    billing: "https://www.figma.com/",
    help: "https://help.figma.com/hc/en-us/articles/360046216313-Upgrade-or-downgrade-your-plan",
  },
  {
    id: "cursor",
    name: "Cursor",
    category: "Software",
    match: /^(cursor|anysphere)\b/i,
    billing: "https://cursor.com/",
    help: "https://docs.cursor.com/account/billing",
  },
  {
    id: "notion",
    name: "Notion",
    category: "Software",
    match: /^notion\b/i,
    billing: "https://www.notion.so/",
    help: "https://www.notion.com/help/upgrade-or-downgrade-your-plan",
  },
];
export function normalizeMerchant(payee: string) {
  return payee
    .normalize("NFKC")
    .toLowerCase()
    .replace(
      /^(?:paypal|sq|sp|tst|checkcard|debit card purchase|recurring card payment)[\s*.:/-]+/i,
      "",
    )
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, " ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
export function merchantFor(payee: string) {
  const name = normalizeMerchant(payee);
  return merchants.find((m) => m.match.test(name));
}
