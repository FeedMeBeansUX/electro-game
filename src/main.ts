import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { LevelScene } from './scenes/LevelScene';
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
  scene: [BootScene, TitleScene, LevelScene],
});
