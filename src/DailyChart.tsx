import { useEffect, useRef, useState } from "react";
import type { Daily } from "./types";
import { ChartTooltip } from "./ChartTooltip";
export function DailyChart({
  days,
  onSelect,
  selected,
  hidden,
  mode = "bars",
}: {
  days: Daily[];
  onSelect: (date: string) => void;
  selected: string | null;
  hidden: boolean;
  mode?: "bars" | "line";
}) {
  const host = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => setHover(null), [days]);
  const values = days.flatMap((d) =>
    mode === "line" ? [d.net] : [d.income, d.expense, d.pending],
  );
  const max = Math.max(...values, 1),
    min = Math.min(...values, 0),
    range = max - min,
    zero = (-min / range) * 100;
  const line = days
    .map(
      (d, i) =>
        `${((i + 0.5) / days.length) * 1000},${240 - ((d.net - min) / range) * 220}`,
    )
    .join(" ");
  const track = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(),
      x = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
    setHover({
      index: Math.min(
        days.length - 1,
        Math.floor((x / rect.width) * days.length),
      ),
      x,
      y: event.clientY - rect.top,
    });
  };
  return (
    <div
      className={`daily-chart ${mode}`}
      ref={host}
      onPointerMove={track}
      onPointerLeave={() => setHover(null)}
      style={{ "--zero-percent": `${zero}%` } as React.CSSProperties}
    >
      {mode === "line" && (
        <svg
          className="cash-line"
          viewBox="0 0 1000 260"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="cash-line-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity=".24" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            points={`0,260 ${line} 1000,260`}
            fill="url(#cash-line-fill)"
          />
          <polyline
            points={line}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      <div className="daily-columns">
        {days.map((day, index) => (
          <button
            key={day.date}
            className={`daily-column ${selected === day.date ? "selected" : ""} ${hover?.index === index ? "hovered" : ""}`}
            aria-label={`Explore ${day.date}`}
            aria-pressed={selected === day.date}
            onClick={() => onSelect(day.date)}
            onFocus={() => {
              const r = host.current?.getBoundingClientRect();
              setHover({
                index,
                x: ((index + 0.5) / days.length) * (r?.width || 600),
                y: 15,
              });
            }}
            onBlur={() => setHover(null)}
          >
            {mode === "bars" &&
              (["income", "expense", "pending"] as const).map((key, k) => (
                <i
                  key={key}
                  className={["green-bar", "red-bar", "yellow-bar"][k]}
                  style={{
                    height: `${(Math.abs(day[key]) / range) * 100}%`,
                    left: `${k * 32 + 3}%`,
                    bottom: day[key] >= 0 ? `${zero}%` : "auto",
                    top: day[key] < 0 ? `${100 - zero}%` : "auto",
                  }}
                />
              ))}
          </button>
        ))}
      </div>
      {hover && days[hover.index] && (
        <>
          <div
            className="chart-crosshair"
            style={{ left: `${((hover.index + 0.5) / days.length) * 100}%` }}
          />
          <ChartTooltip
            day={days[hover.index]}
            x={hover.x}
            y={hover.y}
            width={host.current?.clientWidth || 600}
            height={host.current?.clientHeight || 290}
            hidden={hidden}
          />
        </>
      )}
    </div>
  );
}
