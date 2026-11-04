import Phaser from 'phaser';
import { Button } from './Button';
import { PAL, hex } from '../art/palette';
import { getSettings, onSettingsChange, updateSettings } from '../settings';
import { FONT_FAMILY } from './Label';
import { textResolution } from '../view';

/**
 * "EN" button that turns the English sub-labels on and off.
 * Temporary home for the setting until the parent corner exists (Phase 2).
 */
export function addEnglishToggle(scene: Phaser.Scene, x: number, y: number): Button {
  const btn = new Button(scene, x, y, { size: 20 }, () => {
    updateSettings({ showEnglish: !getSettings().showEnglish });
  });
  const text = scene.add
    .text(0, 0, 'EN', {
      fontFamily: FONT_FAMILY,
      fontSize: '8px',
      fontStyle: 'bold',
      color: hex(PAL.white),
      resolution: textResolution(),
    })
    .setOrigin(0.5);
  btn.add(text);
  const apply = () => {
    const on = getSettings().showEnglish;
    btn.setColor(on ? PAL.green : PAL.slate);
    text.setAlpha(on ? 1 : 0.6);
  };
  apply();
  const off = onSettingsChange(apply);
  btn.once(Phaser.GameObjects.Events.DESTROY, off);
  return btn;
}
