# Rubik's Cube Solver

Next.js (App Router, TypeScript, Tailwind) app that solves 3×3 and 2×2 cubes.
3×3 uses Kociemba's two-phase algorithm ([`cubejs`](https://www.npmjs.com/package/cubejs));
2×2 uses its own solver that finds the shortest possible solution.
Solving runs entirely in the browser inside a Web Worker, so it needs no server and no API keys.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
```

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel: **Add New → Project**, import the repo, keep the defaults (Framework: Next.js), click **Deploy**.

Or with the CLI: `npx vercel` (then `npx vercel --prod`).

## How it works

- `lib/cube.ts` – facelet tables, validation (colour counts, twisted corner, flipped edge, swapped pieces), move helpers.
- `lib/solver.worker.ts` – builds the solver tables once (a few seconds), solves on request, and re-checks every solution.
- `lib/cube2.ts` / `lib/solver2.ts` – 2×2 model (colour scheme inferred from the pieces, no centres needed) and optimal solver (breadth-first distance table, built in well under a second).
- `lib/diagnose.ts` – explains why a painted cube is impossible (bad/duplicate piece, twisted corner, flipped edge) and offers one-click repairs.
- `lib/cube3d.ts` – pure geometry for the 3D cube (sticker positions, layer turns).
- `components/Cube3D.tsx` – Three.js cube with drag-to-rotate and animated layer turns.
- `components/CubeSolver.tsx` – paintable cube net, random scramble, "type moves" input, and the step-through player (3D or flat view).
