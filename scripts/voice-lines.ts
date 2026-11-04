// Writes docs/voice-lines.md. Run with: npm run voice-lines
import { writeFileSync } from 'node:fs';
import { voiceLinesMarkdown } from '../src/audio/voiceLines';

writeFileSync('docs/voice-lines.md', voiceLinesMarkdown());
console.log('wrote docs/voice-lines.md');
