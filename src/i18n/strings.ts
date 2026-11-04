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
  world2: { nl: 'Wereld 2: Knopjes en schakelaars', en: 'World 2: Buttons and switches' },
  world3: { nl: 'Wereld 3: Meer aan de stroom', en: 'World 3: More things to power' },
  world4: { nl: 'Wereld 4: Het echte breadboard', en: 'World 4: The real breadboard' },
  world5: { nl: 'Wereld 5: De toverschakelaar', en: 'World 5: The magic switch' },
  myLevels: { nl: 'Mijn levels', en: 'My levels' },

  // Level editor (parent corner)
  makeLevel: { nl: 'Level maken', en: 'Make a level' },
  editorBuild: { nl: 'Bouwen', en: 'Build' },
  editorMark: { nl: 'Weghalen', en: 'Take away' },
  editorStepBuild: { nl: '1. Bouw een kring die werkt.', en: '1. Build a circuit that works.' },
  editorStepMark: {
    nl: '2. Tik op de stukjes die het kind zelf moet neerzetten.',
    en: '2. Tap the pieces the child has to put in.',
  },
  editorWorks: { nl: 'Werkt!', en: 'Works!' },
  editorNotWorking: { nl: 'Werkt nog niet', en: 'Not working yet' },
  editorNeedMark: { nl: 'Haal eerst iets weg voor het kind', en: 'First take something away for the child' },
  editorSaved: { nl: 'Bewaard bij Mijn levels', en: 'Saved to My levels' },
  editorExported: { nl: 'Bestand gedownload', en: 'File downloaded' },
  customLevelTitle: { nl: 'Mijn level', en: 'My level' },
  customIntro: { nl: 'Maak de kring af!', en: 'Finish the circuit!' },
  customNote: { nl: 'Zelfgemaakt level.', en: 'A home-made level.' },

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
  partButton: { nl: 'Drukknop', en: 'Push button' },
  partFan: { nl: 'Ventilator', en: 'Fan' },
  partBuzzer: { nl: 'Zoemer', en: 'Buzzer' },
  partPot: { nl: 'Draaiknop', en: 'Potentiometer' },
  partTransistor: { nl: 'Transistor', en: 'Transistor' },
  partLdr: { nl: 'Lichtsensor', en: 'Light sensor' },
  partTouch: { nl: 'Aanraakknop', en: 'Touch pad' },

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
  sayTooBright: {
    nl: 'Het lampje is te fel. Kun je het zachter maken?',
    en: 'The light is too bright. Can you make it softer?',
  },
  sayTooDim: {
    nl: 'Het lampje is nog te zacht. Kun je het feller maken?',
    en: 'The light is still too dim. Can you make it brighter?',
  },
  sayHintSwitch: {
    nl: 'Tik op de schakelaar om hem aan te zetten.',
    en: 'Tap the switch to turn it on.',
  },
  sayHintPress: {
    nl: 'Druk op de knop en houd hem vast.',
    en: 'Press the button and hold it down.',
  },
  sayHintKnob: {
    nl: 'Tik op de draaiknop om eraan te draaien.',
    en: 'Tap the knob to turn it.',
  },
  sayXray: {
    nl: 'Kijk! Onder het bord zitten geheime tunnels. Gaatjes in hetzelfde rijtje zijn met elkaar verbonden.',
    en: 'Look! There are secret tunnels under the board. Holes in the same little row are connected.',
  },
  sayNight: { nl: 'Het is nacht. Welterusten!', en: "It's night. Sleep tight!" },
  sayTransistorTurn: {
    nl: 'De transistor zit verkeerd om. Tik erop om hem te draaien.',
    en: 'The transistor is the wrong way round. Tap it to turn it.',
  },
  sayHintNight: { nl: 'Tik op de zon om het nacht te maken.', en: 'Tap the sun to make it night.' },
  sayDay: { nl: 'Goedemorgen! De zon is op.', en: 'Good morning! The sun is up.' },
  saySameStrip: {
    nl: 'Oei, allebei de pootjes zitten in hetzelfde rijtje. Dan gaat de stroom eromheen.',
    en: 'Oops, both legs are in the same little row. Then the current goes around it.',
  },
  sayAllDone: {
    nl: 'Super! Je hebt alle levels van deze wereld gedaan.',
    en: 'Great! You finished all the levels in this world.',
  },
} satisfies Record<string, Txt>;

export type StringKey = keyof typeof STRINGS;

export const t = (key: StringKey): Txt => STRINGS[key];
