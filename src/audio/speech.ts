import type { Txt } from '../i18n/strings';
import { getSettings } from '../settings';

/**
 * Placeholder voice: reads the Dutch text with the browser's text-to-speech.
 * Phase 2 replaces this with recorded voice-over.
 */
let dutchVoice: SpeechSynthesisVoice | undefined;
const lastSaid = new Map<string, number>();

function synth(): SpeechSynthesis | undefined {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : undefined;
}

function pickVoice(): void {
  const voices = synth()?.getVoices() ?? [];
  dutchVoice =
    voices.find((v) => v.lang.toLowerCase() === 'nl-nl') ?? voices.find((v) => v.lang.toLowerCase().startsWith('nl'));
}

const s = synth();
if (s) {
  pickVoice();
  s.addEventListener?.('voiceschanged', pickVoice);
}

export function say(txt: Txt): void {
  const sp = synth();
  if (!sp || !getSettings().speech) return;
  sp.cancel();
  const u = new SpeechSynthesisUtterance(txt.nl);
  u.lang = 'nl-NL';
  if (dutchVoice) u.voice = dutchVoice;
  u.rate = 0.9;
  u.pitch = 1.1;
  sp.speak(u);
}

/** Like say(), but skips if the same line was spoken in the last `cooldownMs`. */
export function sayOnce(key: string, txt: Txt, cooldownMs = 8000): void {
  const now = Date.now();
  if (now - (lastSaid.get(key) ?? -Infinity) < cooldownMs) return;
  lastSaid.set(key, now);
  say(txt);
}

export function stopSpeaking(): void {
  synth()?.cancel();
}
