import { solveLinear } from './linear';
import type { BjtEl, Circuit, DiodeEl } from './circuit';

/** Conductance from every node to the reference, so floating parts don't make the matrix singular. */
const GMIN = 1e-9;
const CLOSED_SWITCH_OHMS = 0.01;
const OPEN_SWITCH_SIEMENS = 1e-12;
const MAX_ITERATIONS = 200;
const VOLT_TOLERANCE = 1e-7;
/** Largest exponent we let Math.exp see (guards against overflow). */
const MAX_EXP_ARG = 80;
/** Battery ramp used when a circuit won't converge in one go ("source stepping"). */
const SOURCE_STEPS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

export interface SolveResult {
  /** Node voltages relative to the (implicit) reference. Only differences matter. */
  voltages: Float64Array;
  /**
   * Current through each element, keyed by element id.
   * Resistor/switch: from a to b. Diode: anode to cathode. Battery: out of the + terminal.
   * Transistor: collector current under its id, base current under `<id>:b`.
   */
  currents: Map<string, number>;
  converged: boolean;
  iterations: number;
}

const expLimited = (x: number) => Math.exp(Math.min(x, MAX_EXP_ARG));

function diodeCurrent(d: DiodeEl, vd: number): { i: number; g: number } {
  const e = expLimited(vd / d.nvt);
  const i = d.is * (e - 1);
  const g = Math.max((d.is / d.nvt) * e, 1e-12);
  return { i, g };
}

