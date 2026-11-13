import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { MemoryEntry } from "./MemoryView";
const colors = { life: 0xb9d7b0, finance: 0x9ebee5, shared: 0xd5b7e4 };
export default function MemoryGraph({
  entries,
  mode,
  onSelect,
}: {
  entries: MemoryEntry[];
  mode: "2d" | "3d";
  onSelect: (id: string) => void;
}) {
  const mount = useRef<HTMLDivElement>(null),
    select = useRef(onSelect);
  select.current = onSelect;
  const [hover, setHover] = useState(""),
    [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    setUnavailable(false);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch {
      setUnavailable(true);
      return;
    }
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(42, 1, 1, 3000);
    const background = new THREE.Color(
      getComputedStyle(el.parentElement!).backgroundColor,
    );
    const light = background.r + background.g + background.b > 1.5;
    const palette = light
      ? { life: 0x4f7243, finance: 0x3e6e9d, shared: 0x83539b }
      : colors;
    camera.position.set(0, mode === "3d" ? 50 : 0, 600);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Memory graph: drag to pan or orbit, scroll to zoom, click an entry for its source.",
    );
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enableRotate = mode === "3d";
    const geometry = new THREE.BufferGeometry(),
      positions: number[] = [],
      rgb: number[] = [];
    const locations: THREE.Vector3[] = [];
    const groups = new Map<string, number>();
    const color = new THREE.Color();
    const nodes = entries.map((m, i) => {
      const key = m.projectId || m.threadId || m.scope;
      if (!groups.has(key)) groups.set(key, groups.size);
      const g = groups.get(key)!;
      const angle = g * 2.399963;
      const local = i * 0.82;
      const p = new THREE.Vector3(
        Math.cos(angle) * 130 + Math.cos(local) * ((i % 7) * 7 + 12),
        Math.sin(angle) * 125 + Math.sin(local) * ((i % 9) * 5 + 12),
        mode === "3d" ? ((i % 13) - 6) * 12 : 0,
      );
      locations.push(p);
      positions.push(p.x, p.y, p.z);
      color.setHex(palette[m.scope as keyof typeof colors] || palette.shared);
      rgb.push(color.r, color.g, color.b);
      return m;
    });
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
    const material = new THREE.PointsMaterial({
      size: 7,
      vertexColors: true,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);
    const links: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
      let count = 0;
      for (let j = i + 1; j < nodes.length && count < 3; j++) {
        const a = nodes[i],
          b = nodes[j];
        if (
          (a.threadId && a.threadId === b.threadId) ||
          (a.projectId && a.projectId === b.projectId) ||
          a.tags.some((t) => b.tags.includes(t))
        ) {
          links.push(...locations[i].toArray(), ...locations[j].toArray());
          count++;
        }
      }
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(links, 3),
    );
    const lineMaterial = new THREE.LineBasicMaterial({
      color: light ? 0x405c51 : 0xa9c4bd,
      transparent: true,
      opacity: 0.14,
    });
    scene.add(new THREE.LineSegments(lineGeometry, lineMaterial));
    const render = () => renderer.render(scene, camera);
    const resize = () => {
      const w = Math.max(el.clientWidth, 1),
        h = Math.max(el.clientHeight, 1);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    controls.addEventListener("change", render);
    resize();
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 9 };
    const pointer = new THREE.Vector2();
    let down = [0, 0];
    const hit = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObject(points)[0]?.index;
    };
    const move = (e: PointerEvent) => {
      const i = hit(e);
      setHover(i === undefined ? "" : nodes[i]?.title || "Memory");
      renderer.domElement.style.cursor = i === undefined ? "grab" : "pointer";
    };
    const start = (e: PointerEvent) => (down = [e.clientX, e.clientY]);
    const click = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const i = hit(e);
      if (i !== undefined && nodes[i]) select.current(nodes[i].id);
    };
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerdown", start);
    renderer.domElement.addEventListener("pointerup", click);
    return () => {
      observer.disconnect();
      controls.dispose();
      geometry.dispose();
      material.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      setHover("");
    };
  }, [entries, mode]);
  return (
    <div className="memory-map">
      <div className="memory-map-canvas" ref={mount} />
      <div className="memory-map-legend">
        <span>● Life</span>
        <span>● Finance</span>
        <span>● Shared</span>
      </div>
      {hover && <div className="memory-map-hover">{hover}</div>}
      {unavailable && (
        <p className="memory-map-unavailable">
          WebGL is unavailable. Use Search & list to browse every entry.
        </p>
      )}
    </div>
  );
}
