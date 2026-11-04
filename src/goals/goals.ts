import type { BoardEval } from '../sim/evaluate';

export interface LedOnGoal {
  kind: 'ledOn';
  /** Part id of the LED that must light up. Omit to accept any LED (e.g. one the player placed). */
  target?: string;
  /** 0..1, defaults to 0.5. */
  minBrightness?: number;
}

export type Goal = LedOnGoal;

export interface GoalStatus {
  done: boolean;
  goals: boolean[];
}

export function checkGoal(goal: Goal, ev: BoardEval): boolean {
  switch (goal.kind) {
    case 'ledOn': {
      const min = goal.minBrightness ?? 0.5;
      const lit = (id: string) => {
        const s = ev.parts.get(id);
        return s?.kind === 'led' && !s.popped && s.brightness >= min;
      };
      return goal.target !== undefined ? lit(goal.target) : [...ev.parts.keys()].some(lit);
    }
  }
}

/** A level is complete when every goal holds and nothing is short-circuited. */
export function checkGoals(goals: Goal[], ev: BoardEval): GoalStatus {
  const results = goals.map((g) => checkGoal(g, ev));
  return { done: results.length > 0 && results.every(Boolean) && !ev.shorted, goals: results };
}
