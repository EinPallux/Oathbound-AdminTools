// The Editor controller: owns the viewport, the terrain and the render layers, routes
// pointer input to the active tool, runs the per-frame flush/rebuild, and exposes the
// API tools use to mutate state + history. UI is wired separately (see ui/*).

import * as THREE from 'three';
import { Viewport } from '../engine/viewport';
import { EditorTerrain } from '../engine/terrain';
import { AssetLayer } from '../engine/asset-render';
import { WaterRoadLayer } from '../engine/water-road';
import { MarkerLayer, type MarkerRef } from '../engine/markers';
import { EditorState, DEFAULT_RES, DEFAULT_SIZE } from './state';
import { History } from './history';
import type { Tool } from './tool';
import { TOOLS } from './tools';

export interface BrushSettings {
  size: number;
  strength: number;
}
export interface PlacementSettings {
  asset: string;
  scale: number;
  jitterRot: boolean;
  jitterScale: number;
  scatterCount: number;
  scatterRadius: number;
  /** Additive vertical offset applied to newly placed assets. */
  y: number;
}

export class Editor {
  readonly viewport: Viewport;
  terrain: EditorTerrain;
  state = new EditorState();
  readonly history = new History();
  readonly tools = TOOLS;
  activeTool: Tool;

  readonly brush: BrushSettings = { size: 18, strength: 1 };
  paint = { biome: 0 };
  readonly placement: PlacementSettings = {
    asset: 'tree:0',
    scale: 2,
    jitterRot: true,
    jitterScale: 0.25,
    scatterCount: 1,
    scatterRadius: 6,
    y: 0,
  };

  /** Current selection (asset placement index, or a marker) for the Select tool. */
  selectedAsset: number | null = null;
  selectedMarker: MarkerRef | null = null;
  /** Grid snapping for placing/moving (helps align buildings into neat towns). */
  readonly snap = { enabled: false, grid: 1 };

  /** Snap a world coordinate to the grid if snapping is on. */
  snapVal(v: number): number {
    return this.snap.enabled && this.snap.grid > 0 ? Math.round(v / this.snap.grid) * this.snap.grid : v;
  }

  private readonly assetLayer = new AssetLayer();
  private readonly waterLayer = new WaterRoadLayer();
  readonly markerLayer = new MarkerLayer();
  private readonly worldGroup = new THREE.Group();
  private brushGizmo: THREE.Object3D;

  private assetsDirty = false;
  private waterDirty = false;
  private markersDirty = false;

  /** UI hooks. */
  onStatus: ((msg: string) => void) | null = null;
  onToolChange: ((tool: Tool) => void) | null = null;
  onStateChange: (() => void) | null = null;

  private dragging = false;

  constructor(canvas: HTMLCanvasElement) {
    this.viewport = new Viewport(canvas);
    this.terrain = new EditorTerrain(DEFAULT_SIZE, DEFAULT_RES);
    this.activeTool = this.tools[0];

    // Orbit on right/middle drag; left is reserved for paint tools.
    this.viewport.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.viewport.controls.screenSpacePanning = true;

    this.viewport.scene.add(this.worldGroup);
    this.worldGroup.add(this.terrain.mesh);
    this.worldGroup.add(this.waterLayer.group);
    this.worldGroup.add(this.assetLayer.group);
    this.worldGroup.add(this.markerLayer.group);
    this.addWorldBounds();

    this.brushGizmo = this.makeBrushGizmo();
    this.viewport.scene.add(this.brushGizmo);

    this.history.onChange = () => this.onStateChange?.();
    this.bindPointer(canvas);
    this.bindKeys();

    this.markAllDirty();
    this.activeTool.onActivate?.(this);
    this.viewport.start((dt) => this.frame(dt));
  }

  // ── World scaffolding ─────────────────────────────────────────────────────-

