// Dev overlay (F1 or ?debug=1): FPS, tick, camera, bird count, hitboxes (with touch aim assist),
// occluders and each bird's phase. Drawn from the snapshot + content only; never touches the sim.
import * as Phaser from 'phaser';
import type { ContentBundle } from '../content/schemas';
import { buildSlices } from '../sim/weapons/hitTest';
import type { Biome } from '../content/schemas';
import type { InputKind, PlaneId, SimState } from '../sim/types';
import type { DrawBird } from '../game/view/interpolate';
import type { ParallaxView } from '../game/view/ParallaxView';

export class DebugOverlay {
  private readonly content: ContentBundle;
  private readonly parallax: ParallaxView;
  private readonly boxes = new Map<PlaneId, Phaser.GameObjects.Graphics>();
  private readonly occluders: Phaser.GameObjects.Graphics[] = [];
  private readonly text: Phaser.GameObjects.Text;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly scene: Phaser.Scene;
  private visible = false;

  constructor(
    scene: Phaser.Scene,
    content: ContentBundle,
    biome: Biome,
    parallax: ParallaxView,
    screen: Phaser.GameObjects.Container,
  ) {
    this.scene = scene;
    this.content = content;
    this.parallax = parallax;
    for (const p of ['near', 'mid', 'far'] as const) {
      const g = scene.add.graphics();
      parallax.plane(p).overlay?.add(g);
      this.boxes.set(p, g);
    }
    for (const slice of buildSlices(biome)) {
      const layer = parallax.layers.find((l) => l.id === slice.layerId);
      if (!layer || slice.occluders.length === 0) continue;
      const g = scene.add.graphics();
      g.lineStyle(3, 0xff00ff, 0.9);
      for (const o of slice.occluders) {
        if (o.shape.type === 'rect')
          g.strokeRect(o.x - o.shape.w / 2, o.y - o.shape.h / 2, o.shape.w, o.shape.h);
        else g.strokeEllipse(o.x, o.y, o.shape.rx * 2, o.shape.ry * 2);
      }
      layer.root.add(g);
      this.occluders.push(g);
    }
    this.text = scene.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '24px',
      color: '#00ff88',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 8, y: 6 },
    });
    screen.add(this.text);
    this.setVisible(false);
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.text.setVisible(on);
    for (const g of this.boxes.values()) g.setVisible(on);
    for (const g of this.occluders) g.setVisible(on);
    for (const l of this.labels) l.setVisible(on);
  }

  get shown(): boolean {
    return this.visible;
  }

  update(
    state: SimState,
    birds: readonly DrawBird[],
    inputKind: InputKind,
    x: number,
    y: number,
    /** v1.6 (D-042): e.g. "art: interim · 1 placeholder". */
    art = '',
  ): void {
    if (!this.visible) return;
    const planes = this.content.scoring.planes;
    for (const g of this.boxes.values()) g.clear();
    let li = 0;
    for (const b of birds) {
      const c = this.content.birds.creatures.find((cr) => cr.id === b.view.creature);
      const g = this.boxes.get(b.view.plane);
      if (!c || c.kind === 'helper' || !g) continue;
      const s = planes[b.view.plane].scale;
      const a = inputKind === 'touch' ? planes[b.view.plane].aimAssistPx : 0;
      const f = b.view.facing;
      g.lineStyle(2, b.view.hittable ? 0x00ff88 : 0xff4444, 1);
      const body = c.hitbox.body;
      g.strokeEllipse(
        b.x + body.ox * s * f,
        b.y + body.oy * s,
        (body.rx * s + a) * 2,
        (body.ry * s + a) * 2,
      );
      const head = c.hitbox.head;
      if (head) g.strokeCircle(b.x + head.ox * s * f, b.y + head.oy * s, head.r * s + a);
      let label = this.labels[li];
      if (!label) {
        label = this.scene.add.text(0, 0, '', {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#ffffff',
        });
        this.labels.push(label);
      }
      const overlay = this.parallax.plane(b.view.plane).overlay;
      if (label.parentContainer !== overlay) overlay?.add(label);
      label
        .setVisible(true)
        .setPosition(b.x, b.y + body.ry * s + 6)
        .setText(
          `#${b.view.id}${b.view.flockId === null ? '' : ` f${b.view.flockId}`} ${b.view.phase} ${b.view.behaviour}`,
        );
      li++;
    }
    for (; li < this.labels.length; li++) this.labels[li]?.setVisible(false);
    const fps = this.scene.game.loop.actualFps.toFixed(0);
    this.text
      .setPosition(x, y)
      .setText(
        `FPS ${fps}  tick ${state.tick}/${state.durationTicks}  cam ${state.cameraX.toFixed(1)}  birds ${state.birds.length}  input ${inputKind}${art === '' ? '' : `  ${art}`}\nflocks ${state.flocks.map((f) => `f${f.id} ${f.state} ${f.alive}/${f.spawnSize}${f.eligible ? '' : ' ✗'}`).join(' · ') || '—'}`,
      );
  }
}
