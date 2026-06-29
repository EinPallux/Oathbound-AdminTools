// Select tool: click a placed asset or a marker to inspect it, tweak a few properties,
// or delete it. A ring highlights the current selection. Drag still orbits the camera.

import * as THREE from 'three';
import type { Tool } from '../tool';
import type { Editor } from '../editor';
import { ENEMY_TIERS, type EnemyTier } from '../../format/map';
import { el, section, slider, row, select as selectRow, button } from '../ui/dom';

export const selectTool: Tool = new (class implements Tool {
  readonly id = 'select';
  readonly label = 'Select';
  readonly icon = '⤿';
  readonly dragPaints = false;

  private down: { x: number; y: number } | null = null;
  private ring: THREE.Mesh | null = null;

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

  onPointerDown(_e: Editor, ev: PointerEvent): void {
    if (ev.button === 0) this.down = { x: ev.clientX, y: ev.clientY };
  }
  onPointerUp(editor: Editor, ev: PointerEvent): void {
    if (ev.button !== 0 || !this.down) return;
    const moved = Math.hypot(ev.clientX - this.down.x, ev.clientY - this.down.y);
    this.down = null;
    if (moved > 6) return;
    const marker = editor.pickMarker(ev);
    if (marker) {
      editor.selectedMarker = marker;
      editor.selectedAsset = null;
    } else {
      const a = editor.pickAsset(ev);
      editor.selectedAsset = a;
      editor.selectedMarker = null;
    }
    this.updateRing(editor);
    editor.onStateChange?.();
  }

  private markerPos(editor: Editor): { x: number; z: number } | null {
    const m = editor.selectedMarker;
    if (!m) return null;
    const s = editor.state;
    if (m.type === 'spawn') return s.spawns[m.index] ?? null;
    if (m.type === 'boss') return s.bosses[m.index] ?? null;
    if (m.type === 'oathstone') return s.oathstones[m.index] ?? null;
    if (m.type === 'npc') return s.npcs[m.index] ?? null;
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
          button('Delete asset', () => editor.deleteAsset(idx), 'danger'),
        );
      }
    } else if (editor.selectedMarker) {
      wrap.append(this.markerPanel(editor));
    } else {
      wrap.append(el('p', { class: 'hint', text: 'Click an asset or marker to select it.' }));
    }
    return section('Select', [wrap]);
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
    } else if (m.type === 'player') {
      wrap.append(el('p', { class: 'sel-title', text: 'Player spawn' }), el('p', { class: 'hint', text: 'Use the Markers tool (Player spawn) to move it.' }));
    } else if (m.type === 'village') {
      wrap.append(el('p', { class: 'sel-title', text: 'Oathhold town' }), button('Remove town', () => editor.deleteMarker(m), 'danger'));
    }
    return wrap;
  }
})();
