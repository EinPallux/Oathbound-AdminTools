// Per-biome terrain colouring — ported from the game's render/terrain-mesh.ts palette,
// adapted to colour from a *painted* per-cell biome (the editor) rather than the game's
// directional biome field. The game loader uses the same mapping so a custom map's
// ground reads identically in-engine. Synced copy of the PALETTE values.

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
};

const _g = new THREE.Color();

/** Terrain colour for a painted biome index + height, written into `out`. */
export function colorForBiome(biome: number, h: number, out: THREE.Color): THREE.Color {
  const t = clamp((h + 2) / 5, 0, 1); // green low→high gradient factor
  switch (biome) {
    case 1: // thornwood — deep forest floor, faintly lifting with height
      return out.copy(PALETTE.thorn).lerp(PALETTE.greenHigh, t * 0.25);
    case 2: // fen
      return out.copy(PALETTE.fen);
    case 3: // ember — scorched, hotter on the rises
      return out.copy(PALETTE.ember).lerp(PALETTE.emberHot, t);
    case 4: { // riven — bare rock, snow capping the high summits
      const snow = clamp((h - 24) / 22, 0, 1);
      return out.copy(PALETTE.rivenRock).lerp(PALETTE.snow, snow);
    }
    case 5: // gravereach
      return out.copy(PALETTE.grave);
    case 6: // hub / town green
      return out.copy(PALETTE.hub);
    default: // greenmarch
      return out.copy(PALETTE.greenLow).lerp(_g.copy(PALETTE.greenHigh), t);
  }
}
