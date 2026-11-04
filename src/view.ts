import Phaser from 'phaser';
import type { Cell } from './board/grid';

/** Logical resolution; everything is laid out in these units and scaled up. */
export const VIEW_W = 480;
export const VIEW_H = 270;

/** Magic-board grid pitch in logical pixels. */
export const CELL = 16;

/** Screen position of hole (0,0) for a board of the given size, centred in the play area. */
export const TOP_BAR_H = 28;
export const TRAY_Y = 214;

export interface BoardLayout {
  originX: number;
  originY: number;
  cols: number;
  rows: number;
}

export function boardLayout(cols: number, rows: number): BoardLayout {
  const w = (cols - 1) * CELL;
  const h = (rows - 1) * CELL;
  const top = TOP_BAR_H + 2;
  const bottom = TRAY_Y - 2;
  return {
    originX: Math.round((VIEW_W - w) / 2),
    originY: Math.round(top + (bottom - top - h) / 2),
    cols,
    rows,
  };
}

export const cellToWorld = (l: BoardLayout, c: Cell): { x: number; y: number } => ({
  x: l.originX + c.x * CELL,
  y: l.originY + c.y * CELL,
});

/** Nearest hole to a world position (may be outside the board). */
export const worldToCell = (l: BoardLayout, x: number, y: number): Cell => ({
  x: Math.round((x - l.originX) / CELL),
  y: Math.round((y - l.originY) / CELL),
});

let currentZoom = 1;

/** Integer zoom when there's room for it (crisp pixels), otherwise fit exactly. */
export function computeZoom(width: number, height: number): number {
  const z = Math.min(width / VIEW_W, height / VIEW_H);
  return z >= 2 ? Math.floor(z) : z;
}

/** Zooms and centres the scene's camera on the logical view, now and on every resize. */
export function fitCamera(scene: Phaser.Scene): void {
  const apply = () => {
    const { width, height } = scene.scale.gameSize;
    currentZoom = computeZoom(width, height);
    scene.cameras.main.setZoom(currentZoom).centerOn(VIEW_W / 2, VIEW_H / 2);
  };
  apply();
  scene.scale.on(Phaser.Scale.Events.RESIZE, apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, apply));
}

/** Resolution for Text objects so they stay sharp at the current zoom. */
export function textResolution(): number {
  return Math.min(8, Math.max(1, Math.ceil(currentZoom * (globalThis.devicePixelRatio || 1))));
}
