import type { Board, PlacedPart, Wire } from '../board/board';
import { routeWire } from '../board/board';
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
  cols: number;
  rows: number;
  fixed: { parts: LevelPartSpec[]; wires: LevelWireSpec[] };
  inventory: InventoryItem[];
  goals: Goal[];
  /** Faint outlines showing where a part could go. */
  hintSpots?: LevelPartSpec[];
  /** One known solution (what the player adds). Used by tests to prove the level is solvable. */
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
  level.fixed.wires.forEach((s, i) => board.wires.push(wireFromSpec(board, s, `fixed-wire-${i}`, true, i)));
  return board;
}
