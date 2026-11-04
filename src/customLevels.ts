import type { LevelDef } from './levels/levels';

/** Levels made in the editor ("Mijn levels"), saved on this device. */
const KEY = 'electro.customLevels.v1';

export function loadCustomLevels(): LevelDef[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as LevelDef[]).filter((l) => l && typeof l.id === 'string') : [];
  } catch {
    return [];
  }
}

function store(list: LevelDef[]): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: the level still exists for this session in the editor.
  }
}

/** Saves a level, replacing one with the same id. */
export function saveCustomLevel(level: LevelDef): void {
  const list = loadCustomLevels().filter((l) => l.id !== level.id);
  store([...list, level]);
}

export function deleteCustomLevel(id: string): void {
  store(loadCustomLevels().filter((l) => l.id !== id));
}
