// Critters tool: drop an ambient-wildlife zone (birds / ground critters / butterflies /
// fireflies). The game spawns `count` creatures of that type wandering within `radius` of
// the point. Click to place; drag orbits. Edit/delete existing zones with Select.

import type { Tool } from '../tool';
import type { Editor } from '../editor';
import { CRITTER_TYPES, type CritterType, type MapCritter } from '../../format/map';
import { el, section, slider, select } from '../ui/dom';

const LABELS: Record<CritterType, string> = {
  birds: 'Birds (overhead)',
  critters: 'Critters (rats/rabbits)',
  butterflies: 'Butterflies',
  fireflies: 'Fireflies (glow)',
};

export const crittersTool: Tool = new (class implements Tool {
  readonly id = 'critters';
  readonly label = 'Critters';
  readonly icon = '🐦';
  readonly dragPaints = false;

  type: CritterType = 'birds';
  radius = 14;
  count = 8;
  private down: { x: number; y: number } | null = null;

  onPointerDown(_e: Editor, ev: PointerEvent): void {
    if (ev.button === 0) this.down = { x: ev.clientX, y: ev.clientY };
  }
  onPointerUp(editor: Editor, ev: PointerEvent): void {
    if (ev.button !== 0 || !this.down) return;
    const moved = Math.hypot(ev.clientX - this.down.x, ev.clientY - this.down.y);
    this.down = null;
    if (moved > 6) return;
    const p = editor.groundPoint(ev);
    if (!p) return;
    const cr: MapCritter = { type: this.type, x: p.x, z: p.z, radius: this.radius, count: Math.round(this.count) };
    editor.addItems(editor.state.critters, [cr], 'Add critters', () => editor.markMarkersDirty());
    editor.setStatus(`${LABELS[this.type]} ×${cr.count} (r=${cr.radius}m)`);
  }

  panel(_editor: Editor): HTMLElement {
    const radiusRow = slider('Radius', {
      min: 3, max: 80, step: 1, value: this.radius,
      onInput: (v) => (this.radius = v),
      format: (v) => `${v.toFixed(0)}m`,
    });
    const countRow = slider('Count', {
      min: 1, max: 40, step: 1, value: this.count,
      onInput: (v) => (this.count = v),
      format: (v) => `${v.toFixed(0)}`,
    });
    return section('Ambient Critters', [
      select('Type', CRITTER_TYPES.map((t) => ({ value: t, label: LABELS[t] })), this.type, (v) => (this.type = v as CritterType)),
      radiusRow.row,
      countRow.row,
      el('p', { class: 'hint', text: 'Click to drop a wildlife zone. Birds wheel overhead, critters scurry, butterflies/fireflies drift. Edit/delete with Select.' }),
    ]);
  }
})();
