import { cloneBoard, type Board } from '../board/board';
import { evaluateBoard, type BoardEval } from '../sim/evaluate';
import type { PartType } from '../parts/defs';

/** Brightness at which an LED counts as "on" in truth tables. */
export const LED_ON = 0.3;
/** Fan speed at which a fan counts as "on" in truth tables. */
export const FAN_ON = 0.2;

export interface LedOnGoal {
  kind: 'ledOn';
  /** Part id of the LED that must light up. Omit to accept any LED (e.g. one the player placed). */
  target?: string;
  /** 0..1, defaults to 0.5. */
  minBrightness?: number;
  /** 0..1: the LED must not be brighter than this (e.g. a soft night light). */
  maxBrightness?: number;
  /** How many LEDs must be lit (only without `target`). Defaults to 1. */
  count?: number;
}

export interface FanGoal {
  kind: 'fanSpinning';
  target?: string;
  /** 0..1, defaults to 0.5. */
  minSpeed?: number;
  /** Required direction: 1 = current from pin 0 to pin 1, -1 = the other way. */
  direction?: 1 | -1;
}

export interface BuzzerGoal {
  kind: 'buzzerOn';
  target?: string;
}

/**
 * The output must follow the inputs (switch or button ids) exactly as the table says,
 * for every combination of inputs. `expect` is 'and', 'or', or one entry per
 * combination, where input i is bit i of the index.
 */
export interface TruthTableGoal {
  kind: 'truthTable';
  inputs: string[];
  /** Part id of the output. Omit and set `outputType` for "any part of this type" (e.g. a buzzer the child placed). */
  output?: string;
  outputType?: PartType;
  expect: 'and' | 'or' | boolean[];
  /** Also require the output to be on right now (so the child has to try it). */
  live?: boolean;
}

/**
 * The output must react to light: on in the dark and off in daylight (a night
 * light), or the other way round. With `live` it must also be on right now.
 */
export interface LightGoal {
  kind: 'lightResponse';
  output?: string;
  outputType?: PartType;
  onWhen: 'dark' | 'light';
  live?: boolean;
}

export type Goal = LedOnGoal | FanGoal | BuzzerGoal | TruthTableGoal | LightGoal;

export interface GoalStatus {
  done: boolean;
  goals: boolean[];
}

/** Whether a part counts as "on": a lit LED, a turning fan or a sounding buzzer. */
export function isActive(ev: BoardEval, id: string): boolean {
  const s = ev.parts.get(id);
  switch (s?.kind) {
    case 'led':
      return !s.popped && s.brightness >= LED_ON;
    case 'fan':
      return Math.abs(s.speed) >= FAN_ON;
    case 'buzzer':
      return s.on;
    default:
      return false;
  }
}

function expected(goal: TruthTableGoal, combo: number): boolean {
  if (Array.isArray(goal.expect)) return goal.expect[combo] ?? false;
  const bits = goal.inputs.map((_, i) => (combo >> i) & 1);
  return goal.expect === 'and' ? bits.every(Boolean) : bits.some(Boolean);
}

function outputActive(goal: TruthTableGoal | LightGoal, ev: BoardEval, board: Board): boolean {
  if (goal.output !== undefined) return isActive(ev, goal.output);
  return board.parts.some((p) => p.type === goal.outputType && isActive(ev, p.id));
}

function checkTruthTable(goal: TruthTableGoal, ev: BoardEval, board: Board): boolean {
  if (goal.live && !outputActive(goal, ev, board)) return false;
  const combos = 1 << goal.inputs.length;
  for (let combo = 0; combo < combos; combo++) {
    const b = cloneBoard(board);
    goal.inputs.forEach((id, i) => {
      const part = b.parts.find((p) => p.id === id);
      if (part) part.props.closed = Boolean((combo >> i) & 1);
    });
    const e = evaluateBoard(b);
    if (e.shorted || outputActive(goal, e, b) !== expected(goal, combo)) return false;
  }
  return true;
}

function checkLight(goal: LightGoal, ev: BoardEval, board: Board): boolean {
  if (goal.live && !outputActive(goal, ev, board)) return false;
  for (const light of [1, 0]) {
    const b = cloneBoard(board);
    b.light = light;
    for (const p of b.parts) if (p.type === 'ldr') p.props.covered = false;
    const e = evaluateBoard(b);
    const shouldBeOn = goal.onWhen === 'dark' ? light === 0 : light === 1;
    if (e.shorted || outputActive(goal, e, b) !== shouldBeOn) return false;
  }
  return true;
}

export function checkGoal(goal: Goal, ev: BoardEval, board?: Board): boolean {
  const ids = (target: string | undefined) => (target !== undefined ? [target] : [...ev.parts.keys()]);
  switch (goal.kind) {
    case 'ledOn': {
      const min = goal.minBrightness ?? 0.5;
      const max = goal.maxBrightness ?? 1;
      const lit = ids(goal.target).filter((id) => {
        const s = ev.parts.get(id);
        return s?.kind === 'led' && !s.popped && s.brightness >= min && s.brightness <= max;
      });
      return lit.length >= (goal.target !== undefined ? 1 : goal.count ?? 1);
    }
    case 'fanSpinning': {
      const min = goal.minSpeed ?? 0.5;
      return ids(goal.target).some((id) => {
        const s = ev.parts.get(id);
        return s?.kind === 'fan' && Math.abs(s.speed) >= min && (!goal.direction || Math.sign(s.speed) === goal.direction);
      });
    }
    case 'buzzerOn':
      return ids(goal.target).some((id) => {
        const s = ev.parts.get(id);
        return s?.kind === 'buzzer' && s.on;
      });
    case 'truthTable':
      return board !== undefined && checkTruthTable(goal, ev, board);
    case 'lightResponse':
      return board !== undefined && checkLight(goal, ev, board);
  }
}

/** A level is complete when every goal holds and nothing is short-circuited. */
export function checkGoals(goals: Goal[], ev: BoardEval, board?: Board): GoalStatus {
  const results = goals.map((g) => checkGoal(g, ev, board));
  return { done: results.length > 0 && results.every(Boolean) && !ev.shorted, goals: results };
}

/** Why a brightness goal isn't met yet, so the game can say "too bright" or "too dim". */
export function brightnessFeedback(goals: Goal[], ev: BoardEval): 'tooBright' | 'tooDim' | null {
  for (const g of goals) {
    if (g.kind !== 'ledOn' || checkGoal(g, ev)) continue;
    const leds = (g.target !== undefined ? [g.target] : [...ev.parts.keys()])
      .map((id) => ev.parts.get(id))
      .filter((s) => s?.kind === 'led' && !s.popped && s.brightness > 0.02);
    if (leds.length === 0) continue;
    const b = Math.max(...leds.map((s) => (s?.kind === 'led' ? s.brightness : 0)));
    if (g.maxBrightness !== undefined && b > g.maxBrightness) return 'tooBright';
    if (b < (g.minBrightness ?? 0.5)) return 'tooDim';
  }
  return null;
}
