import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowUpRight, ArrowLeft, Leaf, Wallet, Grid2X2 } from "lucide-react";
import { GlassChrome } from "../Glass";
import Assistant from "./Assistant";
import "./platform.css";
const Finance = lazy(() => import("../App")),
  Life = lazy(() => import("./Life"));
type Workspace = "life" | "finance";
export default function Platform() {
  const params = new URLSearchParams(location.search),
    initial = params.get("workspace");
  const [workspace, setWorkspace] = useState<Workspace | null>(
    initial === "life" || initial === "finance" ? initial : null,
  );
  const [remember, setRemember] = useState(
    localStorage.getItem("platform-remember") === "true",
  );
  useEffect(() => {
    if (!initial && localStorage.getItem("platform-remember") === "true") {
      const w = localStorage.getItem("platform-workspace");
      if (w === "life" || w === "finance") setWorkspace(w);
    }
  }, []);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) e.preventDefault();
    };
    const up = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.button === 3 ? history.back() : history.forward();
      }
    };
    const aux = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) e.preventDefault();
    };
    const key = (e: KeyboardEvent) => {
      if (
        (e.metaKey && (e.key === "[" || e.key === "]")) ||
        (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight"))
      ) {
        e.preventDefault();
        e.key === "[" || e.key === "ArrowLeft"
          ? history.back()
          : history.forward();
      }
    };
    window.addEventListener("mousedown", down, true);
    window.addEventListener("mouseup", up, true);
    window.addEventListener("auxclick", aux, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("mouseup", up, true);
      window.removeEventListener("auxclick", aux, true);
      window.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    const jump = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!["life", "finance"].includes(d.scope)) return;
      localStorage.setItem(`assistant-active-thread-${d.scope}`, d.threadId);
      if (d.scope !== workspace) {
        sessionStorage.setItem(`assistant-autoopen-${d.scope}`, "true");
        setWorkspace(d.scope);
        const u = new URL(location.href);
        u.searchParams.set("workspace", d.scope);
        for (const k of ["page", "course", "person", "project", "edit"])
          u.searchParams.delete(k);
        history.pushState(null, "", u);
      }
    };
    window.addEventListener("assistant-open-thread", jump);
    return () => window.removeEventListener("assistant-open-thread", jump);
  }, [workspace]);
  const enter = (w: Workspace) => {
    setWorkspace(w);
    localStorage.setItem("platform-workspace", w);
    localStorage.setItem("platform-remember", String(remember));
    const url = new URL(location.href);
    url.searchParams.set("workspace", w);
    for (const key of ["page", "course", "person", "project", "edit"])
      url.searchParams.delete(key);
    history.pushState(null, "", url);
  };
  useEffect(() => {
    const back = () => {
      const w = new URLSearchParams(location.search).get("workspace");
      setWorkspace(w === "life" || w === "finance" ? w : null);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  useEffect(() => {
    document.title =
      workspace === "life"
        ? "Life"
        : workspace === "finance"
          ? "Finance Goblin"
          : "Welcome";
    document.body.dataset.workspace = workspace || "welcome";
  }, [workspace]);
  if (!workspace)
    return (
      <main className="platform-welcome">
        <div className="welcome-art" aria-hidden="true">
          <svg viewBox="0 0 1400 900" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="bloom">
                <stop stopColor="#b3d5ae" stopOpacity=".38" />
                <stop offset="1" stopColor="#8cafbb" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="980" cy="400" r="500" fill="url(#bloom)" />
            {Array.from({ length: 28 }, (_, i) => (
              <path
                key={i}
                className="welcome-branch"
                style={{ animationDelay: `${i * 0.16}s` }}
                d={`M ${-100 + i * 22} 1000 C ${250 + i * 9} ${700 - i * 13}, ${1000 - i * 18} ${600 + i * 7}, ${800 + i * 16} ${-100 + i * 5}`}
                fill="none"
                stroke={i % 3 === 0 ? "#b8d49f" : "#8da4bb"}
                strokeWidth={i % 5 === 0 ? 1.4 : 0.6}
              />
            ))}
            {Array.from({ length: 14 }, (_, i) => (
              <text
                key={i}
                x={750 + ((i * 71) % 500)}
                y={80 + i * 53}
                fill="#b8cebc"
                opacity=".22"
                fontSize="11"
                fontFamily="monospace"
              >
                {
                  [
                    "root → branch → bloom",
                    "const tomorrow = await today()",
                    "01001000 01101111 01101101 01100101",
                    "{ rhythm, memory, possibility }",
                    "growth += a_little_every_day",
                  ][i % 5]
                }
              </text>
            ))}
          </svg>
        </div>
        <div className="welcome-content">
          <span className="welcome-mark">
            <Leaf size={23} />
          </span>
          <h1>
            <span>Welcome</span>
            <i aria-hidden="true" />
          </h1>
          <p>Choose your workspace.</p>
          <div className="welcome-choices">
            <button onClick={() => enter("life")}>
              <GlassChrome radius={22} />
              <Leaf size={25} />
              <span>
                <strong>Life</strong>
                <small>Your days, projects, and people.</small>
              </span>
              <ArrowUpRight size={22} />
            </button>
            <button onClick={() => enter("finance")}>
              <GlassChrome radius={22} />
              <Wallet size={25} />
              <span>
                <strong>Finance Goblin</strong>
                <small>Your money, clearly.</small>
              </span>
              <ArrowUpRight size={22} />
            </button>
          </div>
          <label className="welcome-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => {
                setRemember(e.target.checked);
                localStorage.setItem(
                  "platform-remember",
                  String(e.target.checked),
                );
              }}
            />{" "}
            Open my last workspace next time
          </label>
        </div>
        <span className="welcome-bottom">
          A little more room for what matters.
        </span>
      </main>
    );
  return (
    <>
      <Suspense
        fallback={
          <div className="platform-loading" role="status">
            Opening {workspace === "life" ? "Life" : "Finance Goblin"}…
          </div>
        }
      >
        {workspace === "life" ? <Life /> : <Finance />}
      </Suspense>
      <div className="workspace-switch">
        <button
          aria-label="Choose workspace"
          title="Choose workspace"
          onClick={() => {
            setWorkspace(null);
            const u = new URL(location.href);
            u.searchParams.delete("workspace");
            for (const key of ["page", "course", "person", "project", "edit"])
              u.searchParams.delete(key);
            history.pushState(null, "", u);
          }}
        >
          <Grid2X2 size={16} />
        </button>
        <button
          onClick={() => enter(workspace === "life" ? "finance" : "life")}
        >
          <ArrowLeft size={14} />
          {workspace === "life" ? "Finance Goblin" : "Life"}
        </button>
      </div>
      <Assistant key={workspace} scope={workspace} />
    </>
  );
}
