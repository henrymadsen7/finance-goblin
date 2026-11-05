import { useState } from "react";
import { ArrowUp, ArrowDown, RotateCcw, Check } from "lucide-react";
import type { Preferences, Appearance } from "../shared/preferences.js";
import {
  defaultAppearance,
  defaultPreferences,
  widgetCatalog,
} from "../shared/preferences.js";
const colorFields: [keyof Appearance, string][] = [
  ["background", "Background"],
  ["surface", "Panels"],
  ["text", "Text"],
  ["muted", "Secondary text"],
  ["accent", "Accent"],
  ["income", "Income"],
  ["expense", "Expenses"],
  ["pending", "Pending"],
  ["border", "Borders"],
];
const presets: { name: string; appearance: Appearance }[] = [
  { name: "Midnight", appearance: defaultAppearance },
  {
    name: "Graphite",
    appearance: {
      ...defaultAppearance,
      background: "#131313",
      surface: "#242424",
      text: "#f0f0f0",
      muted: "#a7a7a7",
      accent: "#9cbaff",
      border: "#737373",
    },
  },
  {
    name: "Paper",
    appearance: {
      ...defaultAppearance,
      background: "#eaf0f3",
      surface: "#ffffff",
      text: "#17252f",
      muted: "#536877",
      accent: "#3269c7",
      income: "#256d47",
      expense: "#b43a43",
      pending: "#91650b",
      border: "#8193a0",
    },
  },
];
export function Settings({
  preferences,
  onPreview,
  onSave,
  busy,
}: {
  preferences: Preferences;
  onPreview: (p: Preferences) => void;
  onSave: (p: Preferences) => Promise<void>;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(() => structuredClone(preferences)),
    [tab, setTab] = useState("Appearance");
  const change = (next: Preferences) => {
    setDraft(next);
    onPreview(next);
  };
  const appearance = (
    key: keyof Appearance,
    value: string | number | string[],
  ) => change({ ...draft, appearance: { ...draft.appearance, [key]: value } });
  const enabled = draft.widgets;
  const move = (id: (typeof enabled)[number], direction: number) => {
    const next = [...enabled],
      index = next.indexOf(id),
      target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    change({ ...draft, widgets: next });
  };
  return (
    <>
      <h2>Settings</h2>
      <div
        className="settings-tabs"
        role="tablist"
        aria-label="Settings sections"
      >
        {["Appearance", "Widgets", "Profile"].map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {tab === "Appearance" && (
        <div className="settings-section">
          <div className="theme-presets">
            {presets.map((p) => (
              <button
                key={p.name}
                onClick={() =>
                  change({
                    ...draft,
                    appearance: structuredClone(p.appearance),
                  })
                }
                style={{
                  background: p.appearance.background,
                  color: p.appearance.text,
                  borderColor: p.appearance.border,
                }}
              >
                <span style={{ background: p.appearance.accent }} />
                {p.name}
              </button>
            ))}
          </div>
          <div className="color-grid">
            {colorFields.map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  type="color"
                  aria-label={`${label} color`}
                  value={draft.appearance[key] as string}
                  onChange={(e) => appearance(key, e.target.value)}
                />
                <code>{draft.appearance[key]}</code>
              </label>
            ))}
          </div>
          <label className="radius-control">
            Corner radius{" "}
            <input
              type="range"
              aria-label="Corner radius"
              min="6"
              max="30"
              value={draft.appearance.radius}
              onChange={(e) => appearance("radius", Number(e.target.value))}
            />
            <span>{draft.appearance.radius}px</span>
          </label>
          <details className="palette-options">
            <summary>Category colors</summary>
            <div className="palette-swatches">
              {draft.appearance.categoryColors.map((color, i) => (
                <label key={i}>
                  <input
                    type="color"
                    aria-label={`Category color ${i + 1}`}
                    value={color}
                    onChange={(e) =>
                      appearance(
                        "categoryColors",
                        draft.appearance.categoryColors.map((c, j) =>
                          i === j ? e.target.value : c,
                        ),
                      )
                    }
                  />
                  <button
                    aria-label={`Remove category color ${i + 1}`}
                    disabled={draft.appearance.categoryColors.length <= 3}
                    onClick={() =>
                      appearance(
                        "categoryColors",
                        draft.appearance.categoryColors.filter(
                          (_, j) => j !== i,
                        ),
                      )
                    }
                  >
                    ×
                  </button>
                </label>
              ))}
              <button
                className="button"
                disabled={draft.appearance.categoryColors.length >= 16}
                onClick={() =>
                  appearance("categoryColors", [
                    ...draft.appearance.categoryColors,
                    "#93acc7",
                  ])
                }
              >
                Add color
              </button>
            </div>
          </details>
        </div>
      )}
      {tab === "Widgets" && (
        <div className="settings-section widget-options">
          {[
            ...enabled,
            ...widgetCatalog
              .map(([id]) => id)
              .filter((id) => !enabled.includes(id)),
          ].map((id) => (
            <div key={id}>
              <label>
                <input
                  type="checkbox"
                  checked={enabled.includes(id)}
                  onChange={(e) =>
                    change({
                      ...draft,
                      widgets: e.target.checked
                        ? [...enabled, id]
                        : enabled.filter((v) => v !== id),
                    })
                  }
                />
                {widgetCatalog.find(([key]) => id === key)?.[1]}
              </label>
              {enabled.includes(id) && (
                <span>
                  <button
                    className="icon-button"
                    aria-label={`Move ${widgetCatalog.find(([key]) => key === id)?.[1]} up`}
                    disabled={enabled.indexOf(id) === 0}
                    onClick={() => move(id, -1)}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Move ${widgetCatalog.find(([key]) => key === id)?.[1]} down`}
                    disabled={enabled.indexOf(id) === enabled.length - 1}
                    onClick={() => move(id, 1)}
                  >
                    <ArrowDown size={15} />
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {tab === "Profile" && (
        <div className="settings-section">
          <label>
            Display name
            <input
              maxLength={40}
              value={draft.profileName}
              onChange={(e) =>
                change({ ...draft, profileName: e.target.value })
              }
            />
          </label>
          <label>
            Time zone
            <input
              list="finance-timezones"
              value={draft.timeZone}
              onChange={(e) => change({ ...draft, timeZone: e.target.value })}
            />
            <datalist id="finance-timezones">
              {[
                "America/Denver",
                "America/Los_Angeles",
                "America/Chicago",
                "America/New_York",
                "Europe/London",
                "UTC",
              ].map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </label>
        </div>
      )}
      <div className="settings-actions">
        <button
          className="text-button"
          onClick={() =>
            change({
              ...draft,
              appearance: structuredClone(defaultAppearance),
              widgets: [...defaultPreferences.widgets],
            })
          }
        >
          <RotateCcw size={14} />
          Reset appearance & widgets
        </button>
        <button
          className="primary"
          disabled={busy || !draft.profileName.trim()}
          onClick={() => void onSave(draft)}
        >
          <Check size={15} />
          Save settings
        </button>
      </div>
    </>
  );
}
