// Select tool: click a placed asset or a marker to inspect it, tweak a few properties,
// or delete it. A ring highlights the current selection. Drag still orbits the camera.

import * as THREE from 'three';
import type { Tool } from '../tool';
import type { Editor } from '../editor';
import type { MarkerRef } from '../../engine/markers';
import { ENEMY_TIERS, CRITTER_TYPES, type EnemyTier, type CritterType } from '../../format/map';
import { el, section, slider, row, select as selectRow, button, checkbox } from '../ui/dom';

type DragRef = MarkerRef | { type: 'asset'; index: number };

/** Return the mutable {x,z} object behind a drag ref (so it can be moved in place). */
function entXZ(editor: Editor, d: DragRef): { x: number; z: number } | null {
  const s = editor.state;
  switch (d.type) {
    case 'asset': return s.assets[d.index] ?? null;
    case 'spawn': return s.spawns[d.index] ?? null;
    case 'boss': return s.bosses[d.index] ?? null;
    case 'oathstone': return s.oathstones[d.index] ?? null;
    case 'npc': return s.npcs[d.index] ?? null;
    case 'critter': return s.critters[d.index] ?? null;
    case 'player': return s.playerSpawn;
    case 'village': return s.village;
    default: return null;
  }
}

export const selectTool: Tool = new (class implements Tool {
  readonly id = 'select';
  readonly label = 'Select';
  readonly icon = '⤿';
  readonly dragPaints = false;

  private down: { x: number; y: number } | null = null;
  private ring: THREE.Mesh | null = null;
  private dragRef: DragRef | null = null;
  private dragBefore: { x: number; z: number } | null = null;
  private dragMoved = false;

  onActivate(editor: Editor): void {
    if (!this.ring) {
      const geo = new THREE.RingGeometry(1.4, 1.7, 32).rotateX(-Math.PI / 2);
      this.ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x66e0ff, depthTest: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
      this.ring.renderOrder = 999;
    }
    this.ring.visible = false;
    editor.viewport.scene.add(this.ring);
    this.updateRing(editor);
  }
  onDeactivate(editor: Editor): void {
    if (this.ring) editor.viewport.scene.remove(this.ring);
  }

  onPointerDown(editor: Editor, ev: PointerEvent): void {
    if (ev.button !== 0) return;
    this.down = { x: ev.clientX, y: ev.clientY };
    this.dragMoved = false;
    // Grab whatever is under the cursor (markers first, then assets) to select + drag-move.
    const m = editor.pickMarker(ev);
    this.dragRef = m ?? (() => { const a = editor.pickAsset(ev); return a != null ? ({ type: 'asset', index: a } as DragRef) : null; })();
    this.applySelection(editor, this.dragRef);
    if (this.dragRef) {
      const obj = entXZ(editor, this.dragRef);
      this.dragBefore = obj ? { x: obj.x, z: obj.z } : null;
      editor.viewport.enableControls(false); // drag moves the object, not the camera
    }
    this.updateRing(editor);
    editor.onStateChange?.();
  }

  onPointerMove(editor: Editor, ev: PointerEvent): void {
    if (!this.down || !this.dragRef) return;
    if (!this.dragMoved && Math.hypot(ev.clientX - this.down.x, ev.clientY - this.down.y) < 4) return;
    const p = editor.groundPoint(ev);
    if (!p) return;
    const obj = entXZ(editor, this.dragRef);
    if (!obj) return;
    this.dragMoved = true;
    obj.x = editor.snapVal(p.x);
    obj.z = editor.snapVal(p.z);
    if (this.dragRef.type === 'asset') editor.markAssetsDirty();
    else editor.markMarkersDirty();
    this.updateRing(editor);
  }

  onPointerUp(editor: Editor, ev: PointerEvent): void {
    if (ev.button !== 0) return;
    const ref = this.dragRef;
    const before = this.dragBefore;
    this.dragRef = null;
    this.dragBefore = null;
    this.down = null;
    if (ref) editor.viewport.enableControls(true);
    if (ref && this.dragMoved && before) {
      const obj = entXZ(editor, ref);
      if (obj) {
        const after = { x: obj.x, z: obj.z };
        const dirty = (): void => { ref.type === 'asset' ? editor.markAssetsDirty() : editor.markMarkersDirty(); };
        editor.history.push({
          label: 'Move',
          undo: () => { const o = entXZ(editor, ref); if (o) { o.x = before.x; o.z = before.z; } dirty(); this.updateRing(editor); editor.onStateChange?.(); },
          redo: () => { const o = entXZ(editor, ref); if (o) { o.x = after.x; o.z = after.z; } dirty(); this.updateRing(editor); editor.onStateChange?.(); },
        });
        editor.setStatus('Moved (drag)');
      }
    }
    this.updateRing(editor);
    editor.onStateChange?.();
  }

  private applySelection(editor: Editor, ref: DragRef | null): void {
    if (ref && ref.type === 'asset') {
      editor.selectedAsset = ref.index;
      editor.selectedMarker = null;
    } else if (ref) {
      editor.selectedMarker = ref;
      editor.selectedAsset = null;
    } else {
      editor.selectedAsset = null;
      editor.selectedMarker = null;
    }
  }

  private markerPos(editor: Editor): { x: number; z: number } | null {
    const m = editor.selectedMarker;
    if (!m) return null;
    const s = editor.state;
    if (m.type === 'spawn') return s.spawns[m.index] ?? null;
    if (m.type === 'boss') return s.bosses[m.index] ?? null;
    if (m.type === 'oathstone') return s.oathstones[m.index] ?? null;
    if (m.type === 'npc') return s.npcs[m.index] ?? null;
    if (m.type === 'critter') return s.critters[m.index] ?? null;
    if (m.type === 'player') return s.playerSpawn;
    if (m.type === 'village') return s.village;
    return null;
  }

  private updateRing(editor: Editor): void {
    if (!this.ring) return;
    let pos: { x: number; z: number } | null = null;
    if (editor.selectedAsset != null) pos = editor.state.assets[editor.selectedAsset] ?? null;
    else pos = this.markerPos(editor);
    if (pos) {
      this.ring.visible = true;
      this.ring.position.set(pos.x, editor.terrain.heightAt(pos.x, pos.z) + 0.3, pos.z);
    } else {
      this.ring.visible = false;
    }
  }

  panel(editor: Editor): HTMLElement {
    const wrap = el('div', {});
    if (editor.selectedAsset != null) {
      const idx = editor.selectedAsset;
      const a = editor.state.assets[idx];
      if (a) {
        wrap.append(
          el('p', { class: 'sel-title', text: a.asset }),
          el('p', { class: 'hint', text: `x ${a.x.toFixed(1)}, z ${a.z.toFixed(1)}` }),
          slider('Scale', { min: 0.2, max: 6, step: 0.05, value: a.scale, onInput: (v) => { a.scale = v; editor.markAssetsDirty(); } }).row,
          slider('Rotation', { min: 0, max: 360, step: 1, value: (a.rot * 180) / Math.PI, onInput: (v) => { a.rot = (v * Math.PI) / 180; editor.markAssetsDirty(); }, format: (v) => `${v.toFixed(0)}°` }).row,
          slider('Height (Y)', { min: -20, max: 40, step: 0.1, value: a.y ?? 0, onInput: (v) => { a.y = v; editor.markAssetsDirty(); }, format: (v) => `${v.toFixed(1)}m` }).row,
          el('div', { class: 'btn-row' }, [
            button('Duplicate (Ctrl+D)', () => editor.duplicateAsset(idx)),
            button('Delete', () => editor.deleteAsset(idx), 'danger'),
          ]),
        );
      }
    } else if (editor.selectedMarker) {
      wrap.append(this.markerPanel(editor));
    } else {
      wrap.append(el('p', { class: 'hint', text: 'Click an asset/marker to select it · drag it to move.' }));
    }
    const snap = slider('Grid size', {
      min: 0.25, max: 10, step: 0.25, value: editor.snap.grid,
      onInput: (v) => (editor.snap.grid = v), format: (v) => `${v}m`,
    });
    return section('Select', [
      checkbox('Snap to grid (move/place)', editor.snap.enabled, (v) => (editor.snap.enabled = v)),
      snap.row,
      wrap,
    ]);
  }

  private markerPanel(editor: Editor): HTMLElement {
    const m = editor.selectedMarker!;
    const s = editor.state;
    const wrap = el('div', {});
    const del = button('Delete', () => editor.deleteMarker(m), 'danger');
    if (m.type === 'spawn') {
      const sp = s.spawns[m.index];
      if (!sp) return wrap;
      const lvl = el('input', { type: 'number', value: sp.level, min: 1, max: 30 }) as HTMLInputElement;
      lvl.addEventListener('input', () => { sp.level = Math.max(1, Math.min(30, parseInt(lvl.value || '1', 10))); editor.markMarkersDirty(); });
      const nameI = el('input', { type: 'text', value: sp.name ?? '' }) as HTMLInputElement;
      nameI.addEventListener('input', () => { sp.name = nameI.value.trim() || undefined; editor.markMarkersDirty(); });
      wrap.append(
        el('p', { class: 'sel-title', text: `Spawn · ${sp.id}` }),
        row('Level', lvl),
        selectRow('Tier', ENEMY_TIERS.map((t) => ({ value: t, label: t })), sp.tier ?? 'standard', (v) => { sp.tier = v === 'standard' ? undefined : (v as EnemyTier); editor.markMarkersDirty(); }),
        row('Name', nameI),
        del,
      );
    } else if (m.type === 'boss') {
      const b = s.bosses[m.index];
      wrap.append(el('p', { class: 'sel-title', text: `Boss · ${b?.id}` }), del);
    } else if (m.type === 'oathstone') {
      const o = s.oathstones[m.index];
      if (!o) return wrap;
      const nameI = el('input', { type: 'text', value: o.name }) as HTMLInputElement;
      nameI.addEventListener('input', () => { o.name = nameI.value; editor.markMarkersDirty(); });
      const roadWrap = el('label', { class: 'row check-row' });
      const cb = el('input', { type: 'checkbox' }) as HTMLInputElement;
      cb.checked = !!o.road;
      cb.addEventListener('change', () => { o.road = cb.checked; });
      roadWrap.append(cb, el('span', { text: 'Road from hub' }));
      wrap.append(el('p', { class: 'sel-title', text: `Oathstone · ${o.id}` }), row('Name', nameI), roadWrap, del);
    } else if (m.type === 'npc') {
      const npc = s.npcs[m.index];
      if (!npc) return wrap;
      const nameI = el('input', { type: 'text', value: npc.name }) as HTMLInputElement;
      nameI.addEventListener('input', () => { npc.name = nameI.value; editor.markMarkersDirty(); });
      wrap.append(
        el('p', { class: 'sel-title', text: `NPC · ${npc.name}` }),
        row('Name', nameI),
        slider('Walk speed', { min: 0.4, max: 3, step: 0.1, value: npc.speed, onInput: (v) => { npc.speed = v; }, format: (v) => `${v.toFixed(1)} m/s` }).row,
        selectRow('Look', [
          { value: '0', label: 'Villager' }, { value: '1', label: 'Guard' },
          { value: '2', label: 'Merchant' }, { value: '3', label: 'Elder' },
        ], String(npc.variant ?? 0), (v) => { npc.variant = parseInt(v, 10); editor.markMarkersDirty(); }),
        el('p', { class: 'hint', text: `${npc.route.length} patrol point(s). Re-add via the NPCs tool to change the route.` }),
        del,
      );
    } else if (m.type === 'critter') {
      const cr = s.critters[m.index];
      if (!cr) return wrap;
      wrap.append(
        el('p', { class: 'sel-title', text: `Critters · ${cr.type}` }),
        selectRow('Type', CRITTER_TYPES.map((t) => ({ value: t, label: t })), cr.type, (v) => { cr.type = v as CritterType; editor.markMarkersDirty(); }),
        slider('Radius', { min: 3, max: 80, step: 1, value: cr.radius, onInput: (v) => { cr.radius = v; editor.markMarkersDirty(); }, format: (v) => `${v.toFixed(0)}m` }).row,
        slider('Count', { min: 1, max: 40, step: 1, value: cr.count, onInput: (v) => { cr.count = Math.round(v); editor.markMarkersDirty(); }, format: (v) => `${v.toFixed(0)}` }).row,
        del,
      );
    } else if (m.type === 'player') {
      wrap.append(el('p', { class: 'sel-title', text: 'Player spawn' }), el('p', { class: 'hint', text: 'Use the Markers tool (Player spawn) to move it.' }));
    } else if (m.type === 'village') {
      wrap.append(el('p', { class: 'sel-title', text: 'Oathhold town' }), button('Remove town', () => editor.deleteMarker(m), 'danger'));
    }
    return wrap;
  }
})();
