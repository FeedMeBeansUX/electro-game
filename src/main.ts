import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { LevelScene } from './scenes/LevelScene';
import { MapScene } from './scenes/MapScene';
import { ParentScene } from './scenes/ParentScene';
import { EditorScene } from './scenes/EditorScene';
import { PAL, hex } from './art/palette';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: hex(PAL.ink),
  pixelArt: true,
  roundPixels: true,
  disableContextMenu: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  scene: [BootScene, TitleScene, MapScene, LevelScene, EditorScene, ParentScene],
});

// Offline support (production builds only, so the dev server always serves fresh files).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Not fatal: the game still works online.
    });
  });
}
