# Electro Game (Stroomkring)

A pixel-art, top-down breadboard puzzle game that teaches young children (5+) how electronic circuits work. Players complete simple circuits with LEDs, fans, wires, resistors, switches and transistors. Later levels build real, interactive circuits such as a hotel (two-way) switch and a low-pass sound filter.

The game is in **Dutch**. A setting (the **EN** button, top right) shows the English word in a smaller line under each Dutch label.

See [PLAN.md](PLAN.md) for the design and the phased execution plan.

## Running it

Requires Node.js 22 or newer.

```bash
npm install
npm run dev        # local dev server with hot reload
npm test           # simulator, board and level tests
npm run build      # production build in dist/
```

Add `?level=N` to the URL to start at level N.

## How to play (Phase 1 prototype)

- **Draw a wire:** drag from one hole to another. The tray shows how many wires are left.
- **Move a wire end:** drag the end of a wire you placed. Drop it on the tray to take the wire back.
- **Place a part:** drag it from the tray onto the board. Drag it back to the tray to remove it.
- **Turn a part:** tap it.
- **Hear the task again:** the speaker button. The voice is the browser's Dutch text-to-speech for now; recorded voice-over comes in Phase 2.

## Project layout

```
src/sim       circuit simulator (nodal analysis + Newton–Raphson for LEDs)
src/board     grid and board model (placement rules, wire routing)
src/parts     part definitions
src/goals     level goal checks
src/levels    level loading (levels themselves live in /levels/*.json)
src/i18n      Dutch/English string table
src/scenes    Phaser scenes (boot, title, level)
src/ui        two-line Dutch/English label, buttons, English toggle
src/art       palette and procedurally drawn placeholder pixel art
src/audio     placeholder Dutch text-to-speech
tests/        Vitest unit tests
```

## Level format

Each level is a JSON file in `levels/worldN/`. It lists the fixed parts and wires, the player's inventory, the goals, and one known `solution`. The test suite checks that every level is unsolved at the start and solved by its solution, so a broken level fails CI.
