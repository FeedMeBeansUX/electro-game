import { describe, expect, it } from 'vitest';
import { LEVELS, buildLevelBoard, partFromSpec, wireFromSpec } from '../src/levels/levels';
import { canPlacePart, canPlaceWire, type Board } from '../src/board/board';
import { evaluateBoard } from '../src/sim/evaluate';
import { checkGoals } from '../src/goals/goals';
import { STRINGS } from '../src/i18n/strings';

describe('levels', () => {
  it('loads the World 1 levels in order', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(3);
    expect(LEVELS.map((l) => l.id).slice(0, 3)).toEqual(['w1-l1', 'w1-l2', 'w1-l3']);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
  });

  for (const level of LEVELS) {
    describe(level.id, () => {
      it('has Dutch and English text', () => {
        for (const txt of [level.title, level.intro]) {
          expect(txt.nl.length).toBeGreaterThan(0);
          expect(txt.en.length).toBeGreaterThan(0);
        }
      });

      it('has valid fixed placements', () => {
        const board: Board = { cols: level.cols, rows: level.rows, parts: [], wires: [] };
        level.fixed.parts.forEach((s, i) => {
          const p = partFromSpec(s, `p${i}`, true);
          expect(canPlacePart(board, p), `fixed part ${i}`).toBe(true);
          board.parts.push(p);
        });
        level.fixed.wires.forEach((s) => {
          expect(canPlaceWire(board, { x: s.from[0], y: s.from[1] }, { x: s.to[0], y: s.to[1] })).toBe(true);
        });
      });

      it('is not solved at the start', () => {
        expect(checkGoals(level.goals, evaluateBoard(buildLevelBoard(level))).done).toBe(false);
      });

      it('is solved by its solution, using only the inventory', () => {
        const board = buildLevelBoard(level);
        const used = new Map<string, number>();
        level.solution.parts.forEach((s, i) => {
          const p = partFromSpec(s, `sol-part-${i}`, false);
          expect(canPlacePart(board, p), `solution part ${i}`).toBe(true);
          board.parts.push(p);
          used.set(s.type, (used.get(s.type) ?? 0) + 1);
        });
        level.solution.wires.forEach((s, i) => {
          expect(canPlaceWire(board, { x: s.from[0], y: s.from[1] }, { x: s.to[0], y: s.to[1] })).toBe(true);
          board.wires.push(wireFromSpec(board, s, `sol-wire-${i}`, false, i));
          used.set('wire', (used.get('wire') ?? 0) + 1);
        });
        for (const [type, n] of used) {
          const inv = level.inventory.find((it) => it.type === type);
          expect(inv?.count ?? 0, `inventory has enough ${type}`).toBeGreaterThanOrEqual(n);
        }
        expect(checkGoals(level.goals, evaluateBoard(board)).done).toBe(true);
      });
    });
  }
});

describe('strings', () => {
  it('every string has Dutch and English', () => {
    for (const [key, txt] of Object.entries(STRINGS)) {
      expect(txt.nl, key).not.toBe('');
      expect(txt.en, key).not.toBe('');
    }
  });
});
