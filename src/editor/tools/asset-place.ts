// Asset placement: drop props onto the terrain (single or scattered), with optional
// rotation/scale jitter and a translucent ghost preview. The panel doubles as the asset
// library (built-ins + your custom assets). Placement is one undoable command per stroke.

import * as THREE from 'three';
import type { Tool } from '../tool';
import type { Editor } from '../editor';
import type { AssetCategory, PlacedAsset } from '../../format/map';
import { BUILTIN_ASSETS } from '../../format/assets-builtin';
import { makePreviewMesh, previewYLift, defaultScaleFor } from '../../engine/asset-render';
import { el, section, slider, checkbox } from '../ui/dom';

const CATEGORY_ORDER: AssetCategory[] = ['tree', 'plant', 'rock', 'structure', 'misc'];
const CATEGORY_LABELS: Record<AssetCategory, string> = {
  tree: 'Trees',
  plant: 'Plants & Ground Cover',
  rock: 'Rocks',
  structure: 'Structures',
  misc: 'Misc',
};

export const assetTool: Tool = new (class implements Tool {
  readonly id = 'assets';
  readonly label = 'Assets';
  readonly icon = '🌲';
  readonly dragPaints = true;

  private preview: THREE.Mesh | null = null;
  private previewAsset = '';
  private startIndex = 0;
  private count = 0;
  private placing = false;
  private lastPlace: { x: number; z: number } | null = null;

  onActivate(editor: Editor): void {
    this.refreshPreview(editor);
  }
  onDeactivate(editor: Editor): void {
    this.removePreview(editor);
    editor.hideBrush();
  }

  onPointerDown(editor: Editor, ev: PointerEvent): void {
    if (ev.button !== 0) return;
    const p = editor.groundPoint(ev);
    if (!p) return;
    this.placing = true;
    this.startIndex = editor.state.assets.length;
    this.count = 0;
    this.lastPlace = null;
    this.placeAt(editor, p.x, p.z);
  }

  onPointerMove(editor: Editor, ev: PointerEvent): void {
    const p = editor.groundPoint(ev);
    this.refreshPreview(editor);
    if (p && this.preview) {
      this.preview.visible = true;
      this.preview.position.set(p.x, editor.terrain.heightAt(p.x, p.z) + previewYLift(editor.placement.asset, editor.placement.scale), p.z);
      this.preview.scale.setScalar(editor.placement.scale);
      editor.showBrush(p.x, p.z, editor.placement.scatterCount > 1 ? editor.placement.scatterRadius : editor.placement.scale);
    } else if (this.preview) {
      this.preview.visible = false;
    }
    if (!this.placing || !p) return;
    const spacing = editor.placement.scatterCount > 1 ? editor.placement.scatterRadius : Math.max(1.2, editor.placement.scale * 1.1);
    if (this.lastPlace && Math.hypot(p.x - this.lastPlace.x, p.z - this.lastPlace.z) < spacing) return;
    this.placeAt(editor, p.x, p.z);
  }

  onPointerUp(editor: Editor): void {
    if (!this.placing) return;
    this.placing = false;
    if (this.count === 0) return;
    const start = this.startIndex;
    const added = editor.state.assets.slice(start, start + this.count);
    editor.history.push({
      label: 'Place assets',
      redo: () => {
        editor.state.assets.splice(start, 0, ...added);
        editor.markAssetsDirty();
        editor.onStateChange?.();
      },
      undo: () => {
        editor.state.assets.splice(start, added.length);
        editor.markAssetsDirty();
        editor.onStateChange?.();
      },
    });
    editor.setStatus(`Placed ${this.count} asset${this.count > 1 ? 's' : ''}`);
  }

  private placeAt(editor: Editor, x: number, z: number): void {
    this.lastPlace = { x, z };
    const pl = editor.placement;
    const n = Math.max(1, Math.round(pl.scatterCount));
    for (let i = 0; i < n; i++) {
      let px = x;
      let pz = z;
      if (n > 1) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * pl.scatterRadius;
        px += Math.cos(a) * r;
        pz += Math.sin(a) * r;
      }
      const jitter = 1 + (Math.random() * 2 - 1) * pl.jitterScale;
      const item: PlacedAsset = {
        asset: pl.asset,
        x: px,
        z: pz,
        scale: Math.max(0.05, pl.scale * jitter),
        rot: pl.jitterRot ? Math.random() * Math.PI * 2 : 0,
      };
      editor.state.assets.push(item);
      this.count++;
    }
    editor.markAssetsDirty();
  }

  private refreshPreview(editor: Editor): void {
    if (this.previewAsset === editor.placement.asset && this.preview) return;
    this.removePreview(editor);
    this.preview = makePreviewMesh(editor.placement.asset, editor.state.customAssets);
    this.previewAsset = editor.placement.asset;
    if (this.preview) {
      this.preview.visible = false;
      editor.viewport.scene.add(this.preview);
    }
  }
  private removePreview(editor: Editor): void {
    if (this.preview) {
      editor.viewport.scene.remove(this.preview);
      (this.preview.material as THREE.Material).dispose();
      this.preview = null;
    }
  }

  panel(editor: Editor): HTMLElement {
    // Library grid (built-ins grouped by category + custom assets).
    const grid = el('div', { class: 'asset-lib' });
    const addBtn = (id: string, label: string): void => {
      const b = el('button', {
        class: `asset-chip${editor.placement.asset === id ? ' active' : ''}`,
        text: label,
        onClick: () => {
          editor.placement.asset = id;
          editor.placement.scale = defaultScaleFor(id);
          this.refreshPreview(editor);
          editor.onStateChange?.();
        },
      });
      grid.append(b);
    };
    for (const cat of CATEGORY_ORDER) {
      const items = BUILTIN_ASSETS.filter((a) => a.category === cat);
      if (!items.length) continue;
      grid.append(el('div', { class: 'lib-cat', text: CATEGORY_LABELS[cat] }));
      for (const a of items) addBtn(a.id, a.label);
    }
    if (editor.state.customAssets.length) {
      grid.append(el('div', { class: 'lib-cat', text: 'Custom Assets' }));
      for (const d of editor.state.customAssets) addBtn(`custom:${d.id}`, d.name);
    }

    const scaleRow = slider('Scale', {
      min: 0.2, max: 6, step: 0.05, value: editor.placement.scale,
      onInput: (v) => (editor.placement.scale = v),
      format: (v) => `${v.toFixed(2)}×`,
    });
    const countRow = slider('Scatter count', {
      min: 1, max: 40, step: 1, value: editor.placement.scatterCount,
      onInput: (v) => (editor.placement.scatterCount = v),
      format: (v) => `${v.toFixed(0)}`,
    });
    const radiusRow = slider('Scatter radius', {
      min: 1, max: 60, step: 1, value: editor.placement.scatterRadius,
      onInput: (v) => (editor.placement.scatterRadius = v),
      format: (v) => `${v.toFixed(0)}m`,
    });
    const jitterRow = slider('Scale jitter', {
      min: 0, max: 0.6, step: 0.02, value: editor.placement.jitterScale,
      onInput: (v) => (editor.placement.jitterScale = v),
      format: (v) => `±${(v * 100).toFixed(0)}%`,
    });

    return section('Place Assets', [
      grid,
      scaleRow.row,
      checkbox('Random rotation', editor.placement.jitterRot, (v) => (editor.placement.jitterRot = v)),
      jitterRow.row,
      countRow.row,
      radiusRow.row,
      el('p', { class: 'hint', text: 'Left-click or drag to place · scatter count > 1 spreads within the radius.' }),
    ]);
  }
})();
