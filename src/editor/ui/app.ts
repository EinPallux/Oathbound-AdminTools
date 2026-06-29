// Wires the editor to the DOM: a left tool rail + active-tool panel, a top action bar
// (new / save / load / export / import / asset builder / undo-redo) and a status bar.

import type { Editor } from '../editor';
import { EditorState } from '../state';
import { el, button, row, select } from './dom';
import { openAssetBuilder } from './asset-builder';
import {
  autosave, deleteLocal, downloadMap, importMapFile, listSaves, loadLocal, saveLocal,
} from '../storage';

export class EditorUI {
  private toolbar!: HTMLElement;
  private panel!: HTMLElement;
  private statusEl!: HTMLElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private nameLabel!: HTMLElement;

  constructor(private readonly editor: Editor, private readonly root: HTMLElement) {
    this.build();
    editor.onStatus = (m) => (this.statusEl.textContent = m);
    editor.onToolChange = () => {
      this.renderToolbar();
      this.renderPanel();
    };
    editor.onStateChange = () => {
      this.renderPanel();
      this.renderTopbar();
      this.queueAutosave();
    };
    this.renderToolbar();
    this.renderPanel();
    this.renderTopbar();
  }

  private build(): void {
    this.toolbar = el('div', { class: 'toolbar' });
    this.panel = el('div', { class: 'panel' });
    this.statusEl = el('div', { class: 'status-text', text: 'Sculpt the land, paint biomes, place water, roads, assets & markers — then Export.' });

    const topbar = el('div', { class: 'topbar' });
    this.nameLabel = el('span', { class: 'map-name', text: this.editor.state.name });
    this.undoBtn = button('↶', () => { this.editor.history.undo(); this.editor.markAllDirty(); this.editor.onStateChange?.(); }, 'icon');
    this.redoBtn = button('↷', () => { this.editor.history.redo(); this.editor.markAllDirty(); this.editor.onStateChange?.(); }, 'icon');
    this.undoBtn.title = 'Undo (Ctrl+Z)';
    this.redoBtn.title = 'Redo (Ctrl+Y)';

    topbar.append(
      el('span', { class: 'brand', text: '⚒ Oathbound Map Builder' }),
      this.nameLabel,
      el('div', { class: 'spacer' }),
      this.undoBtn,
      this.redoBtn,
      button('New', () => this.openNewMap()),
      button('Save', () => this.doSave()),
      button('Load', () => this.openSaves()),
      button('Import', () => this.doImport()),
      button('Export JSON', () => this.doExport(), 'primary'),
      button('Asset Builder', () => openAssetBuilder(this.editor)),
    );

    const left = el('div', { class: 'left-rail' }, [this.toolbar, this.panel]);
    const statusbar = el('div', { class: 'statusbar' }, [this.statusEl, el('span', { class: 'hint-right', text: 'Right-drag orbit · wheel zoom · middle-drag pan' })]);
    this.root.append(topbar, left, statusbar);
  }

  private renderToolbar(): void {
    this.toolbar.replaceChildren();
    for (const tool of this.editor.tools) {
      const b = el('button', {
        class: `tool-btn${tool === this.editor.activeTool ? ' active' : ''}`,
        title: tool.label,
        onClick: () => this.editor.setTool(tool.id),
      }, [el('span', { class: 'tool-icon', text: tool.icon }), el('span', { class: 'tool-label', text: tool.label })]);
      this.toolbar.append(b);
    }
  }

  private renderPanel(): void {
    this.panel.replaceChildren();
    const p = this.editor.activeTool.panel?.(this.editor);
    if (p) this.panel.append(p);
    this.panel.append(this.sceneStats());
  }

  private sceneStats(): HTMLElement {
    const s = this.editor.state;
    const stat = (label: string, n: number): HTMLElement =>
      el('div', { class: 'stat' }, [el('b', { text: String(n) }), el('span', { text: label })]);
    return el('div', { class: 'section stats' }, [
      el('h3', { text: 'Scene' }),
      el('div', { class: 'stat-grid' }, [
        stat('assets', s.assets.length),
        stat('lakes', s.lakes.length),
        stat('rivers', s.rivers.length),
        stat('roads', s.roads.length),
        stat('spawns', s.spawns.length),
        stat('bosses', s.bosses.length),
        stat('stones', s.oathstones.length),
        stat('custom', s.customAssets.length),
      ]),
    ]);
  }

