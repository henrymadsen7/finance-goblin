import type { Daily } from "./types";
import { money } from "./types";
export function ChartTooltip({
  day,
  x,
  y,
  width,
  height = 290,
  hidden = false,
  title,
}: {
  day: Daily;
  x: number;
  y: number;
  width: number;
  height?: number;
  hidden?: boolean;
  title?: string;
}) {
  const left = Math.max(8, Math.min(x + 16, width - 238)),
    top = Math.max(
      8,
      Math.min(y > height - 180 ? y - 174 : y + 18, height - 178),
    );
  const fmt = (value: number) => (hidden ? "••••••" : money(value));
  return (
    <div
      className="market-tooltip"
      role="status"
      style={{ left, top: Math.max(8, top) }}
    >
      <div className="tooltip-heading">
        <span className="tooltip-dot" />
        {title ||
          new Date(day.date + "T12:00:00").toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
      </div>
      <div className="tooltip-numbers">
        <span>Income</span>
        <strong className="green">{fmt(day.income)}</strong>
        <span>Spent, less refunds</span>
        <strong className="red">{fmt(day.expense)}</strong>
        <span>Pending</span>
        <strong className="yellow">{fmt(day.pending)}</strong>
      </div>
      <div className="tooltip-net">
        <span>Net cash flow</span>
        <strong className={day.net < 0 ? "red" : "green"}>
          {fmt(day.net)}
        </strong>
      </div>
    </div>
  );
}
