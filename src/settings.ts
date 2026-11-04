/** Player/parent settings, persisted in localStorage when available. */
export interface Settings {
  /** Show the English word in a small line under each Dutch label. */
  showEnglish: boolean;
  /** Read instructions aloud (placeholder Dutch text-to-speech). */
  speech: boolean;
}

const KEY = 'electro.settings.v1';
const DEFAULTS: Settings = { showEnglish: false, speech: true };

type Listener = (s: Settings) => void;
const listeners = new Set<Listener>();

function load(): Settings {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // Storage blocked or corrupt: fall back to defaults.
  }
  return { ...DEFAULTS };
}

let current: Settings = load();

export function getSettings(): Readonly<Settings> {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(current));
  } catch {
    // Ignore: the setting still applies for this session.
  }
  listeners.forEach((fn) => fn(current));
}

/** Subscribe to changes; returns an unsubscribe function. */
export function onSettingsChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
