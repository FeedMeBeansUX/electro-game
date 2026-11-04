import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { voiceLines, voiceLinesMarkdown } from '../src/audio/voiceLines';

describe('voice lines', () => {
  it('lists every level intro and the spoken feedback lines, with unique ids', () => {
    const { general, levels } = voiceLines();
    expect(levels.map((l) => l.id)).toContain('w1-l1-intro');
    expect(general.map((l) => l.id)).toContain('saySuccess');
    const ids = [...general, ...levels].map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('docs/voice-lines.md is up to date (run `npm run voice-lines` if this fails)', () => {
    expect(readFileSync('docs/voice-lines.md', 'utf8')).toBe(voiceLinesMarkdown());
  });
});
