import Phaser from 'phaser';
import {
  canPlacePart,
  canPlaceWire,
  pinCells,
  routeWire,
  wireEnds,
  type Board,
  type PlacedPart,
  type Wire,
} from '../board/board';
import { cellKey, nextRot, sameCell, type Cell, type Rot } from '../board/grid';
import { pickBoardTarget, type BoardTarget } from '../board/pick';
import { LEVELS, buildLevelBoard, partFromSpec, type InventoryItem, type LevelDef } from '../levels/levels';
import { evaluateBoard, MIN_VISIBLE_AMPS, SHORT_CIRCUIT_AMPS, type BoardEval } from '../sim/evaluate';
import { checkGoals } from '../goals/goals';
import { nextHintStep, type HintStep } from '../hints/hints';
import { PART_DEFS, type PartType } from '../parts/defs';
import { LED_COLORS, PAL, WIRE_COLORS, hex } from '../art/palette';
import { ensureBoardTexture, partTextureKey } from '../art/textures';
import { Label, FONT_FAMILY } from '../ui/Label';
import { Button } from '../ui/Button';
import { Mascot } from '../ui/Mascot';
import { HintOverlay } from '../ui/HintOverlay';
import { addParentGate } from '../ui/ParentGate';
import { t, type StringKey, type Txt } from '../i18n/strings';
import { say, sayOnce, stopSpeaking } from '../audio/speech';
import { sfx } from '../audio/sfx';
import { markCompleted } from '../progress';
import {
  TOP_BAR_H,
  TRAY_Y,
  VIEW_H,
  VIEW_W,
  boardLayout,
  cellToWorld,
  fitCamera,
  textResolution,
  worldToCell,
  type BoardLayout,
} from '../view';

type Point = { x: number; y: number };

type Target = { type: 'slot'; slot: Slot } | BoardTarget;

type Drag =
  | { kind: 'none' }
  | { kind: 'pending'; pointerId: number; start: Point; target: Target }
  | {
      kind: 'part';
      pointerId: number;
      part: PlacedPart;
      /** The part as it was on the board, or null for a new part from the tray. */
      original: PlacedPart | null;
      slot: Slot | undefined;
      offset: Point;
      sprite: Phaser.GameObjects.Image;
      ghost: Phaser.GameObjects.Image;
    }
  | { kind: 'wire'; pointerId: number; anchor: Cell; original: Wire | null; target: Cell | null; overTray: boolean };

interface Slot {
  item: InventoryItem;
  left: number;
  x: number;
  y: number;
  w: number;
  h: number;
  icon: Phaser.GameObjects.Image;
  count: Phaser.GameObjects.Text;
  bg: Phaser.GameObjects.Graphics;
}

interface PartView {
  sprite: Phaser.GameObjects.Image;
  extras: Phaser.GameObjects.GameObject[];
}

const DRAG_THRESHOLD = 4;
const SLOT_W = 64;
const SLOT_H = 50;
/** New parts float a little above the finger so it doesn't hide them. */
const LIFT = 10;
const DOT_SPACING = 8;
/** How long the finished circuit runs before the "well done" card appears. */
const CELEBRATE_PAUSE_MS = 4000;
/** Idle time before each hint stage: point at the next step, demonstrate it, then do it. */
const HINT_POINT_MS = 12000;
const HINT_DEMO_MS = 25000;
const HINT_AUTO_MS = 45000;

export class LevelScene extends Phaser.Scene {
  private index = 0;
  private level!: LevelDef;
  private layout!: BoardLayout;
  /** Board pixel scale (1 or 2). */
  private s = 1;
  private board!: Board;
  private ev: BoardEval | null = null;
  private slots: Slot[] = [];
  private drag: Drag = { kind: 'none' };
  private complete = false;
  private nextId = 0;
  private wireColor = 0;
  private wasShorted = false;
  private justPlaced: string | null = null;

  private wiresG!: Phaser.GameObjects.Graphics;
  private dotsG!: Phaser.GameObjects.Graphics;
  private previewG!: Phaser.GameObjects.Graphics;
  private partViews = new Map<string, PartView>();
  private hintImages: { spec: PlacedPart; image: Phaser.GameObjects.Image }[] = [];
  private dotPhase = 0;
  private mascot!: Mascot;
  private hints!: HintOverlay;
  private hintStage = 0;
  private lastActivity = 0;

  constructor() {
    super('level');
  }

  init(data: { index?: number }): void {
    this.index = data.index ?? 0;
    this.ev = null;
    this.slots = [];
    this.drag = { kind: 'none' };
    this.complete = false;
    this.nextId = 0;
    this.wasShorted = false;
    this.justPlaced = null;
    this.partViews = new Map();
    this.hintImages = [];
    this.hintStage = 0;
  }

