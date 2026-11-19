declare module "cubejs" {
  export default class Cube {
    cp: number[];
    co: number[];
    constructor(state?: unknown);
    static fromString(facelets: string): Cube;
    static random(): Cube;
    static initSolver(): void;
    static inverse(algorithm: string): string;
    move(algorithm: string): Cube;
    solve(maxDepth?: number): string;
    asString(): string;
    isSolved(): boolean;
  }
}

declare module "cubejs/lib/cube" {
  import Cube from "cubejs";
  export default Cube;
}
