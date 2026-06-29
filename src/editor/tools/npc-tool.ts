// NPC tool: click once to place a friendly NPC at its home position, then click to add
// patrol waypoints (a looped route). Enter finishes, Esc cancels. Drag orbits the camera.

import * as THREE from 'three';
import type { Tool } from '../tool';
import type { Editor } from '../editor';
import type { MapNpc } from '../../format/map';
import { el, section, slider, select, row } from '../ui/dom';

const VARIANTS = [
  { value: '0', label: 'Villager' },
  { value: '1', label: 'Guard' },
  { value: '2', label: 'Merchant' },
  { value: '3', label: 'Elder' },
];

export const npcTool: Tool = new (class implements Tool {
  readonly id = 'npc';
  readonly label = 'NPCs';
  readonly icon = '🧑';
  readonly dragPaints = false;

  name = 'Villager';
  speed = 1.3;
  variant = 0;

  private home: { x: number; z: number } | null = null;
  private route: { x: number; z: number }[] = [];
  private cursor = { x: 0, z: 0 };
  private down: { x: number; y: number } | null = null;
  private preview: THREE.Line | null = null;
  private dot: THREE.Mesh | null = null;
  private keyHandler: ((ev: KeyboardEvent) => void) | null = null;
  private editorRef: Editor | null = null;

  onActivate(editor: Editor): void {
    this.editorRef = editor;
    this.keyHandler = (ev: KeyboardEvent): void => {
      const t = ev.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
      if (ev.key === 'Enter') {
        ev.preventDefault();
        this.finish(editor);
      } else if (ev.key === 'Escape') {
        this.cancel();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }
  onDeactivate(): void {
    this.cancel();
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
    this.editorRef = null;
  }

  onPointerDown(_e: Editor, ev: PointerEvent): void {
    if (ev.button === 0) this.down = { x: ev.clientX, y: ev.clientY };
  }
  onPointerMove(editor: Editor, ev: PointerEvent): void {
    const p = editor.groundPoint(ev);
    if (p) {
      this.cursor = { x: p.x, z: p.z };
      if (this.home) this.updatePreview(editor);
    }
  }
  onPointerUp(editor: Editor, ev: PointerEvent): void {
    if (ev.button !== 0 || !this.down) return;
    const moved = Math.hypot(ev.clientX - this.down.x, ev.clientY - this.down.y);
    this.down = null;
    if (moved > 6) return; // a drag = orbit
    const p = editor.groundPoint(ev);
    if (!p) return;
    if (!this.home) {
      this.home = { x: p.x, z: p.z };
      editor.setStatus(`NPC “${this.name}” placed — click to add patrol points, Enter to finish, Esc to cancel`);
    } else {
      this.route.push({ x: p.x, z: p.z });
      editor.setStatus(`NPC “${this.name}”: ${this.route.length} patrol point(s) — Enter to finish`);
    }
    this.updatePreview(editor);
  }

  private finish(editor: Editor): void {
    if (!this.home) return;
    const npc: MapNpc = {
      name: this.name.trim() || 'Villager',
      x: this.home.x,
      z: this.home.z,
      route: this.route.slice(),
      speed: this.speed,
      variant: this.variant,
    };
    editor.addItems(editor.state.npcs, [npc], 'Add NPC', () => editor.markMarkersDirty());
    editor.setStatus(`NPC “${npc.name}” added${npc.route.length ? ` with a ${npc.route.length}-point route` : ' (idle)'}`);
    this.cancel();
  }
  private cancel(): void {
    this.home = null;
    this.route = [];
    this.clearPreview();
  }

  private updatePreview(editor: Editor): void {
    this.clearPreview();
    if (!this.home) return;
    const ed = editor;
    const dotGeo = new THREE.SphereGeometry(0.5, 10, 8);
    this.dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0x6fe0a0, depthTest: false }));
    this.dot.position.set(this.home.x, ed.terrain.heightAt(this.home.x, this.home.z) + 1.0, this.home.z);
    this.dot.renderOrder = 998;
    ed.viewport.scene.add(this.dot);

    const pts = [this.home, ...this.route, this.cursor];
    const arr: number[] = [];
    for (const p of pts) arr.push(p.x, ed.terrain.heightAt(p.x, p.z) + 0.5, p.z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    this.preview = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x6fe0a0, depthTest: false }));
    this.preview.renderOrder = 997;
    ed.viewport.scene.add(this.preview);
  }
  private clearPreview(): void {
    const ed = this.editorRef;
    if (this.preview) {
      ed?.viewport.scene.remove(this.preview);
      this.preview.geometry.dispose();
      this.preview = null;
    }
    if (this.dot) {
      ed?.viewport.scene.remove(this.dot);
      this.dot.geometry.dispose();
      this.dot = null;
    }
  }

  panel(editor: Editor): HTMLElement {
    const nameI = el('input', { type: 'text', value: this.name }) as HTMLInputElement;
    nameI.addEventListener('input', () => (this.name = nameI.value));
    const speedRow = slider('Walk speed', {
      min: 0.4, max: 3, step: 0.1, value: this.speed,
      onInput: (v) => (this.speed = v),
      format: (v) => `${v.toFixed(1)} m/s`,
    });
    return section('Friendly NPCs', [
      row('Name', nameI),
      select('Look', VARIANTS, String(this.variant), (v) => (this.variant = parseInt(v, 10))),
      speedRow.row,
      el('button', { class: 'btn', text: 'Finish NPC (Enter)', onClick: () => this.finish(editor) }),
      el('p', { class: 'hint', text: 'Click once to place the NPC, then click to add looped patrol points. Enter finishes · Esc cancels · drag to orbit. Leave with no points for an idle NPC.' }),
    ]);
  }
})();
