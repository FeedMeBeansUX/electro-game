import Phaser from 'phaser';
import { VIEW_H, VIEW_W, fitCamera } from '../view';
import { PAL } from '../art/palette';
import { Label } from '../ui/Label';
import { Button } from '../ui/Button';
import { t, type StringKey, type Txt } from '../i18n/strings';
import { getSettings, updateSettings, type Settings } from '../settings';
import { resetProgress } from '../progress';
import { LEVELS } from '../levels/levels';
import { sfx } from '../audio/sfx';

type BoolSetting = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

const PANEL = { x: 40, y: 20, w: 400, h: 232 };

/** Settings and level notes for the parent. Opened from the gear (press and hold). */
export class ParentScene extends Phaser.Scene {
  private from = '';
  private content!: Phaser.GameObjects.Container;

  constructor() {
    super('parent');
  }

  init(data: { from?: string }): void {
    this.from = data.from ?? 'map';
  }

  create(): void {
    fitCamera(this);
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, PAL.ink, 0.8).setOrigin(0).setInteractive();
    const g = this.add.graphics();
    g.fillStyle(PAL.ink, 1).fillRect(PANEL.x + 2, PANEL.y + 3, PANEL.w, PANEL.h);
    g.fillStyle(PAL.navy, 1).fillRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
    g.fillStyle(0xffffff, 0.15).fillRect(PANEL.x, PANEL.y, PANEL.w, 1);
    new Label(this, VIEW_W / 2, PANEL.y + 8, t('parentCorner'), { size: 12, color: PAL.yellow });
    new Button(this, PANEL.x + PANEL.w - 18, PANEL.y + 18, { size: 20, color: PAL.green, icon: 'icon-check' }, () =>
      this.close(),
    );
    this.content = this.add.container(0, 0);
    this.showSettings();
  }

  private close(): void {
    sfx.tap();
    this.scene.resume(this.from);
    this.scene.stop();
  }

  private clearContent(): void {
    this.content.removeAll(true);
  }

  private showSettings(): void {
    this.clearContent();
    let y = PANEL.y + 44;
    const rows: [StringKey, BoolSetting][] = [
      ['settingEnglish', 'showEnglish'],
      ['settingVoice', 'speech'],
      ['settingSfx', 'sfx'],
      ['settingUnlockAll', 'unlockAll'],
    ];
    for (const [label, key] of rows) {
      this.toggleRow(y, t(label), key);
      y += 27;
    }
    this.resetRow(y);
    y += 27;
    const notes = this.add.container(0, 0);
    const zone = this.add
      .rectangle(PANEL.x + 16, y - 3, PANEL.w - 32, 24, PAL.slate)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    notes.add([zone, new Label(this, PANEL.x + 26, y, t('whatLevelsTeach'), { size: 8, align: 'left' })]);
    zone.on('pointerup', () => {
      sfx.tap();
      this.showLevelNotes();
    });
    this.content.add(notes);
  }

  private toggleRow(y: number, label: Txt, key: BoolSetting): void {
    const zone = this.add.rectangle(PANEL.x + 16, y - 3, PANEL.w - 32, 24, 0xffffff, 0.04).setOrigin(0);
    zone.setInteractive({ useHandCursor: true });
    const text = new Label(this, PANEL.x + 26, y, label, { size: 8, align: 'left' });
    const sw = this.add.graphics();
    const draw = () => {
      const on = getSettings()[key];
      const x = PANEL.x + PANEL.w - 58;
      sw.clear();
      sw.fillStyle(on ? PAL.green : PAL.charcoal, 1).fillRect(x, y + 1, 28, 14);
      sw.fillStyle(PAL.white, 1).fillRect(on ? x + 16 : x + 2, y + 3, 10, 10);
    };
    draw();
    zone.on('pointerup', () => {
      sfx.tap();
      updateSettings({ [key]: !getSettings()[key] } as Partial<Settings>);
      draw();
    });
    this.content.add([zone, text, sw]);
  }

  private resetRow(y: number): void {
    const zone = this.add.rectangle(PANEL.x + 16, y - 3, PANEL.w - 32, 24, 0xffffff, 0.04).setOrigin(0);
    zone.setInteractive({ useHandCursor: true });
    const text = new Label(this, PANEL.x + 26, y, t('resetProgress'), { size: 8, align: 'left', color: PAL.orange });
    let armedUntil = 0;
    zone.on('pointerup', () => {
      sfx.tap();
      if (this.time.now < armedUntil) {
        resetProgress();
        text.setTxt(t('resetDone'));
        armedUntil = 0;
      } else {
        text.setTxt(t('resetConfirm'));
        armedUntil = this.time.now + 3000;
        this.time.delayedCall(3000, () => {
          if (armedUntil !== 0 && this.time.now >= armedUntil) text.setTxt(t('resetProgress'));
        });
      }
    });
    this.content.add([zone, text]);
  }

  private showLevelNotes(): void {
    this.clearContent();
    const back = new Button(this, PANEL.x + 18, PANEL.y + 18, { size: 20, icon: 'icon-next' }, () => {
      sfx.tap();
      this.showSettings();
    });
    back.icon?.setFlipX(true);
    this.content.add(back);
    let y = PANEL.y + 36;
    LEVELS.forEach((level, i) => {
      const txt: Txt = {
        nl: `${i + 1}. ${level.title.nl}: ${level.parentNote.nl}`,
        en: `${i + 1}. ${level.title.en}: ${level.parentNote.en}`,
      };
      const label = new Label(this, PANEL.x + 20, y, txt, { size: 7, align: 'left', wrap: PANEL.w - 40 });
      this.content.add(label);
      y += label.getBounds().height + 4;
    });
  }
}
