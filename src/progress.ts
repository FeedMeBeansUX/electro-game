/** Which levels have been finished, saved in localStorage when available. */
const KEY = 'electro.progress.v1';

interface Progress {
  completed: string[];
}

function load(): Progress {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>;
      if (Array.isArray(p.completed)) return { completed: p.completed.filter((x) => typeof x === 'string') };
    }
  } catch {
    // Storage blocked or corrupt: start fresh.
  }
  return { completed: [] };
}

let current = load();

function save(): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(current));
  } catch {
    // Ignore: progress still counts for this session.
  }
}

export const isCompleted = (levelId: string): boolean => current.completed.includes(levelId);

export function markCompleted(levelId: string): void {
  if (!isCompleted(levelId)) {
    current = { completed: [...current.completed, levelId] };
    save();
  }
}

export function resetProgress(): void {
  current = { completed: [] };
  save();
}

/** A level is open when it's the first one, the previous one is done, or the parent unlocked everything. */
export function isUnlocked(levelIds: readonly string[], index: number, unlockAll: boolean): boolean {
  return unlockAll || index === 0 || isCompleted(levelIds[index - 1]) || isCompleted(levelIds[index]);
}
