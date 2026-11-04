# Electro Game: Phased Execution Plan

A pixel-art, top-down breadboard puzzle game that teaches a 5-year-old how circuits work. Each level gives a small task ("make the light turn on", "make the fan spin"). The player drags real components (wires, LEDs, resistors, switches, fans, transistors, and later capacitors and sensors) onto a breadboard until the task is done. Early levels are one-step puzzles. Later levels are working, interactive circuits such as a hotel (two-way) light switch, a night light and a low-pass sound filter.

---

## 1. Guiding principles

These apply to every phase. When a decision is unclear, check it against this list.

1. **No reading required.** All instructions come from voice, icons and animation. Any text is for the parent.
2. **Nothing punishes.** A wrong circuit does something funny and harmless (the LED sulks, the fan wobbles), then resets. There are no lives, no timers and no "game over".
3. **Honest physics, hidden numbers.** The simulator is real: an LED without a resistor really does get too much current, and a reversed LED really stays dark. Values such as ohms and volts stay hidden until late levels, and even then they are optional.
4. **Show the invisible.** Moving "current dots" show electricity flowing around a closed loop. This is the single most important thing to teach.
5. **One new idea per level.** Each level adds exactly one concept or component.
6. **Large touch targets, forgiving input.** Parts snap to the grid, wires auto-route, and the game assumes a tablet and small fingers.
7. **Bridge to the real world.** Every circuit in the game can be built with a cheap real-world kit. The later phases add printable "build it for real" cards.
8. **Dutch first, English optional.** The game is in Dutch: voice-over, labels, menus and the parent notes. A game setting, **"Engelse woorden tonen" (Show English words)**, shows the English term in a smaller, dimmer line *below* each Dutch label (for example **Weerstand** with *Resistor* underneath). It is off by default. Real electronics parts, datasheets and kits use English names, so this setting is also part of the bridge to the real world.

---

## 2. Technology recommendation

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript** | Type safety for the simulator and data formats |
| Engine | **Phaser 3** (via Vite) | Mature 2D engine with scenes, pointer and touch input, pixel-perfect scaling and audio |
| Audio | **Web Audio API** | Needed to *actually filter sound* in the low-pass filter level, and for buzzers and tones |
| Platform | Browser, installable as a **PWA** | Runs on any tablet or laptop, works offline, and deploys free to GitHub Pages |
| Art | **Aseprite**, a fixed palette (e.g. Resurrect 64 or a custom 32-color palette) | Standard pixel-art workflow with sprite-sheet export |
| Tests | **Vitest** | Unit tests for the circuit simulator, which is the risky core |

Alternative: Godot 4 is also a strong fit. Choose it if you prefer an editor-driven workflow. The plan below is engine-agnostic apart from the audio notes.

**Rendering spec:** a logical resolution of 480×270, scaled by whole numbers (×4 = 1920×1080), with nearest-neighbor filtering. The real breadboard's hole pitch is 8 px, and components snap to that grid. The early "magic board" uses a coarser 16 px grid so the targets are big enough for small fingers.

---

## 3. Core architecture

```
┌──────────────┐   placements    ┌────────────────┐   netlist    ┌───────────────┐
│  Board / UI  │ ──────────────▶ │ Netlist builder│ ───────────▶ │  Simulator    │
│ (Phaser)     │                 │ (grid → nodes) │              │ (MNA solver)  │
└──────▲───────┘                 └────────────────┘              └──────┬────────┘
       │   visual state (brightness, rpm, current dots, warnings)       │
       └────────────────────────────────────────────────────────────────┘
                                          │
                                  ┌───────▼────────┐
                                  │  Goal checker  │──▶ level complete / hints
                                  └────────────────┘
```

