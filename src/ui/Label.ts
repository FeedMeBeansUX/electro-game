import Phaser from 'phaser';
import type { Txt } from '../i18n/strings';
import { getSettings, onSettingsChange } from '../settings';
import { PAL, hex } from '../art/palette';
import { textResolution } from '../view';

export interface LabelOptions {
  /** Dutch font size in logical pixels. The English line is ~65% of this. */
  size?: number;
  color?: number;
  enColor?: number;
  align?: 'left' | 'center';
  /** Wrap width in logical pixels. */
  wrap?: number;
  /** Always show the English line (ignores the setting). */
  forceEnglish?: boolean;
}

export const FONT_FAMILY = 'Verdana, "Trebuchet MS", "DejaVu Sans", sans-serif';

/**
 * A Dutch label with an optional English line underneath, controlled by the
 * "show English words" setting. Space for the English line is always
 * reserved, so toggling the setting never shifts or overlaps the layout.
 * (x, y) is the top of the Dutch line: its centre or left edge, per `align`.
 */
export class Label extends Phaser.GameObjects.Container {
  private readonly nl: Phaser.GameObjects.Text;
  private readonly en: Phaser.GameObjects.Text;
  private readonly forceEnglish: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, txt: Txt, opts: LabelOptions = {}) {
    super(scene, x, y);
    const size = opts.size ?? 8;
    const enSize = Math.max(5, Math.round(size * 0.65));
    const originX = opts.align === 'left' ? 0 : 0.5;
    const style = (px: number, color: number): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: FONT_FAMILY,
      fontSize: `${px}px`,
      fontStyle: 'bold',
      color: hex(color),
      align: opts.align ?? 'center',
      resolution: textResolution(),
      wordWrap: opts.wrap ? { width: opts.wrap, useAdvancedWrap: true } : undefined,
    });
    this.nl = scene.add.text(0, 0, txt.nl, style(size, opts.color ?? PAL.white)).setOrigin(originX, 0);
    this.en = scene.add
      .text(0, this.nl.height + 1, txt.en, {
        ...style(enSize, opts.enColor ?? PAL.silver),
        fontStyle: 'italic',
      })
      .setOrigin(originX, 0);
    this.add([this.nl, this.en]);
    this.forceEnglish = opts.forceEnglish ?? false;
    this.applySettings();
    const off = onSettingsChange(() => this.applySettings());
    this.once(Phaser.GameObjects.Events.DESTROY, off);
    scene.add.existing(this);
  }

  setTxt(txt: Txt): this {
    this.nl.setText(txt.nl);
    this.en.setText(txt.en).setY(this.nl.height + 1);
    return this;
  }

  private applySettings(): void {
    this.en.setVisible(this.forceEnglish || getSettings().showEnglish);
  }
}
