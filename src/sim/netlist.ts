import { netKey, pinCells, wireEnds, type Board } from '../board/board';
import type { Cell } from '../board/grid';
import { SKIN_OHMS, ldrOhms, potOhms, type LedColor } from '../parts/defs';
import { NPN_MODEL, diodeModel, type Circuit, type Element } from './circuit';

/** Wires are tiny resistors so their current can be read for the current-dot animation. */
export const WIRE_OHMS = 0.01;
export const BATTERY_INTERNAL_OHMS = 0.5;
/** A small hobby motor with a fan on it. */
export const FAN_OHMS = 20;
/** An active buzzer: a one-way junction plus some resistance (≈30 mA at 3 V). */
export const BUZZER_FORWARD_VOLTS = 0.6;
export const BUZZER_OHMS = 70;

/** Forward voltage at 10 mA, per LED colour. */
export const LED_FORWARD_VOLTS: Record<LedColor, number> = {
  red: 1.8,
  yellow: 2.0,
  green: 2.1,
  blue: 2.9,
};

export interface Netlist {
  circuit: Circuit;
  /** Node index per connection (key: netKey of a hole). */
  nodeOfCell: Map<string, number>;
}

/** Id of the built-in battery that feeds a breadboard's rails. */
export const SUPPLY_ID = 'supply';

/**
 * Builds the circuit. On a magic board every hole is its own node; on a
 * breadboard all holes of a strip or rail share one (see netKey). Parts listed
 * in `excluded` (e.g. a popped LED, or a part being dragged) are left out.
 */
export function buildNetlist(board: Board, excluded: ReadonlySet<string> = new Set()): Netlist {
  const nodeOfCell = new Map<string, number>();
  const node = (c: Cell): number => {
    const k = netKey(board, c);
    let id = nodeOfCell.get(k);
    if (id === undefined) {
      id = nodeOfCell.size;
      nodeOfCell.set(k, id);
    }
    return id;
  };

  /** Extra nodes inside a part (e.g. between a buzzer's junction and its resistance). */
  let internal = 0;
  const innerNode = (): number => {
    const k = `inner:${internal++}`;
    const id = nodeOfCell.size;
    nodeOfCell.set(k, id);
    return id;
  };

  const elements: Element[] = [];
  if (board.kind === 'breadboard' && board.supply) {
    elements.push({
      kind: 'battery',
      id: SUPPLY_ID,
      pos: node({ x: 0, y: 0 }),
      neg: node({ x: 0, y: board.rows - 1 }),
      volts: board.supply,
      internalOhms: BATTERY_INTERNAL_OHMS,
    });
  }
  const light = board.light ?? 1;
  for (const p of board.parts) {
    if (excluded.has(p.id)) continue;
    const pins = pinCells(p);
    const n0 = node(pins[0]);
    const n1 = node(pins[pins.length - 1]);
    switch (p.type) {
      case 'battery':
        elements.push({
          kind: 'battery',
          id: p.id,
          pos: n0,
          neg: n1,
          volts: p.props.voltage ?? 3,
          internalOhms: BATTERY_INTERNAL_OHMS,
        });
        break;
      case 'resistor':
        elements.push({ kind: 'resistor', id: p.id, a: n0, b: n1, ohms: p.props.resistance ?? 100 });
        break;
      case 'led': {
        const model = diodeModel(LED_FORWARD_VOLTS[p.props.color ?? 'red']);
        elements.push({ kind: 'diode', id: p.id, anode: n0, cathode: n1, ...model });
        break;
      }
      case 'switch':
      case 'button':
        elements.push({ kind: 'switch', id: p.id, a: n0, b: n1, closed: p.props.closed ?? false });
        break;
      case 'fan':
        elements.push({ kind: 'resistor', id: p.id, a: n0, b: n1, ohms: FAN_OHMS });
        break;
      case 'pot':
        elements.push({ kind: 'resistor', id: p.id, a: n0, b: n1, ohms: potOhms(p.props.knob ?? 0) });
        break;
      case 'transistor':
        elements.push({ kind: 'bjt', id: p.id, e: n0, b: node(pins[1]), c: n1, ...NPN_MODEL });
        break;
      case 'ldr':
        elements.push({ kind: 'resistor', id: p.id, a: n0, b: n1, ohms: ldrOhms(p.props.covered ? 0 : light) });
        break;
      case 'touch':
        // A finger across the pads conducts a tiny bit; untouched, the gap doesn't conduct at all.
        if (p.props.closed) elements.push({ kind: 'resistor', id: p.id, a: n0, b: n1, ohms: SKIN_OHMS });
        break;
      case 'buzzer': {
        // The diode carries the buzzer's id, so its current is the buzzer current.
        const mid = innerNode();
        elements.push({ kind: 'diode', id: p.id, anode: n0, cathode: mid, ...diodeModel(BUZZER_FORWARD_VOLTS, 0.01, 1.5) });
        elements.push({ kind: 'resistor', id: `${p.id}:r`, a: mid, b: n1, ohms: BUZZER_OHMS });
        break;
      }
    }
  }
  for (const w of board.wires) {
    if (excluded.has(w.id)) continue;
    const [a, b] = wireEnds(w);
    elements.push({ kind: 'resistor', id: w.id, a: node(a), b: node(b), ohms: WIRE_OHMS });
  }
  return { circuit: { nodeCount: nodeOfCell.size, elements }, nodeOfCell };
}
