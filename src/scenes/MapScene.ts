import Phaser from 'phaser';
import { TOP_BAR_H, VIEW_H, VIEW_W, fitCamera, textResolution } from '../view';
import { PAL, hex } from '../art/palette';
import { Label, FONT_FAMILY } from '../ui/Label';
import { Mascot } from '../ui/Mascot';
import { addParentGate } from '../ui/ParentGate';
import { STRINGS, t, type StringKey, type Txt } from '../i18n/strings';
import { Button } from '../ui/Button';
import { loadCustomLevels } from '../customLevels';
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

  private page: number | 'custom' = 1;

  init(data: { world?: number | 'custom' }): void {
    this.page = data.world ?? this.page;
  }

  create(): void {
    fitCamera(this);
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, PAL.charcoal).setOrigin(0);
    this.add.rectangle(0, 0, VIEW_W, TOP_BAR_H, PAL.ink).setOrigin(0);
    addParentGate(this, VIEW_W - 16, 14);

    const custom = loadCustomLevels();
    const worlds = [...new Set(LEVELS.map((l) => l.world))];
    const pages: (number | 'custom')[] = [...worlds, ...(custom.length ? (['custom'] as const) : [])];
    if (!pages.includes(this.page)) this.page = pages[0];
    const pageIndex = pages.indexOf(this.page);

    const titleKey = this.page === 'custom' ? 'myLevels' : (`world${this.page}` as StringKey);
    new Label(this, VIEW_W / 2, 4, STRINGS[titleKey] ? t(titleKey) : { nl: `Wereld ${this.page}`, en: `World ${this.page}` }, {
      size: 11,
      color: PAL.yellow,
    });

    // Arrows to the previous and next world.
    const turn = (to: number) => {
      sfx.tap();
      this.scene.restart({ world: pages[to] });
    };
    if (pageIndex > 0) {
      const back = new Button(this, 22, VIEW_H / 2 - 10, { size: 28, height: 36, icon: 'icon-next' }, () => turn(pageIndex - 1));
      back.icon?.setFlipX(true);
    }
    if (pageIndex < pages.length - 1) {
      new Button(this, VIEW_W - 22, VIEW_H / 2 - 10, { size: 28, height: 36, icon: 'icon-next' }, () => turn(pageIndex + 1));
    }
    // Page dots.
    pages.forEach((_, i) => {
      this.add
        .rectangle(VIEW_W / 2 + (i - (pages.length - 1) / 2) * 10, VIEW_H - 12, 5, 5, i === pageIndex ? PAL.yellow : PAL.slate)
        .setOrigin(0.5);
    });

    if (this.page === 'custom') {
      custom.forEach((level, i) => this.tile(i, String(i + 1), level.title, true, false, false, () =>
        this.scene.start('level', { custom: level }),
      ));
    } else {
      const ids = LEVELS.map((l) => l.id);
      const unlockAll = getSettings().unlockAll;
      const currentIndex = LEVELS.findIndex((l, i) => !isCompleted(l.id) && isUnlocked(ids, i, unlockAll));
      LEVELS.forEach((level, i) => {
        if (level.world !== this.page) return;
        const unlocked = isUnlocked(ids, i, unlockAll);
        this.tile(level.index - 1, String(level.index), level.title, unlocked, isCompleted(level.id), i === currentIndex, () =>
          this.scene.start('level', { index: i }),
        );
      });
    }

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

  private tile(
    slot: number,
    label: string,
    title: Txt,
    unlocked: boolean,
    done: boolean,
    current: boolean,
    open: () => void,
  ): void {
    const col = slot % 3;
    const row = Math.floor(slot / 3);
    const cx = 144 + col * (TILE_W + 12);
    const cy = 76 + row * (TILE_H + 14);
    const tile = this.add.container(cx, cy);
    const g = this.add.graphics();
    g.fillStyle(PAL.ink, 1).fillRect(-TILE_W / 2 + 2, -TILE_H / 2 + 3, TILE_W, TILE_H);
    g.fillStyle(unlocked ? PAL.navy : PAL.charcoal, 1).fillRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H);
    g.fillStyle(done ? PAL.green : PAL.slate, 1).fillRect(-TILE_W / 2, -TILE_H / 2, TILE_W, 3);
    tile.add(g);
    tile.add(
      this.add
        .text(0, -TILE_H / 2 + 6, label, {
          fontFamily: FONT_FAMILY,
          fontSize: '18px',
          fontStyle: 'bold',
          color: hex(unlocked ? PAL.white : PAL.slate),
          resolution: textResolution(),
        })
        .setOrigin(0.5, 0),
    );
    if (unlocked) tile.add(new Label(this, 0, -TILE_H / 2 + 28, title, { size: 6, wrap: TILE_W - 8 }));
    if (done) {
      for (let s = 0; s < 3; s++) tile.add(this.add.image((s - 1) * 13, TILE_H / 2 - 9, 'icon-star').setTint(PAL.yellow));
    } else if (!unlocked) {
      tile.add(this.add.image(0, 8, 'icon-lock').setTint(PAL.slate).setScale(1.5));
    }
    tile.setSize(TILE_W, TILE_H).setInteractive({ useHandCursor: true });
    if (current) this.tweens.add({ targets: tile, scale: 1.06, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    tile.on('pointerup', () => {
      if (unlocked) {
        sfx.tap();
        open();
      } else {
        sfx.denied();
        this.tweens.add({ targets: tile, x: cx + 3, duration: 50, yoyo: true, repeat: 2, onComplete: () => tile.setX(cx) });
        sayOnce('sayLocked', t('sayLocked'), 4000);
      }
    });
  }
}
