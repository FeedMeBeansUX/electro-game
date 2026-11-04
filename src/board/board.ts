import { DIRS, cellKey, cellsOnSegment, sameCell, type Cell, type Rot } from './grid';
import { PART_DEFS, type PartProps, type PartType } from '../parts/defs';

export interface PlacedPart {
  id: string;
  type: PartType;
  /** Centre hole of the part. Pins sit span/2 cells either side of it. */
  pos: Cell;
  rot: Rot;
  /** Fixed parts belong to the level and can't be moved by the player. */
  fixed: boolean;
  props: PartProps;
}

export interface Wire {
  id: string;
  /** Route through hole centres: [a, (corner), b]. Ends are the connection points. */
  points: Cell[];
  fixed: boolean;
  color: number;
}

export interface Board {
  cols: number;
  rows: number;
  parts: PlacedPart[];
  wires: Wire[];
}

export const wireEnds = (w: Wire): [Cell, Cell] => [w.points[0], w.points[w.points.length - 1]];

/** Pin 0 and pin 1 holes of a part. */
export function pinCells(p: Pick<PlacedPart, 'type' | 'pos' | 'rot'>): [Cell, Cell] {
  const half = PART_DEFS[p.type].span / 2;
  const d = DIRS[p.rot];
  return [
    { x: p.pos.x - d.x * half, y: p.pos.y - d.y * half },
    { x: p.pos.x + d.x * half, y: p.pos.y + d.y * half },
  ];
}

/** Every hole a part covers, pins included. */
export function occupiedCells(p: Pick<PlacedPart, 'type' | 'pos' | 'rot'>): Cell[] {
  const [a, b] = pinCells(p);
  return cellsOnSegment(a, b);
}

/** Holes under the body of a part (covered, but not connection points). */
export function interiorCells(p: Pick<PlacedPart, 'type' | 'pos' | 'rot'>): Cell[] {
  return occupiedCells(p).slice(1, -1);
}

export const inBounds = (b: Pick<Board, 'cols' | 'rows'>, c: Cell): boolean =>
  c.x >= 0 && c.y >= 0 && c.x < b.cols && c.y < b.rows;

/** Holes covered by the bodies of parts (not usable as wire ends). */
function interiorSet(board: Board, ignoreId?: string): Set<string> {
  const s = new Set<string>();
  for (const p of board.parts) {
    if (p.id === ignoreId) continue;
    for (const c of interiorCells(p)) s.add(cellKey(c));
  }
  return s;
}

/** Whether a part may be placed: inside the board, not overlapping parts, no wire end under its body. */
export function canPlacePart(
  board: Board,
  candidate: Pick<PlacedPart, 'type' | 'pos' | 'rot'>,
  ignoreId?: string,
): boolean {
  const cells = occupiedCells(candidate);
  if (!cells.every((c) => inBounds(board, c))) return false;
  const taken = new Set<string>();
  for (const p of board.parts) {
    if (p.id === ignoreId) continue;
    for (const c of occupiedCells(p)) taken.add(cellKey(c));
  }
  if (cells.some((c) => taken.has(cellKey(c)))) return false;
  const interior = interiorCells(candidate).map(cellKey);
  for (const w of board.wires) {
    for (const end of wireEnds(w)) if (interior.includes(cellKey(end))) return false;
  }
  return true;
}

/** Whether a hole can take a wire end (on the board and not hidden under a part body). */
export function canEndWire(board: Board, c: Cell): boolean {
  return inBounds(board, c) && !interiorSet(board).has(cellKey(c));
}

export function canPlaceWire(board: Board, a: Cell, b: Cell): boolean {
  return !sameCell(a, b) && canEndWire(board, a) && canEndWire(board, b);
}

/**
 * Orthogonal route for a new wire: straight if aligned, otherwise an L-shape.
 * Picks the corner whose path crosses the fewest part-covered holes
 * (ties prefer horizontal-first).
 */
export function routeWire(board: Board, a: Cell, b: Cell): Cell[] {
  if (a.x === b.x || a.y === b.y) return [a, b];
  const covered = new Set<string>();
  for (const p of board.parts) for (const c of occupiedCells(p)) covered.add(cellKey(c));
  const cost = (corner: Cell): number => {
    const path = [...cellsOnSegment(a, corner), ...cellsOnSegment(corner, b).slice(1)];
    return path.slice(1, -1).filter((c) => covered.has(cellKey(c))).length;
  };
  const horizontalFirst = { x: b.x, y: a.y };
  const verticalFirst = { x: a.x, y: b.y };
  const corner = cost(verticalFirst) < cost(horizontalFirst) ? verticalFirst : horizontalFirst;
  return [a, corner, b];
}

export function cloneBoard(b: Board): Board {
  return {
    cols: b.cols,
    rows: b.rows,
    parts: b.parts.map((p) => ({ ...p, pos: { ...p.pos }, props: { ...p.props } })),
    wires: b.wires.map((w) => ({ ...w, points: w.points.map((c) => ({ ...c })) })),
  };
}

/**
 * "Smart drop": when a part is dropped, turn it a quarter turn if that makes
 * more of its pins land on wire ends. Never flips it end-to-end (that would
 * change an LED's direction, which the child should decide).
 */
export function bestRotation(board: Board, part: Pick<PlacedPart, 'type' | 'pos' | 'rot'>, ignoreId?: string): Rot {
  const ends = new Set(board.wires.flatMap((w) => wireEnds(w).map(cellKey)));
  const connections = (rot: Rot) => pinCells({ ...part, rot }).filter((c) => ends.has(cellKey(c))).length;
  let best = part.rot;
  let bestCount = canPlacePart(board, part, ignoreId) ? connections(part.rot) : -1;
  for (const rot of [(part.rot + 1) % 4, (part.rot + 3) % 4] as Rot[]) {
    if (!canPlacePart(board, { ...part, rot }, ignoreId)) continue;
    const n = connections(rot);
    if (n > bestCount) {
      best = rot;
      bestCount = n;
    }
  }
  return best;
}
