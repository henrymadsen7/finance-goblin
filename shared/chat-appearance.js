export const defaultChatAppearance = {
  preset: "glass",
  background: "#152329",
  accent: "#c1d8b4",
};
export const chatPresets = [
  { name: "Glass", appearance: defaultChatAppearance },
  {
    name: "White",
    appearance: { preset: "white", background: "#ffffff", accent: "#242424" },
  },
  {
    name: "Black",
    appearance: { preset: "black", background: "#080808", accent: "#e6e6e6" },
  },
];
const rgb = (hex) => hex.match(/[a-f\d]{2}/gi).map((v) => parseInt(v, 16));
const mix = (a, b, amount) =>
  "#" +
  rgb(a)
    .map((v, i) =>
      Math.round(v * (1 - amount) + rgb(b)[i] * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const luminance = (hex) =>
  rgb(hex)
    .map((v) => {
      const n = v / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    })
    .reduce((s, n, i) => s + n * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) /
  (Math.min(luminance(a), luminance(b)) + 0.05);
const foreground = (background) =>
  contrast(background, "#171717") > contrast(background, "#f5f5f5")
    ? "#171717"
    : "#f5f5f5";
export function chatAppearanceVariables(appearance = defaultChatAppearance) {
  const { background, accent, preset } = appearance;
  const text = foreground(background),
    dark = text === "#f5f5f5";
  const surface = mix(background, text, dark ? 0.045 : 0.025);
  return {
    "--chat-bg": background,
    "--chat-surface": surface,
    "--chat-raised": mix(background, text, 0.075),
    "--chat-text": text,
    "--chat-muted":
      contrast(background, mix(background, text, 0.68)) >= 4.5
        ? mix(background, text, 0.68)
        : text,
    "--chat-border": mix(background, text, 0.22),
    "--chat-soft": mix(background, text, 0.07),
    "--chat-accent": accent,
    "--chat-on-accent": foreground(accent),
    "--chat-link": contrast(background, accent) >= 4.5 ? accent : text,
    "--chat-background":
      preset === "glass"
        ? `linear-gradient(160deg, #20332ff5, #111c24fa)`
        : background,
    colorScheme: dark ? "dark" : "light",
  };
}
