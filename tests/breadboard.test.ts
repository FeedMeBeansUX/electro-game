import { describe, expect, it } from 'vitest';
import { bestRotation, canPlacePart, holeAt, netKey, pinCells, type Board, type PlacedPart, type Wire } from '../src/board/board';
import type { Rot } from '../src/board/grid';
import type { PartProps, PartType } from '../src/parts/defs';
import { evaluateBoard } from '../src/sim/evaluate';
import { wiredTogether } from '../src/hints/hints';

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
const bb = (): Board => ({ cols: 24, rows: 11, kind: 'breadboard', supply: 3, parts: [], wires: [] });

describe('breadboard', () => {
  it('has holes only in the rails and strips', () => {
    const b = bb();
    expect(holeAt(b, { x: 3, y: 0 })).toBe(true);
    expect(holeAt(b, { x: 3, y: 1 })).toBe(false);
    expect(holeAt(b, { x: 3, y: 5 })).toBe(false);
    expect(holeAt(b, { x: 3, y: 8 })).toBe(true);
  });

  it('joins each column strip and each rail', () => {
    const b = bb();
    expect(netKey(b, { x: 4, y: 2 })).toBe(netKey(b, { x: 4, y: 4 }));
    expect(netKey(b, { x: 4, y: 4 })).not.toBe(netKey(b, { x: 4, y: 6 }));
    expect(netKey(b, { x: 4, y: 2 })).not.toBe(netKey(b, { x: 5, y: 2 }));
    expect(netKey(b, { x: 0, y: 0 })).toBe(netKey(b, { x: 23, y: 0 }));
  });

  it('lets parts straddle the middle channel but not stand their legs in a hole-less row', () => {
    const b = bb();
    expect(canPlacePart(b, { type: 'led', pos: { x: 3, y: 5 }, rot: 1 })).toBe(true);
    expect(canPlacePart(b, { type: 'led', pos: { x: 3, y: 1 }, rot: 0 })).toBe(false);
  });

  /** + rail → resistor → top strip 5 → LED → top strip 7 → wire → − rail. */
  function lamp(): Board {
    const b = bb();
    b.parts.push(part('r', 'resistor', 5, 1, 1, { resistance: 100 }), part('led', 'led', 6, 3, 0));
    b.wires.push(wire('w', 7, 4, 7, 10));
    return b;
  }

  it('lights an LED through the strips and rails', () => {
    const ev = evaluateBoard(lamp());
    const led = ev.parts.get('led')!;
    expect(led.kind === 'led' && led.brightness).toBeGreaterThan(0.6);
    expect(ev.supplyAmps).toBeGreaterThan(0.01);
    expect(ev.shorted).toBe(false);
  });

  it('an LED with both legs in one strip stays dark (the classic breadboard bug)', () => {
    const b = lamp();
    b.parts = b.parts.filter((p) => p.id !== 'led');
    b.parts.push(part('led', 'led', 7, 3, 1));
    const led = evaluateBoard(b).parts.get('led')!;
    expect(led.kind === 'led' && led.brightness).toBe(0);
  });

  it('a wire straight from rail to rail is a short circuit', () => {
    const b = bb();
    b.wires.push(wire('w', 3, 0, 3, 10));
    expect(evaluateBoard(b).shorted).toBe(true);
  });

  it('hints see strips as connections', () => {
    const b = lamp();
    expect(wiredTogether(b, { x: 7, y: 2 }, { x: 12, y: 10 })).toBe(true);
    expect(wiredTogether(b, { x: 8, y: 2 }, { x: 12, y: 10 })).toBe(false);
  });

  it('smart drop never stands both legs of a part in one strip', () => {
    const b = bb();
    // Dropped vertically inside one strip, the LED should turn to cross two strips.
    expect(bestRotation(b, { type: 'led', pos: { x: 7, y: 3 }, rot: 1 })).not.toBe(1);
  });

  it('a transistor has three legs, the base in the middle', () => {
    const pins = pinCells({ type: 'transistor', pos: { x: 6, y: 3 }, rot: 0 });
    expect(pins).toEqual([
      { x: 5, y: 3 },
      { x: 6, y: 3 },
      { x: 7, y: 3 },
    ]);
  });
});
