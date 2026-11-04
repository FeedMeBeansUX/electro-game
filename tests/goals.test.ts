import { describe, expect, it } from 'vitest';
import type { Board, PlacedPart, Wire } from '../src/board/board';
import type { Rot } from '../src/board/grid';
import type { PartProps, PartType } from '../src/parts/defs';
import { evaluateBoard } from '../src/sim/evaluate';
import { brightnessFeedback, checkGoal, checkGoals, type TruthTableGoal } from '../src/goals/goals';

const part = (id: string, type: PartType, x: number, y: number, rot: Rot, props: PartProps = {}): PlacedPart => ({
  id,
  type,
  pos: { x, y },
  rot,
  fixed: true,
  props,
});
const wire = (id: string, ax: number, ay: number, bx: number, by: number): Wire => ({
  id,
  points: [{ x: ax, y: ay }, { x: bx, y: by }],
  fixed: true,
  color: 0,
});

/** Battery, LED and resistor on top; two switches on the bottom, wired in series or in parallel. */
function twoSwitches(parallel: boolean, s1 = false, s2 = false): Board {
  const b: Board = {
    cols: 24,
    rows: 11,
    parts: [
      part('bat', 'battery', 1, 2, 1),
      part('led', 'led', 6, 0, 0),
      part('res', 'resistor', 11, 1, 1, { resistance: 100 }),
      part('s1', 'switch', 4, 4, 0, { closed: s1 }),
      part('s2', 'switch', parallel ? 4 : 8, parallel ? 5 : 4, 0, { closed: s2 }),
    ],
    wires: [wire('a', 1, 0, 5, 0), wire('b', 7, 0, 11, 0), wire('c', 11, 2, 11, 4)],
  };
  if (parallel) {
    // s1 (3,4)-(5,4) and s2 (3,5)-(5,5) side by side.
    b.wires.push(wire('d', 11, 4, 5, 4), wire('e', 5, 4, 5, 5), wire('f', 3, 4, 3, 5), wire('g', 3, 4, 1, 4));
  } else {
    // s2 (7,4)-(9,4), then s1 (3,4)-(5,4), in a row.
    b.wires.push(wire('d', 11, 4, 9, 4), wire('e', 7, 4, 5, 4), wire('g', 3, 4, 1, 4));
  }
  return b;
}

const and: TruthTableGoal = { kind: 'truthTable', inputs: ['s1', 's2'], output: 'led', expect: 'and' };
const or: TruthTableGoal = { kind: 'truthTable', inputs: ['s1', 's2'], output: 'led', expect: 'or' };

describe('truth table goals', () => {
  it('switches in series make AND, switches side by side make OR', () => {
    const series = twoSwitches(false);
    const parallel = twoSwitches(true);
    expect(checkGoal(and, evaluateBoard(series), series)).toBe(true);
    expect(checkGoal(or, evaluateBoard(series), series)).toBe(false);
    expect(checkGoal(or, evaluateBoard(parallel), parallel)).toBe(true);
    expect(checkGoal(and, evaluateBoard(parallel), parallel)).toBe(false);
  });

  it('live goals also need the output on right now', () => {
    const live = { ...and, live: true };
    const off = twoSwitches(false, true, false);
    const on = twoSwitches(false, true, true);
    expect(checkGoal(live, evaluateBoard(off), off)).toBe(false);
    expect(checkGoal(live, evaluateBoard(on), on)).toBe(true);
  });

  it('is false without a board', () => {
    const b = twoSwitches(false);
    expect(checkGoal(and, evaluateBoard(b))).toBe(false);
  });
});

describe('brightness goals', () => {
  /** Battery + LED + resistor of the given value. */
  const lamp = (ohms: number): Board => ({
    cols: 24,
    rows: 11,
    parts: [part('bat', 'battery', 1, 2, 1), part('led', 'led', 6, 0, 0), part('res', 'resistor', 11, 1, 1, { resistance: ohms })],
    wires: [wire('a', 1, 0, 5, 0), wire('b', 7, 0, 11, 0), wire('c', 11, 2, 1, 4)],
  });
  const soft = { kind: 'ledOn' as const, minBrightness: 0.05, maxBrightness: 0.3 };

  it('a night light needs the big resistor, and says "too bright" with the small one', () => {
    expect(checkGoals([soft], evaluateBoard(lamp(1000))).done).toBe(true);
    const bright = evaluateBoard(lamp(100));
    expect(checkGoals([soft], bright).done).toBe(false);
    expect(brightnessFeedback([soft], bright)).toBe('tooBright');
  });

  it('says "too dim" when the light is on but not bright enough', () => {
    expect(brightnessFeedback([{ kind: 'ledOn', minBrightness: 0.9 }], evaluateBoard(lamp(1000)))).toBe('tooDim');
  });

  it('can require several LEDs', () => {
    const b = lamp(100);
    expect(checkGoal({ kind: 'ledOn', count: 2 }, evaluateBoard(b))).toBe(false);
    expect(checkGoal({ kind: 'ledOn', count: 1 }, evaluateBoard(b))).toBe(true);
  });
});

describe('light goals', () => {
  const goal = { kind: 'lightResponse' as const, outputType: 'led' as const, onWhen: 'dark' as const };

  it('a night light passes "on in the dark", a plain lamp does not', () => {
    // Breadboard night light:
    //   10 kΩ from the + rail to top strip 6 (the base line), wired over to the base (13,3)
    //   light sensor from top strip 6 down to bottom strip 6, wired to the − rail
    //   100 Ω from the + rail to top strip 10, LED from strip 10 to strip 8, wired to the collector (14,3)
    //   transistor E (12,3) B (13,3) C (14,3); emitter strip wired to the − rail
    const night: Board = {
      cols: 24,
      rows: 11,
      kind: 'breadboard',
      supply: 3,
      parts: [
        part('rb', 'resistor', 6, 1, 1, { resistance: 10000 }),
        part('ldr', 'ldr', 6, 5, 1),
        part('rl', 'resistor', 10, 1, 1, { resistance: 100 }),
        part('led', 'led', 9, 3, 2),
        part('q', 'transistor', 13, 3, 0),
      ],
      wires: [wire('g', 6, 8, 6, 10), wire('b', 6, 2, 13, 2), wire('c', 8, 4, 14, 4), wire('e', 12, 4, 12, 10)],
    };
    expect(checkGoal(goal, evaluateBoard(night), night)).toBe(true);

    const lamp: Board = {
      cols: 24,
      rows: 11,
      kind: 'breadboard',
      supply: 3,
      parts: [part('rl', 'resistor', 10, 1, 1, { resistance: 100 }), part('led', 'led', 9, 3, 2)],
      wires: [wire('k', 8, 4, 8, 10)],
    };
    expect(checkGoal(goal, evaluateBoard(lamp), lamp)).toBe(false);
  });
});
