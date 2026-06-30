// Flatten brush: slowly eases sculpted terrain back toward the flat baseline (its original
// state), for when the undo history is gone (e.g. you reopened the map). Unlike Sculpt's
// "flatten" mode — which levels to the height under the cursor — this always pulls heights
// toward a fixed base level (0 by default), raising sunken ground and lowering raised ground
// back to flat. Records a sparse GridStroke so it's still undoable within the session.

import type { Tool } from '../tool';
import type { Editor } from '../editor';
import { GridStroke } from '../history';
import { clamp } from '../../engine/math';
import { el, section, slider } from '../ui/dom';

const RESTORE_RATE = 0.3; // fraction of the gap to the base eased per application — a slow flatten

export const flattenTool: Tool = new (class implements Tool {
  readonly id = 'flatten';
  readonly label = 'Flatten';
  readonly icon = '⏥';
  readonly dragPaints = true;
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
    const { heights } = editor.terrain;
    const strength = editor.brush.strength;
    const base = this.baseLevel;
    editor.terrain.forEachCellInRadius(x, z, editor.brush.size, (idx, falloff) => {
      this.stroke?.record(idx);
      const w = clamp(falloff * strength * RESTORE_RATE, 0, 1);
      heights[idx] += (base - heights[idx]) * w; // convex ease → never overshoots the base
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
    return section('Flatten Terrain', [
      sizeRow.row,
      strengthRow.row,
      baseRow.row,
      el('p', { class: 'hint', text: 'Left-drag to ease terrain back toward the base level (0 = original flat ground). Restores sculpted areas a little per pass — handy when undo is gone. Raise Strength to flatten faster.' }),
    ]);
  }
})();