/** Transistor terminal currents (into the device) and their derivatives to Vbe and Vbc. */
function bjtCurrents(t: BjtEl, vbe: number, vbc: number) {
  const ebe = expLimited(vbe / t.vt);
  const ebc = expLimited(vbc / t.vt);
  const ibe = (t.is / t.bf) * (ebe - 1);
  const ibc = (t.is / t.br) * (ebc - 1);
  const ict = t.is * (ebe - ebc);
  const gbe = Math.max((t.is / (t.bf * t.vt)) * ebe, 1e-12);
  const gbc = Math.max((t.is / (t.br * t.vt)) * ebc, 1e-12);
  const gmf = (t.is / t.vt) * ebe;
  const gmr = (t.is / t.vt) * ebc;
  return {
    ic: ict - ibc,
    ib: ibe + ibc,
    ie: -ict - ibe,
    // [d/dVbe, d/dVbc] for each terminal current
    dc: [gmf, -gmr - gbc],
    db: [gbe, gbc],
    de: [-gmf - gbe, gmr],
  };
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

const critical = (nvt: number, is: number) => nvt * Math.log(nvt / (Math.SQRT2 * is));

/**
 * One node of each group of connected parts. Tying exactly one node per group to
 * the reference fixes that group's "floating" voltage without letting any current
 * flow, which keeps the numbers well-conditioned (otherwise only the tiny GMIN
 * holds a floating circuit in place, and rounding noise never settles).
 */
function anchorNodes(circuit: Circuit): number[] {
  const parent = Array.from({ length: circuit.nodeCount }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const join = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  for (const el of circuit.elements) {
    switch (el.kind) {
      case 'resistor':
        join(el.a, el.b);
        break;
      case 'switch':
        if (el.closed) join(el.a, el.b);
        break;
      case 'battery':
        join(el.pos, el.neg);
        break;
      case 'diode':
        join(el.anode, el.cathode);
        break;
      case 'bjt':
        join(el.b, el.c);
        join(el.b, el.e);
        break;
    }
  }
  return [...new Set(parent.map((_, i) => find(i)))];
}

interface Attempt {
  v: Float64Array;
  /** Junction voltages the last linearisation used (diode vd, transistor vbe/vbc). */
  junctions: Map<string, number>;
  converged: boolean;
  iterations: number;
}

/** One Newton–Raphson run with all batteries scaled by `scale`, starting from `start`. */
function newton(circuit: Circuit, scale: number, start: Attempt | null): Attempt {
  const n = circuit.nodeCount;
  const diodes = circuit.elements.filter((e): e is DiodeEl => e.kind === 'diode');
  const bjts = circuit.elements.filter((e): e is BjtEl => e.kind === 'bjt');
  const junctions = new Map(start?.junctions ?? []);
  for (const d of diodes) if (!junctions.has(d.id)) junctions.set(d.id, 0);
  for (const t of bjts) {
    if (!junctions.has(`${t.id}:be`)) junctions.set(`${t.id}:be`, 0);
    if (!junctions.has(`${t.id}:bc`)) junctions.set(`${t.id}:bc`, 0);
  }
  let v: Float64Array = start ? Float64Array.from(start.v) : new Float64Array(n);
  const anchors = anchorNodes(circuit);
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
    for (const a of anchors) A[a * n + a] += 1;

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
          B[el.pos] += el.volts * scale * g;
          B[el.neg] -= el.volts * scale * g;
          break;
        }
        case 'diode': {
          const vd = junctions.get(el.id)!;
          const { i, g } = diodeCurrent(el, vd);
          const ieq = i - g * vd;
          stampG(el.anode, el.cathode, g);
          B[el.anode] -= ieq;
          B[el.cathode] += ieq;
          break;
        }
        case 'bjt': {
          const vbe = junctions.get(`${el.id}:be`)!;
          const vbc = junctions.get(`${el.id}:bc`)!;
          const k = bjtCurrents(el, vbe, vbc);
          // Each terminal current I = I0 + dI/dVbe·(Vb−Ve) + dI/dVbc·(Vb−Vc), linearised around (vbe, vbc).
          const rows: [number, number, number[]][] = [
            [el.c, k.ic, k.dc],
            [el.b, k.ib, k.db],
            [el.e, k.ie, k.de],
          ];
          for (const [node, i0, [dbe, dbc]] of rows) {
            A[node * n + el.b] += dbe + dbc;
            A[node * n + el.e] -= dbe;
            A[node * n + el.c] -= dbc;
            B[node] -= i0 - dbe * vbe - dbc * vbc;
          }
          break;
        }
      }
    }

    const next = solveLinear(A, B, n);
    if (!next || next.some((x) => !Number.isFinite(x))) break;

    let maxDelta = 0;
    for (let i = 0; i < n; i++) maxDelta = Math.max(maxDelta, Math.abs(next[i] - v[i]));
    let limited = false;
    const limit = (key: string, raw: number, nvt: number, vcrit: number) => {
      const old = junctions.get(key)!;
      const lim = limitJunction(raw, old, nvt, vcrit);
      if (Math.abs(lim - raw) > 1e-12) limited = true;
      maxDelta = Math.max(maxDelta, Math.abs(lim - old));
      junctions.set(key, lim);
    };
    for (const d of diodes) limit(d.id, next[d.anode] - next[d.cathode], d.nvt, critical(d.nvt, d.is));
    for (const t of bjts) {
      const vcrit = critical(t.vt, t.is);
      limit(`${t.id}:be`, next[t.b] - next[t.e], t.vt, vcrit);
      limit(`${t.id}:bc`, next[t.b] - next[t.c], t.vt, vcrit);
    }
    v = next;
    if (!limited && maxDelta < VOLT_TOLERANCE && iterations > 0) {
      return { v, junctions, converged: true, iterations: iterations + 1 };
    }
  }
  return { v, junctions, converged: false, iterations };
}

/**
 * DC operating point by Modified Nodal Analysis.
 * Linear parts are stamped directly; diodes and transistors are linearised and
 * iterated with Newton–Raphson. If that doesn't settle, the batteries are ramped
 * up in steps, each starting from the last answer. Never throws and never loops
 * forever: on trouble it returns its best guess with converged = false.
 */
export function solveDC(circuit: Circuit): SolveResult {
  const n = circuit.nodeCount;
  const currents = new Map<string, number>();
  if (n === 0) {
    for (const el of circuit.elements) currents.set(el.id, 0);
    return { voltages: new Float64Array(0), currents, converged: true, iterations: 0 };
  }

  let attempt = newton(circuit, 1, null);
  let iterations = attempt.iterations;
  if (!attempt.converged) {
    let prev: Attempt | null = null;
    for (const scale of SOURCE_STEPS) {
      prev = newton(circuit, scale, prev);
      iterations += prev.iterations;
      if (!prev.converged) break;
    }
    if (prev?.converged) attempt = prev;
  }
  const v = attempt.v;

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
      case 'bjt': {
        const k = bjtCurrents(el, v[el.b] - v[el.e], v[el.b] - v[el.c]);
        currents.set(el.id, k.ic);
        currents.set(`${el.id}:b`, k.ib);
        break;
      }
    }
  }
  return { voltages: v, currents, converged: attempt.converged, iterations };
}
