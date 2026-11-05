export type WidgetId =
  | "cash"
  | "credit"
  | "income"
  | "expenses"
  | "net"
  | "pending"
  | "payments"
  | "cashFlow"
  | "categories"
  | "activity"
  | "accounts";
export type Appearance = {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  income: string;
  expense: string;
  pending: string;
  border: string;
  radius: number;
  categoryColors: string[];
};
export type PaymentRule = {
  accountId: string;
  dueDay: number;
  leadDays: number;
  autoPayConfirmed: boolean;
};
export type Preferences = {
  profileName: string;
  appearance: Appearance;
  widgets: WidgetId[];
  payments: PaymentRule[];
  timeZone: string;
};
export const widgetCatalog: [WidgetId, string][];
export const defaultAppearance: Appearance;
export const defaultPreferences: Preferences;
