"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { COLORS, FACES, type Face } from "@/lib/cube";
import { moveSpec, stickerSlot } from "@/lib/cube3d";

export type MoveAnim = { move: string; id: number };

type Props = {
  /** Cube state to show (54 facelet letters, U R F D L B order). */
  facelets: string;
  /** When set, `facelets` is the result of this move: turn the layer, then show the new colours. */
  anim: MoveAnim | null;
  durationMs?: number;
  /** 2 for a pocket cube, 3 for a standard cube. */
  size?: 2 | 3;
};

type Api = {
  setColors: (facelets: string) => void;
  turn: (move: string, durationMs: number, onDone: () => void) => void;
  finish: () => void;
};

const SPACING = 1;
const BODY = 0.96;
const STICKER = 0.82;

function labelTexture(letter: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.font = "bold 84px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, 64, 70);
  return new THREE.CanvasTexture(canvas);
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export default function Cube3D({ facelets, anim, durationMs = 450, size = 3 }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);

  // Build the scene once.
  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(4.6, 4.0, 5.6); // sees the Up, Front and Right faces
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minDistance = 5;
    controls.maxDistance = 14;

    const root = new THREE.Group();
    scene.add(root);

    const disposables: { dispose: () => void }[] = [];
    const bodyGeo = new THREE.BoxGeometry(BODY, BODY, BODY);
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0x15151a });
    const stickerGeo = new THREE.PlaneGeometry(STICKER, STICKER);
    disposables.push(bodyGeo, bodyMat, stickerGeo);

    const stickerMats: THREE.MeshBasicMaterial[] = [];
    const cubies: { group: THREE.Group; base: THREE.Vector3 }[] = [];
    const cubieAt = new Map<string, THREE.Group>();

    const coords = size === 2 ? [-0.5, 0.5] : [-1, 0, 1];
    root.scale.setScalar(3 / size); // a 2x2 is drawn bigger so it fills the view like a 3x3
    for (const x of coords)
      for (const y of coords)
        for (const z of coords) {
          const group = new THREE.Group();
          const base = new THREE.Vector3(x, y, z).multiplyScalar(SPACING);
          group.position.copy(base);
          group.add(new THREE.Mesh(bodyGeo, bodyMat));
          root.add(group);
          cubies.push({ group, base });
          cubieAt.set([x, y, z].join(","), group);
        }

    const orient = (mesh: THREE.Object3D, n: [number, number, number]) => {
      if (n[0] === 1) mesh.rotation.y = Math.PI / 2;
      else if (n[0] === -1) mesh.rotation.y = -Math.PI / 2;
      else if (n[1] === 1) mesh.rotation.x = -Math.PI / 2;
      else if (n[1] === -1) mesh.rotation.x = Math.PI / 2;
      else if (n[2] === -1) mesh.rotation.y = Math.PI;
    };

    const count = 6 * size * size;
    for (let i = 0; i < count; i++) {
      const { pos, normal } = stickerSlot(i, size);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      stickerMats[i] = mat;
      disposables.push(mat);
      const mesh = new THREE.Mesh(stickerGeo, mat);
      mesh.position.set(normal[0], normal[1], normal[2]).multiplyScalar(BODY / 2 + 0.002);
      orient(mesh, normal);
      cubieAt.get(pos.join(","))!.add(mesh);

      if (size === 3 && i % 9 === 4) {
        // Label the centres (U R F D L B) so you can tell which face is which.
        const tex = labelTexture(FACES[Math.floor(i / 9)]);
        const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
        disposables.push(tex, labelMat);
        const label = new THREE.Mesh(stickerGeo, labelMat);
        label.position.z = 0.003;
        mesh.add(label);
      }
    }

    // --- animation state ---
    let current: { pivot: THREE.Group; axis: number; target: number; start: number; duration: number; onDone: () => void } | null = null;

    const reset = () => {
      if (!current) return;
      const { pivot } = current;
      for (const { group, base } of cubies) {
        if (group.parent === pivot) {
          root.add(group);
          group.position.copy(base);
          group.quaternion.identity();
        }
      }
      root.remove(pivot);
      current = null;
    };

    const axisVec = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

    const api: Api = {
      setColors(f) {
        for (let i = 0; i < count; i++) stickerMats[i].color.set(COLORS[f[i] as Face].hex);
      },
      turn(move, duration, onDone) {
        api.finish();
        const { axis, layer, angle } = moveSpec(move);
        const pivot = new THREE.Group();
        root.add(pivot);
        for (const { group, base } of cubies) {
          // Outer layer on the side `layer` points to (the middle slice of a 3x3 is at 0 and is skipped).
          if ([base.x, base.y, base.z][axis] * layer > 0) pivot.add(group);
        }
        current = { pivot, axis, target: angle, start: performance.now(), duration, onDone };
      },
      finish() {
        if (!current) return;
        const { onDone } = current;
        reset();
        onDone();
      },
    };
    apiRef.current = api;

    // --- sizing + render loop ---
    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight || w;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (current) {
        const t = Math.min(1, (now - current.start) / current.duration);
        current.pivot.setRotationFromAxisAngle(axisVec[current.axis], current.target * easeInOut(t));
        if (t >= 1) {
          const { onDone } = current;
          reset();
          onDone();
        }
      }
      controls.update();
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      apiRef.current = null;
    };
  }, [size]);

  // React to a new state: snap to it, or play the move that leads to it.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.finish();
    if (anim) {
      api.turn(anim.move, durationMs, () => api.setColors(facelets));
    } else {
      api.setColors(facelets);
    }
    // `durationMs` is intentionally not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facelets, anim]);

  return (
    <div
      ref={mountRef}
      className="mx-auto aspect-square w-full max-w-md touch-none rounded-xl bg-gradient-to-b from-zinc-200 to-zinc-100 dark:from-zinc-800 dark:to-zinc-900"
      aria-label="3D cube — drag to rotate"
    />
  );
}
