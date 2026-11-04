# Electro Game (Stroomkring)

A pixel-art, top-down breadboard puzzle game that teaches young children (5+) how electronic circuits work. Players complete simple circuits with LEDs, fans, wires, resistors, switches and transistors. Later levels build real, interactive circuits such as a hotel (two-way) switch and a low-pass sound filter.

The game is in **Dutch**. A setting in the parent corner shows the English word in a smaller line under each Dutch label.

Play it at **https://feedmebeansux.github.io/electro-game/**. On a tablet, use the browser's "Add to Home Screen" to install it; after the first visit it also works offline.

See [PLAN.md](PLAN.md) for the design and the phased execution plan.

## Running it

Requires Node.js 22 or newer.

```bash
npm install
npm run dev        # local dev server with hot reload
npm test           # simulator, board and level tests
npm run build      # production build in dist/
npm run voice-lines  # regenerate docs/voice-lines.md after changing strings or levels
```

Add `?level=N` to the URL to jump straight into level N.

## How to play

- **Draw a wire:** drag from one hole to another. The tray shows how many wires are left.
- **Move a wire end:** drag the end of a wire you placed. Drop it on the tray to take the wire back.
- **Place a part:** drag it from the tray onto the board. Drag it back to the tray to remove it.
- **Turn a part:** tap it. Parts also turn themselves when dropped, if that connects them to the wires.
- **Breadboard levels (World 4 and 5):** the eye button shows the hidden strips under the board ("X-ray"). Hold a finger on a light sensor to cover it, or use the sun/moon button to make it night. Hold a touch pad to touch it.
- **Switches, buttons and knobs:** tap a switch to flip it, hold a push button down, tap the knob to turn it a step. This still works after a level is done, so he can keep playing with it.
- **Hear the task again:** the speaker button.
- **Stuck?** Vonkje, the spark, helps after a while: first pointing, then showing how, and finally doing one step.

## Parent corner

Press and **hold the gear** (top right) for 1.5 seconds. There you can:

- turn the English words on or off
- turn the voice and the sound effects on or off
- open all levels, or reset progress
- read what each level teaches
- make your own levels (see below)

## Making levels

In the parent corner, choose **Level maken** (make a level):

1. **Bouwen** (build): drag parts from the bottom onto the board and draw wires until the circuit works. The status says **Werkt!** (works) when it does, counting switches as on and knobs as turned up.
2. **Weghalen** (take away): tap the pieces your child should put in. They turn see-through.
3. Pick the goal at the top (LED, fan or buzzer), then use the buttons at the top right: ▶ try it, ✓ save it to **Mijn levels** (a page on the map, on this device only), or ⬇ download it as a level file.

To add a downloaded level to the game for good, put the file in `levels/worldN/`, set its `world` and `index`, give it a proper title, intro and parent note, and run `npm test` (the tests check the level is solvable) and `npm run voice-lines`.

## Recording the voice

The game speaks Dutch with the browser's text-to-speech until you add recordings. [docs/voice-lines.md](docs/voice-lines.md) lists every line with its file name. Save each recording as `public/voice/nl/<name>.mp3`, then commit and push.

## Project layout

```
src/sim       circuit simulator (nodal analysis + Newton–Raphson for LEDs)
src/board     grid and board model (placement rules, wire routing)
src/parts     part definitions
src/goals     level goal checks
src/hints     next-step hints, worked out from each level's solution
src/levels    level loading (levels themselves live in /levels/*.json)
src/i18n      Dutch/English string table
src/scenes    Phaser scenes (boot, title, map, level, level editor, parent corner)
src/editor    turning an editor board into a level
src/ui        two-line Dutch/English label, buttons, mascot, hint overlay, parent gate
src/art       palette and procedurally drawn pixel art
src/audio     voice (recordings with text-to-speech fallback) and synthesized sound effects
public/       app icons, web manifest, offline service worker, voice recordings
scripts/      icon and voice-line generators
tests/        Vitest unit tests
```

## Level format

Each level is a JSON file in `levels/worldN/`. It lists the fixed parts and wires, any movable pre-placed parts, the player's inventory, the goals, a note for the parent, and one known `solution`.

Goal types: `ledOn` (optionally `minBrightness`, `maxBrightness`, `count`), `fanSpinning`, `buzzerOn`, `truthTable` (an output that must follow switches or buttons as AND, OR or a custom table; with `live` the child also has to try it), and `lightResponse` (an output that must be on only in the dark, or only in the light).

Breadboard levels set `"board": "breadboard"` and `"supply": 3` (the rails' battery) on a 24×11 board: row 0 is the + rail, rows 2–4 and 6–8 are 3-hole strips, row 10 is the − rail. `"xray": true` shows the strips from the start, `"dayNight": true` adds the day/night button, and a solution can end with `"light": 0` (night). The test suite checks that every level is unsolved at the start and solved by its solution, so a broken level fails CI. The hint system uses the same solution to show the next step.
