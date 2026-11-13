import { useState, useEffect } from "react";
import {
  defaultLifeAppearance,
  lifePresets,
} from "../../shared/life-appearance.js";
import type { LifeAppearance } from "../../shared/life-appearance.js";
import { request } from "./types";
export function applyLifeAppearance(a: LifeAppearance) {
  const root = document.documentElement.style;
  for (const [key, value] of Object.entries(a))
    root.setProperty(
      `--life-${key === "background" ? "bg" : key === "surface" ? "panel" : key === "border" ? "line" : key}`,
      key === "radius" ? `${value}px` : String(value),
    );
  const rgb = a.accent.match(/[a-f\d]{2}/gi)?.map((v) => parseInt(v, 16)) || [
    193, 216, 180,
  ];
  root.setProperty(
    "--life-on-accent",
    rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 145
      ? "#142018"
      : "#ffffff",
  );
}
export default function Appearance({
  saved,
  refresh,
}: {
  saved?: LifeAppearance;
  refresh: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(saved || defaultLifeAppearance),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    setDraft(saved || defaultLifeAppearance);
  }, [saved]);
  const change = (next: LifeAppearance) => {
    setDraft(next);
    applyLifeAppearance(next);
    setMessage("Unsaved preview");
  };
  useEffect(
    () => () => applyLifeAppearance(saved || defaultLifeAppearance),
    [saved],
  );
  return (
    <section className="life-card life-appearance">
      <h2>Appearance</h2>
      <p>
        Customize Life independently from Finance Goblin. Changes preview
        immediately; save to keep them.
      </p>
      <div className="life-actions">
        {lifePresets.map((p) => (
          <button
            key={p.name}
            className="life-button"
            style={{
              background: p.appearance.background,
              color: p.appearance.text,
              borderColor: p.appearance.border,
            }}
            onClick={() => change({ ...p.appearance })}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="life-color-grid">
        {(
          [
            ["background", "Background"],
            ["surface", "Panels"],
            ["text", "Text"],
            ["muted", "Secondary text"],
            ["accent", "Accent"],
            ["border", "Borders"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <span>{label}</span>
            <input
              type="color"
              aria-label={`${label} color`}
              value={draft[key]}
              onChange={(e) => change({ ...draft, [key]: e.target.value })}
            />
            <code>{draft[key]}</code>
          </label>
        ))}
      </div>
      <label className="life-radius">
        Corner radius{" "}
        <input
          type="range"
          aria-label="Corner radius"
          min="6"
          max="30"
          value={draft.radius}
          onChange={(e) => change({ ...draft, radius: Number(e.target.value) })}
        />
        <span>{draft.radius}px</span>
      </label>
      <div className="life-actions">
        <button
          className="life-button primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await request("/api/life/preferences", { appearance: draft });
              await refresh();
              setMessage("Appearance saved");
            } catch (e) {
              setMessage(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Save appearance
        </button>
        <button
          className="life-button"
          disabled={busy}
          onClick={() => {
            change(saved || defaultLifeAppearance);
            setMessage("Preview canceled");
          }}
        >
          Cancel preview
        </button>
        <button
          className="life-text-button"
          disabled={busy}
          onClick={() => change({ ...defaultLifeAppearance })}
        >
          Reset to default
        </button>
        <span role="status">{message}</span>
      </div>
    </section>
  );
}
