import Phaser from 'phaser';
import { CELL } from '../view';
import { PART_DEFS, type LedColor } from '../parts/defs';
import { LED_COLORS, PAL, hex } from './palette';

/**
 * Placeholder pixel art, drawn pixel-by-pixel onto canvases at boot.
 * Part textures are drawn horizontally with pin 0 on the left; sprites are
 * rotated in 90° steps, which keeps the pixels crisp.
 */

class Px {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
  }

  rect(x: number, y: number, w: number, h: number, color: number, alpha = 1): this {
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = hex(color);
    this.ctx.fillRect(x, y, w, h);
    this.ctx.globalAlpha = 1;
    return this;
  }

  px(x: number, y: number, color: number, alpha = 1): this {
    return this.rect(x, y, 1, 1, color, alpha);
  }

  /** Filled circle using pixel centres, so the edge is hard (no anti-aliasing). */
  disc(cx: number, cy: number, r: number, color: number, alpha = 1): this {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.px(x, y, color, alpha);
      }
    }
    return this;
  }

  /** Draws a pixel map: each character is looked up in `colors` ('.' or ' ' = transparent). */
  map(x: number, y: number, rows: string[], colors: Record<string, number>): this {
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        const c = colors[ch];
        if (c !== undefined) this.px(x + i, y + j, c);
      });
    });
    return this;
  }

  clear(x: number, y: number, w: number, h: number): this {
    this.ctx.clearRect(x, y, w, h);
    return this;
  }

  addTo(scene: Phaser.Scene, key: string): void {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, this.canvas);
  }
}

const partWidth = (span: number) => span * CELL + 8;

/** Silver pin pad and lead from the pin hole towards the body. */
function leads(p: Px, span: number, bodyStart: number, bodyEnd: number): void {
  const right = 4 + span * CELL;
  p.rect(4, 7, bodyStart - 4, 2, PAL.silver).rect(4, 9, bodyStart - 4, 1, PAL.slate);
  p.rect(bodyEnd, 7, right - bodyEnd, 2, PAL.silver).rect(bodyEnd, 9, right - bodyEnd, 1, PAL.slate);
  for (const x of [4, right]) p.rect(x - 2, 6, 4, 4, PAL.slate).rect(x - 1, 7, 2, 2, PAL.white);
}

/** `upright` draws the "−" sign rotated, for sprites turned 90° (so the sign reads correctly on screen). */
function battery(scene: Phaser.Scene, upright: boolean): void {
  const span = PART_DEFS.battery.span;
  const p = new Px(partWidth(span), 16);
  const x0 = 14;
  const x1 = p.w - 14;
  leads(p, span, x0, x1);
  // Body
  p.rect(x0, 2, x1 - x0, 12, PAL.charcoal);
  p.rect(x0, 2, x1 - x0, 1, PAL.slate);
  p.rect(x0, 13, x1 - x0, 1, PAL.ink);
  // "+" cap on the pin-0 side
  p.rect(x0, 2, 9, 12, PAL.orange).rect(x0, 2, 9, 1, PAL.yellow).rect(x0, 13, 9, 1, PAL.red);
  p.rect(x0 + 2, 7, 5, 1, PAL.white).rect(x0 + 4, 5, 1, 5, PAL.white);
  // "−" on the other end
  if (upright) p.rect(x1 - 6, 6, 1, 4, PAL.white);
  else p.rect(x1 - 7, 7, 4, 1, PAL.white);
  // Lightning bolt
  p.map(Math.round((x0 + x1) / 2) - 2, 4, ['..yy', '.yy.', 'yyyy', '.yy.', 'yy..', 'y...'], { y: PAL.yellow });
  p.addTo(scene, upright ? 'part-battery-v' : 'part-battery');
}

function led(scene: Phaser.Scene, key: string, dome: number, light: number, rim: number): void {
  const span = PART_DEFS.led.span;
  const p = new Px(partWidth(span), 16);
  const cx = p.w / 2;
  leads(p, span, cx - 5, cx + 5);
  p.disc(cx, 8, 6.5, rim);
  p.disc(cx - 0.5, 7.5, 5.5, dome);
  p.disc(cx - 1.5, 6.5, 2.5, light);
  p.px(cx - 3, 4, PAL.white).px(cx - 2, 4, PAL.white).px(cx - 3, 5, PAL.white);
  // Flat edge marks the cathode (pin 1, right side), like a real LED.
  p.clear(cx + 6, 0, 2, 16);
  p.rect(cx + 5, 3, 1, 10, rim);
  // Small "+" by the anode leg.
  p.rect(5, 2, 3, 1, PAL.slate).rect(6, 1, 1, 3, PAL.slate);
  p.addTo(scene, key);
}

