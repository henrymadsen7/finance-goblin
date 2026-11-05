import { useState } from "react";
import { ExternalLink, CalendarDays, Check, Settings2 } from "lucide-react";
import type { Account } from "./types";
import type { PaymentRule } from "../shared/preferences.js";
import {
  bankPaymentLinks,
  paymentCycle,
  calendarReminders,
} from "./payment-dates";
const label = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
function Card({
  account,
  rule,
  timeZone,
  fmt,
  onSave,
  compact,
  busy,
}: {
  account: Account;
  rule?: PaymentRule;
  timeZone: string;
  fmt: (n: number) => string;
  onSave: (r: PaymentRule) => Promise<void>;
  compact: boolean;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false),
    [saveError, setSaveError] = useState(""),
    [due, setDue] = useState(rule?.dueDay || 1),
    [lead, setLead] = useState(rule?.leadDays || 1),
    [autopay, setAutopay] = useState(rule?.autoPayConfirmed || false);
  const links = bankPaymentLinks(account.institution),
    cycle = rule ? paymentCycle(rule, new Date(), timeZone) : null;
  return (
    <article className={`payment-card ${compact ? "compact" : ""}`}>
      <div className="payment-card-top">
        <div>
          <strong>{account.name}</strong>
          <span>
            {account.institution}
            {account.mask ? ` · ${account.mask}` : ""}
          </span>
        </div>
        {!compact && (
          <div className="payment-current">
            <span>Current balance</span>
            <b>{account.balance === null ? "Unknown" : fmt(account.balance)}</b>
          </div>
        )}
      </div>
      {cycle ? (
        <div className="payment-dates">
          <div className={cycle.needsCheck ? "yellow" : ""}>
            <span>Pay by</span>
            <strong>{label(cycle.target)}</strong>
          </div>
          <div>
            <span>Due</span>
            <strong>{label(cycle.due)}</strong>
          </div>
          {!compact && (
            <div>
              <span>AutoPay</span>
              <strong className={rule?.autoPayConfirmed ? "green" : "muted"}>
                {rule?.autoPayConfirmed ? "Confirmed by you" : "Not confirmed"}
              </strong>
            </div>
          )}
        </div>
      ) : (
        <p className="payment-unset">Add a due date to track this card.</p>
      )}
      <div className="payment-actions">
        {links && (
          <a
            className="button"
            href={links.login}
            target="_blank"
            rel="noreferrer"
          >
            {compact ? "Open bank" : "Pay / manage AutoPay"}
            <ExternalLink size={13} />
          </a>
        )}
        {!compact && (
          <button className="text-button" onClick={() => setEditing(!editing)}>
            <Settings2 size={14} />
            {rule ? "Edit dates" : "Add due date"}
          </button>
        )}
      </div>
      {!compact && links && (
        <details className="autopay-help">
          <summary>AutoPay setup</summary>
          <p>{links.instructions}</p>
          <p>
            Use the bank’s statement amount and confirm the delivery date there.
            Your current card balance is not necessarily your statement amount
            due.
          </p>
          <a
            className="text-button"
            href={links.help}
            target="_blank"
            rel="noreferrer"
          >
            Official instructions
            <ExternalLink size={12} />
          </a>
        </details>
      )}
      {editing && (
        <form
          className="payment-editor"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaveError("");
            try {
              await onSave({
                accountId: account.id,
                dueDay: due,
                leadDays: lead,
                autoPayConfirmed: autopay,
              });
              setEditing(false);
            } catch (error) {
              setSaveError((error as Error).message);
            }
          }}
        >
          <label>
            Due day of month
            <input
              type="number"
              min="1"
              max="31"
              required
              value={due}
              onChange={(e) => setDue(Number(e.target.value))}
            />
          </label>
          <label>
            Pay this many days before
            <input
              type="number"
              min="1"
              max="14"
              required
              value={lead}
              onChange={(e) => setLead(Number(e.target.value))}
            />
          </label>
          <label className="autopay-check">
            <input
              type="checkbox"
              checked={autopay}
              onChange={(e) => setAutopay(e.target.checked)}
            />
            I verified AutoPay is enabled at my bank
          </label>
          <button className="primary" disabled={busy}>
            <Check size={14} />
            Save dates
          </button>
          {saveError && <p role="alert">{saveError}</p>}
        </form>
      )}
    </article>
  );
}
export function Payments({
  accounts,
  rules,
  timeZone,
  fmt,
  onSave,
  compact = false,
  onOpen,
  busy = false,
}: {
  accounts: Account[];
  rules: PaymentRule[];
  timeZone: string;
  fmt: (n: number) => string;
  onSave: (r: PaymentRule) => Promise<void>;
  compact?: boolean;
  onOpen?: () => void;
  busy?: boolean;
}) {
  const cards = accounts.filter((a) => a.type === "credit");
  const exportCalendar = () => {
    const selected = rules.filter((r) =>
      cards.some((a) => a.id === r.accountId),
    );
    const content = calendarReminders(
      selected,
      Object.fromEntries(cards.map((a) => [a.id, a.name])),
      timeZone,
    );
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/calendar;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "finance-goblin-payment-reminders.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className={`panel payments-panel ${compact ? "compact" : ""}`}>
      <div className="panel-head">
        <h2>{compact ? "Upcoming payments" : "Credit card payments"}</h2>
        {compact ? (
          <button className="text-button" onClick={onOpen}>
            Manage
            <CalendarDays size={14} />
          </button>
        ) : (
          <button
            className="button"
            disabled={
              !rules.some((r) => cards.some((a) => a.id === r.accountId))
            }
            onClick={exportCalendar}
          >
            <CalendarDays size={14} />
            Add calendar reminders
          </button>
        )}
      </div>
      <div className="payment-grid">
        {cards.map((account) => (
          <Card
            key={account.id}
            account={account}
            rule={rules.find((r) => r.accountId === account.id)}
            timeZone={timeZone}
            fmt={fmt}
            onSave={onSave}
            compact={compact}
            busy={busy}
          />
        ))}
      </div>
      {!cards.length && (
        <p className="empty-text">No credit cards in this bank selection.</p>
      )}
      {!compact && (
        <p className="payment-note">
          Dates are your monthly plan. Review your statement in the bank before
          paying. Once added to your calendar, reminders alert at 9 AM in{" "}
          {timeZone}, before each due date. This app does not send payments.
        </p>
      )}
    </section>
  );
}
