import { z } from "zod";
import { getEncoding } from "js-tiktoken";
export const defaultModelSettings = {
  model: "gpt-6-luna",
  reasoning: "low",
  maxTokens: 3000,
  contextTokens: 32000,
};
export const modelSettingsSchema = z
  .object({
    model: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[\w./:-]+$/),
    reasoning: z
      .enum(["none", "low", "medium", "high", "xhigh", "max"])
      .optional(),
    maxTokens: z.number().int().min(256).max(32000).optional(),
    contextTokens: z.number().int().min(4000).max(500000).optional(),
  })
  .strict();
const encoding = getEncoding("o200k_base");
export const tokenCount = (text) => encoding.encode(text).length;
export function capAnswer(text, maxTokens) {
  const tokens = encoding.encode(text);
  return {
    text:
      tokens.length > maxTokens
        ? encoding.decode(tokens.slice(0, maxTokens))
        : text,
    truncated: tokens.length > maxTokens,
  };
}
export function packPrompt(data, system, budget) {
  const copy = structuredClone(data);
  let truncated = false;
  const count = () =>
    tokenCount(JSON.stringify(copy)) + tokenCount(system) + 64;
  // Preserve the current question and live evidence; trim older history and broad snapshots first.
  while (count() > budget && copy.history?.length) {
    copy.history.shift();
    truncated = true;
  }
  const context = copy.context;
  if (context && typeof context === "object") {
    for (const key of [
      "contacts",
      "events",
      "messages",
      "tasks",
      "notes",
      "driveFiles",
      "projects",
      "courses",
      "imports",
    ]) {
      while (count() > budget && context[key]?.length) {
        context[key] = context[key].slice(
          0,
          Math.floor(context[key].length / 2),
        );
        truncated = true;
      }
    }
  }
  while (count() > budget && copy.recalledMemories?.length) {
    copy.recalledMemories.pop();
    truncated = true;
  }
  for (const doc of copy.documents || [])
    while (count() > budget && doc.text.length) {
      doc.text = doc.text.slice(0, Math.floor(doc.text.length * 0.7));
      doc.truncated = true;
      truncated = true;
    }
  if (count() > budget && context?.google) {
    const text = JSON.stringify(context.google);
    const tokens = encoding.encode(text);
    const available = Math.max(0, budget - (count() - tokens.length) - 256);
    context.google = {
      truncated: true,
      data: encoding.decode(tokens.slice(0, available)),
    };
    truncated = true;
  }
  if (count() > budget && copy.memories?.length) {
    copy.memories = [];
    truncated = true;
  }
  if (count() > budget) {
    copy.context = {
      truncated: true,
      notice:
        "Context omitted to fit selected budget. Ask for a narrower lookup.",
    };
    copy.documents = [];
    truncated = true;
  }
  if (count() > budget)
    throw Error(
      "The message exceeds your context budget. Increase it or shorten the message.",
    );
  return {
    prompt: JSON.stringify(copy),
    truncated,
    inputTokens: count(),
    retainedMemoryIds: (copy.recalledMemories || []).map((m) => m.id),
    tokenizer: "o200k_base estimate; image tokens additional",
  };
}
