// A faithful, static copy of the game's player avatar (src/render/player-view.ts, warrior
// look) so the Player Spawn marker shows the real model at true 1:1 in-game scale — a
// reference for how big to make/scale assets. Feet sit at y=0 (the game seats the model at
// terrain height; FEET = PLAYER_HALF = 0.9). Materials are shared module-level so marker
// rebuilds (which dispose child geometry) don't leak.

import * as THREE from 'three';

const SKIN = 0xd9a878;
function mat(color: number, rough = 0.75): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 });
}
const MAT = {
  torso: mat(0x4a5670),
  limb: mat(0x39435a),
  head: mat(SKIN),
  eye: mat(0x2a2a30),
  grip: mat(0x5a3a1e),
  guard: mat(0xc2c6cd, 0.4),
  blade: mat(0xd6dbe2, 0.3),
  shield: mat(0x8a3b3b, 0.6),
  boss: mat(0xc2c6cd, 0.3),
};

function box(w: number, h: number, d: number, m: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
}
/** A pivot group at a joint with a chunky limb box hanging below it. */
function limb(x: number, y: number, w: number, h: number, d: number, m: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, 0);
  const b = box(w, h, d, m);
  b.position.y = -h / 2;
  g.add(b);
  return g;
}

/** Build the static warrior avatar (feet at y=0, ~2.4 m to the top of the head). */
export function buildPlayerModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'player-ref';

  const torso = box(0.86, 0.95, 0.5, MAT.torso);
  torso.position.y = 1.42;
  const head = box(0.66, 0.64, 0.62, MAT.head);
  head.position.y = 2.06;
  const eyeL = box(0.1, 0.12, 0.04, MAT.eye);
  eyeL.position.set(0.15, 2.08, 0.32);
  const eyeR = box(0.1, 0.12, 0.04, MAT.eye);
  eyeR.position.set(-0.15, 2.08, 0.32);
  group.add(torso, head, eyeL, eyeR);

  const armL = limb(0.56, 1.82, 0.26, 0.84, 0.32, MAT.limb);
  const armR = limb(-0.56, 1.82, 0.26, 0.84, 0.32, MAT.limb);
  group.add(armL, armR);
  group.add(limb(0.22, 0.92, 0.32, 0.86, 0.36, MAT.limb), limb(-0.22, 0.92, 0.32, 0.86, 0.36, MAT.limb));

  // Warrior sword in the right hand (rest pose).
  const sword = new THREE.Group();
  const grip = box(0.08, 0.26, 0.08, MAT.grip);
  const guard = box(0.36, 0.09, 0.12, MAT.guard);
  guard.position.y = 0.16;
  const blade = box(0.13, 0.98, 0.06, MAT.blade);
  blade.position.y = 0.7;
  sword.add(grip, guard, blade);
  sword.position.set(0, -0.84, 0.12);
  sword.rotation.set(Math.PI / 4, 0, 0.22);
  armR.add(sword);

  // Shield on the left forearm.
  const shield = box(0.56, 0.66, 0.12, MAT.shield);
  shield.position.set(0, -0.5, 0.2);
  const boss = box(0.16, 0.16, 0.06, MAT.boss);
  boss.position.set(0, -0.5, 0.27);
  armL.add(shield, boss);

  return group;
}

/** Top-of-head height (m) — handy for placing a label above the reference model. */
export const PLAYER_MODEL_HEIGHT = 2.4;
