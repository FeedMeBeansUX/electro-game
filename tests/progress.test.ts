import { beforeEach, describe, expect, it } from 'vitest';
import { isCompleted, isUnlocked, markCompleted, resetProgress } from '../src/progress';

const ids = ['a', 'b', 'c'];

describe('progress', () => {
  beforeEach(() => resetProgress());

  it('unlocks levels one at a time', () => {
    expect(isUnlocked(ids, 0, false)).toBe(true);
    expect(isUnlocked(ids, 1, false)).toBe(false);
    markCompleted('a');
    expect(isCompleted('a')).toBe(true);
    expect(isUnlocked(ids, 1, false)).toBe(true);
    expect(isUnlocked(ids, 2, false)).toBe(false);
  });

  it('unlock-all opens everything, and reset clears progress', () => {
    expect(isUnlocked(ids, 2, true)).toBe(true);
    markCompleted('a');
    resetProgress();
    expect(isCompleted('a')).toBe(false);
  });
});
