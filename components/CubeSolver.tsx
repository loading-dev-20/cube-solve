"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cube3D, { type MoveAnim } from "@/components/Cube3D";
import {
  COLORS,
  FACES,
  FACE_NAMES,
  SOLVED,
  applyMoves,
  colorCounts,
  describeMove,
  invertMove,
  hasDistinctCentres,
  parseMoves,
  toCanonical,
  randomCube,
  validateColored,
  type Face,
} from "@/lib/cube";
import {
  SOLVED2,
  applyMoves2,
  randomCube2,
  toCanonical2,
  validateColored2,
} from "@/lib/cube2";

// Where each face sits in the unfolded net (column, row), 1-based.
const NET: Record<Face, [number, number]> = {
  U: [2, 1],
  L: [1, 2],
  F: [2, 2],
  R: [3, 2],
  B: [4, 2],
  D: [2, 3],
};

type WorkerMsg =
  | { type: "ready" }
  | { type: "solved"; moves: string[] }
  | { type: "error"; message: string };

type Size = 2 | 3;

export default function CubeSolver() {
  const [size, setSize] = useState<Size>(3);
  // Each puzzle keeps its own cube, so switching back and forth doesn't lose your work.
  const [cubes, setCubes] = useState<Record<Size, string>>({ 2: SOLVED2, 3: SOLVED });
  const facelets = cubes[size];
  const setFacelets = (update: string | ((f: string) => string)) =>
    setCubes((c) => ({ ...c, [size]: typeof update === "function" ? update(c[size]) : update }));

  const three = size === 3;
  const perFace = size * size;
  const perColor = three ? 9 : 4;
  const applyBySize = three ? applyMoves : applyMoves2;
  const [paint, setPaint] = useState<Face>("R");
  const [scrambleText, setScrambleText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [workerReady, setWorkerReady] = useState(false);
  const [solving, setSolving] = useState(false);
  const [solution, setSolution] = useState<string[] | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<"3d" | "flat">("3d");
  const [anim, setAnim] = useState<MoveAnim | null>(null);
  const animId = useRef(0);

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("../lib/solver.worker.ts", import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
      const msg = e.data;
      if (msg.type === "ready") setWorkerReady(true);
      if (msg.type === "solved") {
        setSolving(false);
        setSolution(msg.moves);
        setStep(0);
        setAnim(null);
      }
      if (msg.type === "error") {
        setSolving(false);
        setError(msg.message);
      }
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const inSolution = solution !== null;

  // The cube shown on screen: the entered cube, advanced by `step` moves of the solution.
  const shown = useMemo(
    () => (solution ? applyBySize(facelets, solution.slice(0, step)) : facelets),
    [facelets, solution, step, applyBySize],
  );

  // Auto-play through the solution.
  useEffect(() => {
    if (!playing || !solution || step >= solution.length) return;
    const id = setTimeout(() => {
      setAnim({ move: solution[step], id: ++animId.current });
      setStep(step + 1);
    }, 850);
    return () => clearTimeout(id);
  }, [playing, step, solution]);

  const counts = colorCounts(facelets);

  const paintSticker = (index: number) => {
    if (inSolution) return;
    setError(null);
    setFacelets((f) => f.slice(0, index) + paint + f.slice(index + 1));
  };

  const edit = useCallback(() => {
    setSolution(null);
    setStep(0);
    setAnim(null);
    setPlaying(false);
    setError(null);
  }, []);

  /** Move to a step; single steps animate the turn, bigger jumps just snap. */
  const goTo = (target: number) => {
    if (!solution) return;
    const next = Math.max(0, Math.min(solution.length, target));
    if (next === step) return;
    let move: string | null = null;
    if (next === step + 1) move = solution[step];
    else if (next === step - 1) move = invertMove(solution[next]);
    setAnim(move ? { move, id: ++animId.current } : null);
    setStep(next);
  };

  const reset = () => {
    edit();
    setFacelets(three ? SOLVED : SOLVED2);
  };

  const scramble = () => {
    edit();
    setFacelets(three ? randomCube() : randomCube2());
  };

  const changeSize = (next: Size) => {
    if (next === size) return;
    edit();
    setSize(next);
  };

  const applyScramble = () => {
    const moves = parseMoves(scrambleText);
    if (!moves) {
      setError("Use moves like R U R' U' F2 — letters U R F D L B, optionally followed by ' or 2.");
      return;
    }
    const problem = three
      ? hasDistinctCentres(facelets)
        ? null
        : "Give the six centre stickers different colours first, so I know which face is which."
      : validateColored2(facelets);
    if (problem) {
      setError(three ? problem : `Fix the cube first so I can tell the colours apart: ${problem}`);
      return;
    }
    edit();
    setFacelets((f) => applyBySize(f, moves));
    setScrambleText("");
  };

  const solve = () => {
    const problem = three ? validateColored(facelets) : validateColored2(facelets);
    const canonical = three ? toCanonical(facelets) : toCanonical2(facelets);
    if (problem || !canonical) {
      setError(problem ?? "These colours don't make a valid cube.");
      return;
    }
    setError(null);
    setSolving(true);
    // The solver works on face letters; the moves it returns are positional, so they apply as-is.
    workerRef.current?.postMessage({ type: three ? "solve" : "solve2", facelets: canonical });
  };

  const done = solution !== null && step === solution.length;
  const isPlaying = playing && !done;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Rubik&apos;s Cube Solver</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Enter your cube, then watch it solve itself step by step in 3D.
        </p>
      </header>

      <div className="flex justify-center gap-1 text-sm" role="group" aria-label="Cube type">
        {([3, 2] as const).map((n) => (
          <button
            key={n}
            onClick={() => changeSize(n)}
            aria-pressed={size === n}
            className={`rounded-full border px-5 py-1.5 font-medium ${
              size === n
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            {n}×{n} cube
          </button>
        ))}
      </div>

      {/* Palette */}
      {!inSolution && (
        <section aria-label="Colour palette" className="flex flex-wrap justify-center gap-2">
          {FACES.map((f) => {
            const active = paint === f;
            const bad = counts[f] > perColor;
            return (
              <button
                key={f}
                onClick={() => setPaint(f)}
                aria-pressed={active}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                  active
                    ? "border-zinc-900 ring-2 ring-zinc-900 dark:border-white dark:ring-white"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
              >
                <span
                  className="inline-block h-5 w-5 rounded border border-black/30"
                  style={{ background: COLORS[f].hex }}
                />
                <span>{COLORS[f].name}</span>
                <span className={bad ? "font-semibold text-red-600" : "text-zinc-500"}>
                  {counts[f]}/{perColor}
                </span>
              </button>
            );
          })}
        </section>
      )}

      {/* Cube net (editing, or the flat view of a solution) */}
      {(!inSolution || view === "flat") && (
      <section
        aria-label="Cube net"
        className="mx-auto grid gap-1.5"
        style={
          {
            "--s": three ? "clamp(1.5rem, 6.4vw, 2.6rem)" : "clamp(2.1rem, 9vw, 3.6rem)",
            gridTemplateColumns: "repeat(4, auto)",
            gridTemplateRows: "repeat(3, auto)",
          } as React.CSSProperties
        }
      >
        {FACES.map((face, fi) => (
          <div
            key={face}
            className="relative grid gap-0.5 rounded-md bg-zinc-900 p-0.5"
            style={{
              gridColumn: NET[face][0],
              gridRow: NET[face][1],
              gridTemplateColumns: `repeat(${size}, auto)`,
            }}
          >
            {!three && (
              // A 2x2 has no centre sticker to label the face, so mark it in the middle.
              <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-900 text-[9px] font-bold text-white">
                {face}
              </span>
            )}
            {Array.from({ length: perFace }, (_, n) => {
              const index = fi * perFace + n;
              const letter = shown[index] as Face;
              const center = three && n === 4;
              return (
                <button
                  key={n}
                  onClick={() => paintSticker(index)}
                  disabled={inSolution}
                  aria-label={`${FACE_NAMES[face]} face, sticker ${n + 1}: ${COLORS[letter].name}`}
                  className={`flex items-center justify-center rounded-[3px] text-xs font-bold text-black/50 ${
                    inSolution ? "cursor-default" : "cursor-pointer hover:brightness-90"
                  }`}
                  style={{
                    width: "var(--s)",
                    height: "var(--s)",
                    background: COLORS[letter].hex,
                  }}
                >
                  {center ? face : null}
                </button>
              );
            })}
          </div>
        ))}
      </section>
      )}

      {inSolution && view === "3d" && <Cube3D key={size} size={size} facelets={shown} anim={anim} />}

      {/* Edit controls */}
      {!inSolution && (
        <>
          <section className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={solve}
                disabled={!workerReady || solving}
                className="rounded-lg bg-zinc-900 px-5 py-2 font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {solving ? "Solving…" : workerReady ? "Solve" : "Loading solver…"}
              </button>
              <button
                onClick={scramble}
                className="rounded-lg border border-zinc-300 px-4 py-2 transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Random scramble
              </button>
              <button
                onClick={reset}
                className="rounded-lg border border-zinc-300 px-4 py-2 transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Reset
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                applyScramble();
              }}
              className="flex w-full max-w-md gap-2"
            >
              <input
                value={scrambleText}
                onChange={(e) => setScrambleText(e.target.value)}
                placeholder="Or type moves to apply: R U R' U' F2"
                aria-label="Moves to apply"
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              />
              <button
                type="submit"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Apply
              </button>
            </form>
          </section>
          <p className="text-center text-xs text-zinc-500">
            {three
              ? "Paint all 54 stickers, centres included. "
              : "Paint all 24 stickers — a 2×2 has no centres, and any colour scheme works. "}
            Hold the cube with one face on top (U) and another facing you (F), then copy it as laid out here:
            Up on top; Left, Front, Right, Back across the middle; Down below. The solution moves are given
            from that same viewpoint.
          </p>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {/* Solution */}
      {solution && (
        <section className="flex flex-col gap-4">
          <div className="text-center">
            {solution.length === 0 ? (
              <p className="text-lg font-semibold">This cube is already solved 🎉</p>
            ) : (
              <>
                <p className="text-lg font-semibold">
                  Solved in {solution.length} move{solution.length === 1 ? "" : "s"}
                  {!three && <span className="text-sm font-normal text-zinc-500"> (shortest possible)</span>}
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {done
                    ? "Cube solved! 🎉"
                    : step === 0
                      ? "Press Next to start."
                      : `Move ${step}/${solution.length} done. Next: ${solution[step]} — ${describeMove(solution[step])}`}
                </p>
              </>
            )}
          </div>

          {solution.length > 0 && (
            <>
              <div className="flex flex-wrap justify-center gap-2">
                <button onClick={() => { setPlaying(false); setAnim(null); setStep(0); }} disabled={step === 0} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-zinc-700">⏮ Start</button>
                <button onClick={() => { setPlaying(false); goTo(step - 1); }} disabled={step === 0} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-zinc-700">← Back</button>
                <button
                  onClick={() => {
                    if (isPlaying) {
                      setPlaying(false);
                    } else {
                      if (done) {
                        setAnim(null);
                        setStep(0);
                      }
                      setPlaying(true);
                    }
                  }}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
                >
                  {isPlaying ? "⏸ Pause" : "▶ Play"}
                </button>
                <button onClick={() => { setPlaying(false); goTo(step + 1); }} disabled={done} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-zinc-700">Next →</button>
              </div>

              <ol className="flex flex-wrap justify-center gap-1.5" aria-label="Solution moves">
                {solution.map((m, i) => (
                  <li key={i}>
                    <button
                      onClick={() => {
                        setPlaying(false);
                        goTo(i + 1);
                      }}
                      className={`min-w-10 rounded-md border px-2 py-1 font-mono text-sm ${
                        i === step
                          ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                          : i < step
                            ? "border-zinc-200 text-zinc-400 line-through dark:border-zinc-800"
                            : "border-zinc-300 dark:border-zinc-700"
                      }`}
                    >
                      {m}
                    </button>
                  </li>
                ))}
              </ol>

              <p className="text-center text-xs text-zinc-500">
                U/D/L/R/F/B = Up, Down, Left, Right, Front, Back face. Plain = 90° clockwise looking at
                that face, &apos; = counter-clockwise, 2 = half turn.
              </p>
            </>
          )}

          <div className="flex justify-center gap-1 text-sm" role="group" aria-label="View">
            {(["3d", "flat"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`rounded-full border px-4 py-1 ${
                  view === v
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
              >
                {v === "3d" ? "3D cube" : "Flat net"}
              </button>
            ))}
          </div>
          {view === "3d" && (
            <p className="text-center text-xs text-zinc-500">Drag to rotate the cube · scroll or pinch to zoom</p>
          )}
          <div className="flex justify-center">
            <button
              onClick={edit}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Edit cube
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