/** Resistor values that have their own texture (others use the nearest). */
export const RESISTOR_VALUES = [47, 100, 220, 470, 1000, 10000, 22000];

/** Colour-code digits: 0 black, 1 brown, 2 red, 4 yellow, 7 violet (approximated with the palette). */
const DIGIT_COLORS: Record<number, number> = {
  0: PAL.ink,
  1: PAL.plum,
  2: PAL.red,
  3: PAL.orange,
  4: PAL.yellow,
  7: PAL.blue,
};

/**
 * Resistor with real colour bands. Bigger values get a bigger, warmer body:
 * "a bigger speed bump" the child can see.
 */
function resistor(scene: Phaser.Scene, ohms: number): void {
  const span = PART_DEFS.resistor.span;
  const p = new Px(partWidth(span), 16);
  const big = ohms >= 470;
  const x0 = big ? 8 : 10;
  const x1 = p.w - x0;
  const y0 = big ? 4 : 5;
  const h = big ? 9 : 7;
  leads(p, span, x0, x1);
  const body = big ? PAL.orange : PAL.cyan;
  const shade = big ? PAL.red : PAL.teal;
  p.rect(x0, y0, x1 - x0, h, body);
  p.rect(x0, y0, x1 - x0, 1, PAL.white).rect(x0, y0 + h - 1, x1 - x0, 1, shade);
  p.clear(x0, y0, 1, 1).clear(x1 - 1, y0, 1, 1).clear(x0, y0 + h - 1, 1, 1).clear(x1 - 1, y0 + h - 1, 1, 1);
  const digits = String(ohms);
  const first = Number(digits[0]);
  const second = Number(digits[1] ?? 0);
  const zeros = Math.max(0, digits.length - 2);
  const bands: [number, number][] = [
    [x0 + 3, DIGIT_COLORS[first] ?? PAL.ink],
    [x0 + 6, DIGIT_COLORS[second] ?? PAL.ink],
    [x0 + 9, DIGIT_COLORS[zeros] ?? PAL.ink],
    [x1 - 4, big ? PAL.white : PAL.yellow],
  ];
  for (const [x, c] of bands) p.rect(x, y0, 2, h, c);
  p.addTo(scene, `part-resistor-${ohms}`);
}

export const resistorTextureKey = (ohms = 100): string => {
  const nearest = RESISTOR_VALUES.reduce((a, b) => (Math.abs(b - ohms) < Math.abs(a - ohms) ? b : a));
  return `part-resistor-${nearest}`;
};

function button(scene: Phaser.Scene, down: boolean): void {
  const span = PART_DEFS.button.span;
  const p = new Px(partWidth(span), 16);
  const cx = p.w / 2;
  leads(p, span, cx - 7, cx + 7);
  p.rect(cx - 7, 1, 14, 14, PAL.charcoal).rect(cx - 7, 1, 14, 1, PAL.slate).rect(cx - 7, 14, 14, 1, PAL.ink);
  // Corner screws.
  for (const [x, y] of [
    [cx - 6, 2],
    [cx + 5, 2],
    [cx - 6, 13],
    [cx + 5, 13],
  ]) {
    p.px(x, y, PAL.silver);
  }
  if (down) {
    p.disc(cx, 8, 4, PAL.plum).disc(cx, 8.5, 3, PAL.red);
  } else {
    p.disc(cx, 8, 5, PAL.plum).disc(cx - 0.5, 7.5, 4.5, PAL.red).disc(cx - 1.5, 6.5, 1.5, PAL.orange);
  }
  p.addTo(scene, down ? 'part-button-down' : 'part-button');
}

