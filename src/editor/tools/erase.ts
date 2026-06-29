// Erase assets: drag over the terrain to remove any placed props within the brush. One
// undoable command per stroke (removed props are restored on undo).

import type { Tool } from '../tool';
import type { Editor } from '../editor';
import type { PlacedAsset } from '../../format/map';
import { el, section, slider } from '../ui/dom';

export const eraseTool: Tool = new (class implements Tool {
  readonly id = 'erase';
  readonly label = 'Erase';
  readonly icon = '🧽';
  readonly dragPaints = true;

  private removed: PlacedAsset[] = [];
  private erasing = false;

  onPointerDown(editor: Editor, ev: PointerEvent): void {
    if (ev.button !== 0) return;
    this.erasing = true;
    this.removed = [];
    this.eraseAt(editor, ev);
  }
  onPointerMove(editor: Editor, ev: PointerEvent): void {
    const p = editor.groundPoint(ev);
    if (p) editor.showBrush(p.x, p.z, editor.brush.size);
    else editor.hideBrush();
    if (this.erasing) this.eraseAt(editor, ev);
  }
  onPointerUp(editor: Editor): void {
    if (!this.erasing) return;
    this.erasing = false;
    if (!this.removed.length) return;
    const removed = this.removed;
    const set = new Set(removed);
    editor.history.push({
      label: `Erase ${removed.length} asset(s)`,
      undo: () => {
        editor.state.assets.push(...removed);
        editor.markAssetsDirty();
        editor.onStateChange?.();
      },
      redo: () => {
        editor.state.assets = editor.state.assets.filter((a) => !set.has(a));
        editor.markAssetsDirty();
        editor.onStateChange?.();
      },
    });
    editor.setStatus(`Erased ${removed.length} asset${removed.length > 1 ? 's' : ''}`);
    this.removed = [];
  }
  onDeactivate(editor: Editor): void {
    editor.hideBrush();
  }

  private eraseAt(editor: Editor, ev: PointerEvent): void {
    const p = editor.groundPoint(ev);
    if (!p) return;
    const r2 = editor.brush.size * editor.brush.size;
    const keep: PlacedAsset[] = [];
    let removedAny = false;
    for (const a of editor.state.assets) {
      if ((a.x - p.x) ** 2 + (a.z - p.z) ** 2 <= r2) {
        this.removed.push(a);
        removedAny = true;
      } else {
        keep.push(a);
      }
    }
    if (removedAny) {
      editor.state.assets = keep;
      editor.markAssetsDirty();
    }
  }

  panel(editor: Editor): HTMLElement {
    const sizeRow = slider('Erase radius', {
      min: 1, max: 80, step: 1, value: editor.brush.size,
      onInput: (v) => (editor.brush.size = v),
      format: (v) => `${v.toFixed(0)}m`,
    });
    return section('Erase Assets', [
      sizeRow.row,
      el('p', { class: 'hint', text: 'Left-drag over props to remove them. Undo restores them.' }),
    ]);
  }
})();
