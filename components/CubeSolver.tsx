"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cube3D, { type MoveAnim } from "@/components/Cube3D";
import { diagnose } from "@/lib/diagnose";
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

const NO_MARKS: Record<Face, boolean> = {
  U: false,
  R: false,
  F: false,
  D: false,
  L: false,
  B: false,
};

export default function CubeSolver() {
  const [size, setSize] = useState<Size>(3);
  // Each puzzle keeps its own cube, so switching back and forth doesn't lose your work.
  const [cubes, setCubes] = useState<Record<Size, string>>({ 2: SOLVED2, 3: SOLVED });
  const facelets = cubes[size];
  const [history, setHistory] = useState<Record<Size, string>[]>([]); // for Undo
  const [attempted, setAttempted] = useState(false); // user pressed Solve on a cube that isn't valid
  const [activeFix, setActiveFix] = useState<number | null>(null);
  // Which sides the user has copied from their real cube. Only a progress reminder.
  const [marked, setMarked] = useState<Record<Size, Record<Face, boolean>>>({
    2: { ...NO_MARKS },
    3: { ...NO_MARKS },
  });
  const toggleMark = (face: Face) =>
    setMarked((m) => ({ ...m, [size]: { ...m[size], [face]: !m[size][face] } }));
  const clearMarks = () => setMarked((m) => ({ ...m, [size]: { ...NO_MARKS } }));
  const markedCount = FACES.filter((f) => marked[size][f]).length;
  const setFacelets = (update: string | ((f: string) => string)) => {
    setHistory((h) => [...h.slice(-199), cubes]);
    setAttempted(false);
    setActiveFix(null);
    setCubes((c) => ({ ...c, [size]: typeof update === "function" ? update(c[size]) : update }));
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setCubes(prev);
    setAttempted(false);
    setActiveFix(null);
    setError(null);
  };

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
  const complete = FACES.every((f) => counts[f] === perColor);
  const diag = useMemo(() => (inSolution ? null : diagnose(facelets, size)), [facelets, size, inSolution]);
  // Explain problems as soon as every sticker is painted, or when Solve was pressed.
  const showDiag = !inSolution && diag !== null && (complete || attempted);
  const problemStickers = new Set(showDiag && diag ? diag.stickers : []);
  const fixStickers = new Set(
    showDiag && diag && activeFix !== null ? (diag.fixes[activeFix]?.stickers ?? []) : [],
  );

  const paintSticker = (index: number) => {
    if (inSolution || facelets[index] === paint) return;
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
    clearMarks();
    setFacelets(three ? SOLVED : SOLVED2);
  };

  const scramble = () => {
    edit();
    clearMarks();
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
    clearMarks();
    setFacelets((f) => applyBySize(f, moves));
    setScrambleText("");
  };

  const solve = () => {
    if (diag) {
      setAttempted(true); // the panel below explains what is wrong
      return;
    }
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
            const full = counts[f] === perColor;
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
                <span
                  className={
                    bad
                      ? "font-semibold text-red-600"
                      : full
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-zinc-500"
                  }
                >
                  {counts[f]}/{perColor}
                  {full ? " ✓" : ""}
                </span>
              </button>
            );
          })}
        </section>
      )}

      {/* Which sides you have painted — a progress reminder, nothing is locked. */}
      {!inSolution && (
        <section aria-label="Sides painted" className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap justify-center gap-1.5">
            {FACES.map((f) => {
              const done = marked[size][f];
              return (
                <button
                  key={f}
                  onClick={() => toggleMark(f)}
                  aria-pressed={done}
                  aria-label={`${FACE_NAMES[f]} side ${done ? "marked as painted" : "not marked as painted"}`}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition ${
                    done
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full border border-black/30"
                    style={{ background: COLORS[f].hex }}
                  />
                  {f}
                  <span aria-hidden={!done}>{done ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
          <p className="text-center text-xs text-zinc-500">
            {markedCount}/6 sides marked as painted. Mark each side as you paint it — solving still
            works any time.
          </p>
        </section>
      )}

      {/* 3D or flat view, while painting and while stepping through a solution. */}
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

      {/* Cube net (flat painting, or the flat view of a solution) */}
      {view === "flat" && (
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
            className={`relative grid gap-0.5 rounded-md bg-zinc-900 p-0.5 ${
              !inSolution && marked[size][face] ? "ring-2 ring-emerald-500" : ""
            }`}
            style={{
              gridColumn: NET[face][0],
              gridRow: NET[face][1],
              gridTemplateColumns: `repeat(${size}, auto)`,
            }}
          >
            {!inSolution && marked[size][face] && (
              <span className="pointer-events-none absolute -right-1.5 -top-1.5 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                ✓
              </span>
            )}
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
                  className={`relative flex items-center justify-center rounded-[3px] text-xs font-bold text-black/50 ${
                    inSolution ? "cursor-default" : "cursor-pointer hover:brightness-90"
                  } ${
                    fixStickers.has(index)
                      ? "z-10 animate-pulse ring-4 ring-blue-500"
                      : problemStickers.has(index)
                        ? "z-10 ring-2 ring-red-600"
                        : ""
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

      {view === "3d" && (
        <Cube3D
          key={size}
          size={size}
          facelets={shown}
          anim={anim}
          onPaint={inSolution ? undefined : paintSticker}
        />
      )}

      {view === "3d" && (
        <p className="text-center text-xs text-zinc-500">
          {inSolution
            ? "Drag to rotate the cube · scroll or pinch to zoom"
            : "Click or tap a sticker to paint it · drag to rotate · scroll or pinch to zoom"}
        </p>
      )}

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
              <button
                onClick={undo}
                disabled={history.length === 0}
                className="rounded-lg border border-zinc-300 px-4 py-2 transition hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                ↶ Undo
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
            {view === "3d"
              ? "Drag to turn the cube, then click or tap a sticker to paint it. "
              : "Copy the net as laid out: Up on top; Left, Front, Right, Back across the middle; Down below. "}
            Hold the real cube with one face on top (U) and another facing you (F), and keep that grip —
            the solution moves use that same viewpoint.
          </p>
          <details className="mx-auto max-w-md text-xs text-zinc-600 dark:text-zinc-400">
            <summary className="cursor-pointer text-center">How to copy your real cube correctly</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Hold the cube with one face on top (Up) and another toward you (Front), and keep that grip all the way through.</li>
              <li>Front, Right, Back, Left: turn the whole cube around its vertical axis so Up stays on top, and copy each face as you see it.</li>
              <li>Up: look straight down at it, with the Front side nearest to you.</li>
              <li>Down: turn the cube so the bottom faces you, with the old Front side at the top of the face.</li>
              <li>A wrongly copied Down or Back face is the most common cause of &ldquo;impossible cube&rdquo; errors.</li>
            </ul>
          </details>
        </>
      )}

      {!inSolution && complete && !diag && (
        <p className="text-center text-sm font-medium text-emerald-700 dark:text-emerald-400">
          ✓ This cube looks valid — press Solve.
        </p>
      )}

      {showDiag && diag && (
        <section
          aria-live="polite"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <p className="font-medium">{diag.message}</p>
          {diag.stickers.length > 0 && (
            <p className="mt-1 text-xs opacity-80">The stickers in question have a red outline on the flat net.</p>
          )}
          {view === "3d" && (diag.stickers.length > 0 || diag.fixes.length > 0) && (
            <button
              onClick={() => setView("flat")}
              className="mt-2 rounded-md border border-amber-400 px-2.5 py-1 text-xs font-medium transition hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900"
            >
              Show the highlights on the flat net
            </button>
          )}
          {diag.fixes.length > 0 && (
            <>
              <p className="mt-2 text-xs opacity-80">{diag.fixHint}</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {diag.fixes.map((fix, i) => (
                  <li
                    key={i}
                    onMouseEnter={() => setActiveFix(i)}
                    onMouseLeave={() => setActiveFix(null)}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 ${
                      activeFix === i
                        ? "border-blue-500 bg-white dark:bg-zinc-900"
                        : "border-amber-200 dark:border-amber-900"
                    }`}
                  >
                    <button onClick={() => setActiveFix(i)} onFocus={() => setActiveFix(i)} className="text-left">
                      <span className="font-medium">{fix.title}</span>
                      <span className="block text-xs opacity-80">
                        {fix.changes.map((c) => `${FACE_NAMES[c.face]}: ${c.from} → ${c.to}`).join(" · ")}
                      </span>
                    </button>
                    <button
                      onClick={() => setFacelets(fix.result)}
                      className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-white dark:text-zinc-900"
                    >
                      Apply
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs opacity-80">
                If your real cube really looks the way you painted it, it was probably taken apart and rebuilt
                wrongly. It can&apos;t be solved by turning faces until that piece is fixed by hand.
              </p>
            </>
          )}
        </section>
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
              {!three && (
                <p className="text-center text-xs text-zinc-500">
                  On a 2×2 you only ever turn the Up, Right and Front faces: hold the Down–Back–Left corner
                  still and turn just those three.
                </p>
              )}
            </>
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
