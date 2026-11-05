import { useMemo, useState } from "react";
import type { Transaction } from "./types";
import { money } from "./types";
import { categorySpending } from "./finance";
export function CategorySpend({
  rows,
  selected,
  onSelect,
  hidden,
  colors,
}: {
  rows: Transaction[];
  selected: string;
  onSelect: (name: string) => void;
  hidden: boolean;
  colors: string[];
}) {
  const data = useMemo(() => categorySpending(rows), [rows]);
  const max = Math.max(...data.map((d) => Math.abs(d.amount)), 1),
    total = data.reduce((s, d) => s + d.amount, 0);
  const [hover, setHover] = useState<string | null>(null),
    [all, setAll] = useState(false);
  const fmt = (n: number) => (hidden ? "••••••" : money(n));
  return (
    <section className="panel category-spend">
      <div className="panel-head">
        <h2>Spending by category</h2>
        {selected !== "all" && (
          <button className="text-button" onClick={() => onSelect("all")}>
            All categories
          </button>
        )}
      </div>
      <div className="category-bars">
        {(all ? data : data.slice(0, 7)).map((d, i) => (
          <button
            key={d.name}
            aria-pressed={selected === d.name}
            className={selected === d.name ? "active" : ""}
            onClick={() => onSelect(selected === d.name ? "all" : d.name)}
            onPointerEnter={() => setHover(d.name)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(d.name)}
            onBlur={() => setHover(null)}
          >
            <span className="category-bar-label">
              <span>{d.name}</span>
              <strong>{fmt(d.amount)}</strong>
            </span>
            <span className="category-bar-track">
              <i
                style={{
                  width: `${(Math.abs(d.amount) / max) * 100}%`,
                  background: colors[i % colors.length],
                }}
              />
            </span>
            <span
              className={`category-hover ${hover === d.name ? "visible" : ""}`}
              aria-hidden={hover !== d.name}
            >
              {d.count} posted ·{" "}
              {total > 0 ? Math.round((d.amount / total) * 100) : 0}% of net
              spending{d.pending > 0 ? ` · ${fmt(d.pending)} pending` : ""}
            </span>
          </button>
        ))}
      </div>
      {!data.length && (
        <p className="empty-text">No spending in this period.</p>
      )}
      {data.length > 7 && (
        <button
          className="text-button category-show-all"
          onClick={() => setAll(!all)}
        >
          {all ? "Show less" : "Show all categories"}
        </button>
      )}
    </section>
  );
}
