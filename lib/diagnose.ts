// Explains *why* a painted cube is impossible and suggests the most likely repairs.
// It works on the painted colours and never changes them itself.

import {
  COLORS,
  CORNER_COLORS,
  CORNER_FACELETS,
  EDGE_COLORS,
  EDGE_FACELETS,
  FACES,
  FACE_NAMES,
  colorCounts,
  toCanonical,
  validateColored,
  type Face,
} from "./cube";
import { CORNER_SLOTS, toCanonical2, validateColored2 } from "./cube2";

export type Change = { index: number; face: Face; from: string; to: string };
export type Fix = {
  title: string;
  /** Sticker indices this fix touches (for highlighting). */
  stickers: number[];
  changes: Change[];
  /** The whole cube after applying the fix. */
  result: string;
};
export type Diagnosis = {
  message: string;
  /** Stickers that are definitely involved in the problem. */
  stickers: number[];
  fixes: Fix[];
  fixHint?: string;
};

const colourName = (c: string) => COLORS[c as Face].name;
const pieceName = (letters: string) =>
  letters
    .split("")
    .map((l) => FACE_NAMES[l as Face])
    .join("–");
const joinColours = (cs: string[]) => cs.map(colourName).join("–");

function validate(colored: string, size: 2 | 3) {
  return size === 3 ? validateColored(colored) : validateColored2(colored);
}

