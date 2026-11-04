import Phaser from 'phaser';
import { isSpeaking } from '../audio/speech';

/** Vonkje the spark: bobs, blinks, and moves its mouth while a voice line plays. */
export class Mascot extends Phaser.GameObjects.Image {
  private readonly baseY: number;
  private blinkUntil = 0;
  private hopping = false;

  constructor(scene: Phaser.Scene, x: number, y: number, scale = 2) {
    super(scene, x, y, 'mascot-idle');
    this.baseY = y;
    this.setScale(scale).setOrigin(0.5, 1);
    scene.add.existing(this);
    scene.tweens.add({ targets: this, y: y - 2, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const tick = scene.time.addEvent({ delay: 120, loop: true, callback: () => this.animate() });
    this.once(Phaser.GameObjects.Events.DESTROY, () => tick.remove());
  }

  /** A happy little jump. */
  hop(times = 1): void {
    if (this.hopping) return;
    this.hopping = true;
    this.scene.tweens.add({
      targets: this,
      scaleY: this.scaleY * 1.15,
      y: this.baseY - 10,
      duration: 160,
      yoyo: true,
      repeat: times - 1,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.hopping = false;
        this.setScale(this.scaleX);
      },
    });
  }

  private animate(): void {
    const now = this.scene.time.now;
    if (isSpeaking()) {
      this.setTexture(Math.floor(now / 160) % 2 ? 'mascot-talk' : 'mascot-idle');
      return;
    }
    if (now > this.blinkUntil + 2500 && Math.random() < 0.04) this.blinkUntil = now + 150;
    this.setTexture(now < this.blinkUntil ? 'mascot-blink' : 'mascot-idle');
  }
}
