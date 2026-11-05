import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Daily } from "./types";
import { ChartTooltip } from "./ChartTooltip";
import type { Appearance } from "../shared/preferences.js";
import { defaultAppearance } from "../shared/preferences.js";
export default function Landscape({
  days,
  onSelect,
  selected,
  hidden = false,
  palette = defaultAppearance,
}: {
  days: Daily[];
  onSelect: (date: string) => void;
  selected: string | null;
  hidden?: boolean;
  palette?: Appearance;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    day: Daily;
    kind: string;
    x: number;
    y: number;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0, 0);
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D daily income and expense chart. Drag to rotate or select a bar. Use the Cash flow daily list for keyboard day selection.",
    );
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
    camera.position.set(3, 17, 26);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 2, 0);
    controls.enablePan = false;
    controls.minDistance = 19;
    controls.maxDistance = 70;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.35;
    controls.enableDamping = false;
    controls.maxAzimuthAngle = 0.6;
    controls.minAzimuthAngle = -0.6;
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(-8, 15, 10);
    scene.add(light);
    const fill = new THREE.PointLight(palette.accent, 90);
    fill.position.set(-8, 5, 3);
    scene.add(fill);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 10),
      new THREE.MeshStandardMaterial({
        color: palette.surface,
        roughness: 1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.5,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    scene.add(floor);
    for (let z = -4; z <= 4; z += 1) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-15, 0, z),
        new THREE.Vector3(15, 0, z),
      ]);
      scene.add(
        new THREE.Line(
          g,
          new THREE.LineBasicMaterial({
            color: palette.muted,
            transparent: true,
            opacity: 0.5,
          }),
        ),
      );
    }
    for (let x = -15; x <= 15; x += 1) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0, -4),
        new THREE.Vector3(x, 0, 4),
      ]);
      scene.add(
        new THREE.Line(
          g,
          new THREE.LineBasicMaterial({
            color: palette.muted,
            transparent: true,
            opacity: 0.4,
          }),
        ),
      );
    }
    const max = Math.max(
      ...days.flatMap((d) => [
        Math.abs(d.income),
        Math.abs(d.expense),
        d.pending,
      ]),
      1,
    );
    const width = 26 / Math.max(days.length, 1);
    const bars: THREE.Mesh[] = [];
    days.forEach((day, i) => {
      const x = (i - (days.length - 1) / 2) * width;
      [
        ["income", day.income, palette.income, -1.4],
        ["expense", day.expense, palette.expense, 1.1],
        ["pending", day.pending, palette.pending, 3],
      ].forEach(([kind, value, color, z]) => {
        if (Number(value) === 0) return;
        const height = Math.max((Math.abs(Number(value)) / max) * 7, 0.05);
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.61, height, 0.7),
          new THREE.MeshStandardMaterial({
            color: String(color),
            emissive: String(color),
            emissiveIntensity: selected === day.date ? 0.45 : 0.12,
            roughness: 0.28,
            metalness: 0.25,
            transparent: true,
            opacity: !selected || selected === day.date ? 1 : 0.38,
          }),
        );
        mesh.position.set(
          x,
          (height / 2) * Math.sign(Number(value)),
          Number(z),
        );
        mesh.userData = { day, kind };
        scene.add(mesh);
        bars.push(mesh);
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry),
          new THREE.LineBasicMaterial({
            color: String(color),
            transparent: true,
            opacity: 0.5,
          }),
        );
        mesh.add(edges);
      });
    });
    const raycaster = new THREE.Raycaster();
    let down = { x: 0, y: 0 };
    function hit(event: PointerEvent) {
      const r = el!.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - r.left) / r.width) * 2 - 1,
          (-(event.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      return {
        object: raycaster.intersectObjects(bars, false)[0]?.object,
        x: event.clientX - r.left,
        y: event.clientY - r.top,
      };
    }
    const move = (event: PointerEvent) => {
      const { object, x, y } = hit(event);
      el!.style.cursor = object ? "pointer" : "grab";
      const point = new THREE.Vector3();
      const intersects = raycaster.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        point,
      );
      const nearest = Math.max(
        0,
        Math.min(
          days.length - 1,
          Math.round(point.x / width + (days.length - 1) / 2),
        ),
      );
      const day = object
        ? object.userData.day
        : intersects
          ? days[nearest]
          : null;
      setHover(
        day
          ? { day, kind: object?.userData.kind || "daily totals", x, y }
          : null,
      );
    };
    const start = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
      move(e);
    };
    const click = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const { object } = hit(e);
      if (object) onSelect(object.userData.day.date);
    };
    const leave = () => setHover(null);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", start);
    el.addEventListener("pointerup", click);
    el.addEventListener("pointerleave", leave);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);
    const resize = new ResizeObserver(() => {
      const w = el.clientWidth,
        h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      const fit = Math.max(
        31,
        35 / (2 * Math.tan(THREE.MathUtils.degToRad(17)) * camera.aspect),
      );
      camera.position.copy(
        new THREE.Vector3(3, 15, 26)
          .normalize()
          .multiplyScalar(fit)
          .add(controls.target),
      );
      controls.update();
      camera.updateProjectionMatrix();
      render();
    });
    resize.observe(el);
    render();
    return () => {
      controls.removeEventListener("change", render);
      resize.disconnect();
      controls.dispose();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", start);
      el.removeEventListener("pointerup", click);
      el.removeEventListener("pointerleave", leave);
      scene.traverse((o) => {
        if (
          o instanceof THREE.Mesh ||
          o instanceof THREE.Line ||
          o instanceof THREE.LineSegments
        ) {
          o.geometry.dispose();
          const materials = Array.isArray(o.material)
            ? o.material
            : [o.material];
          materials.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [days, onSelect, selected, palette]);
  return (
    <div className="landscape" ref={host}>
      {failed && (
        <div className="chart-fallback">
          3D is unavailable in this browser. Switch to 2D to view your daily
          cash flow.
        </div>
      )}
      {hover && (
        <>
          <div
            className="chart-crosshair three-crosshair"
            style={{ left: hover.x }}
          />
          <ChartTooltip
            day={hover.day}
            x={hover.x}
            y={hover.y}
            width={host.current?.clientWidth || 600}
            height={host.current?.clientHeight || 290}
            hidden={hidden}
          />
        </>
      )}
    </div>
  );
}