### 3.1 Circuit simulator (the heart of the game)
- **Method:** Modified Nodal Analysis (MNA), the same approach SPICE uses, solved with a small dense matrix. This is fine for fewer than 50 nodes.
- **Linear parts:** wires, resistors, batteries, switches (open means very high resistance, closed means very low).
- **Nonlinear parts:** LEDs and diodes (Shockley model or piecewise-linear) and transistors (a simplified Ebers–Moll model, or a switch-like piecewise model) are solved by Newton–Raphson iteration with damping.
- **Time-dependent parts** (Phase 5): capacitors via backward-Euler companion models for transient simulation, which gives blinking and charging.
- **Frequency analysis** (Phase 5): small-signal AC analysis at chosen frequencies gives a filter's frequency response, which then drives a Web Audio filter.
- **Outputs:** the voltage at every node and the current through every part. These map to visuals: LED brightness, fan RPM, buzzer pitch, current-dot speed, and "overload" states.
- **Safety and teaching states:**
  - *Short circuit*: the battery gets hot and wiggles, and the wire glows red. The game explains it and resets.
  - *LED over-current*: the LED flashes and "pops" with a cartoon puff, then gets a new LED for free.
  - *Reversed LED*: the LED stays dark and shows a small "wrong way" arrow hint.

### 3.2 Board model
- **Early levels ("magic board"):** each hole is its own connection point, and the player simply drags wires between parts.
- **Later levels ("real breadboard"):** real breadboard connectivity, with 5-hole vertical strips, a center gap and power rails. This is a concept the game teaches explicitly in World 4.
- Parts have **pins**. A pin in a hole joins that hole's net. The netlist builder unions connected holes into nodes.

### 3.3 Level data format (JSON)
```json
{
  "id": "w1-l3",
  "world": 1,
  "board": "magic",
  "voiceIntro": "vo/w1-l3-intro.ogg",
  "fixed": [
    { "type": "battery", "pos": [2, 4], "rot": 0, "voltage": 3 },
    { "type": "led", "pos": [10, 4], "rot": 0, "color": "red" }
  ],
  "inventory": [ { "type": "wire", "count": 2 } ],
  "goals": [ { "kind": "ledOn", "target": 1, "minBrightness": 0.5 } ],
  "hints": [ { "afterSeconds": 20, "ghostDrag": { "from": "inventory:wire", "to": [6, 2] } } ]
}
```
Goal types grow over time: `ledOn`, `fanSpinning`, `ledOffWhen`, `truthTable` (for switch logic), `blinks`, `soundMuffled`, and so on.

### 3.4 Kid-facing UX
- **Mascot:** an original character (for example, a small spark creature) who gives the voice prompts and rides along with the current dots.
- **Voice-over** in Dutch for every level intro, hint and celebration. *Tip:* record it yourself. Hearing a parent's voice is very motivating. Until the recordings exist, the browser's built-in Dutch text-to-speech (`nl-NL`) reads the lines aloud as a placeholder.
- **Hints escalate with inactivity:** first the mascot points, then a ghost hand demonstrates the drag, then the part is auto-placed.
- **Celebration:** the circuit "comes alive". The fan blows confetti and the LED lights up a little pixel room.
- **Parent corner:** reached with a long-press. It holds the level select, the volume, a short note on what each level teaches, and settings, including the English-labels toggle.

### 3.5 Language & labels
- Every on-screen string lives in one string table with a Dutch (`nl`) and an English (`en`) entry. Code never contains literal UI text.
- A shared **label** component draws the Dutch text, and, when the setting is on, the English text in a smaller, dimmer line underneath. Layouts always reserve room for that second line, so turning it on never makes text overlap.
- Level files use string keys (or `{ "nl": …, "en": … }` pairs) for titles and voice lines, never bare text.
- The setting is saved in `localStorage` and changes take effect immediately, without restarting the level.
- Dutch part names used in the game: Batterij (Battery), Draad (Wire), Lampje/LED (LED), Weerstand (Resistor), Schakelaar (Switch), Drukknop (Push button), Ventilator (Fan), Zoemer (Buzzer), Draaiknop (Potentiometer), Transistor (Transistor), Lichtsensor (Light sensor), Condensator (Capacitor), Luidspreker (Speaker).

---

## 4. Level curriculum

Each world is roughly 5–8 levels. ★ marks a "real, usable circuit" milestone.

