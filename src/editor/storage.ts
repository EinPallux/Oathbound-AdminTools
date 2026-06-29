// Persistence: download/upload oathbound-map.json files and keep named saves in
// localStorage. No backend — everything is client-side so it deploys statically to Vercel.

import type { OathboundMap } from '../format/map';

const PREFIX = 'oathbound.map.';
const INDEX = 'oathbound.maps';
const AUTOSAVE = 'oathbound.autosave';

export function exportFilename(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'map';
  return `${slug}.oathbound-map.json`;
}

/** Trigger a browser download of the map JSON. */
export function downloadMap(map: OathboundMap): void {
  const blob = new Blob([JSON.stringify(map)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename(map.name);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Open a file picker and resolve with the parsed JSON (or null if cancelled). */
export function importMapFile(): Promise<unknown | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(String(reader.result)));
        } catch {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
    input.click();
  });
}

function readIndex(): string[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX) ?? '[]') as string[];
  } catch {
    return [];
  }
}
function writeIndex(names: string[]): void {
  localStorage.setItem(INDEX, JSON.stringify(names));
}

export function listSaves(): string[] {
  return readIndex();
}

export function saveLocal(map: OathboundMap): boolean {
  try {
    localStorage.setItem(PREFIX + map.name, JSON.stringify(map));
    const idx = readIndex();
    if (!idx.includes(map.name)) {
      idx.push(map.name);
      writeIndex(idx);
    }
    return true;
  } catch {
    return false; // quota exceeded
  }
}

export function loadLocal(name: string): unknown | null {
  const raw = localStorage.getItem(PREFIX + name);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function deleteLocal(name: string): void {
  localStorage.removeItem(PREFIX + name);
  writeIndex(readIndex().filter((n) => n !== name));
}

export function autosave(map: OathboundMap): void {
  try {
    localStorage.setItem(AUTOSAVE, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}
export function loadAutosave(): unknown | null {
  const raw = localStorage.getItem(AUTOSAVE);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
