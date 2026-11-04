import { netKey, pinCells, wireEnds, type Board, type PlacedPart } from '../board/board';
import { sameCell, type Cell } from '../board/grid';
import { partFromSpec, type LevelDef } from '../levels/levels';
import { PART_DEFS } from '../parts/defs';

/** One step of a level's known solution, used to show the player what to do next. */
export type HintStep =
  | { kind: 'wire'; from: Cell; to: Cell }
  | { kind: 'place'; target: PlacedPart }
  /** Move, turn or set (switch on, knob position) a part that is already on the board. */
  | { kind: 'adjust'; partId: string; target: PlacedPart }
  /** Set a part the player placed (e.g. turn on the switch they just put in). */
  | { kind: 'set'; target: PlacedPart }
  /** Make it day or night with the sun/moon button. */
  | { kind: 'light'; light: number };

/** Whether a part's settings match the solution: switch on/off and knob position (buttons are momentary, so ignored). */
export function settingsMatch(part: PlacedPart, target: PlacedPart): boolean {
  if (part.type === 'switch') return (part.props.closed ?? false) === (target.props.closed ?? false);
  if (part.type === 'pot') return Math.abs((part.props.knob ?? 0) - (target.props.knob ?? 0)) < 1e-6;
  return true;
}

const hasSettings = (p: PlacedPart): boolean =>
  (p.type === 'switch' && p.props.closed === true) || (p.type === 'pot' && (p.props.knob ?? 0) > 0);

export function solutionSteps(level: LevelDef): HintStep[] {
  const levelIds = new Set([...level.fixed.parts, ...(level.placed ?? [])].map((p) => p.id).filter(Boolean));
  const steps: HintStep[] = [];
  const settings: HintStep[] = [];
  const levelParts = [...level.fixed.parts, ...(level.placed ?? [])];
  level.solution.parts.forEach((spec, i) => {
    const target = partFromSpec(spec, `hint-${i}`, false);
    if (spec.id && levelIds.has(spec.id)) {
      // A part that stays where it is and only needs a setting (switch on) is tried last, after the wiring.
      const original = levelParts.find((p) => p.id === spec.id)!;
      const staysPut = original.pos[0] === spec.pos[0] && original.pos[1] === spec.pos[1] && (original.rot ?? 0) === (spec.rot ?? 0);
      (staysPut ? settings : steps).push({ kind: 'adjust', partId: spec.id, target });
    } else {
      steps.push({ kind: 'place', target });
      if (hasSettings(target)) settings.push({ kind: 'set', target });
    }
  });
  for (const w of level.solution.wires) {
    steps.push({ kind: 'wire', from: { x: w.from[0], y: w.from[1] }, to: { x: w.to[0], y: w.to[1] } });
  }
  // Switching on comes last: first build, then try it.
  if (level.solution.light !== undefined) settings.push({ kind: 'light', light: level.solution.light });
  return [...steps, ...settings];
}

/** Whether a part sits where `target` should be (either way round for non-polar parts). */
export function samePlace(part: PlacedPart, target: PlacedPart): boolean {
  if (part.type !== target.type) return false;
  const a = pinCells(part);
  const b = pinCells(target);
  const same = (x: typeof a, y: typeof a) => x.every((c, i) => sameCell(c, y[i]));
  return same(a, b) || (!PART_DEFS[part.type].polar && same(a, [...b].reverse()));
}

/** Whether two holes are joined by a chain of wires (and, on a breadboard, the hidden strips). */
export function wiredTogether(board: Board, a: Cell, b: Cell): boolean {
  const key = (c: Cell) => netKey(board, c);
  const adj = new Map<string, string[]>();
  for (const w of board.wires) {
    const [e0, e1] = wireEnds(w).map(key);
    adj.set(e0, [...(adj.get(e0) ?? []), e1]);
    adj.set(e1, [...(adj.get(e1) ?? []), e0]);
  }
  const goal = key(b);
  const seen = new Set([key(a)]);
  const queue = [key(a)];
  while (queue.length) {
    const k = queue.shift()!;
    if (k === goal) return true;
    for (const n of adj.get(k) ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return false;
}

export function isStepDone(board: Board, step: HintStep): boolean {
  switch (step.kind) {
    case 'wire':
      return wiredTogether(board, step.from, step.to);
    case 'place':
      return board.parts.some((p) => samePlace(p, step.target));
    case 'adjust': {
      const part = board.parts.find((p) => p.id === step.partId);
      return part !== undefined && samePlace(part, step.target) && settingsMatch(part, step.target);
    }
    case 'set':
      return board.parts.some((p) => samePlace(p, step.target) && settingsMatch(p, step.target));
    case 'light':
      return ((board.light ?? 1) >= 0.5) === (step.light >= 0.5);
  }
}

/** The first solution step the player hasn't done yet, or null if every step is done. */
export function nextHintStep(level: LevelDef, board: Board): HintStep | null {
  return solutionSteps(level).find((s) => !isStepDone(board, s)) ?? null;
}
