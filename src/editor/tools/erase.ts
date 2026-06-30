// Erase: drag over the terrain to remove placed props and/or water features (lakes, rivers,
// roads) within the brush. A whole lake / river / road is removed when the brush touches any
// part of it. One undoable command per stroke restores everything that was removed.

import type { Tool } from '../tool';
import type { Editor } from '../editor';
import type { PlacedAsset, MapLake, MapPath } from '../../format/map';
import { el, section, slider, checkbox } from '../ui/dom';

/** Shortest distance from point (px,pz) to the segment (ax,az)-(bx,bz). */
function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx;
  const cz = az + t * dz;
  return Math.hypot(px - cx, pz - cz);
}

/** True if the brush (centre p, radius r) touches any part of the path (incl. its width). */
function pathNearBrush(path: MapPath, px: number, pz: number, r: number): boolean {
  const reach = r + path.width / 2;
  const pts = path.points;
  if (!pts.length) return false;
  if (pts.length === 1) return Math.hypot(px - pts[0].x, pz - pts[0].z) <= reach;
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(px, pz, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z) <= reach) return true;
  }
  return false;
}

export const eraseTool: Tool = new (class implements Tool {
  readonly id = 'erase';
  readonly label = 'Erase';
  readonly icon = '🧽';
  readonly dragPaints = true;
  eraseAssets = true;
  eraseWater = true; // lakes, rivers & roads

  private erasing = false;
  private rmAssets: PlacedAsset[] = [];
  private rmLakes: MapLake[] = [];
  private rmRivers: MapPath[] = [];
  private rmRoads: MapPath[] = [];

  onPointerDown(editor: Editor, ev: PointerEvent): void {
    if (ev.button !== 0) return;
    this.erasing = true;
    this.rmAssets = [];
    this.rmLakes = [];
    this.rmRivers = [];
    this.rmRoads = [];
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
    const a = this.rmAssets, lk = this.rmLakes, rv = this.rmRivers, rd = this.rmRoads;
    const total = a.length + lk.length + rv.length + rd.length;
    if (!total) return;
    const aSet = new Set(a), lkSet = new Set(lk), rvSet = new Set(rv), rdSet = new Set(rd);
    const s = editor.state;
    const touchedWater = lk.length + rv.length + rd.length > 0;
    editor.history.push({
      label: `Erase ${total} item(s)`,
      undo: () => {
        if (a.length) s.assets.push(...a);
        if (lk.length) s.lakes.push(...lk);
        if (rv.length) s.rivers.push(...rv);
        if (rd.length) s.roads.push(...rd);
        if (a.length) editor.markAssetsDirty();
        if (touchedWater) editor.markWaterDirty();
        editor.onStateChange?.();
      },
      redo: () => {
        if (a.length) s.assets = s.assets.filter((x) => !aSet.has(x));
        if (lk.length) s.lakes = s.lakes.filter((x) => !lkSet.has(x));
        if (rv.length) s.rivers = s.rivers.filter((x) => !rvSet.has(x));
        if (rd.length) s.roads = s.roads.filter((x) => !rdSet.has(x));
        if (a.length) editor.markAssetsDirty();
        if (touchedWater) editor.markWaterDirty();
        editor.onStateChange?.();
      },
    });
    editor.setStatus(`Erased ${total} item${total > 1 ? 's' : ''}`);
    this.rmAssets = [];
    this.rmLakes = [];
    this.rmRivers = [];
    this.rmRoads = [];
  }
  onDeactivate(editor: Editor): void {
    editor.hideBrush();
  }

  private eraseAt(editor: Editor, ev: PointerEvent): void {
    const p = editor.groundPoint(ev);
    if (!p) return;
    const s = editor.state;
    const r = editor.brush.size;
    let assetsChanged = false;
    let waterChanged = false;

    if (this.eraseAssets) {
      const r2 = r * r;
      const keep: PlacedAsset[] = [];
      for (const a of s.assets) {
        if ((a.x - p.x) ** 2 + (a.z - p.z) ** 2 <= r2) this.rmAssets.push(a);
        else keep.push(a);
      }
      if (keep.length !== s.assets.length) { s.assets = keep; assetsChanged = true; }
    }

    if (this.eraseWater) {
      const keepLakes: MapLake[] = [];
      for (const lk of s.lakes) {
        if (Math.hypot(lk.x - p.x, lk.z - p.z) <= r + lk.r) this.rmLakes.push(lk);
        else keepLakes.push(lk);
      }
      if (keepLakes.length !== s.lakes.length) { s.lakes = keepLakes; waterChanged = true; }

      const keepRivers: MapPath[] = [];
      for (const rvp of s.rivers) {
        if (pathNearBrush(rvp, p.x, p.z, r)) this.rmRivers.push(rvp);
        else keepRivers.push(rvp);
      }
      if (keepRivers.length !== s.rivers.length) { s.rivers = keepRivers; waterChanged = true; }

      const keepRoads: MapPath[] = [];
      for (const rdp of s.roads) {
        if (pathNearBrush(rdp, p.x, p.z, r)) this.rmRoads.push(rdp);
        else keepRoads.push(rdp);
      }
      if (keepRoads.length !== s.roads.length) { s.roads = keepRoads; waterChanged = true; }
    }

    if (assetsChanged) editor.markAssetsDirty();
    if (waterChanged) editor.markWaterDirty();
  }

  panel(editor: Editor): HTMLElement {
    const sizeRow = slider('Erase radius', {
      min: 1, max: 80, step: 1, value: editor.brush.size,
      onInput: (v) => (editor.brush.size = v),
      format: (v) => `${v.toFixed(0)}m`,
    });
    return section('Erase', [
      sizeRow.row,
      checkbox('Assets (props)', this.eraseAssets, (v) => (this.eraseAssets = v)),
      checkbox('Lakes, rivers & roads', this.eraseWater, (v) => (this.eraseWater = v)),
      el('p', { class: 'hint', text: 'Left-drag to remove anything under the brush. A whole lake / river / road is removed when the brush touches it. Untick a category to protect it. Undo restores everything.' }),
    ]);
  }
})();
