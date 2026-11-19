import Cube from "cubejs/lib/cube";

/** Face order used by the solver: Up, Right, Front, Down, Left, Back. */
export const FACES = ["U", "R", "F", "D", "L", "B"] as const;
export type Face = (typeof FACES)[number];

export const FACE_NAMES: Record<Face, string> = {
  U: "Up",
  R: "Right",
  F: "Front",
  D: "Down",
  L: "Left",
  B: "Back",
};

/** Standard colour scheme: white top, green front. */
export const COLORS: Record<Face, { hex: string; name: string }> = {
  U: { hex: "#f8fafc", name: "White" },
  R: { hex: "#ef4444", name: "Red" },
  F: { hex: "#22c55e", name: "Green" },
  D: { hex: "#facc15", name: "Yellow" },
  L: { hex: "#fb923c", name: "Orange" },
  B: { hex: "#3b82f6", name: "Blue" },
};

export const SOLVED = FACES.map((f) => f.repeat(9)).join("");

const OFFSET: Record<Face, number> = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 };
const at = (face: Face, n: number) => OFFSET[face] + n - 1;

export const CORNER_FACELETS = [
  [at("U", 9), at("R", 1), at("F", 3)],
  [at("U", 7), at("F", 1), at("L", 3)],
  [at("U", 1), at("L", 1), at("B", 3)],
  [at("U", 3), at("B", 1), at("R", 3)],
  [at("D", 3), at("F", 9), at("R", 7)],
  [at("D", 1), at("L", 9), at("F", 7)],
  [at("D", 7), at("B", 9), at("L", 7)],
  [at("D", 9), at("R", 9), at("B", 7)],
];
export const EDGE_FACELETS = [
  [at("U", 6), at("R", 2)],
  [at("U", 8), at("F", 2)],
  [at("U", 4), at("L", 2)],
  [at("U", 2), at("B", 2)],
  [at("D", 6), at("R", 8)],
  [at("D", 2), at("F", 8)],
  [at("D", 4), at("L", 8)],
  [at("D", 8), at("B", 8)],
  [at("F", 6), at("R", 4)],
  [at("F", 4), at("L", 6)],
  [at("B", 6), at("L", 4)],
  [at("B", 4), at("R", 6)],
];
export const CORNER_COLORS = [
  "URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB",
];
export const EDGE_COLORS = [
  "UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR",
];

function parity(perm: number[]): number {
  let inversions = 0;
  for (let i = 0; i < perm.length; i++)
    for (let j = i + 1; j < perm.length; j++) if (perm[i] > perm[j]) inversions++;
  return inversions % 2;
}

export function colorCounts(facelets: string): Record<Face, number> {
  const counts = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 };
  for (const ch of facelets) if (ch in counts) counts[ch as Face]++;
  return counts;
}

/** Validates a cube painted in colours (any scheme). Returns a problem, or null if it is possible. */
export function validateColored(facelets: string): string | null {
  if (facelets.length !== 54) return "The cube must have 54 stickers.";
  const centres = FACES.map((_, i) => facelets[i * 9 + 4]);
  if (new Set(centres).size !== 6)
    return "The six centre stickers must all be different colours — each centre is a different face.";
  const counts = colorCounts(facelets);
  for (const f of FACES) {
    if (counts[f] !== 9)
      return `Each colour must appear exactly 9 times — ${COLORS[f].name} appears ${counts[f]} times.`;
  }
  return validateFacelets(toCanonical(facelets)!);
}

/** Returns a human-readable problem for a canonical (face-letter) cube, or null when it is possible. */
export function validateFacelets(s: string): string | null {
  if (s.length !== 54) return "The cube must have 54 stickers.";

  const counts = colorCounts(s);
  for (const f of FACES) {
    if (counts[f] !== 9)
      return `Each colour must appear exactly 9 times — ${COLORS[f].name} appears ${counts[f]} times.`;
  }

  const impossible =
    "A piece has a colour combination that doesn't exist on a real cube. Re-check your stickers.";
  const duplicate =
    "The same piece appears twice. Re-check the stickers around the pieces you just changed.";

  const cp: number[] = [];
  let twist = 0;
  for (const slot of CORNER_FACELETS) {
    const l = slot.map((k) => s[k]);
    const ori = l.findIndex((c) => c === "U" || c === "D");
    if (ori < 0) return impossible;
    const piece = `${l[ori]}${l[(ori + 1) % 3]}${l[(ori + 2) % 3]}`;
    const j = CORNER_COLORS.indexOf(piece);
    if (j < 0) return impossible;
    if (cp.includes(j)) return duplicate;
    cp.push(j);
    twist += ori;
  }

  const ep: number[] = [];
  let flip = 0;
  for (const slot of EDGE_FACELETS) {
    const pair = `${s[slot[0]]}${s[slot[1]]}`;
    let j = EDGE_COLORS.indexOf(pair);
    if (j < 0) {
      j = EDGE_COLORS.indexOf(pair[1] + pair[0]);
      if (j < 0) return impossible;
      flip += 1;
    }
    if (ep.includes(j)) return duplicate;
    ep.push(j);
  }

  if (twist % 3 !== 0)
    return "One corner looks twisted in place — that's impossible on a real cube.";
  if (flip % 2 !== 0)
    return "One edge looks flipped in place — that's impossible on a real cube.";
  if (parity(cp) !== parity(ep))
    return "Two pieces look swapped — that's impossible on a real cube.";

  return null;
}

const MOVE = /^[URFDLB][2']?$/;

/** Parses "R U R' U'" into tokens, or returns null if any token is not a valid move. */
export function parseMoves(text: string): string[] | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return tokens.every((t) => MOVE.test(t)) ? tokens : null;
}

/**
 * The stickers the user paints are *colours*. The solver wants *face letters*, where each
 * letter is the face whose centre carries that colour. These helpers convert between the two,
 * so any colour scheme works as long as the six centres are different colours.
 */
export function toCanonical(facelets: string): string | null {
  const faceOfColor = new Map<string, Face>();
  FACES.forEach((face, i) => faceOfColor.set(facelets[i * 9 + 4], face));
  if (faceOfColor.size !== 6) return null;
  return facelets
    .split("")
    .map((c) => faceOfColor.get(c) ?? c)
    .join("");
}

function fromCanonical(canonical: string, facelets: string): string {
  return canonical
    .split("")
    .map((f) => facelets[FACES.indexOf(f as Face) * 9 + 4])
    .join("");
}

export function hasDistinctCentres(facelets: string): boolean {
  return toCanonical(facelets) !== null;
}

/** Apply moves to a cube given as painted colours; returns it unchanged if the centres clash. */
export function applyMoves(facelets: string, moves: string[]): string {
  if (moves.length === 0) return facelets;
  const canonical = toCanonical(facelets);
  if (!canonical) return facelets;
  const result = Cube.fromString(canonical).move(moves.join(" ")).asString();
  return fromCanonical(result, facelets);
}

export function randomCube(): string {
  return Cube.random().asString();
}

export function describeMove(move: string): string {
  const face = FACE_NAMES[move[0] as Face];
  if (move.endsWith("2")) return `Turn the ${face} face 180°`;
  if (move.endsWith("'")) return `Turn the ${face} face 90° counter-clockwise`;
  return `Turn the ${face} face 90° clockwise`;
}

export function invertMove(move: string): string {
  if (move.endsWith("2")) return move;
  return move.endsWith("'") ? move[0] : `${move[0]}'`;
}
