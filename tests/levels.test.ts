import { describe, expect, it } from 'vitest';
import { LEVELS, applySolution, buildLevelBoard, matchesItem, partFromSpec, wireFromSpec } from '../src/levels/levels';
import { canPlacePart, canPlaceWire, type Board } from '../src/board/board';
import { evaluateBoard } from '../src/sim/evaluate';
import { checkGoals } from '../src/goals/goals';
import { STRINGS } from '../src/i18n/strings';

describe('levels', () => {
  it('loads all six World 1 levels in order', () => {
    expect(LEVELS.map((l) => l.id).slice(0, 6)).toEqual(['w1-l1', 'w1-l2', 'w1-l3', 'w1-l4', 'w1-l5', 'w1-l6']);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
  });

  for (const level of LEVELS) {
    describe(level.id, () => {
      it('has Dutch and English text', () => {
        for (const txt of [level.title, level.intro, level.parentNote]) {
          expect(txt.nl.length).toBeGreaterThan(0);
          expect(txt.en.length).toBeGreaterThan(0);
        }
      });

      it('has valid fixed and pre-placed parts', () => {
        const board: Board = { cols: level.cols, rows: level.rows, parts: [], wires: [] };
        [...level.fixed.parts, ...(level.placed ?? [])].forEach((s, i) => {
          const p = partFromSpec(s, `p${i}`, true);
          expect(canPlacePart(board, p), `part ${i}`).toBe(true);
          board.parts.push(p);
        });
        level.fixed.wires.forEach((s) => {
          expect(canPlaceWire(board, { x: s.from[0], y: s.from[1] }, { x: s.to[0], y: s.to[1] })).toBe(true);
        });
      });

      it('is not solved at the start', () => {
        {
          const start = buildLevelBoard(level);
          expect(checkGoals(level.goals, evaluateBoard(start), start).done).toBe(false);
        }
      });

      it('is solved by its solution, using only the inventory', () => {
        const board = buildLevelBoard(level);
        expect(applySolution(level, board)).toBe(true);
        // Parts already in the level (moved, turned or switched on) cost nothing from the inventory.
        const placedIds = new Set([...level.fixed.parts, ...(level.placed ?? [])].map((p) => p.id));
        const used = new Map<string, number>();
        for (const s of level.solution.parts) {
          if (s.id && placedIds.has(s.id)) continue;
          used.set(s.type, (used.get(s.type) ?? 0) + 1);
        }
        if (level.solution.wires.length) used.set('wire', level.solution.wires.length);
        for (const [type, n] of used) {
          const inv = level.inventory.find((it) => it.type === type);
          expect(inv?.count ?? 0, `inventory has enough ${type}`).toBeGreaterThanOrEqual(n);
        }
        expect(checkGoals(level.goals, evaluateBoard(board), board).done).toBe(true);
      });
    });
  }

  it('w1-l5: using the wire instead of the resistor pops the LED', () => {
    const level = LEVELS.find((l) => l.id === 'w1-l5')!;
    const board = buildLevelBoard(level);
    board.wires.push(wireFromSpec(board, { from: [11, 0], to: [11, 2] }, 'shortcut', false, 0));
    const ev = evaluateBoard(board);
    expect(ev.popped).toEqual(['led']);
    expect(checkGoals(level.goals, ev).done).toBe(false);
  });
});

describe('strings', () => {
  it('every string has Dutch and English', () => {
    for (const [key, txt] of Object.entries(STRINGS)) {
      expect(txt.nl, key).not.toBe('');
      expect(txt.en, key).not.toBe('');
    }
  });
});

describe('matchesItem', () => {
  it('tells resistors apart by value', () => {
    const small = { type: 'resistor' as const, count: 1, props: { resistance: 100 } };
    const big = { type: 'resistor' as const, count: 1, props: { resistance: 1000 } };
    const part = { type: 'resistor' as const, props: { resistance: 1000 } };
    expect(matchesItem(small, part)).toBe(false);
    expect(matchesItem(big, part)).toBe(true);
    expect(matchesItem({ type: 'wire', count: 1 }, part)).toBe(false);
  });
});

describe('w5-l4 night light', () => {
  const level = LEVELS.find((l) => l.id === 'w5-l4')!;
  const build = (rot: 0 | 2) => {
    const board = buildLevelBoard(level);
    board.parts.push(partFromSpec({ type: 'ldr', pos: [12, 3] }, 'ldr', false));
    board.parts.push(partFromSpec({ type: 'transistor', pos: [13, 7], rot }, 'q', false));
    board.light = 0;
    return board;
  };

  it('lights the LED at night with the transistor the right way round', () => {
    const ev = evaluateBoard(build(0));
    const led = ev.parts.get('led')!;
    expect(led.kind === 'led' && led.brightness).toBeGreaterThan(0.5);
  });

  it('shows a backwards transistor as current flowing the wrong way (so the game can say so)', () => {
    const q = evaluateBoard(build(2)).parts.get('q')!;
    expect(q.kind === 'transistor' && q.amps).toBeLessThan(-1e-4);
  });
});
