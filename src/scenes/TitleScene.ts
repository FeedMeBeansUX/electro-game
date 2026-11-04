import Phaser from 'phaser';
import { VIEW_H, VIEW_W, fitCamera } from '../view';
import { PAL, LED_COLORS } from '../art/palette';
import { Label } from '../ui/Label';
import { Button } from '../ui/Button';
import { addEnglishToggle } from '../ui/EnglishToggle';
import { t } from '../i18n/strings';
import { say } from '../audio/speech';
import { LEVELS } from '../levels/levels';

/** Start index from `?level=N` (1-based), for testing. */
function startIndex(): number {
  const n = Number(new URLSearchParams(window.location.search).get('level'));
  return Number.isInteger(n) && n >= 1 && n <= LEVELS.length ? n - 1 : 0;
}

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('title');
  }

  create(): void {
    fitCamera(this);
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, PAL.charcoal).setOrigin(0);

    // A little circuit: + → red wire → LED → black wire → −, with the LED glowing.
    const g = this.add.graphics();
    g.fillStyle(PAL.red, 1).fillRect(115, 100, 3, 40).fillRect(115, 100, 175, 3).fillRect(287, 100, 3, 40);
    g.fillStyle(PAL.ink, 1).fillRect(351, 140, 3, 40).fillRect(243, 178, 111, 3).fillRect(243, 140, 3, 40);
    this.add.image(180, 140, 'part-battery').setScale(2);
    this.add.image(320, 140, 'part-led-red-on').setScale(2);
    const glow = this.add.image(320, 140, 'glow').setScale(2).setTint(LED_COLORS.red).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, alpha: { from: 0.5, to: 1 }, duration: 900, yoyo: true, repeat: -1 });

    new Label(this, VIEW_W / 2, 36, t('gameTitle'), { size: 28, color: PAL.yellow });

    const start = () => {
      say(t('gameTitle'));
      this.scene.start('level', { index: startIndex() });
    };
    new Button(this, VIEW_W / 2, 205, { size: 40, height: 28, color: PAL.green, icon: 'icon-play', iconScale: 1.5 }, start);
    new Label(this, VIEW_W / 2, 226, t('tapToStart'), { size: 9 });
    addEnglishToggle(this, VIEW_W - 16, 14);
  }
}
