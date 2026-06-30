// Renders gameplay markers (enemy spawns, bosses, Oathstones, the player spawn and the
// village) as distinct labelled gizmos, and picks them for selection/move/delete. These
// are editor-only overlays — the game places real entities from the same data on load.

import * as THREE from 'three';
import type { EditorTerrain } from './terrain';
import type { EditorState } from '../editor/state';
import type { CritterType } from '../format/map';
import { buildPlayerModel } from '../oathbound/player-model';

export type MarkerType = 'spawn' | 'boss' | 'oathstone' | 'player' | 'village' | 'npc' | 'critter';
export interface MarkerRef {
  type: MarkerType;
  index: number;
}

const labelCache = new Map<string, THREE.SpriteMaterial>();

function labelSprite(text: string, color: string): THREE.Sprite {
  const key = `${text}|${color}`;
  let mat = labelCache.get(key);
  if (!mat) {
    const canvas = document.createElement('canvas');
    const pad = 12;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '600 30px system-ui, sans-serif';
    const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
    canvas.width = w;
    canvas.height = 48;
    const c = canvas.getContext('2d')!;
    c.font = '600 30px system-ui, sans-serif';
    c.fillStyle = 'rgba(12,16,22,0.78)';
    roundRect(c, 0, 0, w, 48, 9);
    c.fill();
    c.fillStyle = color;
    c.textBaseline = 'middle';
    c.fillText(text, pad, 25);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    mat.userData.aspect = w / 48;
    labelCache.set(key, mat);
  }
  const sprite = new THREE.Sprite(mat);
  const aspect = (mat.userData.aspect as number) ?? 3;
  sprite.scale.set(aspect * 3.2, 3.2, 1);
  sprite.renderOrder = 999;
  return sprite;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** NPC robe tints by variant (villager / guard / merchant / elder). */
export const NPC_TINTS = [0x5b7da8, 0x8a8f99, 0x9c6b3f, 0x6a5a72];
const SKIN_MAT = new THREE.MeshLambertMaterial({ color: 0xe0b48c });
const ROUTE_MAT = new THREE.LineBasicMaterial({ color: 0x6fe0a0, transparent: true, opacity: 0.85, depthTest: false });

// Ambient critter zones — shared materials so frequent marker rebuilds don't leak.
const CRITTER_COLORS: Record<string, number> = { birds: 0x9aa1ad, critters: 0x8a7a5a, butterflies: 0xff7ab0, fireflies: 0xffe066 };
const CRITTER_LABELS: Record<string, string> = { birds: 'Birds', critters: 'Critters', butterflies: 'Butterflies', fireflies: 'Fireflies' };
const CRITTER_RING_MATS: Record<string, THREE.MeshBasicMaterial> = {};
const CRITTER_ICON_MATS: Record<string, THREE.Material> = {};
for (const [t, c] of Object.entries(CRITTER_COLORS)) {
  CRITTER_RING_MATS[t] = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthTest: false });
  CRITTER_ICON_MATS[t] = new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide, ...(t === 'fireflies' ? { emissive: c, emissiveIntensity: 0.8 } : {}) });
}

function critterIcon(type: CritterType): THREE.Object3D {
  const mat = CRITTER_ICON_MATS[type];
  const g = new THREE.Group();
  if (type === 'birds') {
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 5), mat);
    body.rotation.x = Math.PI / 2;
    g.add(body, new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.22), mat));
  } else if (type === 'critters') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.3), mat);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.12), mat);
    head.position.set(0, 0.04, 0.2);
    g.add(body, head);
  } else if (type === 'butterflies') {
    const w1 = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.22), mat);
    w1.position.x = 0.08; w1.rotation.y = 0.5;
    const w2 = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.22), mat);
    w2.position.x = -0.08; w2.rotation.y = -0.5;
    g.add(w1, w2);
  } else {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat));
  }
  return g;
}

const SPAWN_MAT = new THREE.MeshLambertMaterial({ color: 0xd64545 });
const BOSS_MAT = new THREE.MeshLambertMaterial({ color: 0xb145d6 });
const OATH_MAT = new THREE.MeshLambertMaterial({ color: 0x45a0d6 });
const PLAYER_MAT = new THREE.MeshLambertMaterial({ color: 0x4cd672 });
const VILLAGE_MAT = new THREE.MeshLambertMaterial({ color: 0xcaa46a });

export class MarkerLayer {
  readonly group = new THREE.Group();
  private refs: { root: THREE.Object3D; ref: MarkerRef }[] = [];

  constructor() {
    this.group.name = 'markers';
  }

