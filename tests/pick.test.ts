import { describe, expect, it } from 'vitest';
import { pickBoardTarget } from '../src/board/pick';
import type { Board, PlacedPart } from '../src/board/board';
import { boardLayout, cellToWorld } from '../src/layout';
import { wireFromSpec } from '../src/levels/levels';

// The "Bouw het zelf" board: 13×5 holes at 2× scale, with a battery the player placed.
const layout = boardLayout(13, 5, 2);
const battery: PlacedPart = { id: 'b', type: 'battery', pos: { x: 1, y: 2 }, rot: 1, fixed: false, props: {} };
const board = (): Board => ({ cols: 13, rows: 5, parts: [{ ...battery }], wires: [] });
const at = (x: number, y: number) => cellToWorld(layout, { x, y });

describe('pickBoardTarget', () => {
  it('grabs a placed part by its body', () => {
    const p = at(1, 2);
    expect(pickBoardTarget(board(), layout, p.x, p.y)?.type).toBe('part');
  });

  it("treats a placed part's pin as a hole, so a wire can be drawn from it", () => {
    for (const [x, y] of [
      [1, 0],
      [1, 4],
    ]) {
      const p = at(x, y);
      const hit = pickBoardTarget(board(), layout, p.x + 3, p.y + 3);
      expect(hit?.type, `pin (${x},${y})`).toBe('hole');
      if (hit?.type === 'hole') expect(hit.part?.id).toBe('b');
    }
  });

  it('picks up a wire end that sits on a pin', () => {
    const b = board();
    b.wires.push(wireFromSpec(b, { from: [1, 0], to: [5, 0] }, 'w', false, 0));
    const p = at(1, 0);
    const hit = pickBoardTarget(b, layout, p.x, p.y);
    expect(hit?.type).toBe('wireEnd');
  });

  it('returns an empty hole elsewhere, and nothing off the board', () => {
    const p = at(6, 3);
    expect(pickBoardTarget(board(), layout, p.x, p.y)).toEqual({ type: 'hole', cell: { x: 6, y: 3 } });
    expect(pickBoardTarget(board(), layout, 0, 0)).toBeNull();
  });
});
