import Phaser from 'phaser';
import {
  bestRotation,
  canPlacePart,
  canPlaceWire,
  routeWire,
  wireEnds,
  type Board,
  type PlacedPart,
  type Wire,
} from '../board/board';
import { cellsOnSegment, nextRot, sameCell, type Cell, type Rot } from '../board/grid';
import { pickBoardTarget, type BoardTarget } from '../board/pick';
import { PART_DEFS, type PartProps, type PartType } from '../parts/defs';
import { PAL, WIRE_COLORS } from '../art/palette';
import { ensureBoardTexture, partTextureKey } from '../art/textures';
import { Label } from '../ui/Label';
import { Button } from '../ui/Button';
import { drawWire } from '../ui/drawWire';
import { t, type StringKey } from '../i18n/strings';
import { sfx } from '../audio/sfx';
import { buildCustomLevel, circuitWorks, EDITOR_GOALS, type EditorGoal } from '../editor/buildLevel';
import { loadCustomLevels, saveCustomLevel } from '../customLevels';
import {
  TOP_BAR_H,
  TRAY_Y,
  VIEW_H,
  VIEW_W,
  boardLayout,
  cellToWorld,
  fitCamera,
  worldToCell,
  type BoardLayout,
} from '../view';

type Point = { x: number; y: number };

interface Draft {
  board: Board;
  /** Ids of parts and wires the child has to put in themselves. */
  takenAway: string[];
  goal: EditorGoal;
  nextId: number;
  /** Stays the same while editing, so saving again replaces the earlier copy. */
  levelId: string;
  number: number;
}

const DRAFT_KEY = 'electro.editorDraft.v1';
const COLS = 13;
const ROWS = 5;

function newDraft(): Draft {
  return {
    board: { cols: COLS, rows: ROWS, parts: [], wires: [] },
    takenAway: [],
    goal: 'led',
    nextId: 0,
    levelId: `custom-${Date.now()}`,
    number: loadCustomLevels().length + 1,
  };
}

function loadDraft(): Draft {
  try {
    const raw = globalThis.localStorage?.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw) as Draft;
  } catch {
    // Fall through to a fresh draft.
  }
  return newDraft();
}

function saveDraft(d: Draft): void {
  try {
    globalThis.localStorage?.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // Not fatal: the draft still lives in memory.
  }
}

/** The parts a parent can build with. */
const PALETTE: { type: PartType; props?: PartProps }[] = [
  { type: 'battery', props: { voltage: 3 } },
  { type: 'led', props: { color: 'red' } },
  { type: 'resistor', props: { resistance: 100 } },
  { type: 'resistor', props: { resistance: 1000 } },
  { type: 'switch' },
  { type: 'button' },
  { type: 'fan' },
  { type: 'buzzer' },
  { type: 'pot' },
];
const PAL_W = 36;

const GOAL_ICONS: Record<EditorGoal, string> = { led: 'part-led-red-on', fan: 'part-fan', buzzer: 'part-buzzer' };

type Drag =
  | { kind: 'none' }
  | { kind: 'pending'; pointerId: number; start: Point; target: BoardTarget | { type: 'palette'; index: number } }
  | { kind: 'part'; pointerId: number; part: PlacedPart; sprite: Phaser.GameObjects.Image }
  | { kind: 'wire'; pointerId: number; anchor: Cell; original: Wire | null; target: Cell | null; overTray: boolean };

/**
 * Level editor for parents (opened from the parent corner):
 * 1. build a circuit that works, 2. tap the pieces the child has to put in,
 * then try it, save it to "Mijn levels", or export it as a level file.
 */
export class EditorScene extends Phaser.Scene {
  private draft!: Draft;
  private layout!: BoardLayout;
  private mode: 'build' | 'take' = 'build';
  private drag: Drag = { kind: 'none' };
  private wiresG!: Phaser.GameObjects.Graphics;
  private previewG!: Phaser.GameObjects.Graphics;
  private sprites: Phaser.GameObjects.Image[] = [];
  private status!: Label;
  private goalIcon!: Phaser.GameObjects.Image;
  private modeButtons: { build: Button; take: Button } | null = null;
  private clearArmedUntil = 0;

  constructor() {
    super('editor');
  }

