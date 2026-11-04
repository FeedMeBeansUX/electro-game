import { pinCells, type Board } from '../board/board';
import { cellKey } from '../board/grid';
import { buildNetlist } from './netlist';
import { solveDC } from './mna';

/** LED current that counts as "fully bright". */
export const LED_FULL_BRIGHT_AMPS = 0.015;
/** Above this an LED pops (real LEDs are rated around 20–30 mA). */
export const LED_MAX_AMPS = 0.04;
/** Battery current above this counts as a short circuit. */
export const SHORT_CIRCUIT_AMPS = 1;
/** Reverse voltage across an LED that counts as "connected the wrong way round". */
export const LED_REVERSED_VOLTS = 0.5;
/** Currents below this are treated as no current (for animation). */
export const MIN_VISIBLE_AMPS = 1e-5;

export interface LedState {
  kind: 'led';
  amps: number;
  /** 0..1 */
  brightness: number;
  popped: boolean;
  reversed: boolean;
}

export interface BatteryState {
  kind: 'battery';
  amps: number;
  shorted: boolean;
}

export interface PassiveState {
  kind: 'passive';
  amps: number;
}

export type PartState = LedState | BatteryState | PassiveState;

export interface BoardEval {
  parts: Map<string, PartState>;
  /** Current through each wire, positive from its first point to its last. */
  wires: Map<string, number>;
  shorted: boolean;
  popped: string[];
  converged: boolean;
}

/**
 * Simulates the board. LEDs that get too much current pop (become open
 * circuits) and the board is solved again, like a real burnt-out LED.
 */
export function evaluateBoard(board: Board, excluded: ReadonlySet<string> = new Set()): BoardEval {
  const popped = new Set<string>();
  let result = solveDC(buildNetlist(board, excluded).circuit);

  for (let round = 0; round < board.parts.length; round++) {
    const over = board.parts.filter(
      (p) =>
        p.type === 'led' &&
        !excluded.has(p.id) &&
        !popped.has(p.id) &&
        (result.currents.get(p.id) ?? 0) > LED_MAX_AMPS,
    );
    if (over.length === 0) break;
    over.forEach((p) => popped.add(p.id));
    result = solveDC(buildNetlist(board, new Set([...excluded, ...popped])).circuit);
  }

  const { nodeOfCell } = buildNetlist(board, new Set([...excluded, ...popped]));
  const voltageAt = (key: string): number => {
    const n = nodeOfCell.get(key);
    return n === undefined ? 0 : result.voltages[n] ?? 0;
  };

  const parts = new Map<string, PartState>();
  let shorted = false;
  for (const p of board.parts) {
    const amps = excluded.has(p.id) ? 0 : result.currents.get(p.id) ?? 0;
    if (p.type === 'led') {
      const isPopped = popped.has(p.id);
      let reversed = false;
      if (!isPopped && !excluded.has(p.id)) {
        // Voltage across the LED (anode minus cathode), read from its pin holes.
        const [anode, cathode] = pinCells(p).map(cellKey);
        reversed = voltageAt(anode) - voltageAt(cathode) < -LED_REVERSED_VOLTS;
      }
      parts.set(p.id, {
        kind: 'led',
        amps: isPopped ? 0 : amps,
        brightness: isPopped || amps < MIN_VISIBLE_AMPS ? 0 : Math.min(1, amps / LED_FULL_BRIGHT_AMPS),
        popped: isPopped,
        reversed,
      });
    } else if (p.type === 'battery') {
      const isShort = amps > SHORT_CIRCUIT_AMPS;
      shorted ||= isShort;
      parts.set(p.id, { kind: 'battery', amps, shorted: isShort });
    } else {
      parts.set(p.id, { kind: 'passive', amps });
    }
  }

  const wires = new Map<string, number>();
  for (const w of board.wires) wires.set(w.id, excluded.has(w.id) ? 0 : result.currents.get(w.id) ?? 0);

  return { parts, wires, shorted, popped: [...popped], converged: result.converged };
}
