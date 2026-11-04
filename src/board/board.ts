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
  /**
   * 'magic' (default): every hole is its own connection point.
   * 'breadboard': holes are joined by hidden strips, like a real breadboard (see netKey).
   */
  kind?: 'magic' | 'breadboard';
  /** Volts of the built-in battery that feeds a breadboard's power rails (row 0 = +, last row = −). */
  supply?: number;
  /** Light in the room, 0 (dark) to 1 (daylight); used by light sensors. Defaults to 1. */
  light?: number;
}

/**
 * The game's breadboard (11 rows):
 *   row 0      + rail (all holes joined)
 *   rows 2–4   top strips: each column of 3 holes is joined
 *   rows 6–8   bottom strips: each column of 3 holes is joined
 *   row 10     − rail
 * Rows 1, 5 (the middle channel) and 9 have no holes.
 * Real breadboards have 5-hole strips; 3 keeps the holes big enough for small fingers.
 */
export const BREADBOARD_ROWS = 11;
export const RAIL_PLUS_ROW = 0;
export const RAIL_MINUS_ROW = BREADBOARD_ROWS - 1;
const NO_HOLE_ROWS = new Set([1, 5, 9]);

/** Whether there is a hole at this spot. */
export function holeAt(board: Pick<Board, 'cols' | 'rows' | 'kind'>, c: Cell): boolean {
  if (!inBounds(board, c)) return false;
  return board.kind !== 'breadboard' || !NO_HOLE_ROWS.has(c.y);
}

/** Which connection (net) a hole belongs to: on a breadboard, all holes of a strip or rail share one. */
export function netKey(board: Pick<Board, 'kind'>, c: Cell): string {
  if (board.kind !== 'breadboard') return cellKey(c);
  if (c.y === RAIL_PLUS_ROW) return 'rail+';
  if (c.y === RAIL_MINUS_ROW) return 'rail-';
  return c.y < 5 ? `top:${c.x}` : `bottom:${c.x}`;
}

export const wireEnds = (w: Wire): [Cell, Cell] => [w.points[0], w.points[w.points.length - 1]];

/**
 * The holes a part's legs sit in, in pin order. Two-legged parts have pins at
 * either end; three-legged parts (transistors) also have one in the middle.
 */
export function pinCells(p: Pick<PlacedPart, 'type' | 'pos' | 'rot'>): Cell[] {
  const def = PART_DEFS[p.type];
  const half = def.span / 2;
  const d = DIRS[p.rot];
  const at = (k: number): Cell => ({ x: p.pos.x + d.x * k, y: p.pos.y + d.y * k });
  return def.pins === 3 ? [at(-half), at(0), at(half)] : [at(-half), at(half)];
}

const firstLast = (pins: Cell[]): [Cell, Cell] => [pins[0], pins[pins.length - 1]];

/** Every hole a part covers, pins included. */
export function occupiedCells(p: Pick<PlacedPart, 'type' | 'pos' | 'rot'>): Cell[] {
  const [a, b] = firstLast(pinCells(p));
  return cellsOnSegment(a, b);
}

/** Holes under the body of a part (covered, but not connection points). */
export function interiorCells(p: Pick<PlacedPart, 'type' | 'pos' | 'rot'>): Cell[] {
  const pins = pinCells(p).map(cellKey);
  return occupiedCells(p).filter((c) => !pins.includes(cellKey(c)));
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
  if (!pinCells(candidate).every((c) => holeAt(board, c))) return false;
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
  return holeAt(board, c) && !interiorSet(board).has(cellKey(c));
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
    kind: b.kind,
    supply: b.supply,
    light: b.light,
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
  const taken = new Set(board.wires.flatMap((w) => wireEnds(w).map((c) => netKey(board, c))));
  for (const p of board.parts) {
    if (p.id === ignoreId) continue;
    for (const c of pinCells(p)) taken.add(netKey(board, c));
  }
  // On a magic board another part's pin can't share a hole, so only wire ends count there.
  if (board.kind !== 'breadboard') {
    taken.clear();
    for (const w of board.wires) for (const c of wireEnds(w)) taken.add(cellKey(c));
  }
  const connections = (rot: Rot) => {
    const nets = pinCells({ ...part, rot }).map((c) => netKey(board, c));
    // Two legs in the same strip short each other out: that's never a good drop.
    if (new Set(nets).size < nets.length) return -1;
    return nets.filter((n) => taken.has(n)).length;
  };
  let best = part.rot;
  let bestCount = canPlacePart(board, part, ignoreId) ? connections(part.rot) : -2;
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