function fan(scene: Phaser.Scene): void {
  const span = PART_DEFS.fan.span;
  const p = new Px(partWidth(span), 16);
  const cx = p.w / 2;
  leads(p, span, cx - 7, cx + 7);
  p.disc(cx, 8, 7.5, PAL.ink).disc(cx, 8, 6.5, PAL.slate).disc(cx, 8, 5.5, PAL.charcoal);
  // "+" by pin 0.
  p.rect(5, 2, 3, 1, PAL.red).rect(6, 1, 1, 3, PAL.red);
  p.addTo(scene, 'part-fan');
  // Blades: a separate sprite that spins.
  const b = new Px(12, 12);
  b.map(0, 0, [
    '.....ww.....',
    '.....ww.....',
    '....www.....',
    '....ww......',
    '.....w......',
    'www..ss..ww.',
    'wwwwwss.wwww',
    '......w..www',
    '......ww....',
    '.....www....',
    '.....ww.....',
    '.....ww.....',
  ], { w: PAL.sky, s: PAL.white });
  b.addTo(scene, 'fan-blades');
}

function buzzer(scene: Phaser.Scene): void {
  const span = PART_DEFS.buzzer.span;
  const p = new Px(partWidth(span), 16);
  const cx = p.w / 2;
  leads(p, span, cx - 7, cx + 7);
  p.disc(cx, 8, 7.5, PAL.ink).disc(cx - 0.5, 7.5, 6.5, PAL.charcoal);
  p.disc(cx, 8, 2, PAL.ink);
  p.px(cx - 4, 4, PAL.slate).px(cx - 3, 3, PAL.slate);
  p.rect(5, 2, 3, 1, PAL.red).rect(6, 1, 1, 3, PAL.red);
  p.addTo(scene, 'part-buzzer');
  const w = new Px(9, 11);
  w.map(0, 0, ['x........', '.x...x...', '..x...x..', '..x...x..', '..x...x..', '..x...x..', '..x...x..', '..x...x..', '..x...x..', '.x...x...', 'x........'], {
    x: PAL.white,
  });
  w.addTo(scene, 'icon-wave');
}

/** NPN transistor seen from above: the D-shaped black body with three legs (E, B, C). */
function transistor(scene: Phaser.Scene): void {
  const p = new Px(partWidth(2), 16);
  const cx = p.w / 2;
  // Three legs, the middle one (base) in the centre hole.
  for (const x of [4, cx, p.w - 4]) {
    p.rect(x - 1, 8, 2, 6, PAL.silver).rect(x - 2, 6, 4, 4, PAL.slate).rect(x - 1, 7, 2, 2, PAL.white);
  }
  p.rect(4, 11, p.w - 8, 2, PAL.silver);
  // Body: flat side at the bottom, round at the top.
  p.disc(cx, 8, 8, PAL.ink).clear(0, 9, p.w, 7);
  p.rect(cx - 8, 8, 16, 2, PAL.ink);
  p.disc(cx - 1, 7, 6.5, PAL.charcoal).clear(0, 9, p.w, 7);
  p.rect(cx - 7, 8, 14, 1, PAL.charcoal);
  p.px(cx - 4, 3, PAL.slate).px(cx - 3, 2, PAL.slate);
  // Re-draw the legs below the flat face.
  for (const x of [4, cx, p.w - 4]) p.rect(x - 1, 10, 2, 3, PAL.silver).rect(x - 2, 6, 4, 4, PAL.slate).rect(x - 1, 7, 2, 2, PAL.white);
  // A tiny arrow on the emitter side, like the circuit symbol.
  p.rect(cx - 5, 5, 2, 1, PAL.white).px(cx - 4, 4, PAL.white);
  p.addTo(scene, 'part-transistor');
}

/** Light sensor (LDR): a reddish disc with the wiggly light-sensitive track. */
function ldr(scene: Phaser.Scene): void {
  const p = new Px(partWidth(2), 16);
  const cx = p.w / 2;
  leads(p, 2, cx - 6, cx + 6);
  p.disc(cx, 8, 6.5, PAL.plum).disc(cx - 0.5, 7.5, 5.5, PAL.orange);
  p.map(cx - 4, 4, ['x.xxx.x', 'x.x.x.x', 'xxx.xxx', 'x.x.x.x', 'x.xxx.x', '.......', '.......'], { x: PAL.red });
  p.px(cx - 3, 3, PAL.yellow).px(cx - 2, 3, PAL.yellow);
  p.addTo(scene, 'part-ldr');
}

