// Optimal 2x2 solver. One corner (Down-Back-Left) never moves when you only turn the
// U, R and F faces, which leaves 7! x 3^6 = 3,674,160 states. A breadth-first search from
// the solved state gives every state's exact distance, so solving is just walking downhill.

import Cube from "cubejs/lib/cube";
import { expand } from "./cube2";

const MOVES = ["U", "U2", "U'", "R", "R2", "R'", "F", "F2", "F'"];
const FREE = [0, 1, 2, 3, 4, 5, 7]; // every corner slot / piece except Down-Back-Left (6)
const PERMS = 5040; // 7!
const ORIS = 729; // 3^6

const FACT = [1, 1, 2, 6, 24, 120, 720];
const SLOT_OF_PIECE = new Map(FREE.map((piece, k) => [piece, k]));

function rankPerm(cp: number[]): number {
  const p = FREE.map((slot) => SLOT_OF_PIECE.get(cp[slot])!);
  let r = 0;
  for (let i = 0; i < 7; i++) {
    let smaller = 0;
    for (let j = i + 1; j < 7; j++) if (p[j] < p[i]) smaller++;
    r += smaller * FACT[6 - i];
  }
  return r;
}

function unrankPerm(r: number): number[] {
  const pool = [0, 1, 2, 3, 4, 5, 6];
  const cp = new Array<number>(8).fill(6);
  for (let i = 0; i < 7; i++) {
    const idx = Math.floor(r / FACT[6 - i]);
    r %= FACT[6 - i];
    cp[FREE[i]] = FREE[pool.splice(idx, 1)[0]];
  }
  return cp;
}

function rankOri(co: number[]): number {
  let r = 0;
  for (let k = 5; k >= 0; k--) r = r * 3 + co[FREE[k]];
  return r;
}

function unrankOri(r: number): number[] {
  const co = new Array<number>(8).fill(0);
  let sum = 0;
  for (let k = 0; k < 6; k++) {
    co[FREE[k]] = r % 3;
    sum += co[FREE[k]];
    r = Math.floor(r / 3);
  }
  co[FREE[6]] = (3 - (sum % 3)) % 3;
  return co;
}

type Tables = { permMove: Uint16Array[]; oriMove: Uint16Array[]; dist: Uint8Array };
let tables: Tables | null = null;

function build(): Tables {
  if (tables) return tables;

  const defs = MOVES.map((m) => {
    const c = new Cube().move(m);
    return { cp: c.cp, co: c.co };
  });

  const permMove = defs.map(({ cp: mcp }) => {
    const t = new Uint16Array(PERMS);
    for (let p = 0; p < PERMS; p++) {
      const cp = unrankPerm(p);
      t[p] = rankPerm(cp.map((_, i) => cp[mcp[i]]));
    }
    return t;
  });
  const oriMove = defs.map(({ cp: mcp, co: mco }) => {
    const t = new Uint16Array(ORIS);
    for (let o = 0; o < ORIS; o++) {
      const co = unrankOri(o);
      t[o] = rankOri(co.map((_, i) => (co[mcp[i]] + mco[i]) % 3));
    }
    return t;
  });

  const dist = new Uint8Array(PERMS * ORIS).fill(255);
  const queue = new Int32Array(PERMS * ORIS);
  const start = rankPerm([0, 1, 2, 3, 4, 5, 6, 7]) * ORIS + rankOri(new Array(8).fill(0));
  dist[start] = 0;
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  while (head < tail) {
    const s = queue[head++];
    const p = Math.floor(s / ORIS);
    const o = s - p * ORIS;
    const d = dist[s] + 1;
    for (let m = 0; m < 9; m++) {
      const ns = permMove[m][p] * ORIS + oriMove[m][o];
      if (dist[ns] === 255) {
        dist[ns] = d;
        queue[tail++] = ns;
      }
    }
  }

  tables = { permMove, oriMove, dist };
  return tables;
}

/** Shortest solution (in face turns) for a 2x2 given as 24 face letters. */
export function solve2(canonical: string): string[] {
  const { permMove, oriMove, dist } = build();
  const cube = Cube.fromString(expand(canonical));
  if (cube.cp[6] !== 6 || cube.co[6] !== 0) throw new Error("Reference corner is not in place.");

  let p = rankPerm(cube.cp);
  let o = rankOri(cube.co);
  const moves: string[] = [];
  for (let d = dist[p * ORIS + o]; d > 0; d--) {
    let found = false;
    for (let m = 0; m < 9 && !found; m++) {
      const np = permMove[m][p];
      const no = oriMove[m][o];
      if (dist[np * ORIS + no] === d - 1) {
        moves.push(MOVES[m]);
        p = np;
        o = no;
        found = true;
      }
    }
    if (!found) throw new Error("2×2 solver table is inconsistent.");
  }

  // Replay the answer on the real model and check every corner landed home.
  const check = Cube.fromString(expand(canonical));
  if (moves.length) check.move(moves.join(" "));
  const home = check.cp.every((c, i) => c === i) && check.co.every((c) => c === 0);
  if (!home) throw new Error("2×2 solution did not solve the cube.");
  return moves;
}
