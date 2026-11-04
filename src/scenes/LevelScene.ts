import Phaser from 'phaser';
import {
  canEndWire,
  canPlacePart,
  canPlaceWire,
  inBounds,
  pinCells,
  routeWire,
  wireEnds,
  type Board,
  type PlacedPart,
  type Wire,
} from '../board/board';
import { nextRot, sameCell, type Cell, type Rot } from '../board/grid';
import { LEVELS, buildLevelBoard, partFromSpec, type InventoryItem, type LevelDef } from '../levels/levels';
import { evaluateBoard, MIN_VISIBLE_AMPS, SHORT_CIRCUIT_AMPS, type BoardEval } from '../sim/evaluate';
import { checkGoals } from '../goals/goals';
import { PART_DEFS, type PartType } from '../parts/defs';
import { LED_COLORS, PAL, WIRE_COLORS, hex } from '../art/palette';
import { ensureBoardTexture, partTextureKey } from '../art/textures';
import { Label, FONT_FAMILY } from '../ui/Label';
import { Button } from '../ui/Button';
import { addEnglishToggle } from '../ui/EnglishToggle';
import { t, type Txt } from '../i18n/strings';
import { say, sayOnce, stopSpeaking } from '../audio/speech';
import {
  CELL,
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

type Target =
  | { type: 'slot'; slot: Slot }
  | { type: 'part'; part: PlacedPart }
  | { type: 'wireEnd'; wire: Wire; end: 0 | 1 }
  | { type: 'hole'; cell: Cell };

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

export class LevelScene extends Phaser.Scene {
  private index = 0;
  private level!: LevelDef;
  private layout!: BoardLayout;
  private board!: Board;
  private ev: BoardEval | null = null;
  private slots: Slot[] = [];
  private drag: Drag = { kind: 'none' };
  private complete = false;
  private nextId = 0;
  private wireColor = 0;

  private wiresG!: Phaser.GameObjects.Graphics;
  private dotsG!: Phaser.GameObjects.Graphics;
  private previewG!: Phaser.GameObjects.Graphics;
  private partViews = new Map<string, PartView>();
  private hintImages: { spec: PlacedPart; image: Phaser.GameObjects.Image }[] = [];
  private dotPhase = 0;

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
    this.partViews = new Map();
    this.hintImages = [];
  }

  create(): void {
    fitCamera(this);
    this.level = LEVELS[this.index];
    this.layout = boardLayout(this.level.cols, this.level.rows);
    this.board = buildLevelBoard(this.level);
    this.wireColor = this.level.fixed.wires.length;

    this.add.rectangle(0, 0, VIEW_W, VIEW_H, PAL.charcoal).setOrigin(0);
    const boardKey = ensureBoardTexture(this, this.level.cols, this.level.rows);
    this.add.image(this.layout.originX - 12, this.layout.originY - 12, boardKey).setOrigin(0);

    for (const spec of this.level.hintSpots ?? []) {
      const part = partFromSpec(spec, 'hint', true);
      const { x, y } = cellToWorld(this.layout, part.pos);
      const image = this.add
        .image(x, y, partTextureKey(part.type, part.props, false, part.rot))
        .setAngle(part.rot * 90)
        .setAlpha(0.25)
        .setTint(PAL.silver)
        .setDepth(4);
      this.tweens.add({ targets: image, alpha: { from: 0.12, to: 0.4 }, duration: 800, yoyo: true, repeat: -1 });
      this.hintImages.push({ spec: part, image });
    }

    this.wiresG = this.add.graphics().setDepth(5);
    this.dotsG = this.add.graphics().setDepth(7);
    this.previewG = this.add.graphics().setDepth(40);

    this.buildTopBar();
    this.buildTray();

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

    this.refresh();
    this.time.delayedCall(400, () => say(this.level.intro));
  }

  update(_time: number, delta: number): void {
    this.drawCurrentDots(delta);
  }

  // ───────────────────────────── UI ─────────────────────────────

  private buildTopBar(): void {
    this.add.rectangle(0, 0, VIEW_W, TOP_BAR_H, PAL.ink).setOrigin(0);
    this.add.rectangle(0, TOP_BAR_H - 1, VIEW_W, 1, PAL.navy).setOrigin(0);
    new Button(this, 16, 14, { size: 20, icon: 'icon-restart' }, () => {
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
    new Button(this, VIEW_W - 42, 14, { size: 20, icon: 'icon-speaker' }, () => say(this.level.intro));
    addEnglishToggle(this, VIEW_W - 16, 14);
  }

  private buildTray(): void {
    this.add.rectangle(0, TRAY_Y, VIEW_W, VIEW_H - TRAY_Y, PAL.ink).setOrigin(0);
    this.add.rectangle(0, TRAY_Y, VIEW_W, 1, PAL.navy).setOrigin(0);
    this.level.inventory.forEach((item, i) => {
      const x = 12 + i * (SLOT_W + 8);
      const y = TRAY_Y + 3;
      const bg = this.add.graphics();
      const key = item.type === 'wire' ? 'icon-wire' : partTextureKey(item.type, { ...PART_DEFS[item.type].defaults, ...item.props });
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
      const slot = this.slots.find((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
      return slot ? { type: 'slot', slot } : null;
    }
    // Parts: movable parts can be grabbed anywhere, fixed ones only by the body
    // (so wires can still be drawn from their pins).
    for (let i = this.board.parts.length - 1; i >= 0; i--) {
      const part = this.board.parts[i];
      const [a, b] = pinCells(part).map((c) => cellToWorld(this.layout, c));
      const onBody = distToSegment({ x, y }, a, b) <= 8;
      const nearPin = Math.min(dist({ x, y }, a), dist({ x, y }, b)) <= 5;
      if (onBody && (!part.fixed || !nearPin)) return { type: 'part', part };
    }
    const cell = worldToCell(this.layout, x, y);
    const c = cellToWorld(this.layout, cell);
    if (!inBounds(this.board, cell) || Math.abs(c.x - x) > CELL / 2 || Math.abs(c.y - y) > CELL / 2) return null;
    for (let i = this.board.wires.length - 1; i >= 0; i--) {
      const wire = this.board.wires[i];
      if (wire.fixed) continue;
      const [e0, e1] = wireEnds(wire);
      if (sameCell(e0, cell)) return { type: 'wireEnd', wire, end: 0 };
      if (sameCell(e1, cell)) return { type: 'wireEnd', wire, end: 1 };
    }
    return canEndWire(this.board, cell) ? { type: 'hole', cell } : null;
  }

  private tap(target: Target): void {
    switch (target.type) {
      case 'slot':
        if (target.slot.item.type === 'wire') sayOnce('wire-how', t('sayWireHowTo'), 3000);
        this.wiggle(target.slot.icon);
        break;
      case 'part': {
        const part = target.part;
        if (PART_DEFS[part.type].tap === 'toggle') {
          part.props.closed = !part.props.closed;
          this.refresh();
        } else if (!part.fixed) {
          this.rotate(part);
        } else {
          const view = this.partViews.get(part.id);
          if (view) this.wiggle(view.sprite);
        }
        break;
      }
      default:
        break;
    }
  }

  private rotate(part: PlacedPart): void {
    let rot: Rot = part.rot;
    for (let i = 0; i < 3; i++) {
      rot = nextRot(rot);
      if (canPlacePart(this.board, { ...part, rot }, part.id)) {
        part.rot = rot;
        this.refresh();
        return;
      }
    }
    const view = this.partViews.get(part.id);
    if (view) this.wiggle(view.sprite);
  }

  private beginDrag(target: Target, p: Phaser.Input.Pointer): void {
    this.drag = { kind: 'none' };
    switch (target.type) {
      case 'slot': {
        const slot = target.slot;
        if (slot.item.type === 'wire') {
          sayOnce('wire-how', t('sayWireHowTo'), 3000);
          return;
        }
        if (slot.left <= 0) {
          this.wiggle(slot.icon);
          return;
        }
        const part = partFromSpec(
          { type: slot.item.type, pos: [0, 0], props: slot.item.props },
          `${slot.item.type}-${++this.nextId}`,
          false,
        );
        this.startPartDrag(part, null, slot, { x: 0, y: -LIFT }, p);
        return;
      }
      case 'part': {
        const part = target.part;
        if (part.fixed) return;
        this.board.parts = this.board.parts.filter((q) => q !== part);
        const c = cellToWorld(this.layout, part.pos);
        this.startPartDrag(part, { ...part, pos: { ...part.pos } }, this.slotFor(part.type), {
          x: c.x - p.worldX,
          y: c.y - p.worldY,
        }, p);
        this.refresh();
        return;
      }
      case 'hole': {
        const slot = this.slotFor('wire');
        if (!slot) return;
        if (slot.left <= 0) {
          sayOnce('no-wires', t('sayNoWiresLeft'));
          this.wiggle(slot.icon);
          return;
        }
        this.drag = { kind: 'wire', pointerId: p.id, anchor: target.cell, original: null, target: null, overTray: false };
        return;
      }
      case 'wireEnd': {
        const wire = target.wire;
        this.board.wires = this.board.wires.filter((w) => w !== wire);
        const anchor = wireEnds(wire)[target.end === 0 ? 1 : 0];
        this.drag = { kind: 'wire', pointerId: p.id, anchor, original: wire, target: null, overTray: false };
        this.refresh();
        return;
      }
    }
  }

  private startPartDrag(part: PlacedPart, original: PlacedPart | null, slot: Slot | undefined, offset: Point, p: Phaser.Input.Pointer): void {
    const key = partTextureKey(part.type, part.props, false, part.rot);
    const ghost = this.add.image(0, 0, key).setAngle(part.rot * 90).setAlpha(0.4).setDepth(30).setVisible(false);
    const sprite = this.add.image(p.worldX + offset.x, p.worldY + offset.y, key).setAngle(part.rot * 90).setDepth(35);
    sprite.setScale(1.15);
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
      const x = p.worldX + d.offset.x;
      const y = p.worldY + d.offset.y;
      const cell = worldToCell(this.layout, x, y);
      if (p.worldY >= TRAY_Y) {
        // Back into the tray.
        if (d.original && d.slot) d.slot.left++;
      } else if (canPlacePart(this.board, { ...d.part, pos: cell })) {
        d.part.pos = cell;
        this.board.parts.push(d.part);
        if (!d.original && d.slot) d.slot.left--;
      } else if (d.original) {
        this.board.parts.push(d.original);
      }
      if (d.slot) this.drawSlot(d.slot);
      this.refresh();
    } else if (d.kind === 'wire') {
      const slot = this.slotFor('wire');
      if (d.overTray) {
        if (d.original && slot) slot.left++;
      } else if (d.target) {
        this.board.wires.push({
          id: d.original?.id ?? `wire-${++this.nextId}`,
          points: routeWire(this.board, d.anchor, d.target),
          fixed: false,
          color: d.original?.color ?? WIRE_COLORS[this.wireColor++ % WIRE_COLORS.length],
        });
        if (!d.original && slot) slot.left--;
      } else if (d.original) {
        this.board.wires.push(d.original);
      }
      if (slot) this.drawSlot(slot);
      this.refresh();
    }
  }

  // ─────────────────────── Simulation & view ───────────────────────

  private refresh(): void {
    const ev = evaluateBoard(this.board);
    this.ev = ev;
    this.renderWires(ev);
    this.renderParts(ev);
    this.updateHintSpots();

    for (const id of ev.popped) {
      const part = this.board.parts.find((q) => q.id === id);
      if (part) this.puff(cellToWorld(this.layout, part.pos));
    }
    if (ev.popped.length > 0) sayOnce('popped', t('sayPopped'));
    else if (ev.shorted) sayOnce('short', t('sayShort'));
    else if ([...ev.parts.values()].some((s) => s.kind === 'led' && s.reversed)) sayOnce('reversed', t('sayReversed'));

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

    for (const part of this.board.parts) {
      const state = ev.parts.get(part.id);
      const { x, y } = cellToWorld(this.layout, part.pos);
      const extras: Phaser.GameObjects.GameObject[] = [];
      let key = partTextureKey(part.type, part.props, false, part.rot);
      if (state?.kind === 'led') {
        if (state.popped) key = 'part-led-popped';
        else if (state.brightness > 0.05) key = partTextureKey(part.type, part.props, true);
      }
      const sprite = this.add.image(x, y, key).setAngle(part.rot * 90).setDepth(10);

      if (state?.kind === 'led' && state.brightness > 0.02) {
        const b = state.brightness;
        const glow = this.add
          .image(x, y, 'glow')
          .setTint(LED_COLORS[part.props.color ?? 'red'])
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0.3 + 0.7 * b)
          .setScale(0.6 + 0.7 * b)
          .setDepth(11);
        extras.push(glow);
      }
      if (state?.kind === 'led' && state.reversed && !part.fixed) {
        const badge = this.add.image(x, y - 13, 'icon-rotate').setTint(PAL.yellow).setDepth(12);
        this.tweens.add({ targets: badge, y: y - 16, duration: 400, yoyo: true, repeat: -1 });
        extras.push(badge);
      }
      if (state?.kind === 'battery' && state.shorted) {
        sprite.setTint(PAL.orange);
        this.tweens.add({ targets: sprite, x: x + 1, duration: 40, yoyo: true, repeat: -1 });
      }
      this.partViews.set(part.id, { sprite, extras });
    }
  }

  private renderWires(ev: BoardEval): void {
    const g = this.wiresG.clear();
    for (const wire of this.board.wires) {
      const hot = Math.abs(ev.wires.get(wire.id) ?? 0) > SHORT_CIRCUIT_AMPS;
      this.drawWire(g, wire.points, wire.color, 1, hot);
    }
  }

  private drawWire(g: Phaser.GameObjects.Graphics, cells: Cell[], color: number, alpha: number, hot = false): void {
    const pts = cells.map((c) => cellToWorld(this.layout, c));
    const seg = (a: Point, b: Point, t: number, dx: number, dy: number, col: number, al: number) => {
      const x = Math.min(a.x, b.x) - t / 2 + dx;
      const y = Math.min(a.y, b.y) - t / 2 + dy;
      g.fillStyle(col, al).fillRect(x, y, Math.abs(a.x - b.x) + t, Math.abs(a.y - b.y) + t);
    };
    for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i], 2, 1, 2, PAL.ink, 0.35 * alpha);
    if (hot) for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i], 4, 0, 0, PAL.yellow, 0.8 * alpha);
    for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i], 2, 0, 0, hot ? PAL.orange : color, alpha);
    const dark = Phaser.Display.Color.IntegerToColor(color).darken(25).color;
    for (const end of [pts[0], pts[pts.length - 1]]) {
      g.fillStyle(dark, alpha).fillRect(end.x - 2, end.y - 2, 4, 4);
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
      g.lineStyle(1, d.overTray ? PAL.red : color, 0.7).lineBetween(a.x, a.y, p.worldX, p.worldY);
      g.fillStyle(color, 1).fillRect(a.x - 2, a.y - 2, 4, 4);
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
    this.dotPhase += delta / 1000;
    const paths: { pts: Point[]; amps: number }[] = [];
    for (const w of this.board.wires) {
      paths.push({ pts: w.points.map((c) => cellToWorld(this.layout, c)), amps: ev.wires.get(w.id) ?? 0 });
    }
    for (const part of this.board.parts) {
      const s = ev.parts.get(part.id);
      if (!s) continue;
      const [a, b] = pinCells(part).map((c) => cellToWorld(this.layout, c));
      // Battery current is measured out of "+" (pin 0), so inside it flows from pin 1 to pin 0.
      paths.push({ pts: s.kind === 'battery' ? [b, a] : [a, b], amps: s.amps });
    }
    for (const { pts, amps } of paths) {
      const mag = Math.abs(amps);
      if (mag < MIN_VISIBLE_AMPS) continue;
      const speed = Phaser.Math.Clamp(14 + 12 * Math.log10(mag / 1e-4), 6, 70);
      const hot = mag > SHORT_CIRCUIT_AMPS;
      const len = polylineLength(pts);
      const offset = (this.dotPhase * speed) % DOT_SPACING;
      g.fillStyle(hot ? PAL.white : PAL.yellow, 1);
      for (let s = offset; s < len; s += DOT_SPACING) {
        const at = pointAlong(pts, amps > 0 ? s : len - s);
        g.fillRect(Math.round(at.x) - 1, Math.round(at.y) - 1, 2, 2);
      }
    }
  }

  private puff(at: Point): void {
    const flash = this.add.circle(at.x, at.y, 8, PAL.white, 0.9).setDepth(20);
    this.tweens.add({ targets: flash, alpha: 0, scale: 2, duration: 250, onComplete: () => flash.destroy() });
    for (let i = 0; i < 7; i++) {
      const r = this.add.rectangle(at.x + Phaser.Math.Between(-4, 4), at.y, 3, 3, i % 2 ? PAL.silver : PAL.slate).setDepth(20);
      this.tweens.add({
        targets: r,
        y: at.y - Phaser.Math.Between(10, 22),
        x: r.x + Phaser.Math.Between(-6, 6),
        alpha: 0,
        duration: Phaser.Math.Between(500, 900),
        onComplete: () => r.destroy(),
      });
    }
  }

  // ─────────────────────────── Winning ───────────────────────────

  private celebrate(): void {
    this.complete = true;
    for (const part of this.board.parts) {
      const s = this.ev?.parts.get(part.id);
      if (s?.kind === 'led' && s.brightness > 0) this.sparkle(cellToWorld(this.layout, part.pos));
    }
    say(t('saySuccess'));
    this.time.delayedCall(1800, () => this.showComplete());
  }

  private sparkle(at: Point): void {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const r = this.add.rectangle(at.x, at.y, 2, 2, i % 2 ? PAL.yellow : PAL.white).setDepth(25);
      this.tweens.add({
        targets: r,
        x: at.x + Math.cos(angle) * 22,
        y: at.y + Math.sin(angle) * 22,
        alpha: 0,
        duration: 700,
        ease: 'Quad.easeOut',
        onComplete: () => r.destroy(),
      });
    }
  }

  private showComplete(): void {
    const last = this.index >= LEVELS.length - 1;
    const shade = this.add.rectangle(0, 0, VIEW_W, VIEW_H, PAL.ink, 0).setOrigin(0).setDepth(50).setInteractive();
    this.tweens.add({ targets: shade, fillAlpha: 0.65, duration: 300 });
    const panel = this.add.graphics().setDepth(51);
    panel.fillStyle(PAL.ink, 1).fillRect(132, 62, 220, 150);
    panel.fillStyle(PAL.navy, 1).fillRect(130, 60, 220, 150);
    panel.fillStyle(0xffffff, 0.15).fillRect(130, 60, 220, 1);
    new Label(this, VIEW_W / 2, 72, t(last ? 'allDone' : 'wellDone'), { size: 18, color: PAL.yellow }).setDepth(52);
    for (let i = 0; i < 3; i++) {
      const star = this.add.image(VIEW_W / 2 + (i - 1) * 26, 124, 'icon-star').setTint(PAL.yellow).setDepth(52).setScale(0);
      this.tweens.add({ targets: star, scale: 2, delay: 200 + i * 180, duration: 300, ease: 'Back.easeOut' });
    }
    if (last) {
      say(t('sayAllDone'));
      new Button(this, VIEW_W / 2, 165, { size: 44, height: 24, color: PAL.green, icon: 'icon-restart' }, () =>
        this.scene.start('title'),
      ).setDepth(52);
      new Label(this, VIEW_W / 2, 182, t('restart'), { size: 8 }).setDepth(52);
    } else {
      new Button(this, VIEW_W / 2, 165, { size: 44, height: 24, color: PAL.green, icon: 'icon-next' }, () =>
        this.scene.restart({ index: this.index + 1 }),
      ).setDepth(52);
      new Label(this, VIEW_W / 2, 182, t('next'), { size: 8 }).setDepth(52);
    }
  }
}

// ─────────────────────────── Geometry ───────────────────────────

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const tt = len2 === 0 ? 0 : Phaser.Math.Clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return dist(p, { x: a.x + tt * dx, y: a.y + tt * dy });
}

function polylineLength(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

function pointAlong(pts: Point[], s: number): Point {
  for (let i = 1; i < pts.length; i++) {
    const l = dist(pts[i - 1], pts[i]);
    if (s <= l || i === pts.length - 1) {
      const f = l === 0 ? 0 : Math.min(1, s / l);
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f };
    }
    s -= l;
  }
  return pts[0];
}

