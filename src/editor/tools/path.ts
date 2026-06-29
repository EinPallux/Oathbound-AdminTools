// River / Road tool: click to drop polyline vertices, double-click or Enter to finish,
// Esc to cancel. A live preview line rubber-bands to the cursor while you draw. Rivers and
// roads are the same interaction with different defaults/materials (handled on commit).

import * as THREE from 'three';
import type { Tool } from '../tool';
import type { Editor } from '../editor';
import type { MapPath } from '../../format/map';
import { el, section, slider } from '../ui/dom';

class PathTool implements Tool {
  readonly dragPaints = false;
  readonly icon: string;
  width: number;

  private points: { x: number; z: number }[] = [];
  private down: { x: number; y: number } | null = null;
  private line: THREE.Line | null = null;
  private dots: THREE.Points | null = null;
  private cursor = { x: 0, z: 0 };
  private keyHandler: ((ev: KeyboardEvent) => void) | null = null;
  private editorRef: Editor | null = null;

  constructor(
    readonly id: 'river' | 'road',
    readonly label: string,
    icon: string,
    defaultWidth: number,
    private readonly color: number,
  ) {
    this.icon = icon;
    this.width = defaultWidth;
  }

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

  onPointerDown(_editor: Editor, ev: PointerEvent): void {
    if (ev.button === 0) this.down = { x: ev.clientX, y: ev.clientY };
  }
  onPointerMove(editor: Editor, ev: PointerEvent): void {
    const p = editor.groundPoint(ev);
    if (p) {
      this.cursor = { x: p.x, z: p.z };
      if (this.points.length) this.updatePreview(editor);
    }
  }
  onPointerUp(editor: Editor, ev: PointerEvent): void {
    if (ev.button !== 0 || !this.down) return;
    const moved = Math.hypot(ev.clientX - this.down.x, ev.clientY - this.down.y);
    this.down = null;
    if (moved > 6) return; // a drag = camera orbit, not a vertex
    const p = editor.groundPoint(ev);
    if (!p) return;
    // Double-click near the last point finishes the path.
    const last = this.points[this.points.length - 1];
    if (last && Math.hypot(p.x - last.x, p.z - last.z) < Math.max(1.5, this.width * 0.4) && this.points.length >= 2) {
      this.finish(editor);
      return;
    }
    this.points.push({ x: p.x, z: p.z });
    this.updatePreview(editor);
    editor.setStatus(`${this.label}: ${this.points.length} point(s) — Enter to finish, Esc to cancel`);
  }

  private finish(editor: Editor): void {
    if (this.points.length < 2) {
      this.cancel();
      return;
    }
    const path: MapPath = { points: this.points.slice(), width: this.width };
    const arr = this.id === 'river' ? editor.state.rivers : editor.state.roads;
    editor.addItems(arr, [path], `Add ${this.label.toLowerCase()}`, () => editor.markWaterDirty());
    editor.setStatus(`${this.label} placed (${path.points.length} points)`);
    this.cancel();
  }

  private cancel(): void {
    this.points = [];
    this.clearPreview();
  }

  private updatePreview(editor: Editor): void {
    this.clearPreview();
    const pts = [...this.points, this.cursor];
    const positions: number[] = [];
    for (const p of pts) positions.push(p.x, editor.terrain.heightAt(p.x, p.z) + 0.6, p.z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: this.color, depthTest: false }));
    this.line.renderOrder = 997;
    editor.viewport.scene.add(this.line);

    const dotPos: number[] = [];
    for (const p of this.points) dotPos.push(p.x, editor.terrain.heightAt(p.x, p.z) + 0.6, p.z);
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.Float32BufferAttribute(dotPos, 3));
    this.dots = new THREE.Points(dgeo, new THREE.PointsMaterial({ color: this.color, size: 6, sizeAttenuation: false, depthTest: false }));
    this.dots.renderOrder = 998;
    editor.viewport.scene.add(this.dots);
  }
  private clearPreview(): void {
    const ed = this.editorRef;
    if (this.line) {
      ed?.viewport.scene.remove(this.line);
      this.line.geometry.dispose();
      this.line = null;
    }
    if (this.dots) {
      ed?.viewport.scene.remove(this.dots);
      this.dots.geometry.dispose();
      this.dots = null;
    }
  }

  panel(_editor: Editor): HTMLElement {
    const widthRow = slider('Width', {
      min: 1, max: 20, step: 0.5, value: this.width,
      onInput: (v) => (this.width = v),
      format: (v) => `${v.toFixed(1)}m`,
    });
    return section(this.label, [
      widthRow.row,
      el('p', { class: 'hint', text: 'Click to add points · double-click or Enter to finish · Esc to cancel · drag to orbit.' }),
    ]);
  }
}

export const riverTool = new PathTool('river', 'River', '〰', 7.5, 0x3a7fa6);
export const roadTool = new PathTool('road', 'Road', '🛤', 4.5, 0xc8b27a);
