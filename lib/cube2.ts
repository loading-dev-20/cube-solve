// 2x2 ("pocket") cube model. Stickers are stored per face, 4 per face, row-major,
// in the same face order as the 3x3 (U R F D L B): 24 characters in total.
//
// A 2x2 has no centres, so the colour scheme is inferred from the pieces themselves.
// Moves and validation reuse the 3x3 model by embedding the 2x2 as a 3x3 whose edges and
// centres are solved and ignored.

import Cube from "cubejs/lib/cube";
import {
  COLORS,
  CORNER_COLORS,
  CORNER_FACELETS,
  FACES,
  SOLVED,
  colorCounts,
  randomCube,
  type Face,
} from "./cube";

export const SOLVED2 = FACES.map((f) => f.repeat(4)).join("");

/** 3x3 facelet index of a corner sticker -> index in the 24-sticker 2x2 string. */
const to2 = (f: number) => {
  const face = Math.floor(f / 9);
  const n = f % 9;
  return face * 4 + (Math.floor(n / 3) / 2) * 2 + (n % 3) / 2;
};
/** 2x2 sticker index -> index of the matching corner sticker in the 3x3 string. */
const to3 = (i: number) => {
  const face = Math.floor(i / 4);
  const k = i % 4;
  return face * 9 + Math.floor(k / 2) * 6 + (k % 2) * 2;
};

export const CORNER_SLOTS = CORNER_FACELETS.map((slot) => slot.map(to2));

/** Embed 24 face-letter stickers in a 3x3 string whose edges and centres are solved. */
export function expand(canonical: string): string {
  const out = SOLVED.split("");
  for (let i = 0; i < 24; i++) out[to3(i)] = canonical[i];
  return out.join("");
}

function extract(s54: string): string {
  let out = "";
  for (let i = 0; i < 24; i++) out += s54[to3(i)];
  return out;
}

type Analysis = { canonical: string; faceColor: Record<Face, string> } | { error: string };

const BAD_COLOURS =
  "These colours can't form a 2×2 cube — check which stickers share a corner.";

/**
 * Work out which colour is which face. The corner in the Down-Back-Left slot is the reference:
 * its three colours become D, B and L, and each one's opposite is the colour it never shares a
 * corner with (U, F and R).
 */
function analyse(colored: string): Analysis {
  const corners = CORNER_SLOTS.map((slot) => slot.map((i) => colored[i]));
  if (corners.some((c) => new Set(c).size !== 3))
    return { error: "A corner has two stickers of the same colour — that piece doesn't exist." };

  const near = new Map<string, Set<string>>();
  for (const c of corners)
    for (const x of c) {
      const set = near.get(x) ?? new Set<string>();
      c.forEach((y) => y !== x && set.add(y));
      near.set(x, set);
    }

  const opposite = (x: string) => {
    const rest = Object.keys(COLORS).filter((k) => k !== x && !near.get(x)?.has(k));
    return rest.length === 1 ? rest[0] : null;
  };

  const [a, b, c] = corners[6]; // stickers on the D, B and L faces of the reference corner
  const [ua, ub, uc] = [opposite(a), opposite(b), opposite(c)];
  if (!ua || !ub || !uc) return { error: BAD_COLOURS };

  const faceColor = { D: a, B: b, L: c, U: ua, F: ub, R: uc } as Record<Face, string>;
  const colorToFace = new Map<string, Face>();
  (Object.keys(faceColor) as Face[]).forEach((f) => colorToFace.set(faceColor[f], f));
  if (colorToFace.size !== 6) return { error: BAD_COLOURS };

  return {
    canonical: colored
      .split("")
      .map((ch) => colorToFace.get(ch)!)
      .join(""),
    faceColor,
  };
}

/** The cube as face letters (what the solver reads), or null if the colours make no sense. */
export function toCanonical2(colored: string): string | null {
  const a = analyse(colored);
  return "error" in a ? null : a.canonical;
}

/** Returns a human-readable problem with a painted 2×2, or null when it is possible. */
export function validateColored2(colored: string): string | null {
  if (colored.length !== 24) return "The cube must have 24 stickers.";
  const counts = colorCounts(colored);
  for (const f of FACES) {
    if (counts[f] !== 4)
      return `Each colour must appear exactly 4 times — ${COLORS[f].name} appears ${counts[f]} times.`;
  }

  const a = analyse(colored);
  if ("error" in a) return a.error;

  const pieces: number[] = [];
  let twist = 0;
  for (const slot of CORNER_SLOTS) {
    const l = slot.map((i) => a.canonical[i]);
    const ori = l.findIndex((c) => c === "U" || c === "D");
    const j = ori < 0 ? -1 : CORNER_COLORS.indexOf(`${l[ori]}${l[(ori + 1) % 3]}${l[(ori + 2) % 3]}`);
    if (j < 0)
      return "A corner has a colour combination that doesn't exist on a real cube. Re-check your stickers.";
    if (pieces.includes(j))
      return "The same corner appears twice. Re-check the stickers around the pieces you just changed.";
    pieces.push(j);
    twist += ori;
  }
  if (twist % 3 !== 0)
    return "One corner looks twisted in place — that's impossible on a real cube.";
  return null;
}

/** Apply moves to a 2×2 painted in colours; returned unchanged if the colours don't make sense. */
export function applyMoves2(colored: string, moves: string[]): string {
  if (moves.length === 0) return colored;
  const a = analyse(colored);
  if ("error" in a) return colored;
  const result = extract(Cube.fromString(expand(a.canonical)).move(moves.join(" ")).asString());
  return result
    .split("")
    .map((f) => a.faceColor[f as Face])
    .join("");
}

export function randomCube2(): string {
  return extract(randomCube());
}
