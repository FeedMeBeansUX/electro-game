/** Sweetie 16 palette (by GrafxKid), used for all placeholder art. */
export const PAL = {
  ink: 0x1a1c2c,
  plum: 0x5d275d,
  red: 0xb13e53,
  orange: 0xef7d57,
  yellow: 0xffcd75,
  lime: 0xa7f070,
  green: 0x38b764,
  teal: 0x257179,
  navy: 0x29366f,
  blue: 0x3b5dc9,
  sky: 0x41a6f6,
  cyan: 0x73eff7,
  white: 0xf4f4f4,
  silver: 0x94b0c2,
  slate: 0x566c86,
  charcoal: 0x333c57,
} as const;

export const WIRE_COLORS: readonly number[] = [PAL.red, PAL.blue, PAL.green, PAL.yellow, PAL.orange];

export const LED_COLORS = {
  red: PAL.red,
  green: PAL.green,
  yellow: PAL.yellow,
  blue: PAL.sky,
} as const;

export const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
