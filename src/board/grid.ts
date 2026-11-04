/** A hole position on the board grid (column x, row y). */
export interface Cell {
  x: number;
  y: number;
}

/** Quarter turns clockwise: 0 = pins left→right, 1 = top→bottom, 2 = right→left, 3 = bottom→top. */
export type Rot = 0 | 1 | 2 | 3;

export const DIRS: readonly Cell[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

export const cellKey = (c: Cell): string => `${c.x},${c.y}`;

export const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;

export const cell = (x: number, y: number): Cell => ({ x, y });

export const nextRot = (r: Rot): Rot => ((r + 1) % 4) as Rot;

/** All cells on the straight horizontal/vertical segment from a to b, inclusive. */
export function cellsOnSegment(a: Cell, b: Cell): Cell[] {
  if (a.x !== b.x && a.y !== b.y) throw new Error('segment must be horizontal or vertical');
  const out: Cell[] = [];
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  let x = a.x;
  let y = a.y;
  out.push({ x, y });
  while (x !== b.x || y !== b.y) {
    x += dx;
    y += dy;
    out.push({ x, y });
  }
  return out;
}
