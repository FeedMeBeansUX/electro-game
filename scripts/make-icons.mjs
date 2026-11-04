// Generates the app icons (public/icons/*.png) from the Vonkje pixel art.
// Run with: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const MASCOT = [
  '.......o........',
  '......oyo.......',
  '..o...oyo...o...',
  '..oo.oyyyo.oo...',
  '...oyyyyyyyo....',
  '..oyyyyyyyyyo...',
  '.oyyyyyyyyyyyo..',
  '.oyywwyyywwyyo..',
  '.oyywkyyywkyyo..',
  '.oyyyyyyyyyyyo..',
  '.oyyyykkkyyyyo..',
  '..oyyyyyyyyyo...',
  '...oyyyyyyyo....',
  '....ooooooo.....',
  '....o.....o.....',
  '...oo.....oo....',
];
const COLORS = { o: [0xef, 0x7d, 0x57], y: [0xff, 0xcd, 0x75], w: [0xf4, 0xf4, 0xf4], k: [0x1a, 0x1c, 0x2c] };
const BG = [0x29, 0x36, 0x6f];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** Square RGB PNG: the mascot centred, `art` pixels wide, on a navy background. */
function icon(size, art) {
  const px = Math.floor(art / 16);
  const off = Math.floor((size - px * 16) / 2);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const mx = Math.floor((x - off) / px);
      const my = Math.floor((y - off) / px);
      const ch = mx >= 0 && my >= 0 && mx < 16 && my < 16 ? MASCOT[my][mx] : '.';
      const [r, g, b] = COLORS[ch] ?? BG;
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', icon(192, 160));
writeFileSync('public/icons/icon-512.png', icon(512, 416));
// Maskable icons get cropped to a circle, so keep the art inside the middle ~60%.
writeFileSync('public/icons/icon-maskable-512.png', icon(512, 304));
writeFileSync('public/icons/apple-touch-icon.png', icon(180, 144));
console.log('icons written to public/icons/');
