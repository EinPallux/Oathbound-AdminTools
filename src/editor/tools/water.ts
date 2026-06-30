// Water paint brush: paints a per-cell water-surface height into the terrain's water grid,
// like the Biome brush. Water then fills wherever the painted level sits *above* the ground,
// so you can flood basins, lakes and gorges up to a chosen Y. Erase mode clears it. Replaces
// the old press-drag circular Lake tool (legacy lakes still load + render for old maps).

import type { Tool } from '../tool';
import type { Editor } from '../editor';
import { GridStroke } from '../history';
import { el, section, slider, checkbox } from '../ui/dom';

export const waterTool: Tool = new (class implements Tool {
  readonly id = 'water';
  readonly label = 'Water';
  readonly icon = '💧';
  readonly dragPaints = true;
  level = 4;
  erase = false;

  private stroke: GridStroke | null = null;

  onPointerDown(editor: Editor, ev: PointerEvent): void {
    if (ev.button !== 0) return;
    this.stroke = new GridStroke(editor.terrain.water, this.erase ? 'Erase water' : 'Paint water', () => editor.markWaterDirty());
    this.paint(editor, ev);
  }
  onPointerMove(editor: Editor, ev: PointerEvent): void {
    const p = editor.groundPoint(ev);
    if (p) editor.showBrush(p.x, p.z, editor.brush.size);
    else editor.hideBrush();
    if (this.stroke) this.paint(editor, ev);
  }
  onPointerUp(editor: Editor): void {
    if (!this.stroke) return;
    const cmd = this.stroke.commit();
    this.stroke = null;
    if (cmd) {
      editor.history.push(cmd);
      editor.markWaterDirty();
    }
  }
  onDeactivate(editor: Editor): void {
    editor.hideBrush();
  }

  private paint(editor: Editor, ev: PointerEvent): void {
    const p = editor.groundPoint(ev);
    if (!p) return;
    const water = editor.terrain.water;
    const v = this.erase ? NaN : this.level;
    editor.terrain.forEachCellInRadius(p.x, p.z, editor.brush.size, (idx) => {
      this.stroke?.record(idx);
      water[idx] = v;
    });
    editor.markWaterDirty();
  }

  panel(editor: Editor): HTMLElement {
    const levelRow = slider('Water level (Y)', {
      min: -40, max: 80, step: 0.5, value: this.level,
      onInput: (v) => (this.level = v),
      format: (v) => `${v.toFixed(1)}m`,
    });
    const sizeRow = slider('Brush size', {
      min: 2, max: 140, step: 1, value: editor.brush.size,
      onInput: (v) => (editor.brush.size = v),
      format: (v) => `${v.toFixed(0)}m`,
    });
    return section('Paint Water', [
      levelRow.row,
      sizeRow.row,
      checkbox('Erase water', this.erase, (v) => (this.erase = v)),
      el('p', { class: 'hint', text: 'Paint to flood the ground up to the chosen level — water only shows where it sits above the terrain, so it fills lakes, basins and gorges. Sculpt/lower the ground first for depth. Tick Erase to remove water.' }),
    ]);
  }
})();
