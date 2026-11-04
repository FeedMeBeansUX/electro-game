import Phaser from 'phaser';
import { PAL } from '../art/palette';
import { Label } from './Label';
import { t } from '../i18n/strings';

const HOLD_MS = 1500;

/**
 * Gear button that opens the parent corner only after being held for 1.5 s,
 * so a child tapping around won't open it by accident.
 */
export function addParentGate(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, 20, 20, PAL.slate).setStrokeStyle(1, PAL.charcoal);
  const icon = scene.add.image(0, 0, 'icon-gear').setAlpha(0.8);
  const ring = scene.add.graphics();
  c.add([bg, icon, ring]);
  c.setSize(26, 26).setInteractive({ useHandCursor: true }).setDepth(60);

  let timer: Phaser.Time.TimerEvent | null = null;
  let tween: Phaser.Tweens.Tween | null = null;
  const progress = { v: 0 };
  const drawRing = () => {
    ring.clear();
    if (progress.v <= 0) return;
    ring.lineStyle(2, PAL.yellow, 1);
    ring.beginPath();
    ring.arc(0, 0, 13, -Math.PI / 2, -Math.PI / 2 + progress.v * Math.PI * 2);
    ring.strokePath();
  };
  const cancel = (showHint: boolean) => {
    if (!timer) return;
    timer.remove();
    timer = null;
    tween?.stop();
    progress.v = 0;
    drawRing();
    if (showHint) {
      const hint = new Label(scene, x - 40, y + 14, t('holdForParents'), { size: 7 }).setDepth(61);
      scene.tweens.add({ targets: hint, alpha: 0, delay: 1500, duration: 400, onComplete: () => hint.destroy() });
    }
  };
  c.on('pointerdown', () => {
    progress.v = 0;
    tween = scene.tweens.add({ targets: progress, v: 1, duration: HOLD_MS, onUpdate: drawRing });
    timer = scene.time.delayedCall(HOLD_MS, () => {
      timer = null;
      tween?.stop();
      progress.v = 0;
      drawRing();
      scene.scene.launch('parent', { from: scene.scene.key });
      scene.scene.pause();
    });
  });
  c.on('pointerup', () => cancel(true));
  c.on('pointerout', () => cancel(false));
  return c;
}
