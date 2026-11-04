import type { StringKey } from '../i18n/strings';

export type PartType = 'battery' | 'led' | 'resistor' | 'switch' | 'button' | 'fan' | 'buzzer' | 'pot';
export type LedColor = 'red' | 'green' | 'yellow' | 'blue';

export interface PartProps {
  /** Battery voltage in volts. */
  voltage?: number;
  /** Resistance in ohms. */
  resistance?: number;
  /** LED colour (sets its forward voltage and glow colour). */
  color?: LedColor;
  /** Switch state, or whether a push button is being held down. */
  closed?: boolean;
  /** Potentiometer knob position, 0 (dimmest) to 1 (brightest). */
  knob?: number;
}

/**
 * What a tap does:
 * - rotate: turn the part a quarter turn (movable parts only)
 * - toggle: flip a switch on/off
 * - press:  a push button is closed only while it is held down
 * - knob:   step a potentiometer's knob
 */
export type TapAction = 'rotate' | 'toggle' | 'press' | 'knob';

export interface PartDef {
  type: PartType;
  /** Distance in grid cells between pin 0 and pin 1 (even, so the centre is a hole). */
  span: number;
  labelKey: StringKey;
  tap: TapAction;
  /** Whether pin 0 and pin 1 are different (swapping them changes what happens). */
  polar: boolean;
  defaults: PartProps;
}

/**
 * Pin conventions: battery pin 0 = "+", pin 1 = "−"; LED and buzzer pin 0 = "+";
 * fan pin 0 = "+" (current from pin 0 to pin 1 blows one way, the other way blows back).
 */
export const PART_DEFS: Record<PartType, PartDef> = {
  battery: { type: 'battery', span: 4, labelKey: 'partBattery', tap: 'rotate', polar: true, defaults: { voltage: 3 } },
  led: { type: 'led', span: 2, labelKey: 'partLed', tap: 'rotate', polar: true, defaults: { color: 'red' } },
  resistor: { type: 'resistor', span: 2, labelKey: 'partResistor', tap: 'rotate', polar: false, defaults: { resistance: 100 } },
  switch: { type: 'switch', span: 2, labelKey: 'partSwitch', tap: 'toggle', polar: false, defaults: { closed: false } },
  button: { type: 'button', span: 2, labelKey: 'partButton', tap: 'press', polar: false, defaults: { closed: false } },
  fan: { type: 'fan', span: 2, labelKey: 'partFan', tap: 'rotate', polar: true, defaults: {} },
  buzzer: { type: 'buzzer', span: 2, labelKey: 'partBuzzer', tap: 'rotate', polar: true, defaults: {} },
  pot: { type: 'pot', span: 2, labelKey: 'partPot', tap: 'knob', polar: false, defaults: { knob: 0 } },
};

export const isPartType = (s: string): s is PartType => s in PART_DEFS;

/** Knob positions a tap steps through. */
export const KNOB_STEPS = [0, 0.25, 0.5, 0.75, 1];

export const nextKnob = (k: number): number => {
  const i = KNOB_STEPS.findIndex((s) => Math.abs(s - k) < 1e-6);
  return KNOB_STEPS[(i + 1) % KNOB_STEPS.length];
};

export const POT_MIN_OHMS = 47;
export const POT_MAX_OHMS = 1000;

/** Potentiometer resistance with a log taper, so each knob step looks like a similar change in brightness. */
export const potOhms = (knob: number): number => POT_MAX_OHMS * Math.pow(POT_MIN_OHMS / POT_MAX_OHMS, knob);
