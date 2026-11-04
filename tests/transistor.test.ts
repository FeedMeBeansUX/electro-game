import { describe, expect, it } from 'vitest';
import { NPN_MODEL, diodeModel, type Circuit, type Element } from '../src/sim/circuit';
import { solveDC } from '../src/sim/mna';
import { BATTERY_INTERNAL_OHMS } from '../src/sim/netlist';
import { LDR_BRIGHT_OHMS, LDR_DARK_OHMS, SKIN_OHMS } from '../src/parts/defs';

// Node 0 = battery +, node 1 = battery − (ground).
const battery: Element = { kind: 'battery', id: 'bat', pos: 0, neg: 1, volts: 3, internalOhms: BATTERY_INTERNAL_OHMS };
const r = (id: string, a: number, b: number, ohms: number): Element => ({ kind: 'resistor', id, a, b, ohms });
const npn = (id: string, c: number, b: number, e: number): Element => ({ kind: 'bjt', id, c, b, e, ...NPN_MODEL });
const led = (id: string, a: number, k: number): Element => ({ kind: 'diode', id, anode: a, cathode: k, ...diodeModel(1.8) });

describe('NPN transistor', () => {
  /** A fan (20 Ω) on the collector; a 1 kΩ base resistor fed by a button. */
  const fanSwitch = (pressed: boolean): Circuit => ({
    nodeCount: 4,
    elements: [battery, r('fan', 0, 2, 20), npn('t', 2, 3, 1), ...(pressed ? [r('rb', 0, 3, 1000)] : [])],
  });

  it('a small base current switches a big collector current', () => {
    const off = solveDC(fanSwitch(false));
    const on = solveDC(fanSwitch(true));
    expect(on.converged).toBe(true);
    expect(Math.abs(off.currents.get('t')!)).toBeLessThan(1e-6);
    const ic = on.currents.get('t')!;
    const ib = on.currents.get('t:b')!;
    expect(ic).toBeGreaterThan(0.1); // enough to spin the fan
    expect(ib).toBeGreaterThan(0.001);
    expect(ib).toBeLessThan(0.005);
    expect(ic / ib).toBeGreaterThan(20);
  });

  it('in its active region the collector current is about β times the base current', () => {
    // 1 MΩ base resistor: ~2.3 µA base current, far from saturation with a 100 Ω load.
    const res = solveDC({ nodeCount: 4, elements: [battery, r('rc', 0, 2, 100), npn('t', 2, 3, 1), r('rb', 0, 3, 1e6)] });
    expect(res.converged).toBe(true);
    const ratio = res.currents.get('t')! / res.currents.get('t:b')!;
    expect(ratio).toBeGreaterThan(90);
    expect(ratio).toBeLessThan(110);
  });

  it('a night light: the LED turns on only in the dark', () => {
    const night = (ldr: number): Circuit => ({
      nodeCount: 6,
      elements: [battery, r('rb', 0, 2, 10_000), r('ldr', 2, 1, ldr), r('rl', 0, 3, 100), led('led', 3, 4), npn('t', 4, 2, 1)],
    });
    const day = solveDC(night(LDR_BRIGHT_OHMS));
    const dark = solveDC(night(LDR_DARK_OHMS));
    expect(day.converged && dark.converged).toBe(true);
    expect(day.currents.get('led')!).toBeLessThan(1e-4);
    expect(dark.currents.get('led')!).toBeGreaterThan(0.005);
  });

  it('touching a pad needs two transistors (a Darlington pair) to light an LED', () => {
    const one = solveDC({
      nodeCount: 6,
      elements: [battery, r('skin', 0, 2, SKIN_OHMS), r('rl', 0, 3, 47), led('led', 3, 4), npn('t1', 4, 2, 1)],
    });
    const two = solveDC({
      nodeCount: 6,
      elements: [
        battery,
        r('skin', 0, 2, SKIN_OHMS),
        r('rl', 0, 3, 47),
        led('led', 3, 4),
        npn('t1', 4, 2, 5),
        npn('t2', 4, 5, 1),
      ],
    });
    expect(one.converged && two.converged).toBe(true);
    expect(one.currents.get('led')!).toBeLessThan(0.001);
    expect(two.currents.get('led')!).toBeGreaterThan(0.004);
  });
});

describe('solver robustness', () => {
  /** Small deterministic random generator, so failures can be reproduced. */
  function rng(seed: number) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }

  it('never throws, hangs or returns garbage on random circuits', () => {
    const rand = rng(42);
    const start = Date.now();
    let converged = 0;
    const trials = 300;
    for (let trial = 0; trial < trials; trial++) {
      const n = 2 + Math.floor(rand() * 8);
      const pick = () => Math.floor(rand() * n);
      const elements: Element[] = [{ kind: 'battery', id: 'b0', pos: 0, neg: 1, volts: 3, internalOhms: BATTERY_INTERNAL_OHMS }];
      const count = 1 + Math.floor(rand() * 8);
      for (let i = 0; i < count; i++) {
        const k = rand();
        const id = `e${i}`;
        if (k < 0.35) elements.push(r(id, pick(), pick(), [0.01, 47, 100, 1000, 1e5][Math.floor(rand() * 5)]));
        else if (k < 0.6) elements.push(led(id, pick(), pick()));
        else if (k < 0.85) elements.push(npn(id, pick(), pick(), pick()));
        else elements.push({ kind: 'switch', id, a: pick(), b: pick(), closed: rand() < 0.5 });
      }
      const res = solveDC({ nodeCount: n, elements });
      expect([...res.voltages].every(Number.isFinite), `trial ${trial} voltages`).toBe(true);
      expect([...res.currents.values()].every(Number.isFinite), `trial ${trial} currents`).toBe(true);
      if (res.converged) converged++;
    }
    expect(Date.now() - start).toBeLessThan(10_000);
    // Nearly every circuit should settle; the rest still give finite numbers.
    expect(converged / trials).toBeGreaterThan(0.98);
  });
});
