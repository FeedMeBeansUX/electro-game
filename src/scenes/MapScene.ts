import Phaser from 'phaser';
import { TOP_BAR_H, VIEW_H, VIEW_W, fitCamera, textResolution } from '../view';
import { PAL, hex } from '../art/palette';
import { Label, FONT_FAMILY } from '../ui/Label';
import { Mascot } from '../ui/Mascot';
import { addParentGate } from '../ui/ParentGate';
import { t } from '../i18n/strings';
import { LEVELS } from '../levels/levels';
import { isCompleted, isUnlocked } from '../progress';
import { getSettings } from '../settings';
import { sayOnce } from '../audio/speech';
import { sfx } from '../audio/sfx';

const TILE_W = 84;
const TILE_H = 66;

/** World map: pick a level. Levels open one after another. */
export class MapScene extends Phaser.Scene {
  constructor() {
    super('map');
  }

  create(): void {
    fitCamera(this);
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, PAL.charcoal).setOrigin(0);
    this.add.rectangle(0, 0, VIEW_W, TOP_BAR_H, PAL.ink).setOrigin(0);
    new Label(this, VIEW_W / 2, 4, t('world1'), { size: 11, color: PAL.yellow });
    addParentGate(this, VIEW_W - 16, 14);

    const ids = LEVELS.map((l) => l.id);
    const unlockAll = getSettings().unlockAll;
    const currentIndex = LEVELS.findIndex((l, i) => !isCompleted(l.id) && isUnlocked(ids, i, unlockAll));
    LEVELS.forEach((level, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = 150 + col * (TILE_W + 12);
      const cy = 76 + row * (TILE_H + 14);
      const unlocked = isUnlocked(ids, i, unlockAll);
      const done = isCompleted(level.id);
      const tile = this.add.container(cx, cy);
      const g = this.add.graphics();
      g.fillStyle(PAL.ink, 1).fillRect(-TILE_W / 2 + 2, -TILE_H / 2 + 3, TILE_W, TILE_H);
      g.fillStyle(unlocked ? PAL.navy : PAL.charcoal, 1).fillRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H);
      g.fillStyle(done ? PAL.green : PAL.slate, 1).fillRect(-TILE_W / 2, -TILE_H / 2, TILE_W, 3);
      tile.add(g);
      const num = this.add
        .text(0, -TILE_H / 2 + 6, String(i + 1), {
          fontFamily: FONT_FAMILY,
          fontSize: '18px',
          fontStyle: 'bold',
          color: hex(unlocked ? PAL.white : PAL.slate),
          resolution: textResolution(),
        })
        .setOrigin(0.5, 0);
      tile.add(num);
      if (unlocked) {
        tile.add(new Label(this, 0, -TILE_H / 2 + 28, level.title, { size: 6, wrap: TILE_W - 8 }));
      }
      if (done) {
        for (let s = 0; s < 3; s++) {
          tile.add(this.add.image((s - 1) * 13, TILE_H / 2 - 9, 'icon-star').setTint(PAL.yellow));
        }
      } else if (!unlocked) {
        tile.add(this.add.image(0, 8, 'icon-lock').setTint(PAL.slate).setScale(1.5));
      }
      tile.setSize(TILE_W, TILE_H).setInteractive({ useHandCursor: true });
      if (i === currentIndex) {
        this.tweens.add({ targets: tile, scale: 1.06, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      tile.on('pointerup', () => {
        if (unlocked) {
          sfx.tap();
          this.scene.start('level', { index: i });
        } else {
          sfx.denied();
          this.tweens.add({ targets: tile, x: cx + 3, duration: 50, yoyo: true, repeat: 2, onComplete: () => tile.setX(cx) });
          sayOnce('sayLocked', t('sayLocked'), 4000);
        }
      });
    });

    const mascot = new Mascot(this, 46, VIEW_H - 14, 3);
    this.time.delayedCall(300, () => {
      sayOnce('sayWelcome', t('sayWelcome'), 120000);
      mascot.hop();
    });

    // Parent corner may have changed "all levels open" or reset progress.
    const onResume = () => this.scene.restart();
    this.events.once(Phaser.Scenes.Events.RESUME, onResume);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.RESUME, onResume));
  }
}
