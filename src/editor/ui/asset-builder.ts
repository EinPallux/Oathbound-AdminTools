// Asset Builder: compose a custom low-poly prop from primitives (box / cylinder / cone /
// sphere / icosahedron), each with a colour and transform, with a live spinning preview.
// Saving adds it to the map's customAssets so it appears in the asset library and exports
// with the map (the game builds the same merged geometry on load).

import * as THREE from 'three';
import type { Editor } from '../editor';
import type { AssetCategory, AssetDef, AssetPart, PrimitiveShape } from '../../format/map';
import { customAssetGeometry } from '../../oathbound/geometry';
import { invalidateAssetGeometry } from '../../engine/asset-render';
import { invalidateThumbnail } from '../../engine/thumbnails';
import { el, button, row, select } from './dom';
import { modal, closeModal } from './app';

const SHAPES: PrimitiveShape[] = ['box', 'cylinder', 'cone', 'sphere', 'icosahedron'];
const DIM_LABELS: Record<PrimitiveShape, [string, string, string]> = {
  box: ['Width', 'Height', 'Depth'],
  cylinder: ['Top R', 'Bottom R', 'Height'],
  cone: ['Radius', 'Height', '—'],
  sphere: ['Radius', '—', '—'],
  icosahedron: ['Radius', 'Detail', '—'],
};
const CATEGORIES: AssetCategory[] = ['tree', 'plant', 'rock', 'structure', 'misc'];

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}
function clone(def: AssetDef): AssetDef {
  return { ...def, parts: def.parts.map((p) => ({ ...p, dims: [...p.dims] as [number, number, number], pos: [...p.pos] as [number, number, number], rot: [...p.rot] as [number, number, number] })) };
}
function newPart(): AssetPart {
  return { shape: 'box', color: 0x8aa86a, dims: [1, 1, 1], pos: [0, 0.5, 0], rot: [0, 0, 0], flat: true };
}
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
}

class MiniPreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private mesh: THREE.Mesh | null = null;
  private raf = 0;
  private angle = 0.6;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.scene.background = new THREE.Color(0x1a2230);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x40463a, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(4, 8, 5);
    this.scene.add(sun);
    const grid = new THREE.GridHelper(6, 6, 0x44506a, 0x2c3550);
    this.scene.add(grid);
  }

  resize(): void {
    const w = this.canvas.clientWidth || 360;
    const h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setParts(parts: AssetPart[]): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (!parts.length) return;
    const geo = customAssetGeometry({ id: 'preview', name: '', category: 'misc', parts, collider: null });
    geo.computeBoundingBox();
    this.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.scene.add(this.mesh);
    // Frame the model.
    const box = geo.boundingBox!;
    const h = Math.max(1, box.max.y - box.min.y, box.max.x - box.min.x, box.max.z - box.min.z);
    this.camera.position.set(h * 1.6, h * 1.3, h * 1.9);
    this.camera.lookAt(0, h * 0.4, 0);
  }

  start(): void {
    const tick = (): void => {
      this.raf = requestAnimationFrame(tick);
      this.angle += 0.01;
      if (this.mesh) this.mesh.rotation.y = this.angle;
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(tick);
  }
  stop(): void {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}

export function openAssetBuilder(editor: Editor): void {
  let def: AssetDef = { id: '', name: 'New Asset', category: 'misc', parts: [newPart()], collider: null };

  const canvas = el('canvas', { class: 'builder-canvas' }) as HTMLCanvasElement;
  const partsWrap = el('div', { class: 'parts-list' });
  const preview = new MiniPreview(canvas);

  const refresh = (): void => {
    preview.setParts(def.parts);
    renderParts();
  };

  function renderParts(): void {
    partsWrap.replaceChildren();
    def.parts.forEach((part, i) => {
      partsWrap.append(partEditor(part, i));
    });
  }

  function vecInputs(label: string, vec: [number, number, number], labels: [string, string, string], step: number, onChange: () => void): HTMLElement {
    const mk = (k: number): HTMLInputElement => {
      const inp = el('input', { type: 'number', value: vec[k], step }) as HTMLInputElement;
      inp.title = labels[k];
      inp.addEventListener('input', () => { vec[k] = parseFloat(inp.value || '0'); onChange(); });
      return inp;
    };
    return el('div', { class: 'vec-row' }, [
      el('span', { class: 'row-label', text: label }),
      el('div', { class: 'vec3' }, [mk(0), mk(1), mk(2)]),
    ]);
  }

  function partEditor(part: AssetPart, i: number): HTMLElement {
    const wrap = el('div', { class: 'part-card' });
    const dimRow = el('div', {});
    const renderDims = (): void => {
      dimRow.replaceChildren(vecInputs('Dims', part.dims, DIM_LABELS[part.shape], 0.05, refresh));
    };
    renderDims();
    const colorInput = el('input', { type: 'color', value: hex(part.color) }) as HTMLInputElement;
    colorInput.addEventListener('input', () => { part.color = parseInt(colorInput.value.slice(1), 16); refresh(); });

    wrap.append(
      el('div', { class: 'part-head' }, [
        el('b', { text: `Part ${i + 1}` }),
        button('✕', () => { def.parts.splice(i, 1); refresh(); }, 'icon danger'),
      ]),
      select('Shape', SHAPES.map((s) => ({ value: s, label: s })), part.shape, (v) => { part.shape = v as PrimitiveShape; renderDims(); refresh(); }),
      row('Colour', colorInput),
      dimRow,
      vecInputs('Position', part.pos, ['X', 'Y', 'Z'], 0.05, refresh),
      vecInputs('Rotation', part.rot, ['X', 'Y', 'Z'], 0.05, refresh),
    );
    return wrap;
  }

  // Header form (name / category / collider) + existing-asset loader.
  const nameInput = el('input', { type: 'text', value: def.name }) as HTMLInputElement;
  nameInput.addEventListener('input', () => (def.name = nameInput.value));
  const colliderInput = el('input', { type: 'number', value: 0, min: 0, step: 0.1 }) as HTMLInputElement;
  colliderInput.addEventListener('input', () => {
    const v = parseFloat(colliderInput.value || '0');
    def.collider = v > 0 ? v : null;
  });
  const boxWInput = el('input', { type: 'number', value: 0, min: 0, step: 0.1 }) as HTMLInputElement;
  const boxDInput = el('input', { type: 'number', value: 0, min: 0, step: 0.1 }) as HTMLInputElement;
  const syncBox = (): void => {
    const w = parseFloat(boxWInput.value || '0');
    const d = parseFloat(boxDInput.value || '0');
    def.box = w > 0 && d > 0 ? { hw: w / 2, hd: d / 2 } : null;
  };
  boxWInput.addEventListener('input', syncBox);
  boxDInput.addEventListener('input', syncBox);
  const boxRow = el('div', { class: 'vec3' }, [boxWInput, boxDInput]);

  const loadExisting = (id: string): void => {
    const existing = editor.state.customAssets.find((d) => d.id === id);
    if (existing) {
      def = clone(existing);
      nameInput.value = def.name;
      colliderInput.value = String(def.collider ?? 0);
      boxWInput.value = String(def.box ? def.box.hw * 2 : 0);
      boxDInput.value = String(def.box ? def.box.hd * 2 : 0);
      catSel.value = def.category;
    }
    refresh();
  };
  const existingOptions = [{ value: '', label: '➕ New asset' }, ...editor.state.customAssets.map((d) => ({ value: d.id, label: d.name }))];
  const existingRow = select('Edit', existingOptions, '', (v) => { if (v) loadExisting(v); });
  const catSel = el('select', {}) as HTMLSelectElement;
  for (const c of CATEGORIES) {
    const o = el('option', { value: c, text: c }) as HTMLOptionElement;
    if (c === def.category) o.selected = true;
    catSel.append(o);
  }
  catSel.addEventListener('change', () => (def.category = catSel.value as AssetCategory));

  const left = el('div', { class: 'builder-left' }, [
    existingRow,
    row('Name', nameInput),
    row('Category', catSel),
    row('Collider radius (0 = none)', colliderInput),
    row('Solid box W × D (0 = none)', boxRow),
    el('div', { class: 'parts-head' }, [el('h3', { text: 'Parts' }), button('+ Add part', () => { def.parts.push(newPart()); refresh(); })]),
    partsWrap,
  ]);
  const right = el('div', { class: 'builder-right' }, [canvas, el('p', { class: 'hint', text: 'Live preview (auto-rotating). Base sits on the grid (y=0).' })]);
  const body = el('div', { class: 'builder' }, [left, right]);

  const save = (asNew: boolean): void => {
    if (!def.parts.length) {
      editor.setStatus('Add at least one part before saving.');
      return;
    }
    const base = slugify(def.name);
    const existingIds = new Set(editor.state.customAssets.map((d) => d.id));
    if (asNew || !def.id) {
      let id = base;
      let n = 2;
      while (existingIds.has(id)) id = `${base}-${n++}`;
      def.id = id;
      editor.state.customAssets.push(clone(def));
    } else {
      const idx = editor.state.customAssets.findIndex((d) => d.id === def.id);
      if (idx >= 0) editor.state.customAssets[idx] = clone(def);
      else editor.state.customAssets.push(clone(def));
      invalidateAssetGeometry(`custom:${def.id}`);
      invalidateThumbnail(`custom:${def.id}`);
    }
    editor.placement.asset = `custom:${def.id}`;
    editor.markAssetsDirty();
    editor.onStateChange?.();
    editor.setStatus(`Saved custom asset “${def.name}”. It’s now in the asset library.`);
    cleanup();
    closeModal();
  };

  modal('Asset Builder', body, [
    button('Cancel', () => { cleanup(); closeModal(); }),
    button('Save as new', () => save(true)),
    button('Save', () => save(false), 'primary'),
  ]);

  // Size the canvas now that it's in the DOM, then run the preview.
  requestAnimationFrame(() => {
    preview.resize();
    refresh();
    preview.start();
  });

  function cleanup(): void {
    preview.stop();
  }
}
