import Cube from "cubejs";
import { solve2 } from "./solver2";

type Req = { type: "solve" | "solve2"; facelets: string };

const post = (msg: unknown) =>
  (self as unknown as { postMessage: (m: unknown) => void }).postMessage(msg);

// Building the 3x3 solver's lookup tables takes a few seconds, so do it once up front.
Cube.initSolver();
post({ type: "ready" });

self.onmessage = (e: MessageEvent<Req>) => {
  try {
    if (e.data.type === "solve2") {
      // 2x2: shortest solution from a breadth-first table (built on first use, well under a second).
      post({ type: "solved", moves: solve2(e.data.facelets) });
      return;
    }
    if (e.data.type !== "solve") return;

    const cube = Cube.fromString(e.data.facelets);
    if (cube.isSolved()) {
      post({ type: "solved", moves: [] });
      return;
    }
    const solution = cube.solve();
    const moves = solution.split(" ").filter(Boolean);
    // Never trust the result blindly: replay it and check the cube really is solved.
    const check = Cube.fromString(e.data.facelets).move(solution);
    if (!check.isSolved()) throw new Error("Solver returned a solution that does not solve the cube.");
    post({ type: "solved", moves });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