### World 1: Light it up (closed loops)
1. One wire is missing between the battery and the LED. Drag it in.
2. Two wires are missing.
3. Place the LED yourself.
4. **LED polarity:** the LED is in backwards, so flip it.
5. **Too much power:** the LED pops without help, so add a resistor ("the speed bump for electricity").
6. Free build: battery + resistor + LED from inventory only.

### World 2: Switches (control)
1. Push button + LED: "light only while pressing" (a doorbell light).
2. Toggle switch + fan.
3. **Two switches in series (AND):** both must be on. The story is a "safety lock".
4. **Two switches in parallel (OR):** either one works. The story is "two doorbells".
5. ★ **Doorbell:** a button and a buzzer.

### World 3: More things to power
1. A fan (motor), and fan direction when the battery is flipped.
2. Two LEDs in series vs. in parallel: compare brightness.
3. Resistor size changes brightness: "a bigger speed bump makes it dimmer".
4. **Potentiometer** as a dimmer knob and fan speed control.
5. ★ **Bedroom lamp:** switch + dimmer + LED.

### World 4: The real breadboard
1. "Secret tunnels": an X-ray view shows the strips connected under the board.
2. Rebuild the World 1 circuit on a real breadboard layout.
3. Power rails (+ and − lines).
4. Find the bug: a part that "looks connected" but sits on the wrong strip.
5. Rebuild the bedroom lamp on the real breadboard.

### World 5: The magic switch (transistors and sensors)
1. **Transistor as an electronic switch:** a tiny button controls a big fan.
2. A transistor's tiny base current: the "the little lever moves the big door" story.
3. **Light sensor (LDR):** cover it with your finger and the LED turns on.
4. ★ **Night light:** LDR + transistor + LED that turns on when the in-game room goes dark (a day/night toggle).
5. ★ **Touch switch:** touch two pads to turn on a light (a Darlington pair, simulated as skin resistance).

### World 6: Projects (interactive, real-world circuits)
1. ★ **Hotel (two-way) switch:** two SPDT switches and two "traveler" wires. The level shows a pixel hotel corridor where the mascot walks in, turns the light on at one end, walks out and turns it off at the other end. The goal is a `truthTable` covering all four switch combinations.
2. ★ **Blinking light:** a capacitor introduction ("electricity bucket"), then a two-transistor astable multivibrator. Blinking speed depends on the capacitor or resistor.
3. ★ **Low-pass sound filter:** music plays through an in-game speaker. Add a resistor + capacitor and the hissy, squeaky sounds go away (the "underwater sound"). A potentiometer sweeps the cutoff. **Real audio:** compute the response with AC analysis and apply it with a Web Audio `IIRFilterNode`/`BiquadFilterNode`, so the child *hears* the circuit working.
4. ★ **Alarm:** a tilt or pressure switch triggers a buzzer and a blinking LED.
5. ★ **Traffic light:** three LEDs and switches, sequenced by the player (or later by a capacitor timer).

### Sandbox mode (unlocked progressively)
An open breadboard with every unlocked part. It includes a "show numbers" toggle for an older child or a parent.

---

## 5. Phased execution plan

Effort estimates assume **one part-time developer** (evenings and weekends). Every phase from Phase 1 onward ends with a **playtest with your son**, and that test is the gate to the next phase.

### Phase 0: Setup & style (≈1 week)
**Goal:** get the project skeleton and the look settled so Phase 1 can start building right away.
- [ ] Art style guide: palette, 8 px grid, a component sprite mock-up (battery, LED, wire, resistor, switch, fan), and a mascot sketch.
- [x] Choose the engine, set up the repo (Vite + TS + Phaser + Vitest) and the CI that deploys to GitHub Pages. (ESLint/Prettier still to add.)
- [ ] Write the list of voice-over lines for World 1.

**Exit criteria:** a running empty Phaser project deployed to a URL and a mock-up screenshot of the board. (This phase has no playtest. The first one is at the end of Phase 1.)

