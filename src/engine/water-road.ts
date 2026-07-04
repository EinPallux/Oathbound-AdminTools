// Water (lake discs + river ribbons) and road ribbons, rebuilt from map data. Materials
// mirror the game's so it reads the same in-engine.

import * as THREE from 'three';
import type { EditorTerrain } from './terrain';
import { hasWater, waterSurfaceGeometry, type MapLake, type MapPath } from '../format/map';
import { buildRibbon } from './ribbon';
import { roadMaterial } from './paving';

const lakeMat = new THREE.MeshStandardMaterial({
  color: 0x356f96,
  transparent: true,
  opacity: 0.84,
  roughness: 0.18,
  metalness: 0.2,
  side: THREE.DoubleSide,
});
const riverMat = new THREE.MeshStandardMaterial({
  color: 0x3a7fa6,
  transparent: true,
  opacity: 0.82,
  roughness: 0.25,
  metalness: 0.15,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});
/** Default water-surface height for a lake placed at (x,z) on the current terrain. */
export function defaultLakeY(terrain: EditorTerrain, x: number, z: number): number {
  return terrain.heightAt(x, z) + 0.15;
}

export class WaterRoadLayer {
  readonly group = new THREE.Group();
  private meshes: THREE.Mesh[] = [];

  constructor() {
    this.group.name = 'water-road';
  }

  private clear(): void {
    for (const m of this.meshes) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.meshes = [];
  }

  rebuild(lakes: MapLake[], rivers: MapPath[], roads: MapPath[], terrain: EditorTerrain): void {
    this.clear();

    // Painted water (the Water tool) — a surface mesh that fills the ground up to each
    // cell's painted level, shown only where it sits above the terrain.
    if (hasWater(terrain.water)) {
      const { positions, indices } = waterSurfaceGeometry(terrain.water, terrain.heights, terrain.res, terrain.size);
      if (positions.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, lakeMat);
        mesh.name = 'painted-water';
        mesh.frustumCulled = false;
        this.group.add(mesh);
        this.meshes.push(mesh);
      }
    }

    for (let i = 0; i < lakes.length; i++) {
      const lk = lakes[i];
      const disc = new THREE.Mesh(new THREE.CircleGeometry(Math.max(0.5, lk.r * 0.82), 40), lakeMat);
      disc.rotation.x = -Math.PI / 2;
      const y = lk.y ?? defaultLakeY(terrain, lk.x, lk.z);
      disc.position.set(lk.x, y, lk.z);
      disc.name = `lake-${i}`;
      disc.frustumCulled = false;
      this.group.add(disc);
      this.meshes.push(disc);
    }

    for (let i = 0; i < rivers.length; i++) {
      const m = buildRibbon(rivers[i], terrain, 0.18, riverMat, `river-${i}`);
      if (m) {
        this.group.add(m);
        this.meshes.push(m);
      }
    }
    for (let i = 0; i < roads.length; i++) {
      const m = buildRibbon(roads[i], terrain, 0.25, roadMaterial(roads[i].style ?? 'city'), `road-${i}`);
      if (m) {
        this.group.add(m);
        this.meshes.push(m);
      }
    }
  }
}
