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

describe('evaluateBoard: new parts', () => {
  /** Battery (+ top-left) with a part on top and a plain wire on the right and bottom. */
  function withPart(type: PartType, rot: Rot = 0, props: PartProps = {}): Board {
    return {
      cols: 24,
      rows: 11,
      parts: [part('bat', 'battery', 5, 6, 1, { voltage: 3 }), part('x', type, 12, 4, rot, props)],
      wires: [wire('w1', 5, 4, 11, 4), wire('w2', 13, 4, 19, 4), wire('w3', 19, 4, 19, 8), wire('w4', 19, 8, 5, 8)],
    };
  }

  it('a fan spins one way, and the other way when turned around', () => {
    const fwd = evaluateBoard(withPart('fan', 0)).parts.get('x')!;
    const back = evaluateBoard(withPart('fan', 2)).parts.get('x')!;
    expect(fwd.kind === 'fan' && fwd.speed).toBe(1);
    expect(back.kind === 'fan' && back.speed).toBe(-1);
  });

  it('a buzzer sounds only the right way round', () => {
    const on = evaluateBoard(withPart('buzzer', 0)).parts.get('x')!;
    const off = evaluateBoard(withPart('buzzer', 2)).parts.get('x')!;
    expect(on.kind === 'buzzer' && on.on).toBe(true);
    expect(on.amps).toBeGreaterThan(0.02);
    expect(on.amps).toBeLessThan(0.05);
    expect(off.kind === 'buzzer' && off.on).toBe(false);
  });

  it('a push button conducts only while pressed', () => {
    const up = evaluateBoard(withPart('button', 0, { closed: false }));
    const down = evaluateBoard(withPart('button', 0, { closed: true }));
    expect(Math.abs(up.wires.get('w1')!)).toBeLessThan(1e-6);
    // With nothing else in the loop a pressed button is a short circuit.
    expect(down.shorted).toBe(true);
  });

  it('turning the potentiometer knob up makes an LED brighter, without popping it', () => {
    const brightness = (knob: number) => {
      const b = withPart('pot', 0, { knob });
      b.wires = b.wires.filter((w) => w.id !== 'w3');
      b.parts.push(part('led', 'led', 19, 5, 1, { color: 'red' }));
      b.wires.push(wire('w5', 19, 6, 19, 8));
      const s = evaluateBoard(b).parts.get('led')!;
      expect(s.kind === 'led' && s.popped).toBe(false);
      return s.kind === 'led' ? s.brightness : -1;
    };
    const levels = [0, 0.25, 0.5, 0.75, 1].map(brightness);
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThan(levels[i - 1]);
    expect(levels[0]).toBeLessThan(0.15);
    expect(levels[4]).toBeGreaterThan(0.9);
  });
});
