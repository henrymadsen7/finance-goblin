import type { PaymentRule } from "../shared/preferences.js";
export function dateInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}-${parts.find((p) => p.type === "day")!.value}`;
}
const stamp = (d: Date) => d.toISOString().slice(0, 10);
export function paymentCycle(
  rule: PaymentRule,
  now = new Date(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const today = dateInZone(now, timeZone),
    [y, m] = today.split("-").map(Number);
  let month = m - 1;
  const makeDue = (month: number) =>
    new Date(
      Date.UTC(
        y,
        month,
        Math.min(rule.dueDay, new Date(Date.UTC(y, month + 1, 0)).getUTCDate()),
        12,
      ),
    );
  let due = makeDue(month);
  if (stamp(due) < today) due = makeDue(++month);
  const target = new Date(due);
  target.setUTCDate(target.getUTCDate() - rule.leadDays);
  return {
    due: stamp(due),
    target: stamp(target),
    today,
    needsCheck: stamp(target) <= today && today <= stamp(due),
  };
}
export function bankPaymentLinks(institution: string) {
  if (/bank of america/i.test(institution))
    return {
      login: "https://secure.bankofamerica.com/auth/signon/?reason=PayABill",
      help: "https://www.bankofamerica.com/credit-cards/credit-card-payments-statements-faq/",
      instructions:
        "Pay & Transfer → Pay Bills → select your card → Make payment recurring. Confirm the payment amount, funding account and delivery date before saving.",
    };
  if (/american express/i.test(institution))
    return {
      login: "https://www.americanexpress.com/en-us/account/login/",
      help: "https://www.americanexpress.com/en-us/resources/how-to-make-a-payment/",
      instructions:
        "Open Payments → Manage AutoPay. Review the statement payment amount, funding account and available payment dates, then approve the plan at Amex.",
    };
  return null;
}
const escapeICS = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\r/g, "");
export function calendarReminders(
  plans: PaymentRule[],
  names: Record<string, string>,
  timeZone: string,
  now = new Date(),
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Finance Goblin//Payment dates//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const plan of plans) {
    const { due } = paymentCycle(plan, now, timeZone);
    const monthDays =
      plan.dueDay <= 28
        ? String(plan.dueDay)
        : Array.from({ length: plan.dueDay - 27 }, (_, i) => 28 + i).join(",");
    lines.push(
      "BEGIN:VEVENT",
      `UID:finance-goblin-${escapeICS(plan.accountId)}@local`,
      `DTSTAMP:${now
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "")}`,
      `DTSTART;TZID=${timeZone}:${due.replace(/-/g, "")}T090000`,
      `RRULE:FREQ=MONTHLY;BYMONTHDAY=${monthDays}${plan.dueDay > 28 ? ";BYSETPOS=-1" : ""}`,
      `SUMMARY:${escapeICS(names[plan.accountId] || "Credit card")} payment due`,
      "DESCRIPTION:Review the bank statement and verify your payment or autopay. Finance Goblin does not submit payments.",
      "BEGIN:VALARM",
      `TRIGGER:-P${plan.leadDays}D`,
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeICS(names[plan.accountId] || "Credit card")}: review or pay before the due date`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  // Fold UTF-8 content lines at the RFC 5545 75-octet limit.
  return (
    lines
      .map((line) => {
        let result = "",
          chunk = "",
          length = 0;
        for (const ch of line) {
          const bytes = new TextEncoder().encode(ch).length;
          if (length + bytes > 74) {
            result += chunk + "\r\n ";
            chunk = "";
            length = 1;
          }
          chunk += ch;
          length += bytes;
        }
        return result + chunk;
      })
      .join("\r\n") + "\r\n"
  );
}
