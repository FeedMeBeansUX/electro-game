import Phaser from 'phaser';
import type { Cell } from '../board/grid';
import { PAL } from '../art/palette';
import { cellToWorld, type BoardLayout } from '../layout';

type Point = { x: number; y: number };

/** Draws a wire along its route: shadow, body, a highlight at the big scale, and darker ends in the holes. */
export function drawWire(
  g: Phaser.GameObjects.Graphics,
  layout: BoardLayout,
  cells: Cell[],
  color: number,
  alpha: number,
  hot = false,
): void {
  const s = layout.scale;
  const pts = cells.map((c) => cellToWorld(layout, c));
  const seg = (a: Point, b: Point, th: number, dx: number, dy: number, col: number, al: number) => {
    const x = Math.min(a.x, b.x) - th / 2 + dx;
    const y = Math.min(a.y, b.y) - th / 2 + dy;
    g.fillStyle(col, al).fillRect(x, y, Math.abs(a.x - b.x) + th, Math.abs(a.y - b.y) + th);
  };
  for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i], 2 * s, s, s + 1, PAL.ink, 0.35 * alpha);
  if (hot) for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i], 4 * s, 0, 0, PAL.yellow, 0.8 * alpha);
  for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i], 2 * s, 0, 0, hot ? PAL.orange : color, alpha);
  if (s > 1 && !hot) {
    // A lighter stripe along the top-left edge gives the wire a rounded look at the big scale.
    const light = Phaser.Display.Color.IntegerToColor(color).lighten(20).color;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const horizontal = a.y === b.y;
      g.fillStyle(light, 0.7 * alpha).fillRect(
        Math.min(a.x, b.x) - s,
        Math.min(a.y, b.y) - s,
        horizontal ? Math.abs(a.x - b.x) + 2 * s : 1,
        horizontal ? 1 : Math.abs(a.y - b.y) + 2 * s,
      );
    }
  }
  const dark = Phaser.Display.Color.IntegerToColor(color).darken(25).color;
  for (const end of [pts[0], pts[pts.length - 1]]) {
    g.fillStyle(dark, alpha).fillRect(end.x - 2 * s, end.y - 2 * s, 4 * s, 4 * s);
  }
}
