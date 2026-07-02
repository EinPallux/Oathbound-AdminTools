// A faithful, static copy of the game's player avatar (src/render/player-view.ts, warrior
// look) so the Player Spawn marker shows the real model at true 1:1 in-game scale — a
// reference for how big to make/scale assets. Feet sit at y=0 (the game seats the model at
// terrain height; FEET = PLAYER_HALF = 0.9). The whole figure is uniformly scaled by
// MODEL_SCALE, matching the game. Materials are memoised per colour so marker rebuilds
// (which dispose child geometry) don't leak.

import * as THREE from 'three';

/** Uniform visual scale of the avatar (mirrors MODEL_SCALE in the game's player-view.ts). */
const MODEL_SCALE = 1.22;

const SKIN = 0xd9a878;
const HAIR = 0x6b4526;
const BROW = 0x4a3018;

const MATS = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, rough = 0.75): THREE.MeshStandardMaterial {
  const key = `${color}|${rough}`;
  let m = MATS.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 });
    MATS.set(key, m);
  }
  return m;
}

/** Create a box at (x,y,z) in `parent`'s local space, add it, and return it (for rotation). */
function put(
  parent: THREE.Object3D,
  w: number, h: number, d: number, color: number,
  x: number, y: number, z: number, rough = 0.75,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, rough));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function joint(x: number, y: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, 0);
  return g;
}

