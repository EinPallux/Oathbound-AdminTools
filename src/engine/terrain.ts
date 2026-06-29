// The editable terrain: a row-major heightfield + per-cell painted biome, rendered as a
// single vertex-coloured grid mesh at full authoring resolution (so what you sculpt is
// exactly what exports). Vertex i ↔ cell i ↔ heights[i] — no resampling, so the export
// is bit-exact with the view. Normals are computed analytically from the field.

import * as THREE from 'three';
import { clamp } from './math';
import { colorForBiome } from '../oathbound/palette';

export class EditorTerrain {
  readonly size: number;
  readonly res: number;
  readonly cell: number;
  private readonly half: number;
  heights: Float32Array;
  biomes: Uint8Array;
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.BufferGeometry;
  private dirty = false;

  constructor(size: number, res: number) {
    this.size = size;
    this.res = res;
    this.cell = size / (res - 1);
    this.half = size / 2;
    this.heights = new Float32Array(res * res);
    this.biomes = new Uint8Array(res * res);

    this.geo = new THREE.BufferGeometry();
    const n = res * res;
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setIndex(this.buildIndex());

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.name = 'terrain';
    this.rebuildXZ();
    this.refresh();
  }

  private buildIndex(): THREE.BufferAttribute {
    const res = this.res;
    const quads = (res - 1) * (res - 1);
    const idx = new Uint32Array(quads * 6);
    let o = 0;
    for (let z = 0; z < res - 1; z++) {
      for (let x = 0; x < res - 1; x++) {
        const a = z * res + x;
        const b = a + 1;
        const c = a + res;
        const d = c + 1;
        idx[o++] = a; idx[o++] = c; idx[o++] = b;
        idx[o++] = b; idx[o++] = c; idx[o++] = d;
      }
    }
    return new THREE.BufferAttribute(idx, 1);
  }

  /** Set the static X/Z of every vertex (Y comes from heights in refresh). */
  private rebuildXZ(): void {
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const { res, cell, half } = this;
    for (let z = 0; z < res; z++) {
      for (let x = 0; x < res; x++) {
        const i = (z * res + x) * 3;
        arr[i] = -half + x * cell;
        arr[i + 2] = -half + z * cell;
      }
    }
  }

  /** Recompute Y positions, vertex colours and normals from heights/biomes. */
  refresh(): void {
    const { res, heights, biomes } = this;
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const nrm = this.geo.attributes.normal as THREE.BufferAttribute;
    const col = this.geo.attributes.color as THREE.BufferAttribute;
    const parr = pos.array as Float32Array;
    const narr = nrm.array as Float32Array;
    const carr = col.array as Float32Array;
    const c = new THREE.Color();
    const inv2cell = 1 / (2 * this.cell);

    for (let z = 0; z < res; z++) {
      for (let x = 0; x < res; x++) {
        const idx = z * res + x;
        const h = heights[idx];
        parr[idx * 3 + 1] = h;

        colorForBiome(biomes[idx], h, c);
        carr[idx * 3] = c.r;
        carr[idx * 3 + 1] = c.g;
        carr[idx * 3 + 2] = c.b;

        // Analytic normal from central differences (clamped at edges).
        const hl = heights[z * res + Math.max(0, x - 1)];
        const hr = heights[z * res + Math.min(res - 1, x + 1)];
        const hd = heights[Math.max(0, z - 1) * res + x];
        const hu = heights[Math.min(res - 1, z + 1) * res + x];
        let nx = (hl - hr) * inv2cell;
        let ny = 1;
        let nz = (hd - hu) * inv2cell;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        narr[idx * 3] = nx;
        narr[idx * 3 + 1] = ny;
        narr[idx * 3 + 2] = nz;
      }
    }
    pos.needsUpdate = true;
    nrm.needsUpdate = true;
    col.needsUpdate = true;
    this.geo.computeBoundingSphere();
    this.dirty = false;
  }

  markDirty(): void {
    this.dirty = true;
  }
  flush(): void {
    if (this.dirty) this.refresh();
  }

  /** Replace the whole field (e.g. on load) and rebuild. */
  load(heights: Float32Array, biomes: Uint8Array): void {
    if (heights.length === this.heights.length) this.heights.set(heights);
    if (biomes.length === this.biomes.length) this.biomes.set(biomes);
    this.refresh();
  }

  // ── Sampling ────────────────────────────────────────────────────────────────

  /** Bilinear terrain height at world (x, z); clamps to edges. */
  heightAt(x: number, z: number): number {
    const { res, cell, half } = this;
    const fx = (x + half) / cell;
    const fz = (z + half) / cell;
    const x0 = clamp(Math.floor(fx), 0, res - 1);
    const z0 = clamp(Math.floor(fz), 0, res - 1);
    const x1 = Math.min(res - 1, x0 + 1);
    const z1 = Math.min(res - 1, z0 + 1);
    const tx = clamp(fx - x0, 0, 1);
    const tz = clamp(fz - z0, 0, 1);
    const h = this.heights;
    const a = h[z0 * res + x0] + (h[z0 * res + x1] - h[z0 * res + x0]) * tx;
    const b = h[z1 * res + x0] + (h[z1 * res + x1] - h[z1 * res + x0]) * tx;
    return a + (b - a) * tz;
  }

  /** Nearest-cell biome index at world (x, z). */
  biomeAt(x: number, z: number): number {
    const { res, cell, half } = this;
    const xi = clamp(Math.round((x + half) / cell), 0, res - 1);
    const zi = clamp(Math.round((z + half) / cell), 0, res - 1);
    return this.biomes[zi * res + xi];
  }

  // ── Brush iteration ───────────────────────────────────────────────────────-

  /**
   * Visit every cell within `radius` of world (cx, cz). `fn` receives the cell index,
   * a smooth falloff in [0,1] (1 at centre → 0 at the rim) and the cell's world XZ.
   */
  forEachCellInRadius(
    cx: number,
    cz: number,
    radius: number,
    fn: (idx: number, falloff: number, wx: number, wz: number) => void,
  ): void {
    const { res, cell, half } = this;
    const minX = clamp(Math.floor((cx - radius + half) / cell), 0, res - 1);
    const maxX = clamp(Math.ceil((cx + radius + half) / cell), 0, res - 1);
    const minZ = clamp(Math.floor((cz - radius + half) / cell), 0, res - 1);
    const maxZ = clamp(Math.ceil((cz + radius + half) / cell), 0, res - 1);
    const r2 = radius * radius;
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const wx = -half + x * cell;
        const wz = -half + z * cell;
        const d2 = (wx - cx) * (wx - cx) + (wz - cz) * (wz - cz);
        if (d2 > r2) continue;
        const d = Math.sqrt(d2);
        const falloff = radius <= 0 ? 1 : 1 - d / radius;
        fn(z * res + x, falloff * falloff * (3 - 2 * falloff), wx, wz);
      }
    }
  }

  /** Average height over a brush (used by the smooth/flatten tools). */
  averageHeight(cx: number, cz: number, radius: number): number {
    let sum = 0;
    let count = 0;
    this.forEachCellInRadius(cx, cz, radius, (idx) => {
      sum += this.heights[idx];
      count++;
    });
    return count ? sum / count : 0;
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