/** Returns null when the cube is valid, otherwise what is wrong and what could fix it. */
export function diagnose(colored: string, size: 2 | 3): Diagnosis | null {
  const three = size === 3;
  const per = size * size;
  const perColor = three ? 9 : 4;
  const problem = validate(colored, size);
  if (!problem) return null;
  const base: Diagnosis = { message: problem, stickers: [], fixes: [] };

  // --- the six centres must differ (3x3) ---
  if (three) {
    const byColour = new Map<string, number[]>();
    FACES.forEach((_, f) => {
      const i = f * 9 + 4;
      byColour.set(colored[i], [...(byColour.get(colored[i]) ?? []), i]);
    });
    const dupes = [...byColour.values()].filter((v) => v.length > 1).flat();
    if (dupes.length) return { ...base, stickers: dupes };
  }

  // --- every colour must appear the right number of times ---
  const counts = colorCounts(colored);
  if (FACES.some((f) => counts[f] !== perColor)) return base;

  const cornerSlots = three ? CORNER_FACELETS : CORNER_SLOTS;
  const edgeSlots = three ? EDGE_FACELETS : [];
  const canonical = three ? toCanonical(colored) : toCanonical2(colored);

  if (!canonical) {
    // 2x2 only: colours that cannot belong to one cube. Point at corners repeating a colour.
    const bad = cornerSlots.filter((s) => new Set(s.map((i) => colored[i])).size !== 3).flat();
    return { ...base, stickers: bad };
  }

  // canonical face letter -> the colour painted for that face
  const faceColour = new Map<string, string>();
  canonical.split("").forEach((f, i) => faceColour.set(f, colored[i]));

  // --- scan every corner and edge for pieces that don't exist or appear twice ---
  const impossible: { label: string; slot: number[] }[] = [];
  const duplicates: { label: string; slots: number[][] }[] = [];
  const seenCorner = new Map<number, number[]>();
  const seenEdge = new Map<number, number[]>();

  cornerSlots.forEach((slot, s) => {
    const l = slot.map((i) => canonical[i]);
    const ori = l.findIndex((c) => c === "U" || c === "D");
    const j = ori < 0 ? -1 : CORNER_COLORS.indexOf(`${l[ori]}${l[(ori + 1) % 3]}${l[(ori + 2) % 3]}`);
    const label = `${pieceName(CORNER_COLORS[s])} corner`;
    if (j < 0) return void impossible.push({ label, slot });
    const first = seenCorner.get(j);
    if (first) duplicates.push({ label: `${joinColours(slot.map((i) => colored[i]))} corner`, slots: [first, slot] });
    else seenCorner.set(j, slot);
  });
  edgeSlots.forEach((slot, s) => {
    const pair = slot.map((i) => canonical[i]).join("");
    let j = EDGE_COLORS.indexOf(pair);
    if (j < 0) j = EDGE_COLORS.indexOf(pair[1] + pair[0]);
    const label = `${pieceName(EDGE_COLORS[s])} edge`;
    if (j < 0) return void impossible.push({ label, slot });
    const first = seenEdge.get(j);
    if (first) duplicates.push({ label: `${joinColours(slot.map((i) => colored[i]))} edge`, slots: [first, slot] });
    else seenEdge.set(j, slot);
  });

  if (impossible.length) {
    const first = impossible[0];
    const colours = joinColours(first.slot.map((i) => colored[i]));
    const more = impossible.length > 1 ? ` (and ${impossible.length - 1} more highlighted)` : "";
    return {
      ...base,
      message: `The ${first.label} reads ${colours}, a colour combination no real piece has${more}. At least one highlighted sticker was copied with the wrong colour.`,
      stickers: impossible.flatMap((p) => p.slot),
    };
  }

  if (duplicates.length) {
    const d = duplicates[0];
    const missing = [...CORNER_COLORS.keys()].find((j) => !seenCorner.has(j));
    const hint =
      missing !== undefined && d.label.endsWith("corner")
        ? ` The ${joinColours([...CORNER_COLORS[missing]].map((l) => faceColour.get(l)!))} corner is missing, so one of the two is probably that piece.`
        : "";
    return {
      ...base,
      message: `The ${d.label} appears twice (both highlighted) — a real cube has only one of each piece.${hint}`,
      stickers: duplicates.flatMap((p) => p.slots.flat()),
    };
  }

  // --- all pieces exist once, but the cube is still impossible: twist / flip / swap ---
  const fixes: Fix[] = [];
  const consider = (title: string, indices: number[], moved: string[]) => {
    const next = colored.split("");
    indices.forEach((idx, k) => (next[idx] = moved[k]));
    const result = next.join("");
    if (validate(result, size) !== null) return;
    fixes.push({
      title,
      stickers: indices,
      result,
      changes: indices.map((index) => ({
        index,
        face: FACES[Math.floor(index / per)],
        from: colourName(colored[index]),
        to: colourName(result[index]),
      })),
    });
  };

  cornerSlots.forEach((slot, s) => {
    const c = slot.map((i) => colored[i]);
    const name = `${pieceName(CORNER_COLORS[s])} corner`;
    consider(`Twist the ${name}`, slot, [c[1], c[2], c[0]]);
    consider(`Twist the ${name}`, slot, [c[2], c[0], c[1]]);
  });
  edgeSlots.forEach((slot, s) => {
    const c = slot.map((i) => colored[i]);
    consider(`Flip the ${pieceName(EDGE_COLORS[s])} edge`, slot, [c[1], c[0]]);
  });

  if (problem.includes("twisted"))
    return {
      message:
        "Every corner piece exists, but one corner's three colours are in the wrong rotation — the most common copying slip. It can be any corner, so check the suggestions against your real cube.",
      stickers: [],
      fixes,
      fixHint: "Hover or tap a suggestion to see where it is on the net. Apply the one that matches your real cube.",
    };
  if (problem.includes("flipped"))
    return {
      message:
        "Every edge piece exists, but one edge has its two colours the wrong way round. It can be any edge, so check the suggestions against your real cube.",
      stickers: [],
      fixes,
      fixHint: "Hover or tap a suggestion to see where it is on the net. Apply the one that matches your real cube.",
    };
  return {
    ...base,
    message:
      "Every piece exists once, but two pieces look swapped. Compare the pieces around the last stickers you painted with your real cube — a mis-copied pair of neighbouring stickers is the usual cause.",
  };
}