/** Build the static warrior avatar (feet at y=0, ~2.95 m to the top of the head at MODEL_SCALE). */
export function buildPlayerModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'player-ref';
  group.scale.setScalar(MODEL_SCALE);

  const b = new THREE.Group();
  group.add(b);
  const armL = joint(0.56, 1.82); b.add(armL);
  const armR = joint(-0.56, 1.82); b.add(armR);
  const legL = joint(0.24, 0.92); group.add(legL);
  const legR = joint(-0.24, 0.92); group.add(legR);

  const STEEL = 0x969ca6, STEEL_DK = 0x6c727c, STEEL_LT = 0xb6bcc4;
  const NAVY = 0x2c3346, NAVY_DK = 0x232838;
  const RED = 0x8f3a34, LEATHER = 0x5a3a1e, LEATHER_DK = 0x3f2814;
  const GOLD = 0xc9a94e, BLADE = 0xd6dbe2, SHIELD = 0x2f3e63;

  // Face (skin + brows + eyes + mouth).
  put(b, 0.62, 0.58, 0.58, SKIN, 0, 2.04, 0);
  put(b, 0.16, 0.05, 0.04, BROW, 0.15, 2.15, 0.30);
  put(b, 0.16, 0.05, 0.04, BROW, -0.15, 2.15, 0.30);
  put(b, 0.09, 0.11, 0.04, 0xffffff, 0.15, 2.04, 0.30, 0.4);
  put(b, 0.09, 0.11, 0.04, 0xffffff, -0.15, 2.04, 0.30, 0.4);
  put(b, 0.07, 0.09, 0.05, 0x2f5fa0, 0.15, 2.03, 0.31, 0.35);
  put(b, 0.07, 0.09, 0.05, 0x2f5fa0, -0.15, 2.03, 0.31, 0.35);
  put(b, 0.16, 0.05, 0.04, 0x9c6b45, 0, 1.86, 0.30);

  // Tufty hair.
  put(b, 0.7, 0.24, 0.66, HAIR, 0, 2.36, 0);
  put(b, 0.62, 0.16, 0.12, HAIR, 0, 2.28, 0.28);
  put(b, 0.12, 0.42, 0.5, HAIR, 0.33, 2.12, -0.02);
  put(b, 0.12, 0.42, 0.5, HAIR, -0.33, 2.12, -0.02);
  put(b, 0.66, 0.3, 0.14, HAIR, 0, 2.22, -0.3);
  for (const [hx, hz] of [[-0.2, 0.1], [0.05, 0.16], [0.24, 0.02], [-0.28, -0.05]] as const)
    put(b, 0.18, 0.14, 0.18, HAIR, hx, 2.5, hz);

  // Red scarf at the collar.
  put(b, 0.56, 0.2, 0.18, RED, 0, 1.68, 0.2);
  put(b, 0.2, 0.26, 0.46, RED, 0.24, 1.7, 0);
  put(b, 0.2, 0.26, 0.46, RED, -0.24, 1.7, 0);
  put(b, 0.5, 0.28, 0.16, RED, 0, 1.64, -0.22);

  // Torso: navy gambeson + steel plate + baldric + belt.
  put(b, 0.8, 0.92, 0.46, NAVY, 0, 1.42, 0);
  put(b, 0.74, 0.54, 0.5, STEEL, 0, 1.58, 0.02);
  put(b, 0.16, 0.5, 0.52, STEEL_LT, 0, 1.58, 0.03);
  put(b, 0.74, 0.06, 0.5, GOLD, 0, 1.32, 0.02);
  put(b, 0.12, 1.12, 0.05, LEATHER, 0, 1.46, 0.26).rotation.z = -0.6;
  put(b, 0.86, 0.16, 0.5, LEATHER, 0, 1.0, 0);
  put(b, 0.2, 0.18, 0.06, GOLD, 0, 1.0, 0.25);

  // Steel pauldrons with gold trim.
  for (const s of [1, -1]) {
    put(b, 0.42, 0.3, 0.46, STEEL, 0.56 * s, 1.86, 0);
    put(b, 0.44, 0.14, 0.48, STEEL_DK, 0.56 * s, 1.98, 0);
    put(b, 0.44, 0.05, 0.49, GOLD, 0.56 * s, 1.77, 0);
  }

  // Arms.
  for (const arm of [armL, armR]) {
    put(arm, 0.28, 0.42, 0.32, NAVY_DK, 0, -0.22, 0);
    put(arm, 0.3, 0.34, 0.34, LEATHER, 0, -0.58, 0);
    put(arm, 0.31, 0.05, 0.35, GOLD, 0, -0.42, 0);
    put(arm, 0.26, 0.2, 0.3, STEEL, 0, -0.84, 0);
  }

  // Legs.
  for (const leg of [legL, legR]) {
    put(leg, 0.34, 0.46, 0.38, NAVY, 0, -0.24, 0);
    put(leg, 0.36, 0.16, 0.4, STEEL, 0, -0.5, 0.02);
    put(leg, 0.36, 0.05, 0.41, GOLD, 0, -0.42, 0.03);
    put(leg, 0.32, 0.24, 0.36, NAVY_DK, 0, -0.68, 0);
    put(leg, 0.36, 0.2, 0.4, LEATHER, 0, -0.84, 0.04);
    put(leg, 0.36, 0.14, 0.18, LEATHER_DK, 0, -0.88, 0.24);
  }

  // Red tabard.
  put(group, 0.42, 0.82, 0.08, RED, 0, 0.56, 0.25);
  put(group, 0.3, 0.2, 0.08, RED, 0, 0.18, 0.25);
  put(group, 0.44, 0.06, 0.09, GOLD, 0, 0.94, 0.25);

  // Sword slung across the back.
  const back = new THREE.Group();
  back.position.set(0.05, 1.45, -0.32);
  back.rotation.set(0.12, 0, -0.7);
  put(back, 0.15, 1.3, 0.11, LEATHER_DK, 0, 0, 0);
  put(back, 0.36, 0.09, 0.13, GOLD, 0, 0.62, 0);
  put(back, 0.08, 0.24, 0.09, LEATHER, 0, 0.75, 0);
  put(back, 0.13, 0.13, 0.13, GOLD, 0, 0.9, 0);
  b.add(back);

  // Sword in the right hand (pointing down at rest).
  const sword = new THREE.Group();
  sword.position.set(0, -0.9, 0.14);
  put(sword, 0.11, 0.11, 0.11, GOLD, 0, 0.14, 0);
  put(sword, 0.08, 0.24, 0.08, LEATHER, 0, 0, 0);
  put(sword, 0.36, 0.1, 0.11, GOLD, 0, -0.15, 0);
  put(sword, 0.14, 0.88, 0.05, BLADE, 0, -0.62, 0, 0.3);
  put(sword, 0.1, 0.18, 0.05, BLADE, 0, -1.12, 0, 0.3);
  armR.add(sword);

  // Kite shield on the left forearm.
  const shield = new THREE.Group();
  shield.position.set(0, -0.5, 0.24);
  put(shield, 0.66, 1.02, 0.06, GOLD, 0, 0.02, -0.02);
  put(shield, 0.58, 0.5, 0.08, SHIELD, 0, 0.22, 0.02);
  put(shield, 0.5, 0.4, 0.08, SHIELD, 0, -0.18, 0.02);
  put(shield, 0.3, 0.32, 0.08, SHIELD, 0, -0.52, 0.02);
  put(shield, 0.16, 0.44, 0.05, GOLD, 0, 0.02, 0.08);
  put(shield, 0.24, 0.24, 0.05, GOLD, 0, 0.02, 0.08).rotation.z = Math.PI / 4;
  put(shield, 0.12, 0.12, 0.06, SHIELD, 0, 0.02, 0.1).rotation.z = Math.PI / 4;
  armL.add(shield);

  return group;
}

/** Top-of-head height (m) at MODEL_SCALE — handy for placing a label above the reference model. */
export const PLAYER_MODEL_HEIGHT = 2.95;
