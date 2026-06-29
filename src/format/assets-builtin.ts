// Catalog of the game's built-in props (pure metadata — no three.js). Each entry maps
// a catalog id ("<kind>:<variant>") to a label, category, a base collider radius (or
// null for visual-only decor, matching the game where scenery adds no colliders), and
// the y-lift used when seating it on the terrain. The geometry for these is built in
// src/oathbound/geometry.ts (editor) and reproduced by the game's buildScenery on load.

import type { AssetCategory } from './map';

export type BuiltinKind =
  | 'tree'
  | 'boulder'
  | 'pebble'
  | 'bush'
  | 'grass'
  | 'flower'
  | 'fern'
  | 'mushroom'
  | 'log'
  | 'lily';

export interface BuiltinEntry {
  id: string; // "<kind>:<variant>"
  kind: BuiltinKind;
  variant: number;
  label: string;
  category: AssetCategory;
  /** Base physical collider radius (m) at scale 1, or null for visual-only. */
  collider: number | null;
  /** Default placement scale. */
  scale: number;
}

function entry(
  kind: BuiltinKind,
  variant: number,
  label: string,
  category: AssetCategory,
  collider: number | null,
  scale: number,
): BuiltinEntry {
  return { id: `${kind}:${variant}`, kind, variant, label, category, collider, scale };
}

// Decor (trees, plants, etc.) is visual-only like the game; boulders are solid so a
// placed rock blocks movement as you'd expect from a hand-built map.
export const BUILTIN_ASSETS: BuiltinEntry[] = [
  // Trees (6 variants — broadleaf, pine, dead snag, birch, great oak, willow).
  entry('tree', 0, 'Broadleaf Tree', 'tree', null, 2.0),
  entry('tree', 1, 'Pine', 'tree', null, 2.2),
  entry('tree', 2, 'Dead Snag', 'tree', null, 1.8),
  entry('tree', 3, 'Birch', 'tree', null, 2.0),
  entry('tree', 4, 'Great Oak', 'tree', null, 2.8),
  entry('tree', 5, 'Willow', 'tree', null, 2.2),
  // Boulders (solid).
  entry('boulder', 0, 'Grey Boulder', 'rock', 0.95, 1.4),
  entry('boulder', 1, 'Ember Boulder', 'rock', 0.95, 1.4),
  entry('boulder', 2, 'Ice Boulder', 'rock', 0.95, 1.4),
  entry('boulder', 3, 'Mossy Boulder', 'rock', 0.95, 1.4),
  // Pebbles / small stones.
  entry('pebble', 0, 'Pebble', 'rock', null, 0.35),
  // Bushes.
  entry('bush', 0, 'Leafy Bush', 'plant', null, 1.0),
  entry('bush', 1, 'Bramble Bush', 'plant', null, 1.0),
  entry('bush', 2, 'Fungal Bush', 'plant', null, 1.0),
  entry('bush', 3, 'Flowering Bush', 'plant', null, 1.0),
  // Ground cover.
  entry('grass', 0, 'Grass Tuft', 'plant', null, 0.9),
  entry('grass', 1, 'Fen Reed', 'plant', null, 0.9),
  entry('flower', 0, 'Red Flower', 'plant', null, 0.5),
  entry('flower', 1, 'Yellow Flower', 'plant', null, 0.5),
  entry('flower', 2, 'Purple Flower', 'plant', null, 0.5),
  entry('flower', 3, 'White Flower', 'plant', null, 0.5),
  entry('fern', 0, 'Fern', 'plant', null, 1.0),
  entry('mushroom', 0, 'Red Toadstool', 'plant', null, 0.9),
  entry('mushroom', 1, 'Brown Cap', 'plant', null, 0.9),
  entry('mushroom', 2, 'Pale Glowcap', 'plant', null, 0.9),
  entry('log', 0, 'Fallen Log', 'misc', null, 1.2),
  entry('lily', 0, 'Lily Pad', 'plant', null, 0.9),
];

const BY_ID = new Map(BUILTIN_ASSETS.map((e) => [e.id, e]));

export function builtinById(id: string): BuiltinEntry | undefined {
  return BY_ID.get(id);
}

/** Parse "<kind>:<variant>" → { kind, variant }, or null if not a built-in id. */
export function parseBuiltin(assetId: string): { kind: BuiltinKind; variant: number } | null {
  const e = BY_ID.get(assetId);
  if (!e) return null;
  return { kind: e.kind, variant: e.variant };
}

/** Y-offset (m) to seat a kind's base on the terrain (mirrors the game's yLift). */
export function builtinYLift(kind: BuiltinKind, variant: number, scale: number): number {
  switch (kind) {
    case 'boulder':
      return scale * 0.35;
    case 'pebble':
      return 0.05;
    case 'bush':
      return scale * 0.1;
    case 'grass':
      return variant === 1 ? 0.2 : 0;
    case 'flower':
      return 0.1;
    default:
      return 0;
  }
}
