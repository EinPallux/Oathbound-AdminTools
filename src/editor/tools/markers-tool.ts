// Markers tool: place gameplay entities — enemy spawns, world bosses, Oathstone travel
// points — and set the singletons (player spawn, the town). Click to place/move; drag to
// orbit. Per-type options live in the tool panel.

import type { Tool } from '../tool';
import type { Editor } from '../editor';
import {
  BOSS_IDS, ENEMY_IDS, ENEMY_TIERS,
  type BossId, type EnemyId, type EnemyTier, type MapOathstone, type MapSpawn,
} from '../../format/map';
import { el, section, select, row } from '../ui/dom';

type Mode = 'spawn' | 'boss' | 'oathstone' | 'player';

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'stone';
}

export const markersTool: Tool = new (class implements Tool {
  readonly id = 'markers';
  readonly label = 'Markers';
  readonly icon = '📍';
  readonly dragPaints = false;

  mode: Mode = 'spawn';
  enemyId: EnemyId = 'bloomhusk';
  level = 1;
  tier: EnemyTier = 'standard';
  spawnName = '';
  bossId: BossId = 'emberhorn';
  oathName = 'New Waystone';
  oathRoad = true;

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
    this.place(editor, p.x, p.z);
  }

  private place(editor: Editor, x: number, z: number): void {
    const s = editor.state;
    switch (this.mode) {
      case 'spawn': {
        const spawn: MapSpawn = { id: this.enemyId, x, z, level: this.level };
        if (this.tier !== 'standard') spawn.tier = this.tier;
        if (this.spawnName.trim()) spawn.name = this.spawnName.trim();
        editor.addItems(s.spawns, [spawn], 'Add spawn', () => editor.markMarkersDirty());
        editor.setStatus(`Spawn: ${spawn.name ?? spawn.id} Lv${spawn.level}`);
        break;
      }
      case 'boss':
        editor.addItems(s.bosses, [{ id: this.bossId, x, z }], 'Add boss', () => editor.markMarkersDirty());
        editor.setStatus(`Boss: ${this.bossId}`);
        break;
      case 'oathstone': {
        const taken = new Set(s.oathstones.map((o) => o.id));
        let id = slug(this.oathName);
        let n = 2;
        while (taken.has(id)) id = `${slug(this.oathName)}-${n++}`;
        const stone: MapOathstone = { id, name: this.oathName.trim() || 'Waystone', x, z, road: this.oathRoad };
        editor.addItems(s.oathstones, [stone], 'Add Oathstone', () => editor.markMarkersDirty());
        editor.setStatus(`Oathstone: ${stone.name}`);
        break;
      }
      case 'player': {
        const prev = { ...s.playerSpawn };
        const next = { x, z };
        editor.history.apply({
          label: 'Move player spawn',
          redo: () => { s.playerSpawn = { ...next }; editor.markMarkersDirty(); editor.onStateChange?.(); },
          undo: () => { s.playerSpawn = { ...prev }; editor.markMarkersDirty(); editor.onStateChange?.(); },
        });
        editor.setStatus('Player spawn moved');
        break;
      }
    }
  }

  private textInput(value: string, onInput: (v: string) => void): HTMLInputElement {
    const i = el('input', { type: 'text', value }) as HTMLInputElement;
    i.addEventListener('input', () => onInput(i.value));
    return i;
  }
  private numInput(value: number, min: number, max: number, onInput: (v: number) => void): HTMLInputElement {
    const i = el('input', { type: 'number', value, min, max }) as HTMLInputElement;
    i.addEventListener('input', () => onInput(Math.max(min, Math.min(max, parseInt(i.value || '0', 10)))));
    return i;
  }

  panel(_editor: Editor): HTMLElement {
    const body = el('div', {});
    const rebuild = (): void => {
      body.replaceChildren();
      if (this.mode === 'spawn') {
        body.append(
          select('Enemy', ENEMY_IDS.map((e) => ({ value: e, label: e })), this.enemyId, (v) => (this.enemyId = v as EnemyId)),
          row('Level', this.numInput(this.level, 1, 30, (v) => (this.level = v))),
          select('Tier', ENEMY_TIERS.map((t) => ({ value: t, label: t })), this.tier, (v) => (this.tier = v as EnemyTier)),
          row('Name (optional)', this.textInput(this.spawnName, (v) => (this.spawnName = v))),
        );
      } else if (this.mode === 'boss') {
        body.append(select('Boss', BOSS_IDS.map((b) => ({ value: b, label: b })), this.bossId, (v) => (this.bossId = v as BossId)));
      } else if (this.mode === 'oathstone') {
        const roadWrap = el('label', { class: 'row check-row' });
        const cb = el('input', { type: 'checkbox' }) as HTMLInputElement;
        cb.checked = this.oathRoad;
        cb.addEventListener('change', () => (this.oathRoad = cb.checked));
        roadWrap.append(cb, el('span', { text: 'Road from hub to this stone' }));
        body.append(row('Name', this.textInput(this.oathName, (v) => (this.oathName = v))), roadWrap);
      } else if (this.mode === 'player') {
        body.append(el('p', { class: 'hint', text: 'Click the ground to move the player spawn point.' }));
      }
    };
    rebuild();
    const modeRow = select(
      'Marker type',
      [
        { value: 'spawn', label: 'Enemy spawn' },
        { value: 'boss', label: 'World boss' },
        { value: 'oathstone', label: 'Oathstone (travel)' },
        { value: 'player', label: 'Player spawn' },
      ],
      this.mode,
      (v) => {
        this.mode = v as Mode;
        rebuild();
      },
    );
    return section('Place Markers', [
      modeRow,
      body,
      el('p', { class: 'hint', text: 'Click to place · use Select to edit/delete existing markers.' }),
    ]);
  }
})();
