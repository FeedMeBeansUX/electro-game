import Phaser from 'phaser';
import { PAL } from '../art/palette';

export interface ButtonOptions {
  /** Square size (or width) in logical pixels. */
  size?: number;
  height?: number;
  color?: number;
  icon?: string;
  iconScale?: number;
}

/** A chunky pixel button with an icon. Fires `onPress` on release. */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private color: number;
  private readonly bw: number;
  private readonly bh: number;
  readonly icon?: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: ButtonOptions, onPress: () => void) {
    super(scene, x, y);
    this.bw = opts.size ?? 20;
    this.bh = opts.height ?? this.bw;
    this.color = opts.color ?? PAL.slate;
    this.bg = scene.add.graphics();
    this.add(this.bg);
    if (opts.icon) {
      this.icon = scene.add.image(0, 0, opts.icon).setScale(opts.iconScale ?? 1);
      this.add(this.icon);
    }
    this.draw(false);
    this.setSize(this.bw + 6, this.bh + 6);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => this.draw(true));
    this.on('pointerout', () => this.draw(false));
    this.on('pointerup', () => {
      this.draw(false);
      onPress();
    });
    scene.add.existing(this);
  }

  setColor(color: number): this {
    this.color = color;
    this.draw(false);
    return this;
  }

  private draw(pressed: boolean): void {
    const g = this.bg.clear();
    const x = -this.bw / 2;
    const y = -this.bh / 2 + (pressed ? 1 : 0);
    if (!pressed) g.fillStyle(PAL.ink, 1).fillRect(x, y + 2, this.bw, this.bh);
    g.fillStyle(this.color, 1).fillRect(x, y, this.bw, this.bh);
    g.fillStyle(0xffffff, 0.25).fillRect(x, y, this.bw, 1);
    g.fillStyle(0x000000, 0.2).fillRect(x, y + this.bh - 1, this.bw, 1);
    this.icon?.setY(pressed ? 1 : 0);
  }
}