  private worldBounds: THREE.LineSegments | null = null;
  private addWorldBounds(): void {
    if (this.worldBounds) {
      this.worldGroup.remove(this.worldBounds);
      this.worldBounds.geometry.dispose();
    }
    const h = this.state.size / 2;
    const y = 0.5;
    const pts = [
      [-h, y, -h], [h, y, -h], [h, y, -h], [h, y, h],
      [h, y, h], [-h, y, h], [-h, y, h], [-h, y, -h],
    ].flat();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.worldBounds = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.worldBounds.name = 'world-bounds';
    this.worldGroup.add(this.worldBounds);
  }

  private makeBrushGizmo(): THREE.Object3D {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }),
    );
    ring.name = 'ring';
    ring.renderOrder = 998;
    // Square outline (unit half-extents, scaled by radius) for square / mesa brushes.
    const square = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 0, -1),
        new THREE.Vector3(1, 0, 1), new THREE.Vector3(-1, 0, 1),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9, depthTest: false }),
    );
    square.name = 'square';
    square.renderOrder = 998;
    square.visible = false;
    group.add(ring, square);
    group.renderOrder = 998;
    group.visible = false;
    return group;
  }

  /** Position + size the brush preview. `square` swaps the round ring for a square outline. */
  showBrush(x: number, z: number, radius: number, square = false): void {
    this.brushGizmo.visible = true;
    this.brushGizmo.position.set(x, this.terrain.heightAt(x, z) + 0.3, z);
    this.brushGizmo.scale.setScalar(Math.max(0.5, radius));
    const ring = this.brushGizmo.getObjectByName('ring');
    const sq = this.brushGizmo.getObjectByName('square');
    if (ring) ring.visible = !square;
    if (sq) sq.visible = square;
  }
  hideBrush(): void {
    this.brushGizmo.visible = false;
  }

  // ── Frame loop ────────────────────────────────────────────────────────────-

  private frame(_dt: number): void {
    this.terrain.flush();
    if (this.assetsDirty) {
      this.assetLayer.rebuild(this.state.assets, this.state.customAssets, this.terrain);
      this.assetsDirty = false;
    }
    if (this.waterDirty) {
      this.waterLayer.rebuild(this.state.lakes, this.state.rivers, this.state.roads, this.terrain);
      this.waterDirty = false;
    }
    if (this.markersDirty) {
      this.markerLayer.rebuild(this.state, this.terrain);
      this.markersDirty = false;
    }
  }

  markTerrainDirty(): void {
    this.terrain.markDirty();
  }
  markAssetsDirty(): void {
    this.assetsDirty = true;
  }
  markWaterDirty(): void {
    this.waterDirty = true;
  }
  markMarkersDirty(): void {
    this.markersDirty = true;
  }
  /** After a terrain edit, dependent layers must re-seat on the new heights. */
  reseatLayers(): void {
    this.assetsDirty = true;
    this.waterDirty = true;
    this.markersDirty = true;
  }
  markAllDirty(): void {
    this.terrain.markDirty();
    this.reseatLayers();
  }

  // ── Tools / input ───────────────────────────────────────────────────────────

  setTool(id: string): void {
    const tool = this.tools.find((t) => t.id === id);
    if (!tool || tool === this.activeTool) {
      if (tool) this.onToolChange?.(tool);
      return;
    }
    this.activeTool.onDeactivate?.(this);
    this.activeTool = tool;
    this.hideBrush();
    tool.onActivate?.(this);
    this.onToolChange?.(tool);
  }

  private bindPointer(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (ev) => {
      if (ev.button === 0 && this.activeTool.dragPaints) {
        this.viewport.enableControls(false);
        this.dragging = true;
      }
      this.activeTool.onPointerDown?.(this, ev);
    });
    canvas.addEventListener('pointermove', (ev) => {
      this.activeTool.onPointerMove?.(this, ev);
    });
    const end = (ev: PointerEvent): void => {
      this.activeTool.onPointerUp?.(this, ev);
      if (this.dragging) {
        this.viewport.enableControls(true);
        this.dragging = false;
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointerleave', (ev) => {
      if (this.dragging) end(ev);
      this.hideBrush();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (ev) => {
      const target = ev.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && ev.key.toLowerCase() === 'z' && !ev.shiftKey) {
        ev.preventDefault();
        this.history.undo();
        this.markAllDirty();
        this.onStateChange?.();
      } else if (mod && (ev.key.toLowerCase() === 'y' || (ev.key.toLowerCase() === 'z' && ev.shiftKey))) {
        ev.preventDefault();
        this.history.redo();
        this.markAllDirty();
        this.onStateChange?.();
      } else if (ev.key === '[') {
        this.brush.size = Math.max(1, this.brush.size - 2);
      } else if (ev.key === ']') {
        this.brush.size = Math.min(120, this.brush.size + 2);
      } else if (mod && ev.key.toLowerCase() === 'd') {
        ev.preventDefault();
        if (this.selectedAsset != null) this.duplicateAsset(this.selectedAsset);
      } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
        if (this.selectedAsset != null) this.deleteAsset(this.selectedAsset);
        else if (this.selectedMarker) this.deleteMarker(this.selectedMarker);
      }
    });
  }

  /** Raycast the terrain under a pointer event; returns the world point or null. */
  groundPoint(ev: PointerEvent | MouseEvent): THREE.Vector3 | null {
    const hit = this.viewport.raycast(ev, [this.terrain.mesh]);
    return hit ? hit.point.clone() : null;
  }

  pickAsset(ev: PointerEvent): number | null {
    return this.assetLayer.pick(this.viewport.raycasterFrom(ev));
  }
  pickMarker(ev: PointerEvent): ReturnType<MarkerLayer['pick']> {
    return this.markerLayer.pick(this.viewport.raycasterFrom(ev));
  }

  // ── State mutation helpers (with history) ────────────────────────────────-

  /** Append items to a state array as one undoable command. */
  addItems<T>(arr: T[], items: T[], label: string, after: () => void): void {
    if (!items.length) return;
    const start = arr.length;
    this.history.apply({
      label,
      redo: () => {
        arr.push(...items);
        after();
        this.onStateChange?.();
      },
      undo: () => {
        arr.splice(start, items.length);
        after();
        this.onStateChange?.();
      },
    });
  }

  /** Remove one item from a state array as one undoable command. */
  removeIndex<T>(arr: T[], index: number, label: string, after: () => void): void {
    if (index < 0 || index >= arr.length) return;
    const item = arr[index];
    this.history.apply({
      label,
      redo: () => {
        arr.splice(index, 1);
        after();
        this.onStateChange?.();
      },
      undo: () => {
        arr.splice(index, 0, item);
        after();
        this.onStateChange?.();
      },
    });
  }

  deleteAsset(index: number): void {
    this.removeIndex(this.state.assets, index, 'Delete asset', () => {
      this.selectedAsset = null;
      this.markAssetsDirty();
    });
  }

  /** Duplicate a placed asset (offset a little) and select the copy. */
  duplicateAsset(index: number): void {
    const a = this.state.assets[index];
    if (!a) return;
    const off = this.snap.enabled ? this.snap.grid : 2;
    const copy = { ...a, x: a.x + off, z: a.z + off };
    const start = this.state.assets.length;
    this.history.apply({
      label: 'Duplicate asset',
      redo: () => { this.state.assets.splice(start, 0, copy); this.selectedAsset = start; this.markAssetsDirty(); this.onStateChange?.(); },
      undo: () => { this.state.assets.splice(start, 1); this.selectedAsset = null; this.markAssetsDirty(); this.onStateChange?.(); },
    });
  }

  deleteMarker(ref: MarkerRef): void {
    const s = this.state;
    const after = (): void => {
      this.selectedMarker = null;
      this.markMarkersDirty();
    };
    if (ref.type === 'spawn') this.removeIndex(s.spawns, ref.index, 'Delete spawn', after);
    else if (ref.type === 'boss') this.removeIndex(s.bosses, ref.index, 'Delete boss', after);
    else if (ref.type === 'oathstone') this.removeIndex(s.oathstones, ref.index, 'Delete Oathstone', after);
    else if (ref.type === 'npc') this.removeIndex(s.npcs, ref.index, 'Delete NPC', after);
    else if (ref.type === 'critter') this.removeIndex(s.critters, ref.index, 'Delete critters', after);
    else if (ref.type === 'village') {
      const had = s.village;
      if (!had) return;
      this.history.apply({
        label: 'Remove village',
        redo: () => { s.village = null; after(); this.onStateChange?.(); },
        undo: () => { s.village = had; this.markMarkersDirty(); this.onStateChange?.(); },
      });
    }
  }

  setStatus(msg: string): void {
    this.onStatus?.(msg);
  }

  // ── New / load / resize ───────────────────────────────────────────────────-

  /** Replace the world with a fresh blank map of the given dimensions. */
  newMap(name: string, size: number, res: number): void {
    this.swapTerrain(new EditorTerrain(size, res));
    this.state = new EditorState();
    this.state.name = name;
    this.state.size = size;
    this.state.res = res;
    this.selectedAsset = null;
    this.history.clear();
    this.addWorldBounds();
    this.markAllDirty();
    this.onStateChange?.();
    this.setStatus(`New map “${name}” (${size}m, ${res}²)`);
  }

  /**
   * Resize the world extent and/or grid resolution, resampling the existing terrain +
   * biome into the new grid at the same world coordinates. All placed content keeps its
   * world position (content outside a shrunk extent is kept but sits beyond the edge).
   */
  resizeMap(size: number, res: number): void {
    const old = this.terrain;
    const next = new EditorTerrain(size, res);
    const half = size / 2;
    const cell = size / (res - 1);
    for (let z = 0; z < res; z++) {
      for (let x = 0; x < res; x++) {
        const wx = -half + x * cell;
        const wz = -half + z * cell;
        const idx = z * res + x;
        next.heights[idx] = old.heightAt(wx, wz); // bilinear, clamps to the old edges
        next.biomes[idx] = old.biomeAt(wx, wz);
        next.water[idx] = old.waterAt(wx, wz); // nearest (NaN where dry)
      }
    }
    next.refresh();
    this.swapTerrain(next);
    this.state.size = size;
    this.state.res = res;
    this.history.clear(); // a resample isn't cheaply invertible
    this.addWorldBounds();
    this.markAllDirty();
    this.onStateChange?.();
    this.setStatus(`Resized to ${size}m · ${res}² (content preserved)`);
  }

  /** Replace the whole height grid (e.g. from a heightmap import) — one undoable step. */
  applyHeights(next: Float32Array): void {
    if (next.length !== this.terrain.heights.length) {
      this.setStatus(`Heightmap size mismatch (expected ${this.terrain.res}² cells).`);
      return;
    }
    const before = this.terrain.heights.slice();
    const after = next.slice();
    const apply = (arr: Float32Array): void => {
      this.terrain.heights.set(arr);
      this.terrain.refresh();
      this.reseatLayers();
      this.onStateChange?.();
    };
    this.history.apply({ label: 'Import heightmap', redo: () => apply(after), undo: () => apply(before) });
    this.setStatus('Heightmap applied — terrain reshaped.');
  }

  /** Load decoded terrain + state (from an imported/loaded map). */
  loadState(state: EditorState, heights: Float32Array, biomes: Uint8Array, water?: Float32Array | null): void {
    this.swapTerrain(new EditorTerrain(state.size, state.res));
    this.terrain.load(heights, biomes, water);
    this.state = state;
    this.selectedAsset = null;
    this.history.clear();
    this.addWorldBounds();
    this.markAllDirty();
    this.onStateChange?.();
    this.setStatus(`Loaded “${state.name}”`);
  }

  private swapTerrain(next: EditorTerrain): void {
    this.worldGroup.remove(this.terrain.mesh);
    this.terrain.dispose();
    this.terrain = next;
    this.worldGroup.add(this.terrain.mesh);
  }
}
