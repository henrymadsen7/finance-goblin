import { useEffect, useRef, useState } from "react";
import { ChevronDown, LoaderCircle, X } from "lucide-react";
import { request } from "./types";
export type ModelSettings = {
  model: string;
  reasoning: string;
  maxTokens: number;
  contextTokens: number;
};
type Model = {
  id: string;
  name: string;
  reasoning: string[];
  contextWindow: number | null;
};
export default function ModelPicker({
  scope,
  value,
  busy,
  onSaved,
}: {
  scope: string;
  value: ModelSettings;
  busy: boolean;
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(value),
    [models, setModels] = useState<Model[]>([]),
    [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setDraft(value);
  }, [value.model, value.reasoning, value.maxTokens, value.contextTokens]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setError("");
    setLoading(true);
    request<{ models: Model[] }>(
      `/api/assistant/${scope}/models`,
      undefined,
      "GET",
    )
      .then((r) => {
        if (active) setModels(r.models);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, scope]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  const selected = models.find((m) => m.id === draft.model);
  const name = (models.find((m) => m.id === value.model)?.name || value.model)
    .replace(/^gpt-/, "GPT-")
    .replace(/-luna$/i, " Luna")
    .replace(/-sol$/i, " Sol");
  return (
    <div className="assistant-inline-model" ref={root}>
      <button
        type="button"
        className="assistant-model-button"
        aria-label={`Model settings: ${value.model}, ${value.reasoning}`}
        aria-expanded={open}
        disabled={busy || saving}
        onClick={() => setOpen((v) => !v)}
        title="Model, reasoning and token limits"
      >
        <span>
          {name} · {value.reasoning}
        </span>
        <ChevronDown size={11} />
      </button>
      {open && (
        <div
          className="assistant-model-popover"
          role="dialog"
          aria-label="Model settings"
        >
          <header>
            <strong>Model & limits</strong>
            <button
              type="button"
              aria-label="Close model settings"
              onClick={() => setOpen(false)}
            >
              <X size={14} />
            </button>
          </header>
          {loading ? (
            <p role="status">
              <LoaderCircle size={14} /> Loading your ChatGPT models…
            </p>
          ) : (
            <>
              <label>
                Model
                <select
                  aria-label="Assistant model"
                  value={draft.model}
                  disabled={!models.length || saving}
                  onChange={(e) => {
                    const next = models.find((m) => m.id === e.target.value)!;
                    setDraft((d) => ({
                      ...d,
                      model: next.id,
                      reasoning: next.reasoning.includes(d.reasoning)
                        ? d.reasoning
                        : next.reasoning[0],
                      contextTokens: Math.min(
                        d.contextTokens,
                        Math.max(
                          4000,
                          (next.contextWindow || 500000) - d.maxTokens - 2048,
                        ),
                      ),
                    }));
                  }}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reasoning
                <select
                  aria-label="Reasoning effort"
                  value={draft.reasoning}
                  disabled={!selected || saving}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, reasoning: e.target.value }))
                  }
                >
                  {selected?.reasoning.map((e) => (
                    <option key={e} value={e}>
                      {e === "xhigh"
                        ? "Extra high"
                        : e.charAt(0).toUpperCase() + e.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="assistant-model-numbers">
                <label>
                  Max answer tokens
                  <input
                    aria-label="Max answer tokens"
                    type="number"
                    min="256"
                    max="32000"
                    step="256"
                    value={draft.maxTokens}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        maxTokens: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  Input context budget
                  <input
                    aria-label="Input context budget"
                    type="number"
                    min="4000"
                    max={Math.min(
                      500000,
                      (selected?.contextWindow || 502048) -
                        draft.maxTokens -
                        2048,
                    )}
                    step="1000"
                    value={draft.contextTokens}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        contextTokens: Number(e.target.value),
                      }))
                    }
                  />
                </label>
              </div>
              <p className="assistant-model-limit">
                Model context window:{" "}
                {selected?.contextWindow
                  ? `${selected.contextWindow.toLocaleString()} tokens`
                  : "not reported"}
                . Input uses an o200k tokenizer estimate; images need additional
                space.
              </p>
              <p className="assistant-model-limit">
                Max answer tokens trims the returned answer locally. This
                ChatGPT subscription provider manages its generation limit.
              </p>
              <div className="assistant-model-presets">
                {[8000, 32000, 64000, 128000]
                  .filter(
                    (n) =>
                      n <
                      (selected?.contextWindow || 0) - draft.maxTokens - 2048,
                  )
                  .map((n) => (
                    <button
                      type="button"
                      key={n}
                      onClick={() =>
                        setDraft((d) => ({ ...d, contextTokens: n }))
                      }
                    >
                      {n / 1000}k context
                    </button>
                  ))}
              </div>
              <button
                type="button"
                className="assistant-model-apply"
                disabled={saving || !selected || busy}
                onClick={async () => {
                  setSaving(true);
                  setError("");
                  try {
                    await request(`/api/assistant/${scope}/settings`, draft);
                    await onSaved();
                    setOpen(false);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Saving…" : "Apply for next message"}
              </button>
            </>
          )}
          {error && (
            <p className="assistant-model-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
