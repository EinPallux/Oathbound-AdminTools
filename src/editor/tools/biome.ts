// Biome paint brush: stamps a biome index into the terrain's per-cell biome field,
// which recolours the ground (and tells the game what vegetation to auto-scatter there).

import type { Tool } from '../tool';
import type { Editor } from '../editor';
import { GridStroke } from '../history';
import { BIOME_IDS } from '../../format/map';
import { el, section, slider, select } from '../ui/dom';

const BIOME_LABELS: Record<string, string> = {
  greenmarch: 'Greenmarch (grass)',
  thornwood: 'Thornwood (forest)',
  fen: 'Sunken Fen (bog)',
  ember: 'Emberreach (scorched)',
  riven: 'Riven Peaks (rock/snow)',
  gravereach: 'Gravereach (corrupt)',
  hub: 'Hub / town green',
};

export const biomeTool: Tool = new (class implements Tool {
  readonly id = 'biome';
  readonly label = 'Biome';
  readonly icon = '🎨';
  readonly dragPaints = true;
  private stroke: GridStroke | null = null;

  onPointerDown(editor: Editor, ev: PointerEvent): void {
    if (ev.button !== 0) return;
    this.stroke = new GridStroke(editor.terrain.biomes, 'Paint biome', () => editor.markTerrainDirty());
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
    const biome = editor.paint.biome;
    const biomes = editor.terrain.biomes;
    editor.terrain.forEachCellInRadius(p.x, p.z, editor.brush.size, (idx) => {
      this.stroke?.record(idx);
      biomes[idx] = biome;
    });
    editor.markTerrainDirty();
  }

  panel(editor: Editor): HTMLElement {
    const sizeRow = slider('Brush size', {
      min: 2, max: 140, step: 1, value: editor.brush.size,
      onInput: (v) => (editor.brush.size = v),
      format: (v) => `${v.toFixed(0)}m`,
    });
    const biomeRow = select(
      'Biome',
      BIOME_IDS.map((id, i) => ({ value: String(i), label: BIOME_LABELS[id] ?? id })),
      String(editor.paint.biome),
      (v) => (editor.paint.biome = parseInt(v, 10)),
    );
    return section('Paint Biome', [
      biomeRow,
      sizeRow.row,
      el('p', { class: 'hint', text: 'Biomes recolour the ground and drive in-game vegetation scatter.' }),
    ]);
  }
})();
