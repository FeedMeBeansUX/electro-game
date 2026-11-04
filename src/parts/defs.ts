import type { StringKey } from '../i18n/strings';

export type PartType =
  | 'battery'
  | 'led'
  | 'resistor'
  | 'switch'
  | 'button'
  | 'fan'
  | 'buzzer'
  | 'pot'
  | 'transistor'
  | 'ldr'
  | 'touch';
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
  /** A finger is covering this light sensor. */
  covered?: boolean;
}

/**
 * What a tap does:
 * - rotate: turn the part a quarter turn (movable parts only)
 * - toggle: flip a switch on/off
 * - press:  held down: a push button closes, a touch pad is touched, a light sensor is covered
 * - knob:   step a potentiometer's knob
 */
export type TapAction = 'rotate' | 'toggle' | 'press' | 'knob';

export interface PartDef {
  type: PartType;
  /** Distance in grid cells between the first and last pin (even, so the centre is a hole). */
  span: number;
  /** Number of legs: 2 (default) or 3 (transistor: emitter, base, collector). */
  pins?: 2 | 3;
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
  /** NPN transistor. Pins: 0 = emitter, 1 = base (middle), 2 = collector. */
  transistor: {
    type: 'transistor',
    span: 2,
    pins: 3,
    labelKey: 'partTransistor',
    tap: 'rotate',
    polar: true,
    defaults: {},
  },
  ldr: { type: 'ldr', span: 2, labelKey: 'partLdr', tap: 'press', polar: false, defaults: { covered: false } },
  touch: { type: 'touch', span: 2, labelKey: 'partTouch', tap: 'press', polar: false, defaults: { closed: false } },
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

/** Light sensor (LDR) resistance: about 100 Ω in daylight, 200 kΩ in the dark. */
export const LDR_BRIGHT_OHMS = 100;
export const LDR_DARK_OHMS = 200_000;
export const ldrOhms = (light: number): number =>
  LDR_DARK_OHMS * Math.pow(LDR_BRIGHT_OHMS / LDR_DARK_OHMS, Math.min(1, Math.max(0, light)));

/** A finger across a touch pad conducts a little, roughly like this resistance. */
export const SKIN_OHMS = 1_000_000;
