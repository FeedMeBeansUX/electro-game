import type { Board, PlacedPart, Wire } from '../board/board';
import { canPlacePart, canPlaceWire, routeWire } from '../board/board';
import type { Rot } from '../board/grid';
import type { Goal } from '../goals/goals';
import type { Txt } from '../i18n/strings';
import { PART_DEFS, isPartType, type PartProps, type PartType } from '../parts/defs';
import { WIRE_COLORS } from '../art/palette';

export interface LevelPartSpec {
  id?: string;
  type: PartType;
  pos: [number, number];
  rot?: Rot;
  props?: PartProps;
}

export interface LevelWireSpec {
  from: [number, number];
  to: [number, number];
}

export interface InventoryItem {
  type: PartType | 'wire';
  count: number;
  props?: PartProps;
}

export interface LevelDef {
  id: string;
  world: number;
  index: number;
  title: Txt;
  /** Spoken (and shown) when the level starts. */
  intro: Txt;
  /** Short note for the parent corner: what this level teaches. */
  parentNote: Txt;
  cols: number;
  rows: number;
  /** Pixel scale of the board (2 = big holes for the first levels). Defaults to 1. */
  scale?: number;
  fixed: { parts: LevelPartSpec[]; wires: LevelWireSpec[] };
  /** Parts already on the board that the player may move or turn (e.g. a backwards LED). */
  placed?: LevelPartSpec[];
  inventory: InventoryItem[];
  goals: Goal[];
  /** Faint outlines showing where a part could go. */
  hintSpots?: LevelPartSpec[];
  /**
   * One known solution: what the player adds. A part whose id matches a level
   * part means "move/turn/set that part like this" (e.g. `"props": {"closed": true}`
   * to switch a fixed switch on). Used by the tests to prove the
   * level is solvable, and by the hint system to show the next step.
   */
  solution: { parts: LevelPartSpec[]; wires: LevelWireSpec[] };
}

const modules = import.meta.glob('../../levels/**/*.json', { eager: true, import: 'default' });

export const LEVELS: LevelDef[] = Object.values(modules)
  .map((m) => m as LevelDef)
  .sort((a, b) => a.world - b.world || a.index - b.index);

export function partFromSpec(spec: LevelPartSpec, id: string, fixed: boolean): PlacedPart {
  if (!isPartType(spec.type)) throw new Error(`unknown part type: ${spec.type}`);
  return {
    id: spec.id ?? id,
    type: spec.type,
    pos: { x: spec.pos[0], y: spec.pos[1] },
    rot: spec.rot ?? 0,
    fixed,
    props: { ...PART_DEFS[spec.type].defaults, ...spec.props },
  };
}

export function wireFromSpec(board: Board, spec: LevelWireSpec, id: string, fixed: boolean, colorIndex: number): Wire {
  const a = { x: spec.from[0], y: spec.from[1] };
  const b = { x: spec.to[0], y: spec.to[1] };
  return { id, points: routeWire(board, a, b), fixed, color: WIRE_COLORS[colorIndex % WIRE_COLORS.length] };
}

/** The board as the level starts: only the level's fixed parts and wires. */
export function buildLevelBoard(level: LevelDef): Board {
  const board: Board = { cols: level.cols, rows: level.rows, parts: [], wires: [] };
  level.fixed.parts.forEach((s, i) => board.parts.push(partFromSpec(s, `fixed-part-${i}`, true)));
  (level.placed ?? []).forEach((s, i) => board.parts.push(partFromSpec(s, `placed-part-${i}`, false)));
  level.fixed.wires.forEach((s, i) => board.wires.push(wireFromSpec(board, s, `fixed-wire-${i}`, true, i)));
  return board;
}

/** Applies the level's solution to a board (parts first, then wires). Returns false if a step doesn't fit. */
export function applySolution(level: LevelDef, board: Board): boolean {
  let ok = true;
  level.solution.parts.forEach((spec, i) => {
    const existing = spec.id ? board.parts.find((p) => p.id === spec.id) : undefined;
    const target = partFromSpec(spec, `solution-part-${i}`, false);
    if (!canPlacePart(board, target, existing?.id)) ok = false;
    if (existing) {
      existing.pos = target.pos;
      existing.rot = target.rot;
      existing.props = { ...existing.props, ...spec.props };
    } else {
      board.parts.push(target);
    }
  });
  level.solution.wires.forEach((spec, i) => {
    const a = { x: spec.from[0], y: spec.from[1] };
    const b = { x: spec.to[0], y: spec.to[1] };
    if (!canPlaceWire(board, a, b)) ok = false;
    board.wires.push(wireFromSpec(board, spec, `solution-wire-${i}`, false, i));
  });
  return ok;
}

/** Whether a part belongs in an inventory slot: same type, and the same value where that matters. */
export function matchesItem(item: InventoryItem, part: Pick<PlacedPart, 'type' | 'props'>): boolean {
  if (item.type !== part.type) return false;
  const def = PART_DEFS[part.type].defaults;
  const want = { ...def, ...item.props };
  return (want.resistance ?? null) === (part.props.resistance ?? null) && (want.color ?? null) === (part.props.color ?? null);
}
