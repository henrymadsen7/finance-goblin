// Adapted from the owner’s Connect application; category spokes are not friendships.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
type Circle = {
  id: string;
  name: string;
  short: string;
  color: string;
  count: number;
};
type Person = { id: string; name: string; circles: string[] };
type Relationship = { id: string; from_id: string; to_id: string };

type Props = {
  people: Person[];
  circles: Circle[];
  relationships: Relationship[];
  mode: "3d" | "2d";
  reset: number;
  onSelect: (id: string) => void;
  onCircle: (id: string) => void;
};
const anchors = [
  [-190, 75, 25],
  [25, -95, 90],
  [175, 95, -20],
  [190, -115, 20],
  [-180, -105, -15],
  [-30, 135, -65],
  [25, 45, -110],
  [-75, -15, 75],
  [80, -30, 0],
];
const hash = (s: string) => {
  let n = 2166136261;
  for (const c of s) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
};

export default function NetworkGraph({
  people,
  circles,
  relationships,
  mode,
  reset,
  onSelect,
  onCircle,
}: Props) {
  const mount = useRef<HTMLDivElement>(null),
    selectRef = useRef(onSelect),
    circleRef = useRef(onCircle);
  selectRef.current = onSelect;
  circleRef.current = onCircle;
  const [hover, setHover] = useState<{
      name: string;
      x: number;
      y: number;
    } | null>(null),
    [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const el = mount.current;
    if (!el) return;
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
      camera = new THREE.PerspectiveCamera(43, 1, 1, 2000);
    camera.position.set(0, mode === "3d" ? 25 : 0, 610);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xfcfbf8, 0);
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive network visualization. Drag to orbit, scroll to zoom. Use the people list to select contacts with a keyboard.",
    );
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.enableRotate = mode === "3d";
    controls.minDistance = 100;
    controls.maxDistance = 2200;
    controls.target.set(0, 0, 0);
    controls.autoRotate = false;
    const geometry = new THREE.BufferGeometry(),
      positions: number[] = [],
      colors: number[] = [],
      linePositions: number[] = [],
      lineColors: number[] = [],
      pointsById = new Map<string, THREE.Vector3>();
    const visibleCircles = circles.filter((c) =>
      people.some((p) => p.circles[0] === c.id),
    );
    const circlesById = new Map(
      circles.map((c, i) => [
        c.id,
        {
          ...c,
          anchor: new THREE.Vector3(
            anchors[i % anchors.length][0] * 1.55,
            anchors[i % anchors.length][1],
            anchors[i % anchors.length][2],
          ),
        },
      ]),
    );
    const labels: HTMLButtonElement[] = [];
    for (const c of visibleCircles) {
      const info = circlesById.get(c.id)!;
      if (mode === "2d") info.anchor.z = 0;
      const label = document.createElement("button");
      label.className = "cluster-label";
      label.textContent = c.short;
      label.style.setProperty("--cluster-color", c.color);
      label.onclick = () => circleRef.current(c.id);
      label.setAttribute("aria-label", `Filter ${c.name}`);
      el.appendChild(label);
      labels.push(label);
    }
    for (const p of people) {
      const c = circlesById.get(p.circles[0]) || circlesById.get("other")!;
      const h = hash(p.id),
        a = ((h % 10000) / 10000) * Math.PI * 2,
        b = (((h >>> 10) % 1000) / 1000) * Math.PI,
        r = 22 + (((h >>> 18) % 1000) / 1000) * 70;
      const position = c.anchor
        .clone()
        .add(
          new THREE.Vector3(
            Math.cos(a) * Math.sin(b) * r,
            Math.sin(a) * Math.sin(b) * r * 0.77,
            mode === "3d" ? Math.cos(b) * r : 0,
          ),
        );
      pointsById.set(p.id, position);
      positions.push(position.x, position.y, position.z);
      const color = new THREE.Color(c.color);
      colors.push(color.r, color.g, color.b);
      linePositions.push(
        c.anchor.x,
        c.anchor.y,
        c.anchor.z,
        position.x,
        position.y,
        position.z,
      );
      const lc = color.clone();
      lineColors.push(lc.r, lc.g, lc.b, lc.r, lc.g, lc.b);
    }
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 64;
    glowCanvas.height = 64;
    const ctx = glowCanvas.getContext("2d")!,
      gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.7, "rgba(255,255,255,1)");
    gradient.addColorStop(0.9, "rgba(255,255,255,0)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(glowCanvas);
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!.clone();
    for (const c of visibleCircles) {
      bounds.expandByPoint(
        circlesById
          .get(c.id)!
          .anchor.clone()
          .add(new THREE.Vector3(0, -76, 0)),
      );
    }
    const center = bounds.isEmpty()
      ? new THREE.Vector3()
      : bounds.getCenter(new THREE.Vector3());
    const extent = bounds.isEmpty()
      ? new THREE.Vector3(760, 360, 150)
      : bounds.getSize(new THREE.Vector3());
    controls.target.copy(center);
    const material = new THREE.PointsMaterial({
      size: 10,
      map: texture,
      transparent: true,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(linePositions, 3),
    );
    lineGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(lineColors, 3),
    );
    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.13,
    });
    scene.add(new THREE.LineSegments(lineGeometry, lineMaterial));
    const knownLines: number[] = [];
    for (const r of relationships) {
      const a = pointsById.get(r.from_id),
        b = pointsById.get(r.to_id);
      if (a && b) knownLines.push(...a.toArray(), ...b.toArray());
    }
    const knownGeometry = new THREE.BufferGeometry();
    knownGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(knownLines, 3),
    );
    const knownMaterial = new THREE.LineBasicMaterial({
      color: "#b7d2ad",
      transparent: true,
      opacity: 0.8,
    });
    scene.add(new THREE.LineSegments(knownGeometry, knownMaterial));
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points!.threshold = 6;
    const mouse = new THREE.Vector2();
    let down = [0, 0],
      hoverId: string | null = null,
      frame = 0;
    const move = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      mouse.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);
      const hit = raycaster.intersectObject(points)[0];
      const person = hit && hit.index !== undefined ? people[hit.index] : null;
      hoverId = person?.id || null;
      renderer.domElement.style.cursor = person ? "pointer" : "grab";
      setHover(
        person
          ? {
              name: person.name,
              x: Math.min(event.clientX - rect.left + 12, rect.width - 190),
              y: event.clientY - rect.top - 34,
            }
          : null,
      );
    };
    const pointerDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
    };
    const click = (e: PointerEvent) => {
      if (hoverId && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5)
        selectRef.current(hoverId);
    };
    const leave = () => setHover(null);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", click);
    renderer.domElement.addEventListener("pointerleave", leave);
    const resize = () => {
      const width = el.clientWidth,
        height = el.clientHeight;
      camera.aspect = width / height;
      const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const distance =
        Math.max(
          250,
          (extent.y / 2 + 35) / halfFov,
          (extent.x / 2 + 45) / (halfFov * camera.aspect),
        ) +
        extent.z / 2;
      camera.position.set(
        center.x,
        center.y + (mode === "3d" ? 25 : 0),
        center.z + distance,
      );
      camera.lookAt(center);
      renderer.setSize(width, height);
      camera.updateProjectionMatrix();
      controls.update();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    const projected = new THREE.Vector3();
    const render = () => {
      renderer.render(scene, camera);
      visibleCircles.forEach((c, i) => {
        const center = circlesById.get(c.id)!.anchor;
        projected
          .copy(center)
          .add(new THREE.Vector3(0, -56, 0))
          .project(camera);
        labels[i].style.transform =
          `translate(${(projected.x * 0.5 + 0.5) * el.clientWidth}px,${(-projected.y * 0.5 + 0.5) * el.clientHeight}px) translate(-50%,-50%)`;
        labels[i].style.opacity = projected.z > 1 ? "0" : "1";
      });
    };
    controls.addEventListener("change", render);
    resize();
    render();
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (!frame) render();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
      observer.disconnect();
      controls.dispose();
      geometry.dispose();
      material.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      knownGeometry.dispose();
      knownMaterial.dispose();
      texture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labels.forEach((l) => l.remove());
    };
  }, [people, circles, relationships, mode, reset]);
  return (
    <div className="graph-mount" ref={mount}>
      {unavailable && (
        <div className="graph-fallback">
          3D rendering is unavailable in this browser.
          <br />
          Your full network is available in People.
        </div>
      )}
      {hover && (
        <div className="graph-tooltip" style={{ left: hover.x, top: hover.y }}>
          {hover.name}
          <span>Open profile ↗</span>
        </div>
      )}
    </div>
  );
}
