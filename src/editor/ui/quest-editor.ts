// Quests & Dialog editor — a second authoring surface in the same tool (so it can
// reference the map's NPCs and export together). Left: edit an NPC's title + dialog lines.
// Right: create quests (kill/talk objective, giver + turn-in NPC, reward) attached to NPCs
// by id. Everything writes into the map state and exports in the same oathbound-map.json.

import type { Editor } from '../editor';
import {
  ENEMY_IDS, ITEM_SLOTS, ITEM_RARITIES, ITEM_PRIMARY_STATS, RELIC_IDS,
  type MapQuest, type ItemSlot, type ItemRarity, type ItemPrimaryStat, type RelicRewardId,
} from '../../format/map';
import { el, row, select, button } from './dom';
import { modal, closeModal } from './app';

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'quest';
}
function textInput(value: string, on: (v: string) => void): HTMLInputElement {
  const i = el('input', { type: 'text', value }) as HTMLInputElement;
  i.addEventListener('input', () => on(i.value));
  return i;
}
function textArea(value: string, on: (v: string) => void, rows = 3): HTMLTextAreaElement {
  const t = el('textarea', { rows }) as HTMLTextAreaElement;
  t.value = value;
  t.addEventListener('input', () => on(t.value));
  return t;
}
function numInput(value: number, on: (v: number) => void, min = 0): HTMLInputElement {
  const i = el('input', { type: 'number', value, min }) as HTMLInputElement;
  i.addEventListener('input', () => on(Math.max(min, parseInt(i.value || '0', 10))));
  return i;
}

