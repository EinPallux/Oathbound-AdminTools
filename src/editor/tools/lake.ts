// Lake tool: press at the centre and drag outward to set the radius; release to place a
// circular water body. Its surface height defaults to just above the terrain at the
// centre — sculpt a basin first (Lower brush) for a deep lake.

import type { Tool } from '../tool';
import type { Editor } from '../editor';
import { defaultLakeY } from '../../engine/water-road';
import { el, section } from '../ui/dom';

export const lakeTool: Tool = new (class implements Tool {
  readonly id = 'lake';
  readonly label = 'Lake';
  readonly icon = '💧';
  readonly dragPaints = true;

  private center: { x: number; z: number } | null = null;
  private radius = 8;

  onPointerDown(editor: Editor, ev: PointerEvent): void {
    if (ev.button !== 0) return;
    const p = editor.groundPoint(ev);
    if (!p) return;
    this.center = { x: p.x, z: p.z };
    this.radius = 8;
    editor.showBrush(p.x, p.z, this.radius);
  }
  onPointerMove(editor: Editor, ev: PointerEvent): void {
    if (!this.center) {
      const p = editor.groundPoint(ev);
      if (p) editor.showBrush(p.x, p.z, 8);
      else editor.hideBrush();
      return;
    }
    const p = editor.groundPoint(ev);
    if (!p) return;
    this.radius = Math.max(3, Math.hypot(p.x - this.center.x, p.z - this.center.z));
    editor.showBrush(this.center.x, this.center.z, this.radius);
  }
  onPointerUp(editor: Editor): void {
    if (!this.center) return;
    const lake = {
      x: this.center.x,
      z: this.center.z,
      r: this.radius,
      y: defaultLakeY(editor.terrain, this.center.x, this.center.z),
    };
    this.center = null;
    editor.addItems(editor.state.lakes, [lake], 'Add lake', () => editor.markWaterDirty());
    editor.setStatus(`Lake placed (r=${lake.r.toFixed(0)}m)`);
  }
  onDeactivate(editor: Editor): void {
    this.center = null;
    editor.hideBrush();
  }

  panel(): HTMLElement {
    return section('Lake', [
      el('p', { class: 'hint', text: 'Press at the centre, drag out to size, release to place. Sculpt a basin first for depth.' }),
    ]);
  }
})();
