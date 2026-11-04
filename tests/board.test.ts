import { describe, expect, it } from 'vitest';
import { canPlacePart, canPlaceWire, pinCells, routeWire, type Board } from '../src/board/board';

const emptyBoard = (): Board => ({ cols: 24, rows: 11, parts: [], wires: [] });

describe('pinCells', () => {
  it('places pins either side of the centre, following the rotation', () => {
    const p = { type: 'led' as const, pos: { x: 5, y: 5 } };
    expect(pinCells({ ...p, rot: 0 })).toEqual([{ x: 4, y: 5 }, { x: 6, y: 5 }]);
    expect(pinCells({ ...p, rot: 1 })).toEqual([{ x: 5, y: 4 }, { x: 5, y: 6 }]);
    expect(pinCells({ ...p, rot: 2 })).toEqual([{ x: 6, y: 5 }, { x: 4, y: 5 }]);
    expect(pinCells({ ...p, rot: 3 })).toEqual([{ x: 5, y: 6 }, { x: 5, y: 4 }]);
  });

  it('uses the part span (battery spans 4 holes)', () => {
    expect(pinCells({ type: 'battery', pos: { x: 5, y: 5 }, rot: 1 })).toEqual([{ x: 5, y: 3 }, { x: 5, y: 7 }]);
  });
});

describe('canPlacePart', () => {
  it('rejects parts that stick out of the board', () => {
    expect(canPlacePart(emptyBoard(), { type: 'led', pos: { x: 0, y: 3 }, rot: 0 })).toBe(false);
    expect(canPlacePart(emptyBoard(), { type: 'led', pos: { x: 1, y: 3 }, rot: 0 })).toBe(true);
  });

  it('rejects overlapping parts, except the part being moved', () => {
    const b = emptyBoard();
    b.parts.push({ id: 'r', type: 'resistor', pos: { x: 5, y: 5 }, rot: 0, fixed: false, props: {} });
    expect(canPlacePart(b, { type: 'led', pos: { x: 6, y: 5 }, rot: 0 })).toBe(false);
    expect(canPlacePart(b, { type: 'led', pos: { x: 5, y: 5 }, rot: 1 })).toBe(false);
    expect(canPlacePart(b, { type: 'led', pos: { x: 8, y: 5 }, rot: 0 })).toBe(true);
    expect(canPlacePart(b, { type: 'resistor', pos: { x: 6, y: 5 }, rot: 0 }, 'r')).toBe(true);
  });

  it('rejects a part whose body would cover a wire end', () => {
    const b = emptyBoard();
    b.wires.push({ id: 'w', points: [{ x: 5, y: 5 }, { x: 9, y: 5 }], fixed: false, color: 0 });
    expect(canPlacePart(b, { type: 'led', pos: { x: 5, y: 5 }, rot: 0 })).toBe(false);
    // Pins may sit on wire ends: that's how they connect.
    expect(canPlacePart(b, { type: 'led', pos: { x: 4, y: 5 }, rot: 1 })).toBe(true);
    expect(canPlacePart(b, { type: 'led', pos: { x: 6, y: 5 }, rot: 0 })).toBe(true);
  });
});

describe('wires', () => {
  it('may not start and end in the same hole or under a part body', () => {
    const b = emptyBoard();
    b.parts.push({ id: 'r', type: 'resistor', pos: { x: 5, y: 5 }, rot: 0, fixed: false, props: {} });
    expect(canPlaceWire(b, { x: 1, y: 1 }, { x: 1, y: 1 })).toBe(false);
    expect(canPlaceWire(b, { x: 1, y: 1 }, { x: 5, y: 5 })).toBe(false);
    expect(canPlaceWire(b, { x: 1, y: 1 }, { x: 4, y: 5 })).toBe(true);
  });

  it('routes straight when aligned and as an L otherwise, avoiding parts', () => {
    const b = emptyBoard();
    expect(routeWire(b, { x: 1, y: 1 }, { x: 6, y: 1 })).toEqual([{ x: 1, y: 1 }, { x: 6, y: 1 }]);
    expect(routeWire(b, { x: 1, y: 1 }, { x: 6, y: 4 })).toEqual([{ x: 1, y: 1 }, { x: 6, y: 1 }, { x: 6, y: 4 }]);
    b.parts.push({ id: 'r', type: 'resistor', pos: { x: 4, y: 1 }, rot: 0, fixed: false, props: {} });
    expect(routeWire(b, { x: 1, y: 1 }, { x: 6, y: 4 })).toEqual([{ x: 1, y: 1 }, { x: 1, y: 4 }, { x: 6, y: 4 }]);
  });
});
