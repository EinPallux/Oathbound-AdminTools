// Flat ribbon draped over the terrain along a polyline (rivers, roads) — ported from
// the game's render/scenery-view.ts buildRibbon so editor paths match in-engine.

import * as THREE from 'three';
import type { EditorTerrain } from './terrain';
import type { MapPath } from '../format/map';

function resamplePath(pts: { x: number; z: number }[], spacing: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [pts[0]];
  let prev = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i];
    const dx = cur.x - prev.x;
    const dz = cur.z - prev.z;
    const seg = Math.hypot(dx, dz);
    const n = Math.max(1, Math.round(seg / spacing));
    for (let k = 1; k <= n; k++) out.push({ x: prev.x + (dx * k) / n, z: prev.z + (dz * k) / n });
    prev = cur;
  }
  return out;
}

/** Build a flat ribbon mesh for a path, draped `yOffset` above the terrain. */
export function buildRibbon(
  path: MapPath,
  terrain: EditorTerrain,
  yOffset: number,
  mat: THREE.Material,
  name: string,
): THREE.Mesh | null {
  if (path.points.length < 2) return null;
  const pts = resamplePath(path.points, 2.5);
  const hw = path.width / 2;
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    const px = -tz;
    const pz = tx;
    const lx = pts[i].x + px * hw;
    const lz = pts[i].z + pz * hw;
    const rx = pts[i].x - px * hw;
    const rz = pts[i].z - pz * hw;
    left.push(lx, terrain.heightAt(lx, lz) + yOffset, lz);
    right.push(rx, terrain.heightAt(rx, rz) + yOffset, rz);
  }
  const positions: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 3;
    const b = (i + 1) * 3;
    positions.push(left[a], left[a + 1], left[a + 2]);
    positions.push(right[b], right[b + 1], right[b + 2]);
    positions.push(right[a], right[a + 1], right[a + 2]);
    positions.push(left[a], left[a + 1], left[a + 2]);
    positions.push(left[b], left[b + 1], left[b + 2]);
    positions.push(right[b], right[b + 1], right[b + 2]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.frustumCulled = false;
  return mesh;
}
