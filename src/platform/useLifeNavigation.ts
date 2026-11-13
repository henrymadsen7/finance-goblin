import { useEffect, useRef, useState } from "react";
import { readLifeRoute, lifeRouteURL } from "../../shared/life-navigation.js";
import type { LifeRoute } from "../../shared/life-navigation.js";
export default function useLifeNavigation() {
  const [route, setRoute] = useState(() => readLifeRoute(location.href));
  const current = useRef(route);
  useEffect(() => {
    const back = () => {
      current.current = readLifeRoute(location.href);
      setRoute(current.current);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const navigate = (patch: Partial<LifeRoute>) => {
    const next = { ...current.current, ...patch };
    const url = lifeRouteURL(location.href, next);
    if (url === location.href) return;
    history.pushState(null, "", url);
    current.current = next;
    setRoute(next);
  };
  return { route, navigate };
}
