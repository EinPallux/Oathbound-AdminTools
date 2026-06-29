// Terrain sculpt brush: raise / lower / smooth / flatten / set-height. Records a sparse
// GridStroke for undo and re-seats dependent layers on stroke end.

import type { Tool } from '../tool';
import type { Editor } from '../editor';
import { GridStroke } from '../history';
import { clamp } from '../../engine/math';
import { el, section, slider, select } from '../ui/dom';

type Mode = 'raise' | 'lower' | 'smooth' | 'flatten' | 'set';

const STEP = 0.7; // metres per application at full strength/centre

export const sculptTool: Tool = new (class implements Tool {
  readonly id = 'sculpt';
  readonly label = 'Sculpt';
  readonly icon = '⛰';
  readonly dragPaints = true;
  mode: Mode = 'raise';
  setHeight = 0;

  private stroke: GridStroke | null = null;
  private flattenTarget = 0;

  onPointerDown(editor: Editor, ev: PointerEvent): void {
    if (ev.button !== 0) return;
    const p = editor.groundPoint(ev);
    if (!p) return;
    this.stroke = new GridStroke(editor.terrain.heights, `Sculpt (${this.mode})`, () => {
      editor.markTerrainDirty();
    });
    this.flattenTarget = editor.terrain.heightAt(p.x, p.z);
    this.apply(editor, p.x, p.z);
  }

  onPointerMove(editor: Editor, ev: PointerEvent): void {
    const p = editor.groundPoint(ev);
    if (p) editor.showBrush(p.x, p.z, editor.brush.size);
    else editor.hideBrush();
    if (!this.stroke || !p) return;
    this.apply(editor, p.x, p.z);
  }

  onPointerUp(editor: Editor): void {
    if (!this.stroke) return;
    const cmd = this.stroke.commit();
    this.stroke = null;
    if (cmd) {
      // Record without re-running redo (already applied live).
      editor.history.push(cmd);
      editor.reseatLayers();
    }
  }

  onDeactivate(editor: Editor): void {
    editor.hideBrush();
  }

  private apply(editor: Editor, x: number, z: number): void {
    const terrain = editor.terrain;
    const strength = editor.brush.strength;
    const radius = editor.brush.size;
    const heights = terrain.heights;
    const mode = this.mode;
    const avg = mode === 'smooth' ? terrain.averageHeight(x, z, radius) : 0;

    terrain.forEachCellInRadius(x, z, radius, (idx, falloff) => {
      this.stroke?.record(idx);
      const w = falloff * strength;
      switch (mode) {
        case 'raise':
          heights[idx] += w * STEP;
          break;
        case 'lower':
          heights[idx] -= w * STEP;
          break;
        case 'smooth':
          heights[idx] += (avg - heights[idx]) * clamp(w * 0.4, 0, 1);
          break;
        case 'flatten':
          heights[idx] += (this.flattenTarget - heights[idx]) * clamp(w * 0.4, 0, 1);
          break;
        case 'set':
          heights[idx] += (this.setHeight - heights[idx]) * clamp(w * 0.5, 0, 1);
          break;
      }
    });
    editor.markTerrainDirty();
  }

  panel(editor: Editor): HTMLElement {
    const setRow = slider('Set height', {
      min: -40, max: 80, step: 0.5, value: this.setHeight,
      onInput: (v) => (this.setHeight = v),
      format: (v) => `${v.toFixed(1)}m`,
    });
    const sizeRow = slider('Brush size', {
      min: 2, max: 120, step: 1, value: editor.brush.size,
      onInput: (v) => (editor.brush.size = v),
      format: (v) => `${v.toFixed(0)}m`,
    });
    const strengthRow = slider('Strength', {
      min: 0.05, max: 2, step: 0.05, value: editor.brush.strength,
      onInput: (v) => (editor.brush.strength = v),
      format: (v) => v.toFixed(2),
    });
    const modeRow = select(
      'Mode',
      [
        { value: 'raise', label: 'Raise' },
        { value: 'lower', label: 'Lower' },
        { value: 'smooth', label: 'Smooth' },
        { value: 'flatten', label: 'Flatten' },
        { value: 'set', label: 'Set height' },
      ],
      this.mode,
      (v) => {
        this.mode = v as Mode;
        setRow.row.style.display = this.mode === 'set' ? '' : 'none';
      },
    );
    setRow.row.style.display = this.mode === 'set' ? '' : 'none';
    return section('Sculpt Terrain', [
      modeRow,
      sizeRow.row,
      strengthRow.row,
      setRow.row,
      el('p', { class: 'hint', text: 'Left-drag to sculpt · right-drag to orbit · [ ] resize brush' }),
    ]);
  }
})();