/** Touch pad: two interleaved metal combs. A finger across them closes the gap a tiny bit. */
function touchPad(scene: Phaser.Scene): void {
  const p = new Px(partWidth(2), 16);
  const cx = p.w / 2;
  leads(p, 2, cx - 7, cx + 7);
  p.rect(cx - 7, 1, 14, 14, PAL.navy).rect(cx - 7, 1, 14, 1, PAL.blue);
  for (let i = 0; i < 4; i++) {
    p.rect(cx - 6, 3 + i * 3, 9, 1, PAL.silver);
    p.rect(cx - 3, 4 + i * 3, 9, 1, PAL.yellow);
  }
  p.rect(cx - 6, 3, 1, 10, PAL.silver).rect(cx + 5, 4, 1, 10, PAL.yellow);
  p.addTo(scene, 'part-touch');
}

function pot(scene: Phaser.Scene): void {
  const span = PART_DEFS.pot.span;
  const p = new Px(partWidth(span), 16);
  const cx = p.w / 2;
  leads(p, span, cx - 7, cx + 7);
  p.rect(cx - 7, 1, 14, 14, PAL.blue).rect(cx - 7, 1, 14, 1, PAL.sky).rect(cx - 7, 14, 14, 1, PAL.navy);
  // Scale marks from dim (left) to bright (right).
  p.px(cx - 6, 12, PAL.navy).px(cx + 5, 12, PAL.yellow);
  p.addTo(scene, 'part-pot');
  const k = new Px(11, 11);
  k.disc(5.5, 5.5, 5.5, PAL.slate).disc(5, 5, 4.5, PAL.white).rect(5, 1, 1, 4, PAL.ink);
  k.addTo(scene, 'pot-knob');
}

function switchPart(scene: Phaser.Scene, closed: boolean): void {
  const span = PART_DEFS.switch.span;
  const p = new Px(partWidth(span), 16);
  const x0 = 9;
  const x1 = p.w - 9;
  leads(p, span, x0, x1);
  p.rect(x0, 3, x1 - x0, 10, PAL.charcoal).rect(x0, 3, x1 - x0, 1, PAL.slate).rect(x0, 12, x1 - x0, 1, PAL.ink);
  p.rect(x0 + 2, 7, 3, 3, PAL.silver).rect(x1 - 5, 7, 3, 3, PAL.silver);
  if (closed) {
    p.rect(x0 + 3, 7, x1 - x0 - 6, 2, PAL.yellow).rect(x0 + 3, 9, x1 - x0 - 6, 1, PAL.orange);
  } else {
    for (let i = 0; i < 13; i++) p.rect(x0 + 3 + i, 8 - Math.floor(i / 3), 1, 2, PAL.yellow);
  }
  p.addTo(scene, closed ? 'part-switch-closed' : 'part-switch-open');
}

function glow(scene: Phaser.Scene): void {
  const p = new Px(40, 40);
  p.disc(20, 20, 20, PAL.white, 0.12);
  p.disc(20, 20, 15, PAL.white, 0.18);
  p.disc(20, 20, 10, PAL.white, 0.3);
  p.disc(20, 20, 6, PAL.white, 0.45);
  p.addTo(scene, 'glow');
}

function boardPanel(scene: Phaser.Scene, cols: number, rows: number): string {
  const key = `board-${cols}x${rows}`;
  if (scene.textures.exists(key)) return key;
  const pad = 12;
  const w = (cols - 1) * CELL + pad * 2;
  const h = (rows - 1) * CELL + pad * 2;
  const p = new Px(w + 2, h + 3);
  p.rect(2, 3, w, h, PAL.ink, 0.5); // drop shadow
  p.rect(0, 0, w, h, PAL.white);
  p.rect(0, h - 2, w, 2, PAL.silver).rect(w - 1, 0, 1, h, PAL.silver).rect(0, 0, w, 1, PAL.white);
  p.clear(0, 0, 1, 1).clear(w - 1, 0, 1, 1).clear(0, h - 1, 1, 1).clear(w - 1, h - 1, 1, 1);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = pad + i * CELL - 2;
      const y = pad + j * CELL - 2;
      p.rect(x, y, 4, 4, PAL.slate).rect(x, y, 4, 1, PAL.charcoal).rect(x, y, 1, 4, PAL.charcoal);
    }
  }
  p.addTo(scene, key);
  return key;
}