  create(): void {
    fitCamera(this);
    this.draft = loadDraft();
    this.layout = boardLayout(COLS, ROWS, 2);
    this.drag = { kind: 'none' };
    this.mode = 'build';
    this.sprites = [];

    this.add.rectangle(0, 0, VIEW_W, VIEW_H, PAL.charcoal).setOrigin(0);
    this.add
      .image(this.layout.originX - 24, this.layout.originY - 24, ensureBoardTexture(this, COLS, ROWS))
      .setOrigin(0)
      .setScale(2);
    this.wiresG = this.add.graphics().setDepth(5);
    this.previewG = this.add.graphics().setDepth(40);

    this.buildTopBar();
    this.buildTray();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
      this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
      this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    });

    this.render();
    this.toast('editorStepBuild');
  }

  // ───────────────────────────── UI ─────────────────────────────

  private buildTopBar(): void {
    this.add.rectangle(0, 0, VIEW_W, TOP_BAR_H, PAL.ink).setOrigin(0);
    new Button(this, 16, 14, { size: 20, icon: 'icon-home' }, () => {
      sfx.tap();
      this.scene.start('map');
    });
    // Clear everything (tap twice).
    new Button(this, 42, 14, { size: 20, icon: 'icon-restart', color: PAL.plum }, () => {
      sfx.tap();
      if (this.time.now < this.clearArmedUntil) {
        this.draft = newDraft();
        this.commit();
        this.clearArmedUntil = 0;
      } else {
        this.clearArmedUntil = this.time.now + 3000;
        this.toast('resetConfirm');
      }
    });
    new Label(this, 150, 3, t('makeLevel'), { size: 10, color: PAL.yellow });

    // Goal: what has to happen (LED on / fan spinning / buzzer sounding).
    const goal = new Button(this, VIEW_W - 120, 14, { size: 28, height: 20 }, () => {
      sfx.tap();
      const i = EDITOR_GOALS.indexOf(this.draft.goal);
      this.draft.goal = EDITOR_GOALS[(i + 1) % EDITOR_GOALS.length];
      this.commit();
    });
    this.goalIcon = this.add.image(0, 0, GOAL_ICONS[this.draft.goal]).setScale(0.7);
    goal.add(this.goalIcon);

    new Button(this, VIEW_W - 86, 14, { size: 22, color: PAL.green, icon: 'icon-play' }, () => this.tryIt());
    new Button(this, VIEW_W - 60, 14, { size: 22, color: PAL.blue, icon: 'icon-check' }, () => this.save());
    new Button(this, VIEW_W - 34, 14, { size: 22, icon: 'icon-download' }, () => this.exportFile());
  }

  private buildTray(): void {
    this.add.rectangle(0, TRAY_Y, VIEW_W, VIEW_H - TRAY_Y, PAL.ink).setOrigin(0);
    PALETTE.forEach((item, i) => {
      const x = 4 + i * (PAL_W + 2);
      this.add.rectangle(x, TRAY_Y + 3, PAL_W, 50, PAL.navy).setOrigin(0);
      const icon = this.add.image(x + PAL_W / 2, TRAY_Y + 18, partTextureKey(item.type, { ...PART_DEFS[item.type].defaults, ...item.props }));
      icon.setScale(Math.min(1, (PAL_W - 4) / icon.width));
      new Label(this, x + PAL_W / 2, TRAY_Y + 32, t(PART_DEFS[item.type].labelKey), { size: 5, wrap: PAL_W });
    });
    const build = new Button(this, 378, TRAY_Y + 14, { size: 52, height: 18 }, () => this.setMode('build'));
    build.add(new Label(this, 0, -7, t('editorBuild'), { size: 7 }));
    const take = new Button(this, 438, TRAY_Y + 14, { size: 60, height: 18 }, () => this.setMode('take'));
    take.add(new Label(this, 0, -7, t('editorMark'), { size: 7 }));
    this.modeButtons = { build, take };
    this.status = new Label(this, 408, TRAY_Y + 30, t('editorNotWorking'), { size: 8 });
    this.setMode('build', true);
  }

  private setMode(mode: 'build' | 'take', quiet = false): void {
    this.mode = mode;
    if (!quiet) {
      sfx.tap();
      this.toast(mode === 'build' ? 'editorStepBuild' : 'editorStepMark');
    }
    this.modeButtons?.build.setColor(mode === 'build' ? PAL.green : PAL.slate);
    this.modeButtons?.take.setColor(mode === 'take' ? PAL.orange : PAL.slate);
  }

  private toast(key: StringKey): void {
    const label = new Label(this, VIEW_W / 2, TOP_BAR_H + 4, t(key), { size: 8, color: PAL.white }).setDepth(60);
    const b = label.getBounds();
    const bg = this.add
      .rectangle(VIEW_W / 2, TOP_BAR_H + 2, b.width + 12, b.height + 6, PAL.ink, 0.85)
      .setOrigin(0.5, 0)
      .setDepth(59);
    this.tweens.add({
      targets: [label, bg],
      alpha: 0,
      delay: 2500,
      duration: 400,
      onComplete: () => {
        label.destroy();
        bg.destroy();
      },
    });
  }

  // ─────────────────────────── State ───────────────────────────

  private get board(): Board {
    return this.draft.board;
  }

  private isTaken(id: string): boolean {
    return this.draft.takenAway.includes(id);
  }

  private commit(): void {
    // Forget marks for things that no longer exist.
    const ids = new Set([...this.board.parts.map((p) => p.id), ...this.board.wires.map((w) => w.id)]);
    this.draft.takenAway = this.draft.takenAway.filter((id) => ids.has(id));
    saveDraft(this.draft);
    this.render();
  }

  private render(): void {
    this.sprites.forEach((s) => s.destroy());
    this.sprites = [];
    for (const p of this.board.parts) {
      const { x, y } = cellToWorld(this.layout, p.pos);
      const img = this.add
        .image(x, y, partTextureKey(p.type, p.props, false, p.rot))
        .setAngle(p.rot * 90)
        .setScale(2)
        .setDepth(10)
        .setAlpha(this.isTaken(p.id) ? 0.35 : 1);
      this.sprites.push(img);
      if (p.type === 'pot') this.sprites.push(this.add.image(x, y, 'pot-knob').setScale(2).setAngle(-135).setDepth(11));
      if (p.type === 'fan') this.sprites.push(this.add.image(x, y, 'fan-blades').setScale(2).setDepth(11));
    }
    const g = this.wiresG.clear();
    for (const w of this.board.wires) drawWire(g, this.layout, w.points, w.color, this.isTaken(w.id) ? 0.35 : 1);
    this.goalIcon.setTexture(GOAL_ICONS[this.draft.goal]);
    const works = circuitWorks(this.board, this.draft.goal);
    this.status.setTxt(t(works ? 'editorWorks' : 'editorNotWorking'));
    this.status.setAlpha(works ? 1 : 0.7);
  }

  // ─────────────────────────── Input ────────────────────────────

  private paletteAt(x: number, y: number): number {
    if (y < TRAY_Y) return -1;
    const i = Math.floor((x - 4) / (PAL_W + 2));
    return i >= 0 && i < PALETTE.length && x - 4 - i * (PAL_W + 2) < PAL_W ? i : -1;
  }

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (over.length > 0 || this.drag.kind !== 'none') return;
    const start = { x: p.worldX, y: p.worldY };
    const pal = this.paletteAt(p.worldX, p.worldY);
    if (pal >= 0) {
      if (this.mode === 'build') this.drag = { kind: 'pending', pointerId: p.id, start, target: { type: 'palette', index: pal } };
      return;
    }
    if (p.worldY >= TRAY_Y) return;
    const target = pickBoardTarget(this.board, this.layout, p.worldX, p.worldY);
    if (target) this.drag = { kind: 'pending', pointerId: p.id, start, target };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (d.kind === 'none' || d.pointerId !== p.id) return;
    if (d.kind === 'pending') {
      if (Phaser.Math.Distance.Between(d.start.x, d.start.y, p.worldX, p.worldY) < 4) return;
      if (this.mode !== 'build') return;
      this.beginDrag(d.target, p);
    }
    const cur = this.drag;
    if (cur.kind === 'part') {
      cur.sprite.setPosition(p.worldX, p.worldY - 20);
    } else if (cur.kind === 'wire') {
      cur.overTray = p.worldY >= TRAY_Y;
      const cell = worldToCell(this.layout, p.worldX, p.worldY);
      cur.target = !cur.overTray && canPlaceWire(this.board, cur.anchor, cell) ? cell : null;
      const g = this.previewG.clear();
      const color = cur.original?.color ?? WIRE_COLORS[this.board.wires.length % WIRE_COLORS.length];
      if (cur.target) drawWire(g, this.layout, routeWire(this.board, cur.anchor, cur.target), color, 0.8);
      else {
        const a = cellToWorld(this.layout, cur.anchor);
        g.lineStyle(2, cur.overTray ? PAL.red : color, 0.7).lineBetween(a.x, a.y, p.worldX, p.worldY);
      }
    }
  }

  private beginDrag(target: BoardTarget | { type: 'palette'; index: number }, p: Phaser.Input.Pointer): void {
    this.drag = { kind: 'none' };
    if (target.type === 'palette') {
      const item = PALETTE[target.index];
      const part: PlacedPart = {
        id: `p${++this.draft.nextId}`,
        type: item.type,
        pos: { x: 0, y: 0 },
        rot: 0,
        fixed: false,
        props: { ...PART_DEFS[item.type].defaults, ...item.props },
      };
      this.startPartDrag(part, p);
    } else if (target.type === 'part') {
      this.board.parts = this.board.parts.filter((q) => q !== target.part);
      this.render();
      this.startPartDrag(target.part, p);
    } else if (target.type === 'hole') {
      this.drag = { kind: 'wire', pointerId: p.id, anchor: target.cell, original: null, target: null, overTray: false };
    } else {
      this.board.wires = this.board.wires.filter((w) => w !== target.wire);
      this.render();
      const anchor = wireEnds(target.wire)[target.end === 0 ? 1 : 0];
      this.drag = { kind: 'wire', pointerId: p.id, anchor, original: target.wire, target: null, overTray: false };
    }
    sfx.pickup();
  }

  private startPartDrag(part: PlacedPart, p: Phaser.Input.Pointer): void {
    const sprite = this.add
      .image(p.worldX, p.worldY - 20, partTextureKey(part.type, part.props, false, part.rot))
      .setAngle(part.rot * 90)
      .setScale(2.3)
      .setDepth(35);
    this.drag = { kind: 'part', pointerId: p.id, part, sprite };
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (d.kind === 'none' || d.pointerId !== p.id) return;
    this.drag = { kind: 'none' };
    this.previewG.clear();
    if (d.kind === 'pending') {
      this.tap(d.target);
    } else if (d.kind === 'part') {
      d.sprite.destroy();
      if (p.worldY < TRAY_Y) {
        const cell = worldToCell(this.layout, p.worldX, p.worldY - 20);
        const rot = bestRotation(this.board, { ...d.part, pos: cell });
        if (canPlacePart(this.board, { ...d.part, pos: cell, rot })) {
          d.part.pos = cell;
          d.part.rot = rot;
          this.board.parts.push(d.part);
          sfx.drop();
        } else {
          sfx.denied();
        }
      } else {
        sfx.remove();
      }
      this.commit();
    } else if (d.kind === 'wire') {
      if (d.target) {
        this.board.wires.push({
          id: d.original?.id ?? `w${++this.draft.nextId}`,
          points: routeWire(this.board, d.anchor, d.target),
          fixed: false,
          color: d.original?.color ?? WIRE_COLORS[this.board.wires.length % WIRE_COLORS.length],
        });
        sfx.connect();
      } else if (d.overTray) {
        sfx.remove();
      } else if (d.original) {
        this.board.wires.push(d.original);
      }
      this.commit();
    }
  }

  private tap(target: BoardTarget | { type: 'palette'; index: number }): void {
    if (target.type === 'palette') return;
    if (this.mode === 'take') {
      const id = target.type === 'part' ? target.part.id : target.type === 'wireEnd' ? target.wire.id : this.wireThrough(target.cell)?.id;
      if (!id) return;
      sfx.tap();
      this.draft.takenAway = this.isTaken(id) ? this.draft.takenAway.filter((x) => x !== id) : [...this.draft.takenAway, id];
      this.commit();
      return;
    }
    const part = target.type === 'part' ? target.part : target.type === 'hole' ? target.part : undefined;
    if (!part) return;
    let rot: Rot = part.rot;
    for (let i = 0; i < 3; i++) {
      rot = nextRot(rot);
      if (canPlacePart(this.board, { ...part, rot }, part.id)) {
        part.rot = rot;
        sfx.rotate();
        this.commit();
        return;
      }
    }
    sfx.denied();
  }

  /** The wire whose route passes through a hole (for tapping a wire in the middle). */
  private wireThrough(cell: Cell): Wire | undefined {
    return this.board.wires.find((w) => {
      for (let i = 1; i < w.points.length; i++) {
        if (cellsOnSegment(w.points[i - 1], w.points[i]).some((c) => sameCell(c, cell))) return true;
      }
      return false;
    });
  }

  // ─────────────────────── Try, save, export ───────────────────────

  private build() {
    const result = buildCustomLevel(this.board, new Set(this.draft.takenAway), this.draft.goal, this.draft.levelId, this.draft.number);
    if (result.problem === 'notWorking') {
      sfx.denied();
      this.toast('editorNotWorking');
    } else if (result.problem === 'nothingTakenAway') {
      sfx.denied();
      this.toast('editorNeedMark');
      this.setMode('take', true);
    }
    return result.level;
  }

  private tryIt(): void {
    const level = this.build();
    if (!level) return;
    sfx.tap();
    this.scene.start('level', { custom: level, returnTo: 'editor' });
  }

  private save(): void {
    const level = this.build();
    if (!level) return;
    saveCustomLevel(level);
    sfx.success();
    this.toast('editorSaved');
  }

  /** Downloads the level as a JSON file, ready to add to the game's levels folder. */
  private exportFile(): void {
    const level = this.build();
    if (!level) return;
    const blob = new Blob([JSON.stringify(level, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stroomkring-${level.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    sfx.tap();
    this.toast('editorExported');
  }
}
