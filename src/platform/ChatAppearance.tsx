import { useEffect, useState } from "react";
import {
  chatPresets,
  defaultChatAppearance,
} from "../../shared/chat-appearance.js";
import type { ChatAppearance as Appearance } from "../../shared/chat-appearance.js";
import { request } from "./types";
export default function ChatAppearance({
  scope,
  saved = defaultChatAppearance,
  onPreview,
  onSaved,
}: {
  scope: string;
  saved?: Appearance;
  onPreview: (value: Appearance | null) => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(saved),
    [hex, setHex] = useState({
      background: saved.background,
      accent: saved.accent,
    }),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    setDraft(saved);
  }, [saved.preset, saved.background, saved.accent]);
  useEffect(() => () => onPreview(null), [onPreview]);
  useEffect(() => {
    setHex({ background: draft.background, accent: draft.accent });
  }, [draft.background, draft.accent]);
  const validHex = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);
  const change = (value: Appearance) => {
    setDraft(value);
    onPreview(value);
    setMessage("Unsaved preview");
  };
  return (
    <section className="assistant-appearance" aria-label="Chat appearance">
      <h3>Chat appearance</h3>
      <p>
        Choose white, black, or your own colors. This applies to both Life and
        Finance chats.
      </p>
      <div
        className="chat-appearance-presets"
        role="group"
        aria-label="Chat color presets"
      >
        {chatPresets.map((p) => (
          <button
            key={p.name}
            type="button"
            aria-pressed={draft.preset === p.appearance.preset}
            disabled={busy}
            onClick={() => change({ ...p.appearance })}
          >
            {p.name}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={draft.preset === "custom"}
          disabled={busy}
          onClick={() => change({ ...draft, preset: "custom" })}
        >
          Custom
        </button>
      </div>
      <div className="chat-appearance-colors">
        {(
          [
            ["background", "Chat background"],
            ["accent", "Chat accent"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <span>{label}</span>
            <input
              type="color"
              aria-label={label}
              value={draft[key]}
              disabled={busy}
              onInput={(e) =>
                change({
                  ...draft,
                  preset: "custom",
                  [key]: e.currentTarget.value,
                })
              }
              onChange={(e) =>
                change({ ...draft, preset: "custom", [key]: e.target.value })
              }
            />
            <input
              className="chat-color-hex"
              type="text"
              aria-label={`${label} hex`}
              aria-invalid={!validHex(hex[key])}
              spellCheck={false}
              maxLength={7}
              value={hex[key]}
              disabled={busy}
              onChange={(e) => {
                const value = e.target.value;
                setHex((current) => ({ ...current, [key]: value }));
                if (validHex(value))
                  change({ ...draft, preset: "custom", [key]: value });
              }}
              onBlur={() => {
                if (!validHex(hex[key]))
                  setHex((current) => ({ ...current, [key]: draft[key] }));
              }}
            />
          </label>
        ))}
      </div>
      <p className="chat-appearance-hint">
        Text and panel colors adjust automatically for readability.
      </p>
      <div className="chat-appearance-actions">
        <button
          type="button"
          className="life-button primary"
          disabled={busy || !Object.values(hex).every(validHex)}
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              await request(`/api/assistant/${scope}/appearance`, draft);
              await onSaved();
              onPreview(null);
              setMessage("Chat appearance saved for both workspaces");
            } catch (e) {
              setMessage(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Save chat appearance
        </button>
        <button
          type="button"
          className="life-button"
          disabled={busy}
          onClick={() => {
            setDraft(saved);
            onPreview(null);
            setMessage("Preview canceled");
          }}
        >
          Cancel preview
        </button>
      </div>
      <span role="status">{message}</span>
    </section>
  );
}