/**
 * A breadboard: cream plastic, a red line along the + rail (top), a blue line
 * along the − rail (bottom), and a groove down the middle channel.
 * Holes only where the breadboard has them (see holeAt).
 */
function breadboardPanel(scene: Phaser.Scene, cols: number, rows: number): string {
  const key = `breadboard-${cols}x${rows}`;
  if (scene.textures.exists(key)) return key;
  const pad = 12;
  const w = (cols - 1) * CELL + pad * 2;
  const h = (rows - 1) * CELL + pad * 2;
  const rowY = (r: number) => pad + r * CELL;
  const p = new Px(w + 2, h + 3);
  p.rect(2, 3, w, h, PAL.ink, 0.5);
  p.rect(0, 0, w, h, PAL.white);
  p.rect(0, h - 2, w, 2, PAL.silver).rect(w - 1, 0, 1, h, PAL.silver);
  p.clear(0, 0, 1, 1).clear(w - 1, 0, 1, 1).clear(0, h - 1, 1, 1).clear(w - 1, h - 1, 1, 1);
  // Rails: a slightly darker band with a coloured line on the inside edge.
  p.rect(2, rowY(0) - 6, w - 4, 12, PAL.silver, 0.25).rect(2, rowY(0) + 7, w - 4, 1, PAL.red);
  p.rect(2, rowY(rows - 1) - 6, w - 4, 12, PAL.silver, 0.25).rect(2, rowY(rows - 1) - 8, w - 4, 1, PAL.blue);
  // + and − signs at both ends of the rails.
  for (const x of [4, w - 9]) {
    p.rect(x, rowY(0) - 1, 5, 1, PAL.red).rect(x + 2, rowY(0) - 3, 1, 5, PAL.red);
    p.rect(x, rowY(rows - 1), 5, 1, PAL.blue);
  }
  // Middle channel.
  p.rect(2, rowY(5) - 3, w - 4, 6, PAL.silver).rect(2, rowY(5) - 3, w - 4, 1, PAL.slate);
  const holeRows = Array.from({ length: rows }, (_, r) => r).filter((r) => ![1, 5, 9].includes(r));
  for (const j of holeRows) {
    for (let i = 0; i < cols; i++) {
      const x = pad + i * CELL - 2;
      const y = rowY(j) - 2;
      p.rect(x, y, 4, 4, PAL.slate).rect(x, y, 4, 1, PAL.charcoal).rect(x, y, 1, 4, PAL.charcoal);
    }
  }
  p.addTo(scene, key);
  return key;
}

/** Board panel texture key for the given size (created on first use). Top-left hole is at (12,12). */
export function ensureBoardTexture(scene: Phaser.Scene, cols: number, rows: number, kind: 'magic' | 'breadboard' = 'magic'): string {
  return kind === 'breadboard' ? breadboardPanel(scene, cols, rows) : boardPanel(scene, cols, rows);
}

