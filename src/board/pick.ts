import { canEndWire, holeAt, pinCells, wireEnds, type Board, type PlacedPart, type Wire } from './board';
import { sameCell, type Cell } from './grid';
import { cellToWorld, worldToCell, type BoardLayout } from '../layout';

type Point = { x: number; y: number };

/** What a finger on the board is touching. */
export type BoardTarget =
  | { type: 'part'; part: PlacedPart }
  | { type: 'wireEnd'; wire: Wire; end: 0 | 1 }
  /** An empty hole or a part's pin. `part` is set when the hole is that part's pin (so a tap can turn it). */
  | { type: 'hole'; cell: Cell; part?: PlacedPart };

/** How close (in unscaled pixels) to a part's line counts as touching it. */
const BODY_REACH = 8;
/** Around each pin, touches go to the hole instead, so wires can be drawn from pins. */
const PIN_ZONE = 6;

/**
 * Hit test for the board. Parts are grabbed by their body; their pins behave
 * like holes, so dragging from a pin draws a wire (or picks up a wire end
 * that is already there).
 */
export function pickBoardTarget(board: Board, layout: BoardLayout, x: number, y: number): BoardTarget | null {
  const s = layout.scale;
  const p = { x, y };
  for (let i = board.parts.length - 1; i >= 0; i--) {
    const part = board.parts[i];
    const pins = pinCells(part).map((c) => cellToWorld(layout, c));
    const onBody = distToSegment(p, pins[0], pins[pins.length - 1]) <= BODY_REACH * s;
    const nearPin = Math.min(...pins.map((pin) => dist(p, pin))) <= PIN_ZONE * s;
    if (onBody && !nearPin) return { type: 'part', part };
  }
  const cell = worldToCell(layout, x, y);
  const c = cellToWorld(layout, cell);
  const half = layout.cell / 2;
  if (!holeAt(board, cell) || Math.abs(c.x - x) > half || Math.abs(c.y - y) > half) return null;
  for (let i = board.wires.length - 1; i >= 0; i--) {
    const wire = board.wires[i];
    if (wire.fixed) continue;
    const [e0, e1] = wireEnds(wire);
    if (sameCell(e0, cell)) return { type: 'wireEnd', wire, end: 0 };
    if (sameCell(e1, cell)) return { type: 'wireEnd', wire, end: 1 };
  }
  if (!canEndWire(board, cell)) return null;
  const part = board.parts.find((q) => pinCells(q).some((pin) => sameCell(pin, cell)));
  return part ? { type: 'hole', cell, part } : { type: 'hole', cell };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}
