// Ground paint brush: stamps a ground-surface index into the terrain's per-cell ground field,
// which recolours the terrain (city paving, grass, desert, mesa, …). Index 0–6 are the
// gameplay biomes; 7+ are extra cosmetic surfaces. Cosmetic only on custom maps — they don't
// drive in-game vegetation scatter. (Was the "Biome" tool.)

import type { Tool } from '../tool';
import type { Editor } from '../editor';
import { GridStroke } from '../history';
import { el, section, slider, select } from '../ui/dom';

// Ordered for the dropdown (value = ground index from BIOME_IDS; never reorder those indices).
const GROUND_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Grass (green)' },
  { value: 6, label: 'Town green' },
  { value: 1, label: 'Forest floor' },
  { value: 17, label: 'Jungle (lush)' },
  { value: 10, label: 'Savanna (dry grass)' },
  { value: 8, label: 'Desert sand' },
  { value: 13, label: 'Beach sand' },
  { value: 12, label: 'Dirt / soil' },
  { value: 14, label: 'Mud' },
  { value: 2, label: 'Marsh / bog' },
  { value: 9, label: 'Mesa (red rock)' },
  { value: 4, label: 'Rocky / snow peaks' },
  { value: 11, label: 'Tundra' },
  { value: 18, label: 'Ice' },
  { value: 7, label: 'City (paved stone)' },
  { value: 15, label: 'Cobblestone road' },
  { value: 3, label: 'Scorched / volcanic' },
  { value: 16, label: 'Ash / wasteland' },
  { value: 19, label: 'Basalt (lava rock)' },
  { value: 5, label: 'Corrupted ground' },
];

export const groundTool: Tool = new (class implements Tool {
  readonly id = 'ground';
  readonly label = 'Ground';
  readonly icon = '🎨';
  readonly dragPaints = true;
  private stroke: GridStroke | null = null;

  onPointerDown(editor: Editor, ev: PointerEvent): void {
    if (ev.button !== 0) return;
    this.stroke = new GridStroke(editor.terrain.biomes, 'Paint ground', () => editor.markTerrainDirty());
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
      editor.reseatLayers();
    }
  }
  onDeactivate(editor: Editor): void {
    editor.hideBrush();
  }

  private paint(editor: Editor, ev: PointerEvent): void {
    const p = editor.groundPoint(ev);
    if (!p) return;
    const ground = editor.paint.biome;
    const biomes = editor.terrain.biomes;
    editor.terrain.forEachCellInRadius(p.x, p.z, editor.brush.size, (idx) => {
      this.stroke?.record(idx);
      biomes[idx] = ground;
    });
    editor.markTerrainDirty();
  }

  panel(editor: Editor): HTMLElement {
    const sizeRow = slider('Brush size', {
      min: 2, max: 140, step: 1, value: editor.brush.size,
      onInput: (v) => (editor.brush.size = v),
      format: (v) => `${v.toFixed(0)}m`,
    });
    const groundRow = select(
      'Ground',
      GROUND_OPTIONS.map((o) => ({ value: String(o.value), label: o.label })),
      String(editor.paint.biome),
      (v) => (editor.paint.biome = parseInt(v, 10)),
    );
    return section('Paint Ground', [
      groundRow,
      sizeRow.row,
      el('p', { class: 'hint', text: 'Recolours the terrain. 0–6 are gameplay biomes; the rest (City, Desert, Mesa, …) are cosmetic ground surfaces. City & cobblestone get a paved-stone look.' }),
    ]);
  }
})();
