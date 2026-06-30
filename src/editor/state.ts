// The editor's working data model. Terrain heights/biomes live in EditorTerrain; this
// holds everything else and (de)serializes to the shared OathboundMap format.

import type { EditorTerrain } from '../engine/terrain';
import {
  MAP_FORMAT_VERSION,
  normalizeMap,
  packHeights,
  unpackHeights,
  type AssetDef,
  type MapBoss,
  type MapFlat,
  type MapCritter,
  type MapLake,
  type MapNpc,
  type MapOathstone,
  type MapPath,
  type MapSpawn,
  type OathboundMap,
  type PlacedAsset,
} from '../format/map';

export const DEFAULT_SIZE = 680;
export const DEFAULT_RES = 257;

export class EditorState {
  name = 'Untitled Map';
  size = DEFAULT_SIZE;
  res = DEFAULT_RES;
  lakes: MapLake[] = [];
  rivers: MapPath[] = [];
  roads: MapPath[] = [];
  assets: PlacedAsset[] = [];
  customAssets: AssetDef[] = [];
  spawns: MapSpawn[] = [];
  bosses: MapBoss[] = [];
  oathstones: MapOathstone[] = [];
  npcs: MapNpc[] = [];
  critters: MapCritter[] = [];
  playerSpawn: { x: number; z: number } = { x: 0, z: 0 };
  flats: MapFlat[] = [];
  village: { x: number; z: number; rot: number } | null = null;

  /** Build the export object, pulling terrain from the live field. */
  toMap(terrain: EditorTerrain): OathboundMap {
    return {
      version: MAP_FORMAT_VERSION,
      name: this.name,
      size: this.size,
      res: this.res,
      heightsPacked: packHeights(terrain.heights),
      biomes: Array.from(terrain.biomes),
      lakes: this.lakes,
      rivers: this.rivers,
      roads: this.roads,
      assets: this.assets,
      customAssets: this.customAssets,
      spawns: this.spawns,
      bosses: this.bosses,
      oathstones: this.oathstones,
      npcs: this.npcs,
      critters: this.critters,
      playerSpawn: this.playerSpawn,
      flats: this.flats,
      village: this.village,
    };
  }

  /** Load from a parsed map: returns the normalized map + the decoded terrain arrays. */
  static fromMap(raw: unknown): { state: EditorState; map: OathboundMap; heights: Float32Array; biomes: Uint8Array } {
    const map = normalizeMap(raw);
    const s = new EditorState();
    s.name = map.name;
    s.size = map.size;
    s.res = map.res;
    s.lakes = map.lakes;
    s.rivers = map.rivers;
    s.roads = map.roads;
    s.assets = map.assets;
    s.customAssets = map.customAssets;
    s.spawns = map.spawns;
    s.bosses = map.bosses;
    s.oathstones = map.oathstones;
    s.npcs = map.npcs;
    s.critters = map.critters;
    s.playerSpawn = map.playerSpawn;
    s.flats = map.flats;
    s.village = map.village;
    const heights = unpackHeights(map);
    const biomes = Uint8Array.from(map.biomes);
    return { state: s, map, heights, biomes };
  }
}
