import type { Txt } from '../i18n/strings';
import { getSettings } from '../settings';

/**
 * Voice-over. Each line has an id; if `public/voice/nl/<id>.mp3` exists it is
 * played (record these yourself, see docs/voice-lines.md). Otherwise the
 * browser's Dutch text-to-speech reads the line as a fallback.
 */
const VOICE_DIR = `${import.meta.env.BASE_URL}voice/nl/`;

let dutchVoice: SpeechSynthesisVoice | undefined;
let current: HTMLAudioElement | null = null;
const missing = new Set<string>();
const lastSaid = new Map<string, number>();

function synth(): SpeechSynthesis | undefined {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : undefined;
}

function pickVoice(): void {
  const voices = synth()?.getVoices() ?? [];
  dutchVoice =
    voices.find((v) => v.lang.toLowerCase().replace('_', '-') === 'nl-nl') ??
    voices.find((v) => v.lang.toLowerCase().startsWith('nl'));
}

const s = synth();
if (s) {
  pickVoice();
  s.addEventListener?.('voiceschanged', pickVoice);
}

function speakTts(text: string): void {
  const sp = synth();
  if (!sp) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'nl-NL';
  if (dutchVoice) u.voice = dutchVoice;
  u.rate = 0.9;
  u.pitch = 1.1;
  sp.speak(u);
}

export function stopSpeaking(): void {
  synth()?.cancel();
  if (current) {
    current.onerror = null;
    current.pause();
    current = null;
  }
}

/** Speaks a line: the recording if there is one, otherwise text-to-speech. */
export function say(id: string, txt: Txt): void {
  if (!getSettings().speech) return;
  stopSpeaking();
  if (missing.has(id) || typeof Audio === 'undefined') {
    speakTts(txt.nl);
    return;
  }
  const audio = new Audio(`${VOICE_DIR}${id}.mp3`);
  current = audio;
  const fallback = () => {
    missing.add(id);
    if (current === audio) {
      current = null;
      speakTts(txt.nl);
    }
  };
  audio.onerror = fallback;
  audio.play().catch((err: unknown) => {
    // NotAllowedError means autoplay was blocked, not that the file is missing.
    if ((err as { name?: string })?.name !== 'NotAllowedError') fallback();
  });
}

/** Like say(), but skips if the same line was spoken in the last `cooldownMs`. */
export function sayOnce(id: string, txt: Txt, cooldownMs = 8000): void {
  const now = Date.now();
  if (now - (lastSaid.get(id) ?? -Infinity) < cooldownMs) return;
  lastSaid.set(id, now);
  say(id, txt);
}

/** Whether a line is being spoken right now (for the mascot's talking animation). */
export function isSpeaking(): boolean {
  return (current !== null && !current.paused && !current.ended) || (synth()?.speaking ?? false);
}
