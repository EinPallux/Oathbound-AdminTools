// Flatten brush — slowly eases terrain toward a target, a little per pass (undoable). Two modes:
//   • To base level — pulls heights toward a fixed level (0 = original flat ground), raising
//     sunken ground and lowering raised ground back to flat. Good for restoring sculpted areas
//     when the undo history is gone (e.g. you reopened the map).
//   • Normalize     — pulls heights toward the *brushed area's own average*, so it levels the
//     spikes/roughness of a region without lowering its base elevation (a spiky mountain top
//     becomes a flat plateau at its current height, instead of being demolished to 0).
// (Sculpt's own "flatten" mode is different again: it levels to the height under the cursor.)

import type { Tool } from '../tool';
import type { Editor } from '../editor';
import { GridStroke } from '../history';
import { clamp } from '../../engine/math';
import { el, section, slider, select } from '../ui/dom';

type FlattenMode = 'base' | 'normalize';

const RESTORE_RATE = 0.3; // fraction of the gap to the target eased per application — a slow flatten

export const flattenTool: Tool = new (class implements Tool {
  readonly id = 'flatten';
  readonly label = 'Flatten';
  readonly icon = '⏥';
  readonly dragPaints = true;
  mode: FlattenMode = 'base';
  baseLevel = 0;

  private stroke: GridStroke | null = null;

  onPointerDown(editor: Editor, ev: PointerEvent): void {
    if (ev.button !== 0) return;
    const p = editor.groundPoint(ev);
    if (!p) return;
    this.stroke = new GridStroke(editor.terrain.heights, 'Flatten', () => editor.markTerrainDirty());
    this.apply(editor, p.x, p.z);
  }

  onPointerMove(editor: Editor, ev: PointerEvent): void {
    const p = editor.groundPoint(ev);
    if (p) editor.showBrush(p.x, p.z, editor.brush.size);
    else editor.hideBrush();
    if (this.stroke && p) this.apply(editor, p.x, p.z);
  }

  onPointerUp(editor: Editor): void {
    if (!this.stroke) return;
    const cmd = this.stroke.commit();
    this.stroke = null;
    if (cmd) {
      // Already applied live during the drag — record without re-running redo.
      editor.history.push(cmd);
      editor.reseatLayers();
    }
  }

  onDeactivate(editor: Editor): void {
    editor.hideBrush();
  }

  private apply(editor: Editor, x: number, z: number): void {
    const terrain = editor.terrain;
    const { heights } = terrain;
    const strength = editor.brush.strength;
    const radius = editor.brush.size;
    // 'base' eases toward a fixed level; 'normalize' eases toward the region's own mean
    // height (recomputed live) so it levels spikes without changing the base elevation.
    const target = this.mode === 'normalize' ? terrain.averageHeight(x, z, radius) : this.baseLevel;
    terrain.forEachCellInRadius(x, z, radius, (idx, falloff) => {
      this.stroke?.record(idx);
      const w = clamp(falloff * strength * RESTORE_RATE, 0, 1);
      heights[idx] += (target - heights[idx]) * w; // convex ease → never overshoots the target
    });
    editor.markTerrainDirty();
  }

  panel(editor: Editor): HTMLElement {
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
    const baseRow = slider('Base level', {
      min: -40, max: 80, step: 0.5, value: this.baseLevel,
      onInput: (v) => (this.baseLevel = v),
      format: (v) => `${v.toFixed(1)}m`,
    });
    const hint = el('p', { class: 'hint' });
    const refresh = (): void => {
      baseRow.row.style.display = this.mode === 'base' ? '' : 'none';
      hint.textContent = this.mode === 'normalize'
        ? 'Left-drag to level the spikes/roughness of an area toward its own average height — flattens it without lowering its base elevation (e.g. smooth a jagged mountain top). Raise Strength to level faster.'
        : 'Left-drag to ease terrain toward the base level (0 = original flat ground), a little per pass — handy for restoring sculpted areas when undo is gone. Raise Strength to flatten faster.';
    };
    const modeRow = select(
      'Mode',
      [
        { value: 'base', label: 'To base level' },
        { value: 'normalize', label: 'Normalize (level spikes)' },
      ],
      this.mode,
      (v) => { this.mode = v as FlattenMode; refresh(); },
    );
    refresh();
    return section('Flatten Terrain', [
      modeRow,
      sizeRow.row,
      strengthRow.row,
      baseRow.row,
      hint,
    ]);
  }
})();
