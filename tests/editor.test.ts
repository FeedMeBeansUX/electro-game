import { describe, expect, it } from 'vitest';
import type { Board, PlacedPart, Wire } from '../src/board/board';
import type { Rot } from '../src/board/grid';
import type { PartProps, PartType } from '../src/parts/defs';
import { buildCustomLevel, circuitWorks } from '../src/editor/buildLevel';
import { applySolution, buildLevelBoard } from '../src/levels/levels';
import { evaluateBoard } from '../src/sim/evaluate';
import { checkGoals } from '../src/goals/goals';
import { nextHintStep } from '../src/hints/hints';

const part = (id: string, type: PartType, x: number, y: number, rot: Rot, props: PartProps = {}): PlacedPart => ({
  id,
  type,
  pos: { x, y },
  rot,
  fixed: false,
  props,
});
const wire = (id: string, ax: number, ay: number, bx: number, by: number): Wire => ({
  id,
  points: [{ x: ax, y: ay }, { x: bx, y: by }],
  fixed: false,
  color: 0,
});

/** What a parent might build: battery, LED, resistor and a switch, all wired up (switch left off). */
function built(): Board {
  return {
    cols: 13,
    rows: 5,
    parts: [
      part('bat', 'battery', 1, 2, 1, { voltage: 3 }),
      part('led', 'led', 6, 0, 0, { color: 'red' }),
      part('res', 'resistor', 11, 1, 1, { resistance: 100 }),
      part('sw', 'switch', 6, 4, 0, { closed: false }),
    ],
    wires: [wire('a', 1, 0, 5, 0), wire('b', 7, 0, 11, 0), wire('c', 11, 2, 11, 4), wire('d', 11, 4, 7, 4), wire('e', 5, 4, 1, 4)],
  };
}

describe('level editor', () => {
  it('counts the circuit as working with switches on, even if the parent left them off', () => {
    expect(circuitWorks(built(), 'led')).toBe(true);
    expect(circuitWorks(built(), 'fan')).toBe(false);
  });

  it('refuses a circuit that does not work, or one with nothing taken away', () => {
    const broken = built();
    broken.wires.pop();
    expect(buildCustomLevel(broken, new Set(['led']), 'led', 'x', 1).problem).toBe('notWorking');
    expect(buildCustomLevel(built(), new Set(), 'led', 'x', 1).problem).toBe('nothingTakenAway');
  });

  it('makes a level that starts unsolved and is solved by its own solution', () => {
    const { level } = buildCustomLevel(built(), new Set(['led', 'e']), 'led', 'custom-1', 1);
    expect(level).not.toBeNull();
    if (!level) return;
    expect(level.inventory).toEqual([
      { type: 'led', count: 1, props: { color: 'red' } },
      { type: 'wire', count: 1 },
    ]);
    // The switch starts off in the level.
    expect(level.fixed.parts.find((p) => p.id === 'sw')?.props?.closed).toBe(false);

    const start = buildLevelBoard(level);
    expect(checkGoals(level.goals, evaluateBoard(start), start).done).toBe(false);
    expect(nextHintStep(level, start)?.kind).toBe('place');

    const solved = buildLevelBoard(level);
    expect(applySolution(level, solved)).toBe(true);
    expect(checkGoals(level.goals, evaluateBoard(solved), solved).done).toBe(true);
    expect(nextHintStep(level, solved)).toBeNull();
  });
});
