import { cloneBoard, wireEnds, type Board, type PlacedPart } from '../board/board';
import { checkGoals, type Goal } from '../goals/goals';
import type { InventoryItem, LevelDef, LevelPartSpec, LevelWireSpec } from '../levels/levels';
import { PART_DEFS } from '../parts/defs';
import { evaluateBoard } from '../sim/evaluate';
import { t } from '../i18n/strings';

export type EditorGoal = 'led' | 'fan' | 'buzzer';

export const EDITOR_GOALS: EditorGoal[] = ['led', 'fan', 'buzzer'];

export function goalFor(kind: EditorGoal): Goal {
  switch (kind) {
    case 'led':
      return { kind: 'ledOn', minBrightness: 0.5 };
    case 'fan':
      return { kind: 'fanSpinning', minSpeed: 0.5 };
    case 'buzzer':
      return { kind: 'buzzerOn' };
  }
}

/** The circuit as the parent built it, with every switch on, every button held and every knob turned up. */
export function workingBoard(board: Board): Board {
  const b = cloneBoard(board);
  for (const p of b.parts) {
    if (p.type === 'switch' || p.type === 'button') p.props.closed = true;
    if (p.type === 'pot') p.props.knob = 1;
  }
  return b;
}

/** Whether the built circuit reaches the goal (with switches on and knobs up). */
export function circuitWorks(board: Board, goal: EditorGoal): boolean {
  const b = workingBoard(board);
  return checkGoals([goalFor(goal)], evaluateBoard(b), b).done;
}

/** How a part starts in the level: switches off, buttons up, knobs at the lowest setting. */
function startProps(p: PlacedPart): PlacedPart['props'] {
  const props = { ...p.props };
  if (p.type === 'switch' || p.type === 'button') props.closed = false;
  if (p.type === 'pot') props.knob = 0;
  return props;
}

const spec = (p: PlacedPart, props: PlacedPart['props'], withId: boolean): LevelPartSpec => ({
  ...(withId ? { id: p.id } : {}),
  type: p.type,
  pos: [p.pos.x, p.pos.y],
  rot: p.rot,
  props,
});

const wireSpec = (w: Board['wires'][number]): LevelWireSpec => {
  const [a, b] = wireEnds(w);
  return { from: [a.x, a.y], to: [b.x, b.y] };
};

export interface BuildResult {
  level: LevelDef | null;
  problem: 'notWorking' | 'nothingTakenAway' | null;
}

/**
 * Turns the editor's board into a level. `takenAway` holds the ids of parts and
 * wires the child must put in themselves: they go into the tray, and the built
 * circuit becomes the level's solution.
 */
export function buildCustomLevel(
  board: Board,
  takenAway: ReadonlySet<string>,
  goal: EditorGoal,
  id: string,
  number: number,
): BuildResult {
  if (!circuitWorks(board, goal)) return { level: null, problem: 'notWorking' };
  if (takenAway.size === 0) return { level: null, problem: 'nothingTakenAway' };

  const working = workingBoard(board);
  const fixedParts = working.parts.filter((p) => !takenAway.has(p.id));
  const playerParts = working.parts.filter((p) => takenAway.has(p.id));
  const fixedWires = board.wires.filter((w) => !takenAway.has(w.id));
  const playerWires = board.wires.filter((w) => takenAway.has(w.id));

  // Tray: one slot per kind of part (resistors and LEDs also by value/colour).
  const inventory: InventoryItem[] = [];
  for (const p of playerParts) {
    const props = startProps(p);
    const keyProps =
      p.type === 'resistor' ? { resistance: props.resistance } : p.type === 'led' ? { color: props.color } : undefined;
    const existing = inventory.find((it) => it.type === p.type && JSON.stringify(it.props) === JSON.stringify(keyProps));
    if (existing) existing.count++;
    else inventory.push({ type: p.type, count: 1, ...(keyProps ? { props: keyProps } : {}) });
  }
  if (playerWires.length) inventory.push({ type: 'wire', count: playerWires.length });

  // Solution: the child's parts as built, plus switching on the level's own switches and knobs.
  const interactive = (p: PlacedPart) => PART_DEFS[p.type].tap !== 'rotate';
  const level: LevelDef = {
    id,
    world: 0,
    index: number,
    title: { nl: `${t('customLevelTitle').nl} ${number}`, en: `${t('customLevelTitle').en} ${number}` },
    intro: t('customIntro'),
    parentNote: t('customNote'),
    cols: board.cols,
    rows: board.rows,
    scale: 2,
    fixed: {
      parts: fixedParts.map((p) => spec(p, startProps(p), true)),
      wires: fixedWires.map(wireSpec),
    },
    inventory,
    goals: [goalFor(goal)],
    solution: {
      parts: [
        ...playerParts.map((p) => spec(p, p.props, false)),
        ...fixedParts.filter(interactive).map((p) => spec(p, p.props, true)),
      ],
      wires: playerWires.map(wireSpec),
    },
  };
  return { level, problem: null };
}
