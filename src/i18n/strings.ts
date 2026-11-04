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
  mascotName: { nl: 'Vonkje', en: 'Vonkje (Little Spark)' },
  world1: { nl: 'Wereld 1: Licht aan!', en: 'World 1: Lights on!' },

  // Parent corner
  parentCorner: { nl: 'Ouderhoek', en: 'Parent corner' },
  holdForParents: { nl: 'Ouders: houd vast', en: 'Parents: press and hold' },
  settingEnglish: { nl: 'Engelse woorden tonen', en: 'Show English words' },
  settingVoice: { nl: 'Stem', en: 'Voice' },
  settingSfx: { nl: 'Geluidjes', en: 'Sound effects' },
  settingUnlockAll: { nl: 'Alle levels open', en: 'All levels open' },
  resetProgress: { nl: 'Voortgang wissen', en: 'Reset progress' },
  resetConfirm: { nl: 'Tik nog een keer om te wissen', en: 'Tap again to reset' },
  resetDone: { nl: 'Voortgang gewist', en: 'Progress reset' },
  whatLevelsTeach: { nl: 'Wat leert elk level?', en: 'What each level teaches' },

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
  sayWelcome: {
    nl: 'Hoi! Ik ben Vonkje. Kies een level.',
    en: "Hi! I'm Vonkje. Pick a level.",
  },
  sayLocked: {
    nl: 'Dit level gaat open als je het level ervoor af hebt.',
    en: 'This level opens when you finish the one before it.',
  },
  sayHintPlace: {
    nl: 'Sleep het onderdeel uit de bak naar het bord.',
    en: 'Drag the part from the tray onto the board.',
  },
  sayHintTurn: {
    nl: 'Tik op het onderdeel om het te draaien.',
    en: 'Tap the part to turn it.',
  },
  sayHintHelp: {
    nl: 'Kijk, ik help je een beetje.',
    en: "Look, I'll help you a bit.",
  },
  sayAllDone: {
    nl: 'Super! Je hebt alle levels van deze wereld gedaan.',
    en: 'Great! You finished all the levels in this world.',
  },
} satisfies Record<string, Txt>;

export type StringKey = keyof typeof STRINGS;

export const t = (key: StringKey): Txt => STRINGS[key];