const ICONS: Record<string, string[]> = {
  speaker: [
    '.....x......',
    '....xx...x..',
    '...xwx....x.',
    'xxxwwx..x..x',
    'xwwwwx...x.x',
    'xwwwwx...x.x',
    'xwwwwx...x.x',
    'xxxwwx..x..x',
    '...xwx....x.',
    '....xx...x..',
    '.....x......',
  ],
  restart: [
    '...xxxxx....',
    '..xx...xx.x.',
    '.xx.....xxx.',
    '.x.....xxxx.',
    'xx..........',
    'x...........',
    'x...........',
    'xx.........x',
    '.x........xx',
    '.xx......xx.',
    '..xx....xx..',
    '...xxxxxx...',
  ],
  play: [
    'xx..........',
    'xxxx........',
    'xxxxxx......',
    'xxxxxxxx....',
    'xxxxxxxxxx..',
    'xxxxxxxxxxxx',
    'xxxxxxxxxxxx',
    'xxxxxxxxxx..',
    'xxxxxxxx....',
    'xxxxxx......',
    'xxxx........',
    'xx..........',
  ],
  next: [
    '......x.....',
    '......xx....',
    '......xxx...',
    'xxxxxxxxxx..',
    'xxxxxxxxxxx.',
    'xxxxxxxxxxxx',
    'xxxxxxxxxxxx',
    'xxxxxxxxxxx.',
    'xxxxxxxxxx..',
    '......xxx...',
    '......xx....',
    '......x.....',
  ],
  rotate: [
    '..xxxxx..',
    '.xx...xx.',
    'xx.....x.',
    'x.....xxx',
    'x......x.',
    'x........',
    'xx.......',
    '.xx...xx.',
    '..xxxxx..',
  ],
  home: [
    '.....xx.....',
    '....xxxx....',
    '...xxxxxx...',
    '..xxxxxxxx..',
    '.xxxxxxxxxx.',
    'xxxxxxxxxxxx',
    '.xxxxxxxxxx.',
    '.xxx....xxx.',
    '.xxx....xxx.',
    '.xxx....xxx.',
    '.xxx....xxx.',
    '.xxx....xxx.',
  ],
  gear: [
    '....xxxx....',
    '.x..xxxx..x.',
    'xxxxxxxxxxxx',
    '.xxxx..xxxx.',
    '.xxx....xxx.',
    'xxx......xxx',
    'xxx......xxx',
    '.xxx....xxx.',
    '.xxxx..xxxx.',
    'xxxxxxxxxxxx',
    '.x..xxxx..x.',
    '....xxxx....',
  ],
  lock: [
    '...xxxx...',
    '..xx..xx..',
    '.xx....xx.',
    '.x......x.',
    '.x......x.',
    'xxxxxxxxxx',
    'xxxxxxxxxx',
    'xxxx..xxxx',
    'xxxx..xxxx',
    'xxxxx.xxxx',
    'xxxxxxxxxx',
    'xxxxxxxxxx',
  ],
  download: [
    '....xxxx....',
    '....xxxx....',
    '....xxxx....',
    '....xxxx....',
    '.xxxxxxxxxx.',
    '..xxxxxxxx..',
    '...xxxxxx...',
    '....xxxx....',
    '.....xx.....',
    '............',
    'xxxxxxxxxxxx',
    'xxxxxxxxxxxx',
  ],
  eye: [
    '............',
    '....xxxx....',
    '..xx....xx..',
    '.x...xx...x.',
    'x...xxxx...x',
    'x...xxxx...x',
    '.x...xx...x.',
    '..xx....xx..',
    '....xxxx....',
    '............',
  ],
  sun: [
    '.....x......',
    '.x...x...x..',
    '..x.....x...',
    '....xxx.....',
    '...xxxxx....',
    'xx.xxxxx.xx.',
    '...xxxxx....',
    '....xxx.....',
    '..x.....x...',
    '.x...x...x..',
    '.....x......',
  ],
  moon: [
    '...xxxx...',
    '..xxx.....',
    '.xxx......',
    'xxxx......',
    'xxxx......',
    'xxxx......',
    'xxxxx.....',
    '.xxxxx...x',
    '..xxxxxxx.',
    '....xxx...',
  ],
  check: [
    '..........x',
    '.........xx',
    '........xx.',
    '.......xx..',
    'x.....xx...',
    'xx...xx....',
    '.xx.xx.....',
    '..xxx......',
    '...x.......',
  ],
  star: [
    '.....x.....',
    '.....x.....',
    '....xxx....',
    'xxxxxxxxxxx',
    '.xxxxxxxxx.',
    '..xxxxxxx..',
    '..xxxxxxx..',
    '.xxxx.xxxx.',
    '.xxx...xxx.',
    'xx.......xx',
  ],
};

const MASCOT_BODY = [
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
  '.oyyyyyyyyyyyo..',
  '..oyyyyyyyyyo...',
  '...oyyyyyyyo....',
  '....ooooooo.....',
  '....o.....o.....',
  '...oo.....oo....',
];

