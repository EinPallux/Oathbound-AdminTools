// Per-ground terrain colouring — the Map Builder paints a per-cell ground index (the "Ground"
// tool) and this maps each index → a terrain colour. The game loader uses an identical copy
// (src/render/custom-map-view.ts) so a custom map's ground reads the same in-engine. Keep the
// two in sync. 0–6 are the gameplay biomes; 7+ are cosmetic ground surfaces.

import * as THREE from 'three';
import { clamp } from '../engine/math';

const PALETTE = {
  greenLow: new THREE.Color(0x375a32),
  greenHigh: new THREE.Color(0x7d8a55),
  thorn: new THREE.Color(0x274a2a),
  fen: new THREE.Color(0x3b4a39),
  ember: new THREE.Color(0x5a2f24),
  emberHot: new THREE.Color(0x713326),
  rivenRock: new THREE.Color(0x8990a0),
  snow: new THREE.Color(0xe8eef6),
  grave: new THREE.Color(0x49455a),
  hub: new THREE.Color(0x6e7a4e),
  // Extended cosmetic ground surfaces.
  city: new THREE.Color(0x70737a),
  desert: new THREE.Color(0xcbb074),
  mesaLow: new THREE.Color(0x8a4326),
  mesaHigh: new THREE.Color(0xbc7d4c),
  savanna: new THREE.Color(0x9d9a54),
  tundra: new THREE.Color(0xc6d1d7),
  dirt: new THREE.Color(0x6b4f33),
  sand: new THREE.Color(0xe2d29a),
  mud: new THREE.Color(0x463726),
  cobble: new THREE.Color(0x8a8278),
  ash: new THREE.Color(0x47443f),
  jungleLow: new THREE.Color(0x1d3a1b),
  jungleHigh: new THREE.Color(0x386030),
  ice: new THREE.Color(0xb9d4e6),
  basalt: new THREE.Color(0x2c2c31),
};

/**
 * Deterministic per-slab brightness for paved ground (city / cobblestone): each `tile`-metre
 * slab gets a steady shade, with a darker seam between slabs — reads as flagstones/paving at
 * the terrain mesh's vertex resolution (which is too coarse for fine cobbles).
 */
function paveShade(wx: number, wz: number, tile: number): number {
  const tx = Math.floor(wx / tile);
  const tz = Math.floor(wz / tile);
  const fx = wx / tile - tx;
  const fz = wz / tile - tz;
  const edge = Math.min(fx, 1 - fx, fz, 1 - fz);
  let h = (tx * 374761393 + tz * 668265263) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  const rnd = ((h >>> 0) % 1000) / 1000;
  let s = 0.84 + rnd * 0.3; // 0.84 .. 1.14 slab-to-slab
  if (edge < 0.07) s *= 0.62; // darker seam/grout between slabs
  return s;
}

/** Terrain colour for a painted ground index at world (wx, wz) + height, written into `out`. */
export function colorForBiome(biome: number, h: number, wx: number, wz: number, out: THREE.Color): THREE.Color {
  const t = clamp((h + 2) / 5, 0, 1);
  switch (biome) {
    case 1: return out.copy(PALETTE.thorn).lerp(PALETTE.greenHigh, t * 0.25);
    case 2: return out.copy(PALETTE.fen);
    case 3: return out.copy(PALETTE.ember).lerp(PALETTE.emberHot, t);
    case 4: { const sn = clamp((h - 24) / 22, 0, 1); return out.copy(PALETTE.rivenRock).lerp(PALETTE.snow, sn); }
    case 5: return out.copy(PALETTE.grave);
    case 6: return out.copy(PALETTE.hub);
    case 7: return out.copy(PALETTE.city).multiplyScalar(paveShade(wx, wz, 12));  // City — paved stone
    case 8: return out.copy(PALETTE.desert);                                       // Desert sand
    case 9: { const band = Math.sin(h * 0.8) * 0.5 + 0.5; return out.copy(PALETTE.mesaLow).lerp(PALETTE.mesaHigh, band); } // Mesa — red strata
    case 10: return out.copy(PALETTE.savanna);                                     // Savanna
    case 11: { const sn = clamp((h - 6) / 20, 0, 1); return out.copy(PALETTE.tundra).lerp(PALETTE.snow, sn); } // Tundra
    case 12: return out.copy(PALETTE.dirt);                                        // Dirt
    case 13: return out.copy(PALETTE.sand);                                        // Beach sand
    case 14: return out.copy(PALETTE.mud);                                         // Mud
    case 15: return out.copy(PALETTE.cobble).multiplyScalar(paveShade(wx, wz, 7)); // Cobblestone road
    case 16: return out.copy(PALETTE.ash);                                         // Ash / wasteland
    case 17: return out.copy(PALETTE.jungleLow).lerp(PALETTE.jungleHigh, t * 0.5); // Jungle
    case 18: return out.copy(PALETTE.ice);                                         // Ice
    case 19: return out.copy(PALETTE.basalt);                                      // Basalt
    default: return out.copy(PALETTE.greenLow).lerp(PALETTE.greenHigh, t);         // 0 — grass
  }
}
