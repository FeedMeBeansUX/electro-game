import { describe, expect, it } from 'vitest';
import { LEVELS, applySolution, buildLevelBoard, wireFromSpec } from '../src/levels/levels';
import { nextHintStep, samePlace, wiredTogether } from '../src/hints/hints';
import type { PlacedPart } from '../src/board/board';

const level = (id: string) => LEVELS.find((l) => l.id === id)!;

describe('hints', () => {
  it('points at the missing wire, then at nothing once it is placed', () => {
    const l = level('w1-l1');
    const board = buildLevelBoard(l);
    expect(nextHintStep(l, board)).toEqual({ kind: 'wire', from: { x: 11, y: 2 }, to: { x: 1, y: 4 } });
    board.wires.push(wireFromSpec(board, { from: [1, 4], to: [11, 2] }, 'w', false, 0));
    expect(nextHintStep(l, board)).toBeNull();
  });

  it('accepts a different route made of several wires', () => {
    const l = level('w1-l1');
    const board = buildLevelBoard(l);
    board.wires.push(wireFromSpec(board, { from: [11, 2], to: [8, 3] }, 'a', false, 0));
    expect(nextHintStep(l, board)?.kind).toBe('wire');
    board.wires.push(wireFromSpec(board, { from: [8, 3], to: [1, 4] }, 'b', false, 1));
    expect(nextHintStep(l, board)).toBeNull();
  });

  it('asks to place the LED, and to turn the backwards LED', () => {
    expect(nextHintStep(level('w1-l3'), buildLevelBoard(level('w1-l3')))?.kind).toBe('place');
    const step = nextHintStep(level('w1-l4'), buildLevelBoard(level('w1-l4')));
    expect(step?.kind).toBe('adjust');
  });

  it('has no hint left once the solution is applied, for every level', () => {
    for (const l of LEVELS) {
      const board = buildLevelBoard(l);
      applySolution(l, board);
      expect(nextHintStep(l, board), l.id).toBeNull();
    }
  });

  it('treats resistors as either-way-round but LEDs as one-way', () => {
    const base = { id: 'x', pos: { x: 5, y: 2 }, fixed: false, props: {} };
    const r = (rot: 0 | 2): PlacedPart => ({ ...base, type: 'resistor', rot });
    const d = (rot: 0 | 2): PlacedPart => ({ ...base, type: 'led', rot });
    expect(samePlace(r(0), r(2))).toBe(true);
    expect(samePlace(d(0), d(2))).toBe(false);
  });

  it('wiredTogether follows chains of wires', () => {
    const board = buildLevelBoard(level('w1-l6'));
    board.wires.push(wireFromSpec(board, { from: [0, 0], to: [3, 0] }, 'a', false, 0));
    board.wires.push(wireFromSpec(board, { from: [3, 0], to: [3, 3] }, 'b', false, 0));
    expect(wiredTogether(board, { x: 0, y: 0 }, { x: 3, y: 3 })).toBe(true);
    expect(wiredTogether(board, { x: 0, y: 0 }, { x: 4, y: 3 })).toBe(false);
  });
});