### Phase 1: Core tech prototype (≈3–4 weeks)
**Goal:** prove that "drag parts, close the loop, light turns on" works and is fun, using placeholder art.
- [x] Grid board with snapping, pinch/zoom off, and touch + mouse input.
- [x] Drag parts from an inventory tray, rotate them by tapping, and remove them by dragging back to the tray.
- [x] Wire tool: drag from hole to hole, with an auto-routed orthogonal pixel wire. Wire ends can be dragged to re-route, or onto the tray to remove the wire.
- [x] Netlist builder (magic board only).
- [x] **Simulator v1:** linear MNA (battery, wire, resistor, switch) plus an LED (diode model, Newton–Raphson).
- [x] Simulator unit tests: voltage divider, series and parallel resistors, LED + resistor current, reversed LED, short circuit detection.
- [x] Visual feedback: LED brightness, current-dot animation along wires, short-circuit and over-current states.
- [x] Goal checker + "level complete" screen.
- [x] Level loader from JSON, with three hard-coded World 1 levels. Each level carries a known solution that the tests check.
- [x] Dutch string table with English entries, the two-line label component, and the "show English words" setting (a temporary toggle button until the parent corner exists in Phase 2).
- [x] Placeholder Dutch voice for level intros using the browser's text-to-speech.

**Exit criteria:** your son can complete three levels on a tablet with only verbal help from you. The simulator test suite is green.

**Status:** built, and the test suite is green. Still to do: the playtest. Things to watch for: whether the parts and holes are big enough for his fingers, whether drawing wires from hole to hole makes sense to him, and whether the text-to-speech voice is understandable.

### Phase 2: Vertical slice: World 1 polished (≈3–4 weeks)
**Goal:** one world that looks, sounds and feels like the final game.
- [ ] Final pixel art for the board, battery, wire, LED (several colors), resistor and mascot. Add idle animations.
- [ ] Juice: snap "click" sounds, sparkle on connect, a celebration animation, LED glow (an additive sprite).
- [ ] Voice-over pipeline: per-level intro, hints and success lines in Dutch (recorded and normalized, saved as .ogg/.mp3), replacing the text-to-speech placeholder.
- [ ] Escalating hint system (point → ghost hand → auto-place).
- [ ] World map / level select with icons and stars, plus save progress in `localStorage`.
- [ ] Parent corner (long-press gate), with the English-labels setting moved into it.
- [ ] PWA manifest + offline caching, and test on the actual tablet he'll use.
- [ ] All six World 1 levels.

**Exit criteria:** he plays World 1 start to finish **without** your help and asks for more.

### Phase 3: Content tools + Worlds 2–3 (≈4–6 weeks)
**Goal:** make adding levels cheap, then add switches, motors and dimmers.
- [ ] **In-game level editor** (behind the parent corner): place fixed parts, set the inventory and goals, then export or import JSON. This lets you design levels together with him.
- [ ] New parts: push button, toggle switch, fan/motor (RPM from current, direction from polarity), buzzer (Web Audio tone), potentiometer (drag a knob).
- [ ] New goal types: `fanSpinning`, `truthTable` (for the AND/OR switch levels), `brightnessCompare`.
- [ ] Interactive parts during play: the child can press buttons and flip switches *after* building, and the circuit reacts live.
- [ ] World 2 and World 3 levels.
- [ ] Simulator tests for the new parts.

**Exit criteria:** you can build a new level in the editor in under 10 minutes. Worlds 1–3 are playable.

