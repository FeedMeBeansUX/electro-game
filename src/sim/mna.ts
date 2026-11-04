import { solveLinear } from './linear';
import type { Circuit, DiodeEl } from './circuit';

/** Conductance from every node to the reference, so floating parts don't make the matrix singular. */
const GMIN = 1e-9;
const CLOSED_SWITCH_OHMS = 0.01;
const OPEN_SWITCH_SIEMENS = 1e-12;
const MAX_ITERATIONS = 200;
const VOLT_TOLERANCE = 1e-7;
/** Largest exponent we let Math.exp see (guards against overflow). */
const MAX_EXP_ARG = 80;

export interface SolveResult {
  /** Node voltages relative to the (implicit) reference. Only differences matter. */
  voltages: Float64Array;
  /** Current through each element, keyed by element id.
   *  Resistor/switch: from a to b. Diode: anode to cathode. Battery: out of the + terminal. */
  currents: Map<string, number>;
  converged: boolean;
  iterations: number;
}

function diodeCurrent(d: DiodeEl, vd: number): { i: number; g: number } {
  const arg = Math.min(vd / d.nvt, MAX_EXP_ARG);
  const e = Math.exp(arg);
  const i = d.is * (e - 1);
  const g = Math.max((d.is / d.nvt) * e, 1e-12);
  return { i, g };
}

/** SPICE-style junction voltage limiting: keeps Newton steps on the exponential well-behaved. */
export function limitJunction(vNew: number, vOld: number, nvt: number, vcrit: number): number {
  if (vNew > vcrit && Math.abs(vNew - vOld) > 2 * nvt) {
    if (vOld > 0) {
      const arg = 1 + (vNew - vOld) / nvt;
      return arg > 0 ? vOld + nvt * Math.log(arg) : vcrit;
    }
    return nvt * Math.log(vNew / nvt);
  }
  return vNew;
}

/**
 * DC operating point by Modified Nodal Analysis.
 * Linear parts are stamped directly; diodes are linearised and iterated with Newton–Raphson.
 * Never throws and never loops forever: on trouble it returns its best guess with converged = false.
 */
export function solveDC(circuit: Circuit): SolveResult {
  const n = circuit.nodeCount;
  const currents = new Map<string, number>();
  if (n === 0) {
    for (const el of circuit.elements) currents.set(el.id, 0);
    return { voltages: new Float64Array(0), currents, converged: true, iterations: 0 };
  }

  const diodes = circuit.elements.filter((e): e is DiodeEl => e.kind === 'diode');
  const vdOp = new Map<string, number>(diodes.map((d) => [d.id, 0]));
  const vcrit = new Map<string, number>(diodes.map((d) => [d.id, d.nvt * Math.log(d.nvt / (Math.SQRT2 * d.is))]));

  let v: Float64Array = new Float64Array(n);
  let converged = false;
  let iterations = 0;

  for (; iterations < MAX_ITERATIONS; iterations++) {
    const A = new Float64Array(n * n);
    const B = new Float64Array(n);
    const stampG = (a: number, b: number, g: number) => {
      A[a * n + a] += g;
      A[b * n + b] += g;
      A[a * n + b] -= g;
      A[b * n + a] -= g;
    };
    for (let i = 0; i < n; i++) A[i * n + i] += GMIN;

    for (const el of circuit.elements) {
      switch (el.kind) {
        case 'resistor':
          stampG(el.a, el.b, 1 / el.ohms);
          break;
        case 'switch':
          stampG(el.a, el.b, el.closed ? 1 / CLOSED_SWITCH_OHMS : OPEN_SWITCH_SIEMENS);
          break;
        case 'battery': {
          // Norton equivalent: current source V/r into the + node, in parallel with conductance 1/r.
          const g = 1 / el.internalOhms;
          stampG(el.pos, el.neg, g);
          B[el.pos] += el.volts * g;
          B[el.neg] -= el.volts * g;
          break;
        }
        case 'diode': {
          const vd = vdOp.get(el.id)!;
          const { i, g } = diodeCurrent(el, vd);
          const ieq = i - g * vd;
          stampG(el.anode, el.cathode, g);
          B[el.anode] -= ieq;
          B[el.cathode] += ieq;
          break;
        }
      }
    }

    const next = solveLinear(A, B, n);
    if (!next || next.some((x) => !Number.isFinite(x))) break;

    let maxDelta = 0;
    for (let i = 0; i < n; i++) maxDelta = Math.max(maxDelta, Math.abs(next[i] - v[i]));
    let limited = false;
    for (const d of diodes) {
      const raw = next[d.anode] - next[d.cathode];
      const old = vdOp.get(d.id)!;
      const lim = limitJunction(raw, old, d.nvt, vcrit.get(d.id)!);
      if (Math.abs(lim - raw) > 1e-12) limited = true;
      maxDelta = Math.max(maxDelta, Math.abs(lim - old));
      vdOp.set(d.id, lim);
    }
    v = next;
    if (!limited && maxDelta < VOLT_TOLERANCE && iterations > 0) {
      converged = true;
      iterations++;
      break;
    }
  }

  for (const el of circuit.elements) {
    switch (el.kind) {
      case 'resistor':
        currents.set(el.id, (v[el.a] - v[el.b]) / el.ohms);
        break;
      case 'switch':
        currents.set(el.id, el.closed ? (v[el.a] - v[el.b]) / CLOSED_SWITCH_OHMS : 0);
        break;
      case 'battery':
        currents.set(el.id, (el.volts - (v[el.pos] - v[el.neg])) / el.internalOhms);
        break;
      case 'diode':
        currents.set(el.id, diodeCurrent(el, v[el.anode] - v[el.cathode]).i);
        break;
    }
  }
  return { voltages: v, currents, converged, iterations };
}
