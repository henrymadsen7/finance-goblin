export const defaultLifeAppearance = {
  background: "#0e151a",
  surface: "#192329",
  text: "#e9efed",
  muted: "#98aba6",
  accent: "#c1d8b4",
  border: "#647487",
  radius: 18,
};
export const lifePresets = [
  { name: "Midnight", appearance: defaultLifeAppearance },
  {
    name: "Graphite",
    appearance: {
      ...defaultLifeAppearance,
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
      ...defaultLifeAppearance,
      background: "#eaf0f3",
      surface: "#ffffff",
      text: "#17252f",
      muted: "#536877",
      accent: "#3269c7",
      border: "#8193a0",
    },
  },
];
