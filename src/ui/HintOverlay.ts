import Phaser from 'phaser';
import { PAL } from '../art/palette';

type Point = { x: number; y: number };

export interface Carry {
  texture: string;
  angle: number;
  scale: number;
}

/** Hint visuals: a bobbing pointer, and a ghost hand that demonstrates a drag or a tap. */
export class HintOverlay {
  private objects: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth = 45,
  ) {}

  clear(): void {
    for (const o of this.objects) {
      this.scene.tweens.killTweensOf(o);
      o.destroy();
    }
    this.objects = [];
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objects.push(o);
    return o;
  }

  /** Pulsing rings and a bobbing hand above a spot. */
  point(at: Point, ...more: Point[]): void {
    for (const p of [at, ...more]) {
      const ring = this.track(this.scene.add.circle(p.x, p.y, 6).setStrokeStyle(2, PAL.yellow).setDepth(this.depth));
      this.scene.tweens.add({ targets: ring, scale: 2.2, alpha: 0, duration: 900, repeat: -1 });
    }
    const hand = this.track(this.scene.add.image(at.x + 2, at.y + 6, 'hand').setOrigin(0.35, 0).setDepth(this.depth + 1));
    this.scene.tweens.add({ targets: hand, y: at.y + 2, duration: 350, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** A ghost hand drags from `from` to `to`, optionally carrying a part or drawing a wire. */
  drag(from: Point, to: Point, carry: Carry | { wireColor: number }): void {
    const hand = this.track(this.scene.add.image(from.x, from.y, 'hand').setOrigin(0.35, 0).setDepth(this.depth + 1).setAlpha(0));
    const line = this.track(this.scene.add.graphics().setDepth(this.depth));
    const item =
      'texture' in carry
        ? this.track(
            this.scene.add
              .image(from.x, from.y, carry.texture)
              .setAngle(carry.angle)
              .setScale(carry.scale)
              .setAlpha(0)
              .setDepth(this.depth),
          )
        : null;
    const state = { t: 0 };
    const draw = () => {
      const x = from.x + (to.x - from.x) * state.t;
      const y = from.y + (to.y - from.y) * state.t;
      hand.setPosition(x, y);
      item?.setPosition(x, y);
      line.clear();
      if ('wireColor' in carry && state.t > 0) {
        line.lineStyle(3, carry.wireColor, 0.6).lineBetween(from.x, from.y, x, y);
        line.fillStyle(carry.wireColor, 0.8).fillRect(from.x - 3, from.y - 3, 6, 6);
      }
    };
    this.scene.tweens.chain({
      targets: state,
      loop: -1,
      tweens: [
        {
          targets: [hand, ...(item ? [item] : [])],
          alpha: { from: 0, to: 0.9 },
          duration: 250,
          onStart: () => {
            state.t = 0;
            draw();
          },
        },
        { targets: state, t: 1, duration: 1300, ease: 'Sine.easeInOut', onUpdate: draw },
        { targets: [hand, ...(item ? [item] : [])], alpha: 0, duration: 300, delay: 300 },
        { targets: state, t: 0, duration: 600, onComplete: () => line.clear() },
      ],
    });
  }

  /** A ghost hand taps on a spot. */
  tap(at: Point): void {
    const hand = this.track(this.scene.add.image(at.x + 2, at.y + 2, 'hand').setOrigin(0.35, 0).setDepth(this.depth + 1));
    const ring = this.track(this.scene.add.circle(at.x, at.y, 5).setStrokeStyle(2, PAL.yellow).setDepth(this.depth).setAlpha(0));
    this.scene.tweens.chain({
      targets: hand,
      loop: -1,
      tweens: [
        { targets: hand, y: at.y + 8, duration: 300, ease: 'Sine.easeOut' },
        { targets: hand, y: at.y + 1, duration: 120, ease: 'Sine.easeIn' },
        {
          targets: ring,
          alpha: { from: 1, to: 0 },
          scale: { from: 1, to: 2.5 },
          duration: 400,
        },
        { targets: hand, y: at.y + 8, duration: 250, delay: 300 },
      ],
    });
  }
}