  private renderTopbar(): void {
    this.nameLabel.textContent = this.editor.state.name;
    this.undoBtn.disabled = !this.editor.history.canUndo();
    this.redoBtn.disabled = !this.editor.history.canRedo();
  }

  // ── Actions ──────────────────────────────────────────────────────────────-

  private doExport(): void {
    const map = this.editor.state.toMap(this.editor.terrain);
    downloadMap(map);
    this.editor.setStatus(`Exported “${map.name}” — drop it into Oathbound’s public/maps/.`);
  }

  private doSave(): void {
    const map = this.editor.state.toMap(this.editor.terrain);
    const ok = saveLocal(map);
    this.editor.setStatus(ok ? `Saved “${map.name}” to this browser.` : 'Save failed (storage full).');
  }

  private async doImport(): Promise<void> {
    const raw = await importMapFile();
    if (!raw) return;
    try {
      const { state, heights, biomes } = EditorState.fromMap(raw);
      this.editor.loadState(state, heights, biomes);
    } catch (e) {
      this.editor.setStatus(`Import failed: ${(e as Error).message}`);
    }
  }

  private loadByName(name: string): void {
    const raw = loadLocal(name);
    if (!raw) return;
    const { state, heights, biomes } = EditorState.fromMap(raw);
    this.editor.loadState(state, heights, biomes);
  }

  private queueAutosaveTimer = 0;
  private queueAutosave(): void {
    window.clearTimeout(this.queueAutosaveTimer);
    this.queueAutosaveTimer = window.setTimeout(() => {
      autosave(this.editor.state.toMap(this.editor.terrain));
    }, 1200);
  }

  // ── Modals ───────────────────────────────────────────────────────────────-

  private openNewMap(): void {
    let name = 'Untitled Map';
    let size = this.editor.state.size;
    let res = String(this.editor.state.res);
    const nameI = el('input', { type: 'text', value: name }) as HTMLInputElement;
    nameI.addEventListener('input', () => (name = nameI.value));
    const sizeI = el('input', { type: 'number', value: size, min: 100, max: 2000, step: 20 }) as HTMLInputElement;
    sizeI.addEventListener('input', () => (size = parseInt(sizeI.value || '680', 10)));
    const body = el('div', {}, [
      row('Name', nameI),
      row('World size (m)', sizeI),
      select('Resolution', [
        { value: '129', label: '129² — coarse, fast' },
        { value: '193', label: '193² — medium' },
        { value: '257', label: '257² — detailed (default)' },
        { value: '321', label: '321² — fine, heavier' },
      ], res, (v) => (res = v)),
      el('p', { class: 'hint', text: 'A new map clears the current one. Save or Export first if needed.' }),
    ]);
    modal('New Map', body, [
      button('Cancel', () => closeModal()),
      button('Create', () => {
        this.editor.newMap(name || 'Untitled Map', Math.max(100, size), parseInt(res, 10));
        closeModal();
      }, 'primary'),
    ]);
  }

  private openSaves(): void {
    const names = listSaves();
    const list = el('div', { class: 'save-list' });
    if (!names.length) list.append(el('p', { class: 'hint', text: 'No saved maps in this browser yet.' }));
    for (const n of names) {
      list.append(el('div', { class: 'save-row' }, [
        el('span', { class: 'save-name', text: n }),
        button('Load', () => { this.loadByName(n); closeModal(); }),
        button('Delete', () => { deleteLocal(n); closeModal(); this.openSaves(); }, 'danger'),
      ]));
    }
    modal('Saved Maps', list, [button('Close', () => closeModal())]);
  }
}

// ── Generic modal ────────────────────────────────────────────────────────────

let modalEl: HTMLElement | null = null;
export function modal(title: string, content: HTMLElement, actions: HTMLElement[]): void {
  closeModal();
  const dialog = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [el('h2', { text: title }), button('✕', () => closeModal(), 'icon')]),
    el('div', { class: 'modal-body' }, [content]),
    el('div', { class: 'modal-actions' }, actions),
  ]);
  modalEl = el('div', { class: 'modal-overlay', onClick: (e: MouseEvent) => { if (e.target === modalEl) closeModal(); } }, [dialog]);
  document.body.append(modalEl);
}
export function closeModal(): void {
  modalEl?.remove();
  modalEl = null;
}