export function openQuestEditor(editor: Editor): void {
  const s = editor.state;
  const npcCol = el('div', { class: 'qe-pane' });
  const questCol = el('div', { class: 'qe-pane' });
  let selectedNpc = s.npcs[0]?.id ?? '';

  const npcOptions = (): { value: string; label: string }[] =>
    s.npcs.map((n) => ({ value: n.id!, label: n.name }));

  function renderNpcCol(): void {
    npcCol.replaceChildren(el('h3', { text: 'NPC Dialog' }));
    if (!s.npcs.length) {
      npcCol.append(el('p', { class: 'hint', text: 'No NPCs yet — place some with the NPCs tool first, then give them dialog here.' }));
      return;
    }
    if (!s.npcs.find((n) => n.id === selectedNpc)) selectedNpc = s.npcs[0].id!;
    npcCol.append(select('NPC', npcOptions(), selectedNpc, (v) => { selectedNpc = v; renderNpcCol(); }));
    const npc = s.npcs.find((n) => n.id === selectedNpc)!;
    npcCol.append(
      row('Title', textInput(npc.title ?? '', (v) => { npc.title = v.trim() || undefined; })),
      el('label', { class: 'row col' }, [
        el('span', { class: 'row-label', text: 'Dialog (one line per row)' }),
        textArea((npc.dialog ?? []).join('\n'), (v) => { npc.dialog = v.split('\n').map((l) => l.trim()).filter(Boolean); }, 5),
      ]),
      el('p', { class: 'hint', text: `Talking to “${npc.name}” shows these lines. Quests this NPC gives/takes are added on the right.` }),
    );
  }

  function objectiveEditor(q: MapQuest): HTMLElement {
    const wrap = el('div', {});
    const render = (): void => {
      wrap.replaceChildren(
        select('Objective', [{ value: 'kill', label: 'Kill enemies' }, { value: 'talk', label: 'Talk to an NPC' }], q.objective.type, (v) => {
          q.objective = v === 'kill' ? { type: 'kill', enemyId: ENEMY_IDS[0], count: 5 } : { type: 'talk', npcId: s.npcs[0]?.id ?? '' };
          render();
        }),
      );
      if (q.objective.type === 'kill') {
        const obj = q.objective;
        wrap.append(
          select('Enemy', ENEMY_IDS.map((e) => ({ value: e, label: e })), obj.enemyId, (v) => { obj.enemyId = v as typeof obj.enemyId; }),
          row('Count', numInput(obj.count, (v) => { obj.count = Math.max(1, v); }, 1)),
        );
      } else {
        const obj = q.objective;
        wrap.append(select('Talk to', npcOptions(), obj.npcId, (v) => { obj.npcId = v; }));
      }
    };
    render();
    return wrap;
  }

  const RELIC_LABELS: Record<RelicRewardId, string> = {
    ashbrand: "Ashbrand, the Tyrant's Horn — weapon",
    'rimewyrm-heart': 'Heart of the Rimewyrm — amulet',
    'hollow-crown': 'Crown of the Hollow King — head',
    'bloodroot-sigil': "Sael's Bloodroot Sigil — ring",
  };

  function itemRewardEditor(q: MapQuest): HTMLElement {
    const wrap = el('div', {});
    const render = (): void => {
      const kind = q.reward.item?.kind ?? 'none';
      wrap.replaceChildren(
        select('Item reward', [
          { value: 'none', label: 'None' },
          { value: 'gear', label: 'Gear (rolled from a spec)' },
          { value: 'relic', label: 'Relic (named unique)' },
        ], kind, (v) => {
          if (v === 'none') q.reward.item = undefined;
          else if (v === 'gear') q.reward.item = { kind: 'gear', slot: 'weapon', rarity: 'uncommon', ilvl: 5 };
          else q.reward.item = { kind: 'relic', relicId: RELIC_IDS[0] };
          render();
        }),
      );
      const it = q.reward.item;
      if (it?.kind === 'gear') {
        wrap.append(
          select('Slot', ITEM_SLOTS.map((sl) => ({ value: sl, label: sl })), it.slot, (v) => { it.slot = v as ItemSlot; }),
          select('Rarity', ITEM_RARITIES.map((r) => ({ value: r, label: r })), it.rarity, (v) => { it.rarity = v as ItemRarity; }),
          row('Item level', numInput(it.ilvl, (v) => { it.ilvl = Math.max(1, v); }, 1)),
          select('Primary stat', [{ value: '', label: '— default (STR) —' }, ...ITEM_PRIMARY_STATS.map((p) => ({ value: p, label: p }))], it.primaryStat ?? '', (v) => { it.primaryStat = (v || undefined) as ItemPrimaryStat | undefined; }),
          el('p', { class: 'hint', text: 'A piece of gear is rolled to this spec on turn-in (armour slots ignore the primary stat).' }),
        );
      } else if (it?.kind === 'relic') {
        wrap.append(
          select('Relic', RELIC_IDS.map((r) => ({ value: r, label: RELIC_LABELS[r] })), it.relicId, (v) => { it.relicId = v as RelicRewardId; }),
          el('p', { class: 'hint', text: 'Hands the player this exact end-game relic — very powerful, use sparingly.' }),
        );
      }
    };
    render();
    return wrap;
  }

  function questCard(q: MapQuest, i: number): HTMLElement {
    const card = el('div', { class: 'quest-card' });
    const head = el('b', { text: q.name || '(unnamed quest)' });
    const refreshTitle = (): void => { head.textContent = q.name || '(unnamed quest)'; };
    card.append(
      el('div', { class: 'part-head' }, [head, button('✕', () => { s.quests.splice(i, 1); renderQuestCol(); }, 'icon danger')]),
      row('Name', textInput(q.name, (v) => { q.name = v; refreshTitle(); })),
      el('label', { class: 'row col' }, [el('span', { class: 'row-label', text: 'Description' }), textArea(q.description, (v) => (q.description = v), 2)]),
      select('Giver (accept)', npcOptions(), q.giver, (v) => (q.giver = v)),
      select('Turn-in (complete)', npcOptions(), q.turnIn, (v) => (q.turnIn = v)),
      objectiveEditor(q),
      el('div', { class: 'row two' }, [
        el('span', { class: 'row-label', text: 'Reward' }),
        el('div', { class: 'vec3' }, [
          labelled('gold', numInput(q.reward.gold, (v) => (q.reward.gold = v))),
          labelled('xp', numInput(q.reward.xp, (v) => (q.reward.xp = v))),
        ]),
      ]),
      itemRewardEditor(q),
      el('label', { class: 'row col' }, [el('span', { class: 'row-label', text: 'Offer text' }), textArea(q.offerText ?? '', (v) => (q.offerText = v || undefined), 2)]),
      el('label', { class: 'row col' }, [el('span', { class: 'row-label', text: 'In-progress text' }), textArea(q.progressText ?? '', (v) => (q.progressText = v || undefined), 2)]),
      el('label', { class: 'row col' }, [el('span', { class: 'row-label', text: 'Complete text' }), textArea(q.completeText ?? '', (v) => (q.completeText = v || undefined), 2)]),
    );
    return card;
  }

  function labelled(label: string, input: HTMLElement): HTMLElement {
    return el('div', { class: 'mini-field' }, [el('span', { text: label }), input]);
  }

  function renderQuestCol(): void {
    questCol.replaceChildren(
      el('div', { class: 'parts-head' }, [
        el('h3', { text: 'Quests' }),
        button('+ Add quest', () => {
          if (!s.npcs.length) { editor.setStatus('Place at least one NPC first.'); return; }
          const npc0 = s.npcs[0].id!;
          const base = slug('quest');
          const used = new Set(s.quests.map((q) => q.id));
          let id = base; let n = 1;
          while (used.has(id)) id = `${base}-${++n}`;
          const q: MapQuest = {
            id, name: 'New Quest', description: '', giver: npc0, turnIn: npc0,
            objective: { type: 'kill', enemyId: ENEMY_IDS[0], count: 5 },
            reward: { gold: 25, xp: 50 },
          };
          s.quests.push(q);
          renderQuestCol();
        }),
      ]),
    );
    if (!s.quests.length) questCol.append(el('p', { class: 'hint', text: 'No quests yet. Add one and attach it to a giver + turn-in NPC.' }));
    s.quests.forEach((q, i) => questCol.append(questCard(q, i)));
  }

  renderNpcCol();
  renderQuestCol();
  const body = el('div', { class: 'quest-editor' }, [npcCol, questCol]);
  modal('Quests & Dialog', body, [button('Done', () => { editor.onStateChange?.(); closeModal(); }, 'primary')]);
}