  create(): void {
    fitCamera(this);
    this.level = LEVELS[this.index];
    this.s = this.level.scale ?? 1;
    this.layout = boardLayout(this.level.cols, this.level.rows, this.s);
    this.board = buildLevelBoard(this.level);
    this.wireColor = this.level.fixed.wires.length;

    this.add.rectangle(0, 0, VIEW_W, VIEW_H, PAL.charcoal).setOrigin(0);
    const boardKey = ensureBoardTexture(this, this.level.cols, this.level.rows);
    this.add
      .image(this.layout.originX - 12 * this.s, this.layout.originY - 12 * this.s, boardKey)
      .setOrigin(0)
      .setScale(this.s);

    for (const spec of this.level.hintSpots ?? []) {
      const part = partFromSpec(spec, 'hint', true);
      const { x, y } = cellToWorld(this.layout, part.pos);
      const image = this.add
        .image(x, y, partTextureKey(part.type, part.props, false, part.rot))
        .setAngle(part.rot * 90)
        .setScale(this.s)
        .setTint(PAL.silver)
        .setDepth(4);
      this.tweens.add({ targets: image, alpha: { from: 0.12, to: 0.4 }, duration: 800, yoyo: true, repeat: -1 });
      this.hintImages.push({ spec: part, image });
    }

    this.wiresG = this.add.graphics().setDepth(5);
    this.dotsG = this.add.graphics().setDepth(7);
    this.previewG = this.add.graphics().setDepth(40);
    this.hints = new HintOverlay(this);

    this.buildTopBar();
    this.buildTray();
    this.mascot = new Mascot(this, VIEW_W - 20, VIEW_H - 4, 2).setDepth(55);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
      this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
      this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    });

    this.refresh(false);
    this.resetActivity();
    this.time.delayedCall(400, () => this.sayIntro());
  }

  update(time: number, delta: number): void {
    this.drawCurrentDots(delta);
    this.updateHints(time);
  }

  private sayIntro(): void {
    say(`${this.level.id}-intro`, this.level.intro);
  }

  private sayKey(key: StringKey, cooldownMs?: number): void {
    sayOnce(key, t(key), cooldownMs);
  }

  // ───────────────────────────── UI ─────────────────────────────

  private buildTopBar(): void {
    this.add.rectangle(0, 0, VIEW_W, TOP_BAR_H, PAL.ink).setOrigin(0);
    this.add.rectangle(0, TOP_BAR_H - 1, VIEW_W, 1, PAL.navy).setOrigin(0);
    new Button(this, 16, 14, { size: 20, icon: 'icon-home' }, () => {
      sfx.tap();
      stopSpeaking();
      this.scene.start('map');
    });
    new Button(this, 42, 14, { size: 20, icon: 'icon-restart' }, () => {
      sfx.tap();
      stopSpeaking();
      this.scene.restart({ index: this.index });
    });
    const n = this.index + 1;
    const lvl = t('level');
    const title: Txt = {
      nl: `${lvl.nl} ${n} · ${this.level.title.nl}`,
      en: `${lvl.en} ${n} · ${this.level.title.en}`,
    };
    new Label(this, VIEW_W / 2, 3, title, { size: 10, color: PAL.yellow });
    new Button(this, VIEW_W - 42, 14, { size: 20, icon: 'icon-speaker' }, () => this.sayIntro());
    addParentGate(this, VIEW_W - 16, 14);
  }

  private buildTray(): void {
    this.add.rectangle(0, TRAY_Y, VIEW_W, VIEW_H - TRAY_Y, PAL.ink).setOrigin(0);
    this.add.rectangle(0, TRAY_Y, VIEW_W, 1, PAL.navy).setOrigin(0);
    this.level.inventory.forEach((item, i) => {
      const x = 12 + i * (SLOT_W + 8);
      const y = TRAY_Y + 3;
      const bg = this.add.graphics();
      const key =
        item.type === 'wire' ? 'icon-wire' : partTextureKey(item.type, { ...PART_DEFS[item.type].defaults, ...item.props });
      const icon = this.add.image(x + SLOT_W / 2, y + 13, key);
      icon.setScale(Math.min(1, (SLOT_W - 6) / icon.width));
      const count = this.add
        .text(x + SLOT_W - 3, y + 2, '', {
          fontFamily: FONT_FAMILY,
          fontSize: '7px',
          fontStyle: 'bold',
          color: hex(PAL.white),
          resolution: textResolution(),
        })
        .setOrigin(1, 0);
      const labelKey = item.type === 'wire' ? 'partWire' : PART_DEFS[item.type].labelKey;
      new Label(this, x + SLOT_W / 2, y + 25, t(labelKey), { size: 8 });
      const slot: Slot = { item, left: item.count, x, y, w: SLOT_W, h: SLOT_H, icon, count, bg };
      this.slots.push(slot);
      this.drawSlot(slot);
    });
  }

  private drawSlot(slot: Slot): void {
    const empty = slot.left <= 0;
    slot.bg
      .clear()
      .fillStyle(empty ? PAL.charcoal : PAL.navy, 1)
      .fillRect(slot.x, slot.y, slot.w, slot.h)
      .fillStyle(0xffffff, empty ? 0.05 : 0.15)
      .fillRect(slot.x, slot.y, slot.w, 1);
    slot.icon.setAlpha(empty ? 0.3 : 1);
    slot.count.setText(`×${slot.left}`).setAlpha(empty ? 0.4 : 1);
  }

  private slotFor(type: PartType | 'wire'): Slot | undefined {
    return this.slots.find((s) => s.item.type === type);
  }

  private wiggle(target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject): void {
    const x0 = target.x;
    this.tweens.add({ targets: target, x: x0 + 2, duration: 50, yoyo: true, repeat: 2, onComplete: () => (target.x = x0) });
  }

  // ─────────────────────────── Input ────────────────────────────

  private onPointerDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    this.resetActivity();
    if (over.length > 0 || this.complete || this.drag.kind !== 'none') return;
    const target = this.hitTest(p.worldX, p.worldY);
    if (target) this.drag = { kind: 'pending', pointerId: p.id, start: { x: p.worldX, y: p.worldY }, target };
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (d.kind === 'none' || d.pointerId !== p.id) return;
    if (d.kind === 'pending') {
      if (Phaser.Math.Distance.Between(d.start.x, d.start.y, p.worldX, p.worldY) < DRAG_THRESHOLD) return;
      this.beginDrag(d.target, p);
    }
    this.moveDrag(p);
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (d.kind === 'none' || d.pointerId !== p.id) return;
    if (d.kind === 'pending') {
      this.drag = { kind: 'none' };
      this.tap(d.target);
      return;
    }
    this.endDrag(p);
  }

  private hitTest(x: number, y: number): Target | null {
    if (y >= TRAY_Y) {
      const slot = this.slots.find((sl) => x >= sl.x && x < sl.x + sl.w && y >= sl.y && y < sl.y + sl.h);
      return slot ? { type: 'slot', slot } : null;
    }
    return pickBoardTarget(this.board, this.layout, x, y);
  }

  private tap(target: Target): void {
    switch (target.type) {
      case 'slot':
        sfx.tap();
        if (target.slot.item.type === 'wire') this.sayKey('sayWireHowTo', 3000);
        this.wiggle(target.slot.icon);
        break;
      case 'hole':
        // Tapping a pin acts like tapping the part.
        if (target.part) this.tapPart(target.part, true);
        break;
      case 'part':
        this.tapPart(target.part);
        break;
      default:
        break;
    }
  }

  /** Tap on a part: switches toggle, movable parts turn, fixed parts just wiggle (unless `quiet`). */
  private tapPart(part: PlacedPart, quiet = false): void {
    if (PART_DEFS[part.type].tap === 'toggle') {
      sfx.tap();
      part.props.closed = !part.props.closed;
      this.refresh();
    } else if (!part.fixed) {
      this.rotate(part);
    } else if (!quiet) {
      sfx.denied();
      const view = this.partViews.get(part.id);
      if (view) this.wiggle(view.sprite);
    }
  }

  private rotate(part: PlacedPart): void {
    let rot: Rot = part.rot;
    for (let i = 0; i < 3; i++) {
      rot = nextRot(rot);
      if (canPlacePart(this.board, { ...part, rot }, part.id)) {
        part.rot = rot;
        sfx.rotate();
        this.justPlaced = part.id;
        this.refresh();
        return;
      }
    }
    sfx.denied();
    const view = this.partViews.get(part.id);
    if (view) this.wiggle(view.sprite);
  }

  private beginDrag(target: Target, p: Phaser.Input.Pointer): void {
    this.drag = { kind: 'none' };
    switch (target.type) {
      case 'slot': {
        const slot = target.slot;
        if (slot.item.type === 'wire') {
          this.sayKey('sayWireHowTo', 3000);
          return;
        }
        if (slot.left <= 0) {
          sfx.denied();
          this.wiggle(slot.icon);
          return;
        }
        const part = partFromSpec(
          { type: slot.item.type, pos: [0, 0], props: slot.item.props },
          `${slot.item.type}-${++this.nextId}`,
          false,
        );
        sfx.pickup();
        this.startPartDrag(part, null, slot, { x: 0, y: -LIFT * this.s }, p);
        return;
      }
      case 'part': {
        const part = target.part;
        if (part.fixed) return;
        this.board.parts = this.board.parts.filter((q) => q !== part);
        const c = cellToWorld(this.layout, part.pos);
        sfx.pickup();
        this.startPartDrag(
          part,
          { ...part, pos: { ...part.pos } },
          this.slotFor(part.type),
          { x: c.x - p.worldX, y: c.y - p.worldY },
          p,
        );
        this.refresh();
        return;
      }
      case 'hole': {
        const slot = this.slotFor('wire');
        if (!slot) return;
        if (slot.left <= 0) {
          sfx.denied();
          this.sayKey('sayNoWiresLeft');
          this.wiggle(slot.icon);
          return;
        }
        sfx.pickup();
        this.drag = { kind: 'wire', pointerId: p.id, anchor: target.cell, original: null, target: null, overTray: false };
        return;
      }
      case 'wireEnd': {
        const wire = target.wire;
        this.board.wires = this.board.wires.filter((w) => w !== wire);
        const anchor = wireEnds(wire)[target.end === 0 ? 1 : 0];
        sfx.pickup();
        this.drag = { kind: 'wire', pointerId: p.id, anchor, original: wire, target: null, overTray: false };
        this.refresh();
        return;
      }
    }
  }

  private startPartDrag(
    part: PlacedPart,
    original: PlacedPart | null,
    slot: Slot | undefined,
    offset: Point,
    p: Phaser.Input.Pointer,
  ): void {
    const key = partTextureKey(part.type, part.props, false, part.rot);
    const ghost = this.add
      .image(0, 0, key)
      .setAngle(part.rot * 90)
      .setScale(this.s)
      .setAlpha(0.4)
      .setDepth(30)
      .setVisible(false);
    const sprite = this.add
      .image(p.worldX + offset.x, p.worldY + offset.y, key)
      .setAngle(part.rot * 90)
      .setScale(this.s * 1.15)
      .setDepth(35);
    this.drag = { kind: 'part', pointerId: p.id, part, original, slot, offset, sprite, ghost };
  }

  private moveDrag(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (d.kind === 'part') {
      const x = p.worldX + d.offset.x;
      const y = p.worldY + d.offset.y;
      d.sprite.setPosition(x, y);
      const cell = worldToCell(this.layout, x, y);
      const ok = p.worldY < TRAY_Y && canPlacePart(this.board, { ...d.part, pos: cell });
      const c = cellToWorld(this.layout, cell);
      d.ghost.setPosition(c.x, c.y).setVisible(ok);
    } else if (d.kind === 'wire') {
      d.overTray = p.worldY >= TRAY_Y;
      const cell = worldToCell(this.layout, p.worldX, p.worldY);
      d.target = !d.overTray && canPlaceWire(this.board, d.anchor, cell) ? cell : null;
      this.drawWirePreview(d, p);
    }
  }

  private endDrag(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    this.drag = { kind: 'none' };
    this.previewG.clear();
    if (d.kind === 'part') {
      d.sprite.destroy();
      d.ghost.destroy();
      const cell = worldToCell(this.layout, p.worldX + d.offset.x, p.worldY + d.offset.y);
      if (p.worldY >= TRAY_Y) {
        // Back into the tray.
        if (d.original && d.slot) d.slot.left++;
        sfx.remove();
      } else if (canPlacePart(this.board, { ...d.part, pos: cell })) {
        d.part.pos = cell;
        this.board.parts.push(d.part);
        if (!d.original && d.slot) d.slot.left--;
        this.justPlaced = d.part.id;
        this.celebrateConnections(pinCells(d.part));
      } else {
        sfx.denied();
        if (d.original) this.board.parts.push(d.original);
      }
      if (d.slot) this.drawSlot(d.slot);
      this.refresh();
    } else if (d.kind === 'wire') {
      const slot = this.slotFor('wire');
      if (d.overTray) {
        if (d.original && slot) slot.left++;
        sfx.remove();
      } else if (d.target) {
        this.addWire(d.anchor, d.target, d.original);
        if (!d.original && slot) slot.left--;
      } else if (d.original) {
        sfx.denied();
        this.board.wires.push(d.original);
      }
      if (slot) this.drawSlot(slot);
      this.refresh();
    }
  }

  private addWire(a: Cell, b: Cell, original: Wire | null): void {
    this.board.wires.push({
      id: original?.id ?? `wire-${++this.nextId}`,
      points: routeWire(this.board, a, b),
      fixed: false,
      color: original?.color ?? WIRE_COLORS[this.wireColor++ % WIRE_COLORS.length],
    });
    this.celebrateConnections([a, b]);
  }

  /** Click, plus a little sparkle where a new wire end or part pin meets something it connects to. */
  private celebrateConnections(cells: Cell[]): void {
    const pins = new Set(this.board.parts.flatMap((p) => pinCells(p).map(cellKey)));
    const ends = new Map<string, number>();
    for (const w of this.board.wires) for (const e of wireEnds(w)) ends.set(cellKey(e), (ends.get(cellKey(e)) ?? 0) + 1);
    let connected = false;
    for (const c of cells) {
      const k = cellKey(c);
      // A pin meeting a wire end, or a wire end meeting another wire end.
      if ((pins.has(k) && (ends.get(k) ?? 0) > 0) || (ends.get(k) ?? 0) > 1) {
        connected = true;
        this.sparkle(cellToWorld(this.layout, c), 6, 10 * this.s);
      }
    }
    if (connected) sfx.connect();
    else sfx.drop();
  }

  // ─────────────────────── Simulation & view ───────────────────────

  private refresh(feedback = true): void {
    const ev = evaluateBoard(this.board);
    this.ev = ev;
    this.renderWires(ev);
    this.renderParts(ev);
    this.updateHintSpots();

    if (feedback) {
      for (const id of ev.popped) {
        const part = this.board.parts.find((q) => q.id === id);
        if (part) this.puff(cellToWorld(this.layout, part.pos));
      }
      if (ev.popped.length > 0) {
        sfx.pop();
        this.sayKey('sayPopped');
      } else if (ev.shorted) {
        if (!this.wasShorted) sfx.short();
        this.sayKey('sayShort');
      } else if (this.board.parts.some((p) => !p.fixed && isReversed(ev, p.id))) {
        this.sayKey('sayReversed');
      }
    }
    this.wasShorted = ev.shorted;

    if (!this.complete && this.drag.kind === 'none' && checkGoals(this.level.goals, ev).done) this.celebrate();
  }

  private renderParts(ev: BoardEval): void {
    for (const view of this.partViews.values()) {
      this.tweens.killTweensOf(view.sprite);
      view.sprite.destroy();
      view.extras.forEach((o) => {
        this.tweens.killTweensOf(o);
        o.destroy();
      });
    }
    this.partViews.clear();
    const s = this.s;

    for (const part of this.board.parts) {
      const state = ev.parts.get(part.id);
      const { x, y } = cellToWorld(this.layout, part.pos);
      const extras: Phaser.GameObjects.GameObject[] = [];
      let key = partTextureKey(part.type, part.props, false, part.rot);
      if (state?.kind === 'led') {
        if (state.popped) key = 'part-led-popped';
        else if (state.brightness > 0.05) key = partTextureKey(part.type, part.props, true);
      }
      const sprite = this.add
        .image(x, y, key)
        .setAngle(part.rot * 90)
        .setScale(s)
        .setDepth(10);

      if (state?.kind === 'led' && state.brightness > 0.02) {
        const b = state.brightness;
        const alpha = 0.3 + 0.7 * b;
        const glow = this.add
          .image(x, y, 'glow')
          .setTint(LED_COLORS[part.props.color ?? 'red'])
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(alpha)
          .setScale((0.6 + 0.7 * b) * (s > 1 ? 0.75 * s : 1))
          .setDepth(11);
        this.tweens.add({ targets: glow, alpha: alpha * 0.75, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        extras.push(glow);
      }
      if (state?.kind === 'led' && state.reversed && !part.fixed) {
        const badge = this.add
          .image(x, y - 13 * s, 'icon-rotate')
          .setTint(PAL.yellow)
          .setScale(s)
          .setDepth(12);
        this.tweens.add({ targets: badge, y: y - 16 * s, duration: 400, yoyo: true, repeat: -1 });
        extras.push(badge);
      }
      if (state?.kind === 'battery' && state.shorted) {
        sprite.setTint(PAL.orange);
        this.tweens.add({ targets: sprite, x: x + s, duration: 40, yoyo: true, repeat: -1 });
      }
      if (part.id === this.justPlaced) {
        sprite.setScale(s * 1.3);
        this.tweens.add({ targets: sprite, scale: s, duration: 220, ease: 'Back.easeOut' });
      }
      this.partViews.set(part.id, { sprite, extras });
    }
    this.justPlaced = null;
  }

  private renderWires(ev: BoardEval): void {
    const g = this.wiresG.clear();
    for (const wire of this.board.wires) {
      const hot = Math.abs(ev.wires.get(wire.id) ?? 0) > SHORT_CIRCUIT_AMPS;
      this.drawWire(g, wire.points, wire.color, 1, hot);
    }
  }

  private drawWire(g: Phaser.GameObjects.Graphics, cells: Cell[], color: number, alpha: number, hot = false): void {
    const s = this.s;
    const pts = cells.map((c) => cellToWorld(this.layout, c));
    const seg = (a: Point, b: Point, th: number, dx: number, dy: number, col: number, al: number) => {
      const x = Math.min(a.x, b.x) - th / 2 + dx;
      const y = Math.min(a.y, b.y) - th / 2 + dy;
      g.fillStyle(col, al).fillRect(x, y, Math.abs(a.x - b.x) + th, Math.abs(a.y - b.y) + th);
    };
    for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i], 2 * s, s, s + 1, PAL.ink, 0.35 * alpha);
    if (hot) for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i], 4 * s, 0, 0, PAL.yellow, 0.8 * alpha);
    for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i], 2 * s, 0, 0, hot ? PAL.orange : color, alpha);
    if (s > 1 && !hot) {
      // A lighter stripe along the top-left edge gives the wire a rounded look at the big scale.
      const light = Phaser.Display.Color.IntegerToColor(color).lighten(20).color;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const horizontal = a.y === b.y;
        g.fillStyle(light, 0.7 * alpha).fillRect(
          Math.min(a.x, b.x) - s,
          Math.min(a.y, b.y) - s,
          horizontal ? Math.abs(a.x - b.x) + 2 * s : 1,
          horizontal ? 1 : Math.abs(a.y - b.y) + 2 * s,
        );
      }
    }
    const dark = Phaser.Display.Color.IntegerToColor(color).darken(25).color;
    for (const end of [pts[0], pts[pts.length - 1]]) {
      g.fillStyle(dark, alpha).fillRect(end.x - 2 * s, end.y - 2 * s, 4 * s, 4 * s);
    }
  }

  private drawWirePreview(d: Extract<Drag, { kind: 'wire' }>, p: Phaser.Input.Pointer): void {
    const g = this.previewG.clear();
    const color = d.original?.color ?? WIRE_COLORS[this.wireColor % WIRE_COLORS.length];
    if (d.target) {
      this.drawWire(g, routeWire(this.board, d.anchor, d.target), color, 0.8);
    } else {
      // Not over a valid hole: a thin line to the finger.
      const a = cellToWorld(this.layout, d.anchor);
      g.lineStyle(this.s, d.overTray ? PAL.red : color, 0.7).lineBetween(a.x, a.y, p.worldX, p.worldY);
      g.fillStyle(color, 1).fillRect(a.x - 2 * this.s, a.y - 2 * this.s, 4 * this.s, 4 * this.s);
    }
  }

  private updateHintSpots(): void {
    for (const { spec, image } of this.hintImages) {
      const filled = this.board.parts.some((q) => q.type === spec.type && sameCell(q.pos, spec.pos));
      image.setVisible(!filled);
    }
  }

  /** Little yellow dots that move along wires (and through parts) in the direction of the current. */
  private drawCurrentDots(delta: number): void {
    const g = this.dotsG.clear();
    const ev = this.ev;
    if (!ev) return;
    const s = this.s;
    this.dotPhase += delta / 1000;
    const paths: { pts: Point[]; amps: number }[] = [];
    for (const w of this.board.wires) {
      paths.push({ pts: w.points.map((c) => cellToWorld(this.layout, c)), amps: ev.wires.get(w.id) ?? 0 });
    }
    for (const part of this.board.parts) {
      const st = ev.parts.get(part.id);
      if (!st) continue;
      const [a, b] = pinCells(part).map((c) => cellToWorld(this.layout, c));
      // Battery current is measured out of "+" (pin 0), so inside it flows from pin 1 to pin 0.
      paths.push({ pts: st.kind === 'battery' ? [b, a] : [a, b], amps: st.amps });
    }
    for (const { pts, amps } of paths) {
      const mag = Math.abs(amps);
      if (mag < MIN_VISIBLE_AMPS) continue;
      const speed = Phaser.Math.Clamp(14 + 12 * Math.log10(mag / 1e-4), 6, 70) * s;
      const hot = mag > SHORT_CIRCUIT_AMPS;
      const len = polylineLength(pts);
      const spacing = DOT_SPACING * s;
      const offset = (this.dotPhase * speed) % spacing;
      g.fillStyle(hot ? PAL.white : PAL.yellow, 1);
      for (let d = offset; d < len; d += spacing) {
        const at = pointAlong(pts, amps > 0 ? d : len - d);
        g.fillRect(Math.round(at.x) - s, Math.round(at.y) - s, 2 * s, 2 * s);
      }
    }
  }

  private puff(at: Point): void {
    const s = this.s;
    const flash = this.add.circle(at.x, at.y, 8 * s, PAL.white, 0.9).setDepth(20);
    this.tweens.add({ targets: flash, alpha: 0, scale: 2, duration: 250, onComplete: () => flash.destroy() });
    for (let i = 0; i < 9; i++) {
      const r = this.add
        .rectangle(at.x + Phaser.Math.Between(-4, 4) * s, at.y, 3 * s, 3 * s, i % 2 ? PAL.silver : PAL.slate)
        .setDepth(20);
      this.tweens.add({
        targets: r,
        y: at.y - Phaser.Math.Between(10, 22) * s,
        x: r.x + Phaser.Math.Between(-6, 6) * s,
        alpha: 0,
        duration: Phaser.Math.Between(500, 900),
        onComplete: () => r.destroy(),
      });
    }
  }

  private sparkle(at: Point, count = 12, radius = 22 * this.s): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = this.add.rectangle(at.x, at.y, 2 * this.s, 2 * this.s, i % 2 ? PAL.yellow : PAL.white).setDepth(25);
      this.tweens.add({
        targets: r,
        x: at.x + Math.cos(angle) * radius,
        y: at.y + Math.sin(angle) * radius,
        alpha: 0,
        duration: 600,
        ease: 'Quad.easeOut',
        onComplete: () => r.destroy(),
      });
    }
  }

  // ─────────────────────────── Hints ───────────────────────────

  private resetActivity(): void {
    this.lastActivity = this.time.now;
    this.hintStage = 0;
    this.hints?.clear();
  }

  private updateHints(now: number): void {
    if (this.complete || this.drag.kind !== 'none') return;
    const idle = now - this.lastActivity;
    const stage = idle >= HINT_AUTO_MS ? 3 : idle >= HINT_DEMO_MS ? 2 : idle >= HINT_POINT_MS ? 1 : 0;
    if (stage <= this.hintStage) return;
    this.hintStage = stage;
    const step = nextHintStep(this.level, this.board);
    if (!step) return;
    if (stage === 1) this.hintPoint(step);
    else if (stage === 2) this.hintDemo(step);
    else this.hintAuto(step);
  }

  private stepPoints(step: HintStep): { from: Point; to: Point } {
    switch (step.kind) {
      case 'wire':
        return { from: cellToWorld(this.layout, step.from), to: cellToWorld(this.layout, step.to) };
      case 'place': {
        const slot = this.slotFor(step.target.type);
        const to = cellToWorld(this.layout, step.target.pos);
        return { from: slot ? { x: slot.icon.x, y: slot.icon.y } : to, to };
      }
      case 'adjust': {
        const part = this.board.parts.find((p) => p.id === step.partId);
        const at = cellToWorld(this.layout, part?.pos ?? step.target.pos);
        return { from: at, to: at };
      }
    }
  }

  private hintPoint(step: HintStep): void {
    const { from, to } = this.stepPoints(step);
    this.hints.clear();
    if (step.kind === 'adjust') this.hints.point(from);
    else this.hints.point(from, to);
    this.mascot.hop();
    sfx.hint();
    const line: StringKey = step.kind === 'wire' ? 'sayWireHowTo' : step.kind === 'place' ? 'sayHintPlace' : 'sayHintTurn';
    this.sayKey(line, 15000);
  }

  private hintDemo(step: HintStep): void {
    const { from, to } = this.stepPoints(step);
    this.hints.clear();
    if (step.kind === 'wire') {
      this.hints.drag(from, to, { wireColor: WIRE_COLORS[this.wireColor % WIRE_COLORS.length] });
    } else if (step.kind === 'place') {
      const tp = step.target;
      this.hints.drag(from, to, {
        texture: partTextureKey(tp.type, tp.props, false, tp.rot),
        angle: tp.rot * 90,
        scale: this.s,
      });
    } else {
      this.hints.tap(from);
    }
    this.mascot.hop();
  }

  /** Last resort after a long time without progress: do the next step for the player. */
  private hintAuto(step: HintStep): void {
    this.hints.clear();
    let done = false;
    if (step.kind === 'wire') {
      const slot = this.slotFor('wire');
      if (slot && slot.left > 0 && canPlaceWire(this.board, step.from, step.to)) {
        this.addWire(step.from, step.to, null);
        slot.left--;
        this.drawSlot(slot);
        done = true;
      }
    } else if (step.kind === 'place') {
      const slot = this.slotFor(step.target.type);
      if (slot && slot.left > 0 && canPlacePart(this.board, step.target)) {
        const part = { ...step.target, id: `${step.target.type}-${++this.nextId}`, props: { ...step.target.props } };
        this.board.parts.push(part);
        slot.left--;
        this.drawSlot(slot);
        this.justPlaced = part.id;
        this.celebrateConnections(pinCells(part));
        done = true;
      }
    } else {
      const part = this.board.parts.find((p) => p.id === step.partId);
      if (part && canPlacePart(this.board, { ...part, pos: step.target.pos, rot: step.target.rot }, part.id)) {
        part.pos = { ...step.target.pos };
        part.rot = step.target.rot;
        this.justPlaced = part.id;
        sfx.rotate();
        done = true;
      }
    }
    if (done) {
      this.sayKey('sayHintHelp', 0);
      this.mascot.hop(2);
      this.refresh(false);
    }
    // Start the hint cycle again for the next step.
    this.lastActivity = this.time.now;
    this.hintStage = 0;
  }

  // ─────────────────────────── Winning ───────────────────────────

  private celebrate(): void {
    this.complete = true;
    this.hints.clear();
    markCompleted(this.level.id);
    for (const part of this.board.parts) {
      const st = this.ev?.parts.get(part.id);
      if (st?.kind === 'led' && st.brightness > 0) this.sparkle(cellToWorld(this.layout, part.pos));
    }
    sfx.success();
    this.mascot.hop(3);
    this.time.delayedCall(300, () => say('saySuccess', t('saySuccess')));
    this.confetti();
    // Let the finished circuit run for a while before the card appears.
    this.time.delayedCall(CELEBRATE_PAUSE_MS, () => this.showComplete());
  }

  private confetti(): void {
    const colors = [PAL.yellow, PAL.red, PAL.sky, PAL.lime, PAL.orange, PAL.white];
    for (let i = 0; i < 40; i++) {
      const x = Phaser.Math.Between(20, VIEW_W - 20);
      const r = this.add
        .rectangle(x, TOP_BAR_H - 4, 3, 2, colors[i % colors.length])
        .setDepth(26)
        .setAngle(Phaser.Math.Between(0, 90));
      this.tweens.add({
        targets: r,
        y: TRAY_Y - Phaser.Math.Between(0, 40),
        x: x + Phaser.Math.Between(-30, 30),
        angle: r.angle + Phaser.Math.Between(180, 540),
        alpha: { from: 1, to: 0 },
        delay: Phaser.Math.Between(0, 600),
        duration: Phaser.Math.Between(1400, 2400),
        ease: 'Quad.easeIn',
        onComplete: () => r.destroy(),
      });
    }
  }

  /** A card slides up over the tray, so the working circuit stays visible above it. */
  private showComplete(): void {
    const last = this.index >= LEVELS.length - 1;
    const h = VIEW_H - TRAY_Y;
    const card = this.add.container(0, VIEW_H).setDepth(50);
    const bg = this.add.graphics();
    bg.fillStyle(PAL.navy, 1).fillRect(0, 0, VIEW_W, h);
    bg.fillStyle(PAL.yellow, 1).fillRect(0, 0, VIEW_W, 2);
    // Swallow taps so nothing underneath reacts.
    const blocker = this.add.rectangle(0, 0, VIEW_W, h, 0, 0).setOrigin(0).setInteractive();
    card.add([bg, blocker]);
    card.add(new Label(this, 16, 9, t(last ? 'allDone' : 'wellDone'), { size: 14, color: PAL.yellow, align: 'left' }));
    for (let i = 0; i < 3; i++) {
      const star = this.add.image(196 + i * 24, h / 2, 'icon-star').setTint(PAL.yellow).setScale(0);
      card.add(star);
      this.tweens.add({ targets: star, scale: 1.6, delay: 350 + i * 160, duration: 300, ease: 'Back.easeOut' });
    }
    const home = new Button(this, VIEW_W - 122, h / 2 - 4, { size: 26, height: 22, icon: 'icon-home' }, () => {
      sfx.tap();
      this.scene.start('map');
    });
    card.add(home);
    if (last) {
      home.setColor(PAL.green);
      say('sayAllDone', t('sayAllDone'));
    } else {
      const next = new Button(
        this,
        VIEW_W - 76,
        h / 2 - 4,
        { size: 44, height: 24, color: PAL.green, icon: 'icon-next' },
        () => {
          sfx.tap();
          this.scene.restart({ index: this.index + 1 });
        },
      );
      card.add([next, new Label(this, VIEW_W - 76, h / 2 + 11, t('next'), { size: 7 })]);
      this.tweens.add({ targets: next, scale: 1.08, duration: 500, yoyo: true, repeat: -1, delay: 600 });
    }
    this.tweens.add({ targets: card, y: TRAY_Y, duration: 350, ease: 'Back.easeOut' });
  }
}

function isReversed(ev: BoardEval, id: string): boolean {
  const st = ev.parts.get(id);
  return st?.kind === 'led' && st.reversed;
}

// ─────────────────────────── Geometry ───────────────────────────

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polylineLength(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

function pointAlong(pts: Point[], d: number): Point {
  for (let i = 1; i < pts.length; i++) {
    const l = dist(pts[i - 1], pts[i]);
    if (d <= l || i === pts.length - 1) {
      const f = l === 0 ? 0 : Math.min(1, d / l);
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f };
    }
    d -= l;
  }
  return pts[0];
}
