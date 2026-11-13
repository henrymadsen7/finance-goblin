export type ChatAppearance = {
  preset: "glass" | "white" | "black" | "custom";
  background: string;
  accent: string;
};
export const defaultChatAppearance: ChatAppearance;
export const chatPresets: { name: string; appearance: ChatAppearance }[];
export function chatAppearanceVariables(
  appearance?: ChatAppearance,
): Record<string, string>;
