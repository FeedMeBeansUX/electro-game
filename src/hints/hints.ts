import { pinCells, wireEnds, type Board, type PlacedPart } from '../board/board';
import { cellKey, sameCell, type Cell } from '../board/grid';
import { partFromSpec, type LevelDef } from '../levels/levels';
import type { PartType } from '../parts/defs';

/** One step of a level's known solution, used to show the player what to do next. */
export type HintStep =
  | { kind: 'wire'; from: Cell; to: Cell }
  | { kind: 'place'; target: PlacedPart }
  | { kind: 'adjust'; partId: string; target: PlacedPart };

/** Parts whose two pins are not interchangeable. */
const POLAR: ReadonlySet<PartType> = new Set(['led', 'battery']);

export function solutionSteps(level: LevelDef): HintStep[] {
  const placedIds = new Set((level.placed ?? []).map((p) => p.id));
  const steps: HintStep[] = level.solution.parts.map((spec, i) => {
    const target = partFromSpec(spec, `hint-${i}`, false);
    return spec.id && placedIds.has(spec.id) ? { kind: 'adjust', partId: spec.id, target } : { kind: 'place', target };
  });
  for (const w of level.solution.wires) {
    steps.push({ kind: 'wire', from: { x: w.from[0], y: w.from[1] }, to: { x: w.to[0], y: w.to[1] } });
  }
  return steps;
}

/** Whether a part sits where `target` should be (either way round for non-polar parts). */
export function samePlace(part: PlacedPart, target: PlacedPart): boolean {
  if (part.type !== target.type) return false;
  const [a0, a1] = pinCells(part);
  const [b0, b1] = pinCells(target);
  if (sameCell(a0, b0) && sameCell(a1, b1)) return true;
  return !POLAR.has(part.type) && sameCell(a0, b1) && sameCell(a1, b0);
}

/** Whether two holes are joined by a chain of wires. */
export function wiredTogether(board: Board, a: Cell, b: Cell): boolean {
  const adj = new Map<string, string[]>();
  for (const w of board.wires) {
    const [e0, e1] = wireEnds(w).map(cellKey);
    adj.set(e0, [...(adj.get(e0) ?? []), e1]);
    adj.set(e1, [...(adj.get(e1) ?? []), e0]);
  }
  const goal = cellKey(b);
  const seen = new Set([cellKey(a)]);
  const queue = [cellKey(a)];
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
      return part !== undefined && samePlace(part, step.target);
    }
  }
}

/** The first solution step the player hasn't done yet, or null if every step is done. */
export function nextHintStep(level: LevelDef, board: Board): HintStep | null {
  return solutionSteps(level).find((s) => !isStepDone(board, s)) ?? null;
}
