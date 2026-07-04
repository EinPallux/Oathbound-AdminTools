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
  mountainLow: new THREE.Color(0x5b554e),
  mountainHigh: new THREE.Color(0x877f73),
};

// ── Ground grain ──────────────────────────────────────────────────────────────
// A little deterministic per-spot colour variation so each ground type reads with *texture* —
// grassy speckle + meadow patches, craggy stone mottle, fine sandy/snowy grit — instead of one
// flat colour per cube. Pure function of world position, so it stays stable as the cube bubble
// rebuilds and matches 1:1 in-game. Kept byte-identical with the game copy (custom-map-view.ts).
type GrainStyle = 'grass' | 'rock' | 'grit' | 'flat';
function hash01(ix: number, iz: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/** Value noise in [0,1) sampled per `cell`-metre block at world (wx, wz). */
function vnoise(wx: number, wz: number, cell: number, seed: number): number {
  return hash01(Math.floor(wx / cell), Math.floor(wz / cell), seed);
}
/** Nudge `out` with per-spot grain matching the ground's material feel. */
function applyGrain(out: THREE.Color, style: GrainStyle, wx: number, wz: number): void {
  if (style === 'grass') {
    const fine = vnoise(wx, wz, 1.7, 11) - 0.5;   // per-blade speckle
    const patch = vnoise(wx, wz, 6.5, 12) - 0.5;  // meadow patches
    out.addScalar(fine * 0.09 + patch * 0.05);
    out.g += patch * 0.035; out.r += patch * 0.02; // patches drift warmer/cooler green
  } else if (style === 'rock') {
    const fine = vnoise(wx, wz, 1.5, 21) - 0.5;
    const crag = vnoise(wx, wz, 3.4, 22) - 0.5;   // blocky craggy mottle
    out.addScalar(fine * 0.12 + crag * 0.09);
  } else if (style === 'grit') {
    const fine = vnoise(wx, wz, 1.4, 31) - 0.5;
    const patch = vnoise(wx, wz, 5, 32) - 0.5;
    out.addScalar(fine * 0.06 + patch * 0.035);   // subtle sand/snow grain
  }
}

/** Terrain colour for a painted ground index at world (wx, wz) + height, written into `out`. */
export function colorForBiome(biome: number, h: number, wx: number, wz: number, out: THREE.Color): THREE.Color {
  const t = clamp((h + 2) / 5, 0, 1);
  let style: GrainStyle = 'grass';
  switch (biome) {
    case 1: out.copy(PALETTE.thorn).lerp(PALETTE.greenHigh, t * 0.25); break;
    case 2: out.copy(PALETTE.fen); break;
    case 3: out.copy(PALETTE.ember).lerp(PALETTE.emberHot, t); style = 'rock'; break;
    case 4: { const sn = clamp((h - 24) / 22, 0, 1); out.copy(PALETTE.rivenRock).lerp(PALETTE.snow, sn); style = 'rock'; break; }
    case 5: out.copy(PALETTE.grave); style = 'rock'; break;
    case 6: out.copy(PALETTE.hub); break;
    case 7: out.copy(PALETTE.city); style = 'flat'; break;   // City — paved (paving texture overlays the top)
    case 8: out.copy(PALETTE.desert); style = 'grit'; break;                                  // Desert sand
    case 9: { const band = Math.sin(h * 0.8) * 0.5 + 0.5; out.copy(PALETTE.mesaLow).lerp(PALETTE.mesaHigh, band); style = 'rock'; break; } // Mesa
    case 10: out.copy(PALETTE.savanna); break;                                                // Savanna (dry grass)
    case 11: { const sn = clamp((h - 6) / 20, 0, 1); out.copy(PALETTE.tundra).lerp(PALETTE.snow, sn); style = 'grit'; break; } // Tundra
    case 12: out.copy(PALETTE.dirt); style = 'grit'; break;                                   // Dirt
    case 13: out.copy(PALETTE.sand); style = 'grit'; break;                                   // Beach sand
    case 14: out.copy(PALETTE.mud); style = 'grit'; break;                                    // Mud
    case 15: out.copy(PALETTE.cobble); style = 'flat'; break;                                 // Cobblestone (paving overlay)
    case 16: out.copy(PALETTE.ash); style = 'grit'; break;                                    // Ash / wasteland
    case 17: out.copy(PALETTE.jungleLow).lerp(PALETTE.jungleHigh, t * 0.5); break;            // Jungle
    case 18: out.copy(PALETTE.ice); style = 'grit'; break;                                    // Ice
    case 19: out.copy(PALETTE.basalt); style = 'rock'; break;                                 // Basalt
    case 20: { const sn = clamp((h - 26) / 20, 0, 1); out.copy(PALETTE.mountainLow).lerp(PALETTE.mountainHigh, clamp(h / 40, 0, 1)).lerp(PALETTE.snow, sn); style = 'rock'; break; } // Mountains
    default: out.copy(PALETTE.greenLow).lerp(PALETTE.greenHigh, t); break;                    // 0 — grass
  }
  applyGrain(out, style, wx, wz);
  return out;
}
