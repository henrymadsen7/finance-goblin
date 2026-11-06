import { z } from "zod";
import { defaultPreferences, widgetCatalog } from "../shared/preferences.js";
import { safeBillingUrl } from "../shared/subscription-links.js";
const color = z.string().regex(/^#[\da-fA-F]{6}$/);
export const subscriptionReviewSchema = z
  .object({
    transactionId: z.string().min(1).max(200),
    decision: z.enum(["auto", "confirmed", "dismissed"]),
    category: z.string().trim().min(1).max(80).optional(),
    billingUrl: z
      .string()
      .max(2000)
      .refine(
        safeBillingUrl,
        "Use an HTTPS billing URL without embedded credentials.",
      )
      .optional(),
  })
  .strict();
export const preferencesSchema = z
  .object({
    profileName: z.string().trim().min(1).max(40),
    appearance: z
      .object({
        background: color,
        surface: color,
        text: color,
        muted: color,
        accent: color,
        income: color,
        expense: color,
        pending: color,
        border: color,
        radius: z.number().int().min(6).max(30),
        categoryColors: z.array(color).min(3).max(16),
      })
      .strict(),
    widgets: z
      .array(z.enum(widgetCatalog.map(([id]) => id)))
      .max(widgetCatalog.length)
      .refine((v) => new Set(v).size === v.length, "Widgets must be unique"),
    payments: z
      .array(
        z
          .object({
            accountId: z.string().min(1).max(200),
            dueDay: z.number().int().min(1).max(31),
            leadDays: z.number().int().min(1).max(14),
            autoPayConfirmed: z.boolean(),
          })
          .strict(),
      )
      .max(50)
      .refine(
        (v) => new Set(v.map((p) => p.accountId)).size === v.length,
        "One schedule per card",
      ),
    subscriptionReviews: z
      .array(subscriptionReviewSchema)
      .max(500)
      .refine(
        (v) => new Set(v.map((r) => r.transactionId)).size === v.length,
        "One review per charge",
      )
      .default([]),
    timeZone: z
      .string()
      .max(80)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }),
  })
  .strict();
export function readPreferences(store) {
  const saved = store.get("preferences", "dashboard");
  const parsed = preferencesSchema.safeParse(saved);
  const preferences = parsed.success
    ? parsed.data
    : structuredClone(defaultPreferences);
  preferences.payments = preferences.payments.filter(
    (plan) => store.get("account", plan.accountId)?.type === "credit",
  );
  return preferences;
}
