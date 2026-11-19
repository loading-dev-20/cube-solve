// Pure geometry for the 3D cube (no three.js import, so it can be unit-tested in Node).
// Coordinates: +x right, +y up, +z toward the viewer (Front). Cubies sit at -1, 0, 1.

import { FACES, type Face } from "./cube";

type Vec = [number, number, number];

/**
 * Sticker index -> where that sticker lives on an n x n x n cube (n = 2 or 3) and which way it
 * faces. Cubie centres sit at -h..h in steps of 1, where h = (n - 1) / 2.
 */
export function stickerSlot(index: number, n = 3): { pos: Vec; normal: Vec } {
  const face = FACES[Math.floor(index / (n * n))];
  const k = index % (n * n);
  const r = Math.floor(k / n);
  const c = k % n;
  const h = (n - 1) / 2;
  switch (face) {
    case "U": return { pos: [c - h, h, r - h], normal: [0, 1, 0] };
    case "R": return { pos: [h, h - r, h - c], normal: [1, 0, 0] };
    case "F": return { pos: [c - h, h - r, h], normal: [0, 0, 1] };
    case "D": return { pos: [c - h, -h, h - r], normal: [0, -1, 0] };
    case "L": return { pos: [-h, h - r, c - h], normal: [-1, 0, 0] };
    case "B": return { pos: [h - c, h - r, -h], normal: [0, 0, -1] };
  }
}

const MOVE_AXIS: Record<Face, { axis: 0 | 1 | 2; layer: -1 | 1; clockwise: 1 | -1 }> = {
  // `clockwise` is the sign of the right-hand-rule rotation about +axis that
  // looks clockwise when you face that side of the cube.
  U: { axis: 1, layer: 1, clockwise: -1 },
  D: { axis: 1, layer: -1, clockwise: 1 },
  R: { axis: 0, layer: 1, clockwise: -1 },
  L: { axis: 0, layer: -1, clockwise: 1 },
  F: { axis: 2, layer: 1, clockwise: -1 },
  B: { axis: 2, layer: -1, clockwise: 1 },
};

/** Which layer a move turns, about which axis, and by how many radians (right-hand rule). */
export function moveSpec(move: string) {
  const { axis, layer, clockwise } = MOVE_AXIS[move[0] as Face];
  const turns = move.endsWith("2") ? 2 : 1;
  const dir = move.endsWith("'") ? -clockwise : clockwise;
  return { axis, layer, angle: dir * turns * (Math.PI / 2) };
}

/** Rotate a vector about a coordinate axis by `angle` radians (right-hand rule). */
export function rotateVec(v: Vec, axis: 0 | 1 | 2, angle: number): Vec {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const [x, y, z] = v;
  const out: Vec =
    axis === 0 ? [x, y * c - z * s, y * s + z * c]
    : axis === 1 ? [x * c + z * s, y, -x * s + z * c]
    : [x * c - y * s, x * s + y * c, z];
  // Snap to the nearest half so repeated rotations never drift (cubie centres are multiples of 0.5).
  return out.map((n) => Math.round(n * 2) / 2) as Vec;
}
