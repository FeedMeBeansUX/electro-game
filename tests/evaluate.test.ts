import { describe, expect, it } from 'vitest';
import type { Board, PlacedPart, Wire } from '../src/board/board';
import { evaluateBoard } from '../src/sim/evaluate';
import { checkGoals } from '../src/goals/goals';
import type { Rot } from '../src/board/grid';
import type { PartProps, PartType } from '../src/parts/defs';

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

/** Battery on the left (+ at top), LED on top, resistor top-right: the World 1 loop. */
function loop(ledRot: Rot = 0, withResistor = true): Board {
  const parts = [part('bat', 'battery', 5, 6, 1, { voltage: 3 }), part('led', 'led', 12, 4, ledRot, { color: 'red' })];
  const wires = [wire('w1', 5, 4, 11, 4), wire('w2', 13, 4, 19, 4), wire('w3', 19, 6, 5, 8)];
  if (withResistor) parts.push(part('res', 'resistor', 19, 5, 1, { resistance: 100 }));
  else wires.push(wire('w4', 19, 4, 19, 6));
  return { cols: 24, rows: 11, parts, wires };
}

describe('evaluateBoard', () => {
  it('lights the LED in a closed loop and reports current in every wire', () => {
    const ev = evaluateBoard(loop());
    const led = ev.parts.get('led')!;
    expect(led.kind).toBe('led');
    if (led.kind !== 'led') return;
    expect(led.brightness).toBeGreaterThan(0.6);
    expect(led.popped).toBe(false);
    expect(ev.shorted).toBe(false);
    // Conventional current flows from + (top-left) to the right along the top wire...
    expect(ev.wires.get('w1')!).toBeGreaterThan(0.01);
    // ...and back from right to left along the bottom wire (drawn from x=19 to x=5).
    expect(ev.wires.get('w3')!).toBeGreaterThan(0.01);
    expect(checkGoals([{ kind: 'ledOn', target: 'led' }], ev).done).toBe(true);
    expect(checkGoals([{ kind: 'ledOn' }], ev).done).toBe(true);
    expect(checkGoals([{ kind: 'ledOn', target: 'nope' }], ev).done).toBe(false);
  });

  it('keeps the LED dark when the loop is open', () => {
    const b = loop();
    b.wires = b.wires.filter((w) => w.id !== 'w3');
    const ev = evaluateBoard(b);
    const led = ev.parts.get('led')!;
    expect(led.kind === 'led' && led.brightness).toBe(0);
    expect(checkGoals([{ kind: 'ledOn', target: 'led' }], ev).done).toBe(false);
  });

  it('flags a reversed LED', () => {
    const ev = evaluateBoard(loop(2));
    const led = ev.parts.get('led')!;
    expect(led.kind === 'led' && led.reversed).toBe(true);
    expect(led.kind === 'led' && led.brightness).toBeLessThan(0.01);
  });

  it('pops an LED that has no resistor', () => {
    const ev = evaluateBoard(loop(0, false));
    const led = ev.parts.get('led')!;
    expect(led.kind === 'led' && led.popped).toBe(true);
    expect(ev.popped).toEqual(['led']);
    expect(ev.shorted).toBe(false);
    expect(checkGoals([{ kind: 'ledOn', target: 'led' }], ev).done).toBe(false);
  });

  it('detects a short circuit and does not count the level as done', () => {
    const b = loop();
    b.wires.push(wire('short', 5, 4, 5, 8));
    // The short wire would run under the battery in a real game; the simulator doesn't care.
    const ev = evaluateBoard(b);
    expect(ev.shorted).toBe(true);
    expect(checkGoals([{ kind: 'ledOn', target: 'led' }], ev).done).toBe(false);
  });

  it('ignores excluded parts (e.g. one being dragged)', () => {
    const ev = evaluateBoard(loop(), new Set(['res']));
    const led = ev.parts.get('led')!;
    expect(led.kind === 'led' && led.brightness).toBe(0);
  });

  it('switch controls the LED', () => {
    const b = loop();
    b.wires = b.wires.filter((w) => w.id !== 'w3');
    b.parts.push(part('sw', 'switch', 12, 8, 0, { closed: false }));
    b.wires.push(wire('w5', 19, 6, 13, 8), wire('w6', 11, 8, 5, 8));
    const off = evaluateBoard(b).parts.get('led')!;
    expect(off.kind === 'led' && off.brightness).toBe(0);
    b.parts.find((p) => p.id === 'sw')!.props.closed = true;
    const on = evaluateBoard(b).parts.get('led')!;
    expect(on.kind === 'led' && on.brightness).toBeGreaterThan(0.6);
  });
});
