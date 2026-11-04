/**
 * All on-screen and spoken text. Dutch (nl) is the game language;
 * English (en) is shown in a smaller line underneath when the
 * "show English words" setting is on.
 */
export interface Txt {
  nl: string;
  en: string;
}

export const STRINGS = {
  gameTitle: { nl: 'Stroomkring', en: 'Circuit' },
  tapToStart: { nl: 'Tik om te beginnen', en: 'Tap to start' },
  level: { nl: 'Level', en: 'Level' },
  wellDone: { nl: 'Goed gedaan!', en: 'Well done!' },
  next: { nl: 'Volgende', en: 'Next' },
  restart: { nl: 'Opnieuw', en: 'Restart' },
  allDone: { nl: 'Alles gelukt!', en: 'All done!' },
  englishWords: { nl: 'Engels', en: 'English' },

  // Part names
  partBattery: { nl: 'Batterij', en: 'Battery' },
  partWire: { nl: 'Draad', en: 'Wire' },
  partLed: { nl: 'Lampje', en: 'LED' },
  partResistor: { nl: 'Weerstand', en: 'Resistor' },
  partSwitch: { nl: 'Schakelaar', en: 'Switch' },

  // Spoken feedback
  sayWireHowTo: {
    nl: 'Trek een draadje van gaatje naar gaatje.',
    en: 'Drag a wire from hole to hole.',
  },
  sayNoWiresLeft: {
    nl: 'Je draadjes zijn op. Sleep een draadje terug naar beneden om het opnieuw te gebruiken.',
    en: 'You are out of wires. Drag a wire back down to use it again.',
  },
  sayPopped: {
    nl: 'Oei! Te veel stroom. Het lampje is kapot gegaan. Gelukkig krijg je een nieuwe.',
    en: 'Oops! Too much current. The light broke. Luckily you get a new one.',
  },
  sayShort: {
    nl: 'Kortsluiting! De stroom gaat zo snel rond dat de batterij heet wordt.',
    en: 'Short circuit! The current goes around so fast that the battery gets hot.',
  },
  sayReversed: {
    nl: 'Het lampje zit verkeerd om. Tik erop om het te draaien.',
    en: 'The light is the wrong way around. Tap it to turn it.',
  },
  saySuccess: {
    nl: 'Goed gedaan! De stroom gaat helemaal rond.',
    en: 'Well done! The current goes all the way around.',
  },
  sayAllDone: {
    nl: 'Super! Je hebt alle levels gedaan.',
    en: 'Great! You finished all the levels.',
  },
} satisfies Record<string, Txt>;

export type StringKey = keyof typeof STRINGS;

export const t = (key: StringKey): Txt => STRINGS[key];
