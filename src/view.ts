import Phaser from 'phaser';
import { VIEW_H, VIEW_W, computeZoom } from './layout';

export * from './layout';

let currentZoom = 1;

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
