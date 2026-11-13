export type LifeAppearance = { background: string; surface: string; text: string; muted: string; accent: string; border: string; radius: number };
export const defaultLifeAppearance: LifeAppearance;
export const lifePresets: { name: string; appearance: LifeAppearance }[];