  private clear(): void {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    }
    this.refs = [];
  }

  private add(root: THREE.Object3D, ref: MarkerRef): void {
    root.traverse((o) => (o.userData.pickRoot = root));
    this.group.add(root);
    this.refs.push({ root, ref });
  }

  rebuild(state: EditorState, terrain: EditorTerrain): void {
    this.clear();

    state.spawns.forEach((s, i) => {
      const g = new THREE.Group();
      const pin = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 6), SPAWN_MAT);
      pin.position.y = 1.2;
      pin.rotation.x = Math.PI;
      g.add(pin);
      const label = labelSprite(`${s.name ?? s.id} · Lv${s.level}${s.tier ? ` ${s.tier[0].toUpperCase()}` : ''}`, '#ffd9d9');
      label.position.y = 3.4;
      g.add(label);
      g.position.set(s.x, terrain.heightAt(s.x, s.z), s.z);
      this.add(g, { type: 'spawn', index: i });
    });

    state.bosses.forEach((b, i) => {
      const g = new THREE.Group();
      const pin = new THREE.Mesh(new THREE.ConeGeometry(1.8, 4.5, 6), BOSS_MAT);
      pin.position.y = 2.25;
      pin.rotation.x = Math.PI;
      g.add(pin);
      const label = labelSprite(`BOSS · ${b.id}`, '#f0caff');
      label.position.y = 5.6;
      g.add(label);
      g.position.set(b.x, terrain.heightAt(b.x, b.z), b.z);
      this.add(g, { type: 'boss', index: i });
    });

    state.oathstones.forEach((o, i) => {
      const g = new THREE.Group();
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.2, 1.1), OATH_MAT);
      pillar.position.y = 1.6;
      g.add(pillar);
      const label = labelSprite(`◈ ${o.name}`, '#d6efff');
      label.position.y = 4.4;
      g.add(label);
      g.position.set(o.x, terrain.heightAt(o.x, o.z), o.z);
      this.add(g, { type: 'oathstone', index: i });
    });

    {
      const p = state.playerSpawn;
      const g = new THREE.Group();
      // The real player avatar at true 1:1 scale — a size reference for assets.
      g.add(buildPlayerModel());
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 28).rotateX(-Math.PI / 2), PLAYER_MAT);
      ring.position.y = 0.03;
      g.add(ring);
      const label = labelSprite('▶ Player Spawn · ~2.4m (1:1)', '#d2ffe0');
      label.position.y = 3.0;
      g.add(label);
      g.position.set(p.x, terrain.heightAt(p.x, p.z), p.z);
      this.add(g, { type: 'player', index: 0 });
    }

    if (state.village) {
      const v = state.village;
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 3.2), VILLAGE_MAT);
      base.position.y = 1.2;
      g.add(base);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3, 1.8, 4), new THREE.MeshLambertMaterial({ color: 0x8a5a3a }));
      roof.position.y = 3.2;
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      const label = labelSprite('⌂ Oathhold Town', '#ffe9c8');
      label.position.y = 5.0;
      g.add(label);
      g.position.set(v.x, terrain.heightAt(v.x, v.z), v.z);
      g.rotation.y = v.rot;
      this.add(g, { type: 'village', index: 0 });
    }

    // Friendly NPCs: a small figure + name label, plus a route line if they patrol.
    state.npcs.forEach((npc, i) => {
      const g = new THREE.Group();
      const robe = new THREE.MeshLambertMaterial({ color: NPC_TINTS[npc.variant ?? 0] ?? NPC_TINTS[0] });
      const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.7, 6), robe);
      legs.position.y = 0.35;
      g.add(legs);
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.8, 7), robe);
      torso.position.y = 1.0;
      g.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), SKIN_MAT);
      head.position.y = 1.6;
      g.add(head);
      const label = labelSprite(`☺ ${npc.name}`, '#cdeedd');
      label.position.y = 2.4;
      g.add(label);
      g.position.set(npc.x, terrain.heightAt(npc.x, npc.z), npc.z);
      this.add(g, { type: 'npc', index: i });

      if (npc.route.length) {
        const pts = [{ x: npc.x, z: npc.z }, ...npc.route, { x: npc.x, z: npc.z }];
        const arr: number[] = [];
        for (const p of pts) arr.push(p.x, terrain.heightAt(p.x, p.z) + 0.4, p.z);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        const line = new THREE.Line(geo, ROUTE_MAT);
        line.renderOrder = 996;
        this.group.add(line);
      }
    });

    // Ambient critter zones: a radius ring + a few sample creatures + a count label.
    state.critters.forEach((cr, i) => {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.5, cr.radius * 0.96), Math.max(0.6, cr.radius), 44).rotateX(-Math.PI / 2),
        CRITTER_RING_MATS[cr.type] ?? CRITTER_RING_MATS.birds,
      );
      ring.position.y = 0.1;
      ring.renderOrder = 995;
      g.add(ring);
      const yBase = cr.type === 'birds' ? 3.5 : cr.type === 'critters' ? 0.25 : 1.3;
      const r = cr.radius;
      for (const [ox, oz] of [[0, 0], [r * 0.4, r * 0.2], [-r * 0.35, -r * 0.3]] as [number, number][]) {
        const ic = critterIcon(cr.type);
        ic.position.set(ox, yBase, oz);
        g.add(ic);
      }
      const col = (CRITTER_COLORS[cr.type] ?? 0xffffff).toString(16).padStart(6, '0');
      const label = labelSprite(`${CRITTER_LABELS[cr.type] ?? cr.type} ×${cr.count}`, `#${col}`);
      label.position.y = Math.max(2.2, yBase + 1.0);
      g.add(label);
      g.position.set(cr.x, terrain.heightAt(cr.x, cr.z), cr.z);
      this.add(g, { type: 'critter', index: i });
    });
  }

  pick(raycaster: THREE.Raycaster): MarkerRef | null {
    const hits = raycaster.intersectObjects(this.group.children, true);
    for (const h of hits) {
      const root = h.object.userData.pickRoot as THREE.Object3D | undefined;
      const found = this.refs.find((r) => r.root === root);
      if (found) return found.ref;
    }
    return null;
  }
}