### Phase 4: Real breadboard + semiconductors (≈4–6 weeks)
**Goal:** teach real breadboard connectivity, transistors and sensors.
- [ ] Breadboard board type: strips, center gap, power rails, and an "X-ray" toggle that shows hidden connections.
- [ ] Multi-pin parts that straddle the center gap correctly.
- [ ] **Simulator v2:** NPN transistor model with robust Newton–Raphson convergence (damping, gmin stepping, and a fallback to a switch model if the solve doesn't converge).
- [ ] LDR (light sensor) tied to an in-game light level (day/night toggle, cover with finger).
- [ ] Touch pads (simulated skin resistance).
- [ ] World 4 and World 5 levels.
- [ ] Convergence and stress tests (randomized circuits must never freeze the game: cap the iterations and degrade gracefully).

**Exit criteria:** the night light and touch switch levels work reliably, and the simulator never hangs on random junk circuits.

### Phase 5: Time & sound: the interactive projects (≈5–7 weeks)
**Goal:** make the "real, usable circuit" levels.
- [ ] Capacitor part + **transient simulation** (backward Euler, fixed timestep tied to the game loop and slowed down so blinking is visible).
- [ ] SPDT switch part + the hotel corridor scene (mascot walks between the two switches).
- [ ] Astable multivibrator blinking-light level.
- [ ] **AC analysis + Web Audio bridge:** compute the circuit's frequency response, then apply it to a music or noise source through `IIRFilterNode` (or a fitted `BiquadFilterNode`) so the low-pass filter is audible. Add a simple pixel "sound wave" visualizer (oscilloscope or spectrum bars) so he can *see* the high sounds disappear.
- [ ] Tilt/pressure switch + alarm level, and the traffic light level.
- [ ] World 6 levels.

**Exit criteria:** he can turn the hotel light on and off from both ends, and *hears* the difference when he adds the filter capacitor.

### Phase 6: Sandbox, polish & real-world bridge (≈3–4 weeks)
**Goal:** a complete, durable game, and a path to real hardware.
- [ ] Sandbox mode with unlockable parts, an optional "show numbers" overlay (volts, mA, ohms) and a multimeter tool.
- [ ] **"Build it for real" cards:** for each ★ level, a printable page showing the real breadboard layout, a real photo-style pixel render and a parts list, using a safe 2×AA / 3 V battery pack.
- [ ] Accessibility: color-blind-safe LED/wire colors, and a left-handed tray position.
- [ ] Performance pass on low-end tablets, plus audio ducking and volume balance.
- [ ] Check every screen with English labels on and off, and add an English voice-over set only if it's ever wanted.
- [ ] Final bug bash, then tag v1.0.

**Exit criteria:** v1.0 deployed. Each world takes him about 1–2 short sessions. At least one ★ circuit has been built on a real breadboard together.

### Optional Phase 7: Growing up with the game
- Logic gates (built from transistors, then as blocks), a 555 timer chip, an RGB LED, a microcontroller "brain" block with simple visual programming.
- An older-child mode with numbers always on, Ohm's law puzzles and component values to pick.

---

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| The simulator is hard to get right (especially transistors and convergence) | Build it test-first. Start linear and add nonlinear parts one at a time. Use a fallback switch model. Iteration caps prevent freezes. |
| Fine motor control of a 5-year-old | Big snapping targets, auto-routed wires, generous hit areas, no precision drags, and an undo button |
| Concepts too abstract | Current-dot animation, stories and metaphors (speed bump, bucket, lever), and an early playable prototype (Phase 1) to test them |
| Frustration or boredom | Escalating hints, short levels, playtest every phase, and let him design levels with you in the editor |
| Scope creep | Each phase has exit criteria. Phases 0–2 are a complete mini-game on their own. Worlds can ship one at a time. |
| Teaching something wrong | Keep the physics honest. Simplify the *presentation*, not the behavior, and use conventional current direction consistently (+ to −). |

---

## 7. Suggested repository layout

```
/src
  /scenes        Boot, WorldMap, Level, Editor, Sandbox, ParentCorner
  /board         grid, placement, wire routing, breadboard topology
  /sim           netlist.ts, mna.ts, components/*.ts, transient.ts, ac.ts
  /parts         part definitions (pins, sprites, sim model, interactions)
  /goals         goal checkers
  /audio         sfx, voice, filter bridge
  /ui            tray, hints, celebrations
/levels          world1/*.json … world6/*.json
/assets          sprites (Aseprite sources + exports), audio, voice
/tests           simulator & netlist unit tests
/docs            design notes, build-it-for-real cards
```

---

## 8. Immediate next steps

1. Set up the Phase 0 repo skeleton and the GitHub Pages deploy.
2. Write the simulator v1 test cases *before* the simulator itself.
