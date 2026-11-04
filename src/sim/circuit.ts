/** Electrical model of the board: nodes are numbered 0..nodeCount-1. */

export interface ResistorEl {
  kind: 'resistor';
  id: string;
  a: number;
  b: number;
  ohms: number;
}

/** Battery: ideal source with a small internal resistance (Norton form in the solver). */
export interface BatteryEl {
  kind: 'battery';
  id: string;
  pos: number;
  neg: number;
  volts: number;
  internalOhms: number;
}

export interface DiodeEl {
  kind: 'diode';
  id: string;
  anode: number;
  cathode: number;
  /** Saturation current (A). */
  is: number;
  /** Emission coefficient × thermal voltage (V). */
  nvt: number;
}

export interface SwitchEl {
  kind: 'switch';
  id: string;
  a: number;
  b: number;
  closed: boolean;
}

/** NPN transistor (Ebers–Moll transport model). */
export interface BjtEl {
  kind: 'bjt';
  id: string;
  c: number;
  b: number;
  e: number;
  /** Saturation current (A). */
  is: number;
  /** Forward and reverse current gain. */
  bf: number;
  br: number;
  /** Thermal voltage (V). */
  vt: number;
}

export type Element = ResistorEl | BatteryEl | DiodeEl | SwitchEl | BjtEl;

export interface Circuit {
  nodeCount: number;
  elements: Element[];
}

export const THERMAL_VOLTAGE = 0.02585;

/** Builds a Shockley diode model that passes `atAmps` at `forwardVolts`. */
export function diodeModel(forwardVolts: number, atAmps = 0.01, n = 2): { is: number; nvt: number } {
  const nvt = n * THERMAL_VOLTAGE;
  return { is: atAmps / Math.exp(forwardVolts / nvt), nvt };
}

/** A small general-purpose NPN transistor (like a 2N3904 or BC547). */
export const NPN_MODEL = { is: 1e-14, bf: 100, br: 1, vt: THERMAL_VOLTAGE };
