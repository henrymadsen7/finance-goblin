import React from "react";
import { createRoot } from "react-dom/client";
import Platform from "./platform/Platform";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "./styles.css";
import "./theme.css";
import "./customization.css";
import "./subscriptions.css";
document.body.classList.toggle(
  "desktop-platform",
  Boolean(window.financeDesktop),
);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Platform />
  </React.StrictMode>,
);
