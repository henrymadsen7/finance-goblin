import { useEffect, useState } from "react";
import LiquidGlass from "liquid-glass-react";
const still = { x: 0, y: 0 };
// Decorative only: the real buttons retain their native semantics and focus.
// No screenshots, remote resources, or tracking are used for this effect.
export function GlassChrome({ radius = 16 }: { radius?: number }) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const preferences = matchMedia(
      "(prefers-reduced-transparency: reduce), (prefers-contrast: more)",
    );
    const update = () => setReduced(preferences.matches);
    update();
    preferences.addEventListener("change", update);
    return () => preferences.removeEventListener("change", update);
  }, []);
  if (reduced) return null;
  return (
    <div className="glass-chrome" aria-hidden="true">
      <LiquidGlass
        className="liquid-surface"
        displacementScale={18}
        blurAmount={0.16}
        saturation={115}
        aberrationIntensity={0.35}
        elasticity={0}
        cornerRadius={radius}
        padding="0"
        mode="standard"
        globalMousePos={still}
        mouseOffset={still}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: "100%",
          height: "100%",
        }}
      >
        <span />
      </LiquidGlass>
    </div>
  );
}
