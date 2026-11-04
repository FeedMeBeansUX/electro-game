import type { StringKey } from '../i18n/strings';

export type PartType = 'battery' | 'led' | 'resistor' | 'switch';
export type LedColor = 'red' | 'green' | 'yellow' | 'blue';

export interface PartProps {
  /** Battery voltage in volts. */
  voltage?: number;
  /** Resistance in ohms. */
  resistance?: number;
  /** LED colour (sets its forward voltage and glow colour). */
  color?: LedColor;
  /** Switch state. */
  closed?: boolean;
}

export interface PartDef {
  type: PartType;
  /** Distance in grid cells between pin 0 and pin 1 (even, so the centre is a hole). */
  span: number;
  labelKey: StringKey;
  /** What a tap does to a movable part. */
  tap: 'rotate' | 'toggle';
  defaults: PartProps;
}

/**
 * Pin conventions: battery pin 0 = "+", pin 1 = "−";
 * LED pin 0 = anode (+, long leg), pin 1 = cathode.
 */
export const PART_DEFS: Record<PartType, PartDef> = {
  battery: { type: 'battery', span: 4, labelKey: 'partBattery', tap: 'rotate', defaults: { voltage: 3 } },
  led: { type: 'led', span: 2, labelKey: 'partLed', tap: 'rotate', defaults: { color: 'red' } },
  resistor: { type: 'resistor', span: 2, labelKey: 'partResistor', tap: 'rotate', defaults: { resistance: 100 } },
  switch: { type: 'switch', span: 2, labelKey: 'partSwitch', tap: 'toggle', defaults: { closed: false } },
};

export const isPartType = (s: string): s is PartType => s in PART_DEFS;
