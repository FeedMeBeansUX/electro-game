import { describe, expect, it } from 'vitest';
import { diodeModel, type Circuit } from '../src/sim/circuit';
import { limitJunction, solveDC } from '../src/sim/mna';
import { solveLinear } from '../src/sim/linear';
import { BATTERY_INTERNAL_OHMS } from '../src/sim/netlist';

const R_INT = BATTERY_INTERNAL_OHMS;
const battery = (id: string, pos: number, neg: number, volts = 3) =>
  ({ kind: 'battery', id, pos, neg, volts, internalOhms: R_INT }) as const;
const resistor = (id: string, a: number, b: number, ohms: number) => ({ kind: 'resistor', id, a, b, ohms }) as const;
const redLed = (id: string, anode: number, cathode: number) =>
  ({ kind: 'diode', id, anode, cathode, ...diodeModel(1.8) }) as const;

describe('solveLinear', () => {
  it('solves a 3×3 system', () => {
    // 2x + y - z = 8, -3x - y + 2z = -11, -2x + y + 2z = -3  →  x=2, y=3, z=-1
    const a = new Float64Array([2, 1, -1, -3, -1, 2, -2, 1, 2]);
    const b = new Float64Array([8, -11, -3]);
    const x = solveLinear(a, b, 3)!;
    expect(x[0]).toBeCloseTo(2);
    expect(x[1]).toBeCloseTo(3);
    expect(x[2]).toBeCloseTo(-1);
  });

  it('reports a singular matrix', () => {
    expect(solveLinear(new Float64Array([1, 2, 2, 4]), new Float64Array([1, 2]), 2)).toBeNull();
  });
});

describe('solveDC: linear circuits', () => {
  it('voltage divider splits the battery voltage', () => {
    const c: Circuit = {
      nodeCount: 3,
      elements: [battery('b', 0, 2, 6), resistor('r1', 0, 1, 1000), resistor('r2', 1, 2, 1000)],
    };
    const r = solveDC(c);
    expect(r.converged).toBe(true);
    const i = 6 / (2000 + R_INT);
    expect(r.voltages[1] - r.voltages[2]).toBeCloseTo(i * 1000, 6);
    expect(r.currents.get('r1')).toBeCloseTo(i, 6);
    expect(r.currents.get('b')).toBeCloseTo(i, 6);
  });

  it('series resistors add up', () => {
    const c: Circuit = {
      nodeCount: 3,
      elements: [battery('b', 0, 2), resistor('r1', 0, 1, 100), resistor('r2', 1, 2, 200)],
    };
    expect(solveDC(c).currents.get('b')).toBeCloseTo(3 / (300 + R_INT), 6);
  });

  it('parallel resistors share the current', () => {
    const c: Circuit = {
      nodeCount: 2,
      elements: [battery('b', 0, 1), resistor('r1', 0, 1, 100), resistor('r2', 0, 1, 100)],
    };
    const r = solveDC(c);
    const total = 3 / (50 + R_INT);
    expect(r.currents.get('b')).toBeCloseTo(total, 6);
    expect(r.currents.get('r1')).toBeCloseTo(total / 2, 6);
    expect(r.currents.get('r2')).toBeCloseTo(total / 2, 6);
  });

  it('an open switch stops the current and a closed one lets it through', () => {
    const make = (closed: boolean): Circuit => ({
      nodeCount: 3,
      elements: [battery('b', 0, 2), { kind: 'switch', id: 's', a: 0, b: 1, closed }, resistor('r', 1, 2, 100)],
    });
    expect(Math.abs(solveDC(make(false)).currents.get('r')!)).toBeLessThan(1e-6);
    expect(solveDC(make(true)).currents.get('r')).toBeCloseTo(3 / (100.01 + R_INT), 6);
  });

  it('floating parts give finite numbers', () => {
    const c: Circuit = {
      nodeCount: 4,
      elements: [battery('b', 0, 1), resistor('r', 2, 3, 100)],
    };
    const r = solveDC(c);
    expect(r.converged).toBe(true);
    expect([...r.voltages].every(Number.isFinite)).toBe(true);
    expect(r.currents.get('r')).toBeCloseTo(0, 6);
  });

  it('handles an empty circuit', () => {
    expect(solveDC({ nodeCount: 0, elements: [] }).converged).toBe(true);
  });
});

describe('solveDC: LEDs', () => {
  it('LED with a 100 Ω resistor on 3 V draws a safe ~12 mA', () => {
    const c: Circuit = { nodeCount: 3, elements: [battery('b', 0, 2), resistor('r', 0, 1, 100), redLed('d', 1, 2)] };
    const r = solveDC(c);
    expect(r.converged).toBe(true);
    const i = r.currents.get('d')!;
    expect(i).toBeGreaterThan(0.01);
    expect(i).toBeLessThan(0.013);
    const vd = r.voltages[1] - r.voltages[2];
    expect(vd).toBeGreaterThan(1.75);
    expect(vd).toBeLessThan(1.85);
    // Kirchhoff: the same current flows through every part of the loop.
    expect(r.currents.get('r')).toBeCloseTo(i, 6);
  });

  it('a reversed LED stays dark', () => {
    const c: Circuit = { nodeCount: 3, elements: [battery('b', 0, 2), resistor('r', 0, 1, 100), redLed('d', 2, 1)] };
    const r = solveDC(c);
    expect(r.converged).toBe(true);
    expect(Math.abs(r.currents.get('d')!)).toBeLessThan(1e-6);
  });

  it('an LED straight across the battery converges to a dangerously high current', () => {
    const c: Circuit = { nodeCount: 2, elements: [battery('b', 0, 1), redLed('d', 0, 1)] };
    const r = solveDC(c);
    expect(r.converged).toBe(true);
    expect(r.currents.get('d')!).toBeGreaterThan(0.5);
  });

  it('two LEDs in parallel share the current', () => {
    const c: Circuit = {
      nodeCount: 3,
      elements: [battery('b', 0, 2), resistor('r', 0, 1, 100), redLed('d1', 1, 2), redLed('d2', 1, 2)],
    };
    const r = solveDC(c);
    expect(r.converged).toBe(true);
    expect(r.currents.get('d1')).toBeCloseTo(r.currents.get('d2')!, 6);
    expect(r.currents.get('d1')! + r.currents.get('d2')!).toBeCloseTo(r.currents.get('r')!, 6);
  });
});

describe('limitJunction', () => {
  it('leaves small steps alone', () => {
    expect(limitJunction(0.5, 0.49, 0.05, 1.8)).toBe(0.5);
  });

  it('damps big steps above the critical voltage', () => {
    const lim = limitJunction(10, 1.8, 0.05, 1.86);
    expect(lim).toBeLessThan(2.1);
    expect(lim).toBeGreaterThan(1.8);
  });
});