/** Vonkje, the spark mascot: idle, blink and talk frames. */
function mascot(scene: Phaser.Scene): void {
  const colors = { o: PAL.orange, y: PAL.yellow, w: PAL.white, k: PAL.ink, m: PAL.red };
  const frames: Record<string, Record<number, string>> = {
    idle: { 10: '.oyyyykkkyyyyo..' },
    blink: { 7: '.oyyyyyyyyyyyo..', 8: '.oyykkyyykkyyo..', 10: '.oyyyykkkyyyyo..' },
    talk: { 10: '.oyyyymmmyyyyo..', 11: '..oyyymmmyyyo...' },
  };
  for (const [name, rows] of Object.entries(frames)) {
    const map = MASCOT_BODY.map((row, i) => rows[i] ?? row);
    // Rosy cheeks.
    const p = new Px(16, 16).map(0, 0, map, colors);
    p.px(2, 9, PAL.orange).px(12, 9, PAL.orange);
    p.addTo(scene, `mascot-${name}`);
  }
}

const HAND = [
  '....xx......',
  '...xwwx.....',
  '...xwwx.....',
  '...xwwxxx...',
  '...xwwwwwxx.',
  '.xxxwwwwwwwx',
  'xwwxwwwwwwwx',
  'xwwwwwwwwwwx',
  '.xwwwwwwwwwx',
  '..xwwwwwwwx.',
  '...xwwwwwx..',
  '...xxxxxxx..',
];

function icons(scene: Phaser.Scene): void {
  new Px(12, 12).map(0, 0, HAND, { x: PAL.ink, w: PAL.white }).addTo(scene, 'hand');
  for (const [name, rows] of Object.entries(ICONS)) {
    const p = new Px(rows[0].length, rows.length);
    p.map(0, 0, rows, { x: PAL.white, w: PAL.silver });
    p.addTo(scene, `icon-${name}`);
  }
  // Wire icon for the tray.
  const w = new Px(28, 14);
  w.rect(2, 10, 8, 2, PAL.red).rect(8, 3, 2, 9, PAL.red).rect(8, 3, 12, 2, PAL.red).rect(18, 3, 2, 8, PAL.red);
  w.rect(18, 9, 8, 2, PAL.red);
  w.rect(0, 9, 4, 4, PAL.slate).rect(24, 8, 4, 4, PAL.slate);
  w.addTo(scene, 'icon-wire');
}

export const ledTextureKey = (color: LedColor, on: boolean): string => `part-led-${color}${on ? '-on' : ''}`;

export function partTextureKey(
  type: string,
  props: { color?: LedColor; closed?: boolean; resistance?: number },
  lit = false,
  rot = 0,
): string {
  switch (type) {
    case 'resistor':
      return resistorTextureKey(props.resistance);
    case 'button':
      return props.closed ? 'part-button-down' : 'part-button';
    case 'battery':
      return rot % 2 === 1 ? 'part-battery-v' : 'part-battery';
    case 'led':
      return ledTextureKey(props.color ?? 'red', lit);
    case 'switch':
      return props.closed ? 'part-switch-closed' : 'part-switch-open';
    default:
      return `part-${type}`;
  }
}

/** Creates every placeholder texture. Call once from the boot scene. */
export function createTextures(scene: Phaser.Scene): void {
  battery(scene, false);
  battery(scene, true);
  RESISTOR_VALUES.forEach((ohms) => resistor(scene, ohms));
  button(scene, false);
  button(scene, true);
  fan(scene);
  buzzer(scene);
  pot(scene);
  transistor(scene);
  ldr(scene);
  touchPad(scene);
  switchPart(scene, false);
  switchPart(scene, true);
  const shades: Record<LedColor, [number, number, number, number]> = {
    // dome off, highlight off, dome on, rim
    red: [PAL.red, PAL.orange, PAL.orange, PAL.plum],
    green: [PAL.green, PAL.lime, PAL.lime, PAL.teal],
    yellow: [PAL.orange, PAL.yellow, PAL.yellow, PAL.red],
    blue: [PAL.blue, PAL.sky, PAL.cyan, PAL.navy],
  };
  for (const color of Object.keys(LED_COLORS) as LedColor[]) {
    const [dome, light, domeOn, rim] = shades[color];
    led(scene, ledTextureKey(color, false), dome, light, rim);
    led(scene, ledTextureKey(color, true), domeOn, PAL.white, dome);
  }
  led(scene, 'part-led-popped', PAL.slate, PAL.silver, PAL.charcoal);
  glow(scene);
  icons(scene);
  mascot(scene);
}
