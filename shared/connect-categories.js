// Preserved from the owner’s existing Connect project. Headline signals only.
export const CIRCLES = [
  {
    id: "technology",
    name: "AI & technology",
    short: "AI & technology",
    color: "#4d6c91",
    pattern:
      /\b(ai|artificial intelligence|machine learning|software|developer|computer science|cybersecurity|information systems|data scien\w*|automation|saas|technology|technical|cs|full.stack|front.end|back.end)\b/i,
  },
  {
    id: "founders",
    name: "Founders & operators",
    short: "Founders & operators",
    color: "#8b6948",
    pattern:
      /\b(founder|co-founder|entrepreneur|ceo|chief executive|owner|operations|operator|bizops|president)\b/i,
  },
  {
    id: "investing",
    name: "Finance & investing",
    short: "Finance & investing",
    color: "#4b7a78",
    pattern:
      /\b(invest|investing|investment|venture|vc|capital|finance|financial|banking|private equity|accountant|accounting|accountancy|fund|wealth)\b/i,
  },
  {
    id: "design",
    name: "Design & product",
    short: "Design & product",
    color: "#866782",
    pattern:
      /\b(design|designer|ux|creative|product management|product manager|photograph|videograph|filmmak)\b/i,
  },
  {
    id: "growth",
    name: "Growth & marketing",
    short: "Growth & marketing",
    color: "#a46755",
    pattern:
      /\b(marketing|marketer|growth|sales|gtm|go-to-market|business development|brand|partnership|account manager|customer success|sdr|bdr|communications)\b/i,
  },
  {
    id: "property",
    name: "Real estate & construction",
    short: "Real estate & construction",
    color: "#77784d",
    pattern:
      /\b(real estate|construction|contractor|roofing|roof|brokerage|exteriors|property|land development|commercial brokerage)\b/i,
  },
  {
    id: "education",
    name: "Education & research",
    short: "Education & research",
    color: "#647e9c",
    pattern:
      /\b(student|university|byu|college|school|professor|research|teaching|education|candidate|alumni)\b/i,
  },
  {
    id: "health",
    name: "Health & life sciences",
    short: "Health & life sciences",
    color: "#617f5f",
    pattern:
      /\b(health|healthcare|medical|medicine|physician|dental|dentist|therapy|nurse|biotech|biological|bioengineering|biochemical|neuroscience|nutritional)\b/i,
  },
  {
    id: "other",
    name: "Other connections",
    short: "Other connections",
    color: "#777672",
    pattern: null,
  },
];
export function classify(headline) {
  const circles = CIRCLES.filter((c) => c.pattern?.test(headline)).map(
    (c) => c.id,
  );
  const communities = [];
  if (/\bBYU\b|Brigham Young/i.test(headline)) communities.push("BYU");
  if (/\bSandbox\b|\bSB0[4-6]\b|\bSBO[4-6]\b/i.test(headline))
    communities.push("Sandbox");
  if (/\bYC\b|Y Combinator/i.test(headline)) communities.push("Y Combinator");
  return { circles: circles.length ? circles : ["other"], communities };
}
