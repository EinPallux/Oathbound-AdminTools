// The editable terrain: a row-major heightfield + per-cell painted biome, rendered as a
// single vertex-coloured grid mesh at full authoring resolution (so what you sculpt is
// exactly what exports). Vertex i ↔ cell i ↔ heights[i] — no resampling, so the export
// is bit-exact with the view. Normals are computed analytically from the field.

import * as THREE from 'three';
import { clamp } from './math';
import { colorForBiome, groundMaterial, type GroundMaterial } from '../oathbound/palette';
import { pavedSurfaceGeometry } from '../format/map';
import { makePavingTexture, makeGroundTexture } from './paving';

/** Sculpt brush footprint + edge profile. Hard-edged shapes build vertical cliffs. */
export type BrushShape = 'circle' | 'square' | 'pillar' | 'mesa';

/** Fixed voxel cube size (m) — matches the game's `VOXEL_CUBE` so the Cube-World preview reads
 *  1:1 with what the player sees. The whole (huge) map can't be voxelised at this size, so the
 *  preview draws a fine-cube *bubble* around the camera focus (same as the game's player bubble)
 *  and rebuilds it as you pan — instead of one coarse whole-map mesh with giant cubes. */
const VOXEL_CUBE = 3;
/** Lift a detail overlay just above the cube top to beat z-fighting. */
const GROUND_LIFT = 0.06;
/** World tile size (repeats/m) per material — a smaller number ⇒ bigger stones/blades on the ground. */
const GROUND_TILE: Record<GroundMaterial, number> = { grass: 1 / 2.4, rock: 1 / 2.8, grit: 1 / 1.8, paved: 1 / 2.2 };
/** Tint boost per material so (light detail texture × biome tint) averages back near the base colour. */
const GROUND_BOOST: Record<GroundMaterial, number> = { grass: 1.34, rock: 1.24, grit: 1.2, paved: 1 };
/** All ground materials, in a stable order for overlay iteration. */
const GROUND_MATERIALS: GroundMaterial[] = ['grass', 'rock', 'grit', 'paved'];

// Shared paving material for the SMOOTH-mode overlay. Lazy so tests without a DOM are fine.
let _pavingMat: THREE.Material | null = null;
function pavingMaterial(): THREE.Material {
  if (!_pavingMat) {
    _pavingMat = new THREE.MeshLambertMaterial({
      map: makePavingTexture(), vertexColors: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
  }
  return _pavingMat;
}

// One detail-texture material per ground material, for the voxel cube-top overlays. Lazy (DOM).
let _groundMats: Record<GroundMaterial, THREE.Material> | null = null;
function groundMaterials(): Record<GroundMaterial, THREE.Material> {
  if (!_groundMats) {
    const mk = (map: THREE.Texture): THREE.Material => new THREE.MeshLambertMaterial({
      map, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    _groundMats = {
      grass: mk(makeGroundTexture('grass')),
      rock: mk(makeGroundTexture('rock')),
      grit: mk(makeGroundTexture('grit')),
      paved: mk(makePavingTexture()),
    };
  }
  return _groundMats;
}

export class EditorTerrain {
  readonly size: number;
  readonly res: number;
  readonly cell: number;
  private readonly half: number;
  heights: Float32Array;
  biomes: Uint8Array;
  /** Painted water-surface height per cell; NaN = dry (no water). Parallel to heights. */
  water: Float32Array;
  readonly mesh: THREE.Mesh;
  /** Wrapper holding the smooth mesh + the voxel mesh; add THIS to the scene, not `mesh`. */
  readonly group: THREE.Group;
  /** Voxel / "Cube World" terrain, shown instead of the smooth mesh when `voxel` is on. */
  private readonly voxelMesh: THREE.Mesh;
  /** Per-material detail overlays for voxel mode — one textured quad per cube top, keyed by the
   *  cube's ground material (grass/rock/grit/paved), so each cube reads as its surface. */
  private readonly voxelOverlays: Record<GroundMaterial, THREE.Mesh>;
  /** Render the terrain as stepped cubes (Cube World look). Visual only — export is unchanged. */
  voxel = false;
  /** Vertical quantization (m) for the voxel terrain (matches the game's default). */
  voxelStep = 2;
  /** Centre + radius (m) of the currently-built cube bubble, so we only rebuild when it drifts. */
  private vcx = Infinity;
  private vcz = Infinity;
  private vr = 260;
  /** Paved-ground (City/Cobblestone) texture overlay, a child of the terrain mesh. */
  private readonly paving: THREE.Mesh;
  private readonly geo: THREE.BufferGeometry;
  private dirty = false;

  constructor(size: number, res: number) {
    this.size = size;
    this.res = res;
    this.cell = size / (res - 1);
    this.half = size / 2;
    this.heights = new Float32Array(res * res);
    this.biomes = new Uint8Array(res * res);
    this.water = new Float32Array(res * res).fill(NaN); // all dry

    this.geo = new THREE.BufferGeometry();
    const n = res * res;
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setIndex(this.buildIndex());

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.name = 'terrain';

    this.paving = new THREE.Mesh(new THREE.BufferGeometry(), pavingMaterial());
    this.paving.name = 'paving';
    this.paving.frustumCulled = false;

    // Voxel terrain sits beside the smooth mesh in a wrapper group; visibility toggles between
    // them. The smooth mesh stays present (hidden) even in voxel mode so tools keep raycasting it.
    // The paving overlay is a group child (not under the smooth mesh) so it shows in both modes.
    this.voxelMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.voxelMesh.name = 'terrain-voxel';
    this.voxelMesh.frustumCulled = false;
    this.voxelMesh.visible = false;
    // Per-material detail overlays (voxel mode) — a textured quad on each cube top.
    const gm = groundMaterials();
    this.voxelOverlays = {
      grass: new THREE.Mesh(new THREE.BufferGeometry(), gm.grass),
      rock: new THREE.Mesh(new THREE.BufferGeometry(), gm.rock),
      grit: new THREE.Mesh(new THREE.BufferGeometry(), gm.grit),
      paved: new THREE.Mesh(new THREE.BufferGeometry(), gm.paved),
    };
    this.group = new THREE.Group();
    this.group.name = 'terrain-group';
    this.group.add(this.mesh);
    this.group.add(this.voxelMesh);
    for (const mat of GROUND_MATERIALS) {
      const m = this.voxelOverlays[mat];
      m.name = `terrain-voxel-${mat}`;
      m.frustumCulled = false;
      m.visible = false;
      this.group.add(m);
    }
    this.group.add(this.paving);

    this.rebuildXZ();
    this.refresh();
  }

  /** Rebuild the cube bubble if the focus point has drifted or the radius changed. Called each
   *  frame with the camera's orbit target + a view-scaled radius. Cheap no-op while it's stable. */
  updateVoxel(cx: number, cz: number, radius: number): void {
    if (!this.voxel) return;
    const moved = Math.abs(cx - this.vcx) + Math.abs(cz - this.vcz);
    if (moved < Math.max(VOXEL_CUBE, this.vr * 0.25) && radius === this.vr) return;
    this.vr = radius;
    this.rebuildVoxelBubble(cx, cz, radius);
  }

  /** Build a bubble of fixed-size (VOXEL_CUBE) cubes around (cx, cz), clipped to the map, plus a
   *  per-cube paved-stone overlay — mirroring the game's `VoxelTerrain` so the preview reads 1:1.
   *  Cube tops sit at the height quantised to `voxelStep`; side walls drop to lower neighbours. */
  private rebuildVoxelBubble(cx: number, cz: number, radius: number): void {
    const cube = VOXEL_CUBE, step = this.voxelStep, sideDarken = 0.7, half = this.half;
    this.vcx = cx; this.vcz = cz;
    const i0 = Math.floor((cx - radius) / cube), i1 = Math.ceil((cx + radius) / cube);
    const j0 = Math.floor((cz - radius) / cube), j1 = Math.ceil((cz + radius) / cube);
    const nx = i1 - i0 + 1, nz = j1 - j0 + 1;
    const c = new THREE.Color();

    // Height / colour / biome per cube on the fixed world grid (cube centre = (i+0.5)·cube).
    const H = new Float32Array(nx * nz);
    const CR = new Float32Array(nx * nz), CG = new Float32Array(nx * nz), CB = new Float32Array(nx * nz);
    const BIO = new Uint8Array(nx * nz);
    const IB = new Uint8Array(nx * nz); // 1 = cube centre lies inside the authored map
    for (let jz = 0; jz < nz; jz++) {
      for (let ix = 0; ix < nx; ix++) {
        const wx = (i0 + ix + 0.5) * cube, wz = (j0 + jz + 0.5) * cube;
        const k = jz * nx + ix;
        const raw = this.heightAt(wx, wz);
        H[k] = step > 0 ? Math.round(raw / step) * step : raw;
        const bio = this.biomeAt(wx, wz);
        BIO[k] = bio;
        IB[k] = wx >= -half && wx <= half && wz >= -half && wz <= half ? 1 : 0;
        colorForBiome(bio, H[k], wx, wz, c);
        CR[k] = c.r; CG[k] = c.g; CB[k] = c.b;
      }
    }

    const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = [];
    const quad = (
      ax: number, ay: number, az: number, bx: number, by: number, bz: number,
      cxx: number, cyy: number, czz: number, dx: number, dy: number, dz: number,
      nx2: number, ny2: number, nz2: number, r: number, g: number, b: number,
    ): void => {
      const base = pos.length / 3;
      pos.push(ax, ay, az, bx, by, bz, cxx, cyy, czz, dx, dy, dz);
      for (let i = 0; i < 4; i++) { nrm.push(nx2, ny2, nz2); col.push(r, g, b); }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    // Neighbour top (only draw a wall to a lower in-map neighbour; map-edge cubes get no skirt).
    const wall = (k: number, nk: number): boolean => nk >= 0 && nk < nx * nz && IB[nk] === 1 && H[k] > H[nk];
    // Per-material overlay buckets: a textured, biome-tinted quad on every cube top.
    const OV: Record<GroundMaterial, { pos: number[]; uv: number[]; col: number[]; idx: number[] }> = {
      grass: { pos: [], uv: [], col: [], idx: [] }, rock: { pos: [], uv: [], col: [], idx: [] },
      grit: { pos: [], uv: [], col: [], idx: [] }, paved: { pos: [], uv: [], col: [], idx: [] },
    };

    for (let jz = 0; jz < nz; jz++) {
      for (let ix = 0; ix < nx; ix++) {
        const k = jz * nx + ix;
        if (!IB[k]) continue; // clip the bubble to the authored map
        const y = H[k];
        const x0 = (i0 + ix) * cube, x1 = x0 + cube;
        const z0 = (j0 + jz) * cube, z1 = z0 + cube;
        const r = CR[k], g = CG[k], b = CB[k];
        const dr = r * sideDarken, dg = g * sideDarken, db = b * sideDarken;
        quad(x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0, 0, 1, 0, r, g, b); // flat top
        if (ix + 1 < nx && wall(k, k + 1)) quad(x1, y, z0, x1, y, z1, x1, H[k + 1], z1, x1, H[k + 1], z0, 1, 0, 0, dr, dg, db);
        if (ix - 1 >= 0 && wall(k, k - 1)) quad(x0, y, z1, x0, y, z0, x0, H[k - 1], z0, x0, H[k - 1], z1, -1, 0, 0, dr, dg, db);
        if (jz + 1 < nz && wall(k, k + nx)) quad(x1, y, z1, x0, y, z1, x0, H[k + nx], z1, x1, H[k + nx], z1, 0, 0, 1, dr, dg, db);
        if (jz - 1 >= 0 && wall(k, k - nx)) quad(x0, y, z0, x1, y, z0, x1, H[k - nx], z0, x0, H[k - nx], z0, 0, 0, -1, dr, dg, db);

        // Detail overlay on the cube top: pick the material's texture, tint by the biome colour
        // (paving keeps its own brighter grey/warm tint), world-UV so the grain tiles seamlessly.
        const mat = groundMaterial(BIO[k]);
        const tile = GROUND_TILE[mat], py = y + GROUND_LIFT;
        let tr: number, tg: number, tb: number;
        if (mat === 'paved') { const warm = BIO[k] === 15; tr = warm ? 0.74 : 0.68; tg = 0.68; tb = warm ? 0.58 : 0.71; }
        else { const bo = GROUND_BOOST[mat]; tr = Math.min(1, r * bo); tg = Math.min(1, g * bo); tb = Math.min(1, b * bo); }
        const o = OV[mat], ob = o.pos.length / 3;
        o.pos.push(x0, py, z0, x0, py, z1, x1, py, z1, x1, py, z0);
        o.uv.push(x0 * tile, z0 * tile, x0 * tile, z1 * tile, x1 * tile, z1 * tile, x1 * tile, z0 * tile);
        for (let i = 0; i < 4; i++) o.col.push(tr, tg, tb);
        o.idx.push(ob, ob + 1, ob + 2, ob, ob + 2, ob + 3);
      }
    }

    const g = this.voxelMesh.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(nrm), 3));
    g.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(col), 3));
    g.setIndex(new THREE.BufferAttribute(Uint32Array.from(idx), 1));
    g.computeBoundingSphere();

    for (const mat of GROUND_MATERIALS) {
      const o = OV[mat], mesh = this.voxelOverlays[mat], geo = mesh.geometry;
      geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(o.pos), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(o.uv), 2));
      geo.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(o.col), 3));
      geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(o.idx), 1));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      mesh.visible = this.voxel && o.pos.length > 0;
    }
  }

  /** Toggle stepped-cube (Cube World) terrain rendering. */
  setVoxel(on: boolean): void {
    if (this.voxel === on) return;
    this.voxel = on;
    this.refresh();
  }

  /** Set the voxel vertical step (m) and rebuild if voxel terrain is showing. */
  setVoxelStep(step: number): void {
    this.voxelStep = step;
    if (this.voxel) this.rebuildVoxelBubble(this.vcx === Infinity ? 0 : this.vcx, this.vcz === Infinity ? 0 : this.vcz, this.vr);
  }

  /** Rebuild the City/Cobblestone paving overlay from the current ground + heights. */
  private rebuildPaving(): void {
    // In voxel mode lay the paving on the quantized cube tops so City/Cobblestone show the stone
    // texture instead of flat grey; otherwise it follows the smooth surface.
    const hAt = this.voxel && this.voxelStep > 0
      ? (x: number, z: number): number => Math.round(this.heightAt(x, z) / this.voxelStep) * this.voxelStep
      : undefined;
    const { positions, uvs, colors, indices } = pavedSurfaceGeometry(this.biomes, this.heights, this.res, this.size, hAt);
    const g = this.paving.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    this.paving.visible = positions.length > 0;
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

        colorForBiome(biomes[idx], h, -this.half + x * this.cell, -this.half + z * this.cell, c);
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
    this.rebuildPaving();
    // Smooth mesh stays raycastable (tools pick against it) but is hidden in voxel mode.
    this.mesh.visible = !this.voxel;
    this.voxelMesh.visible = this.voxel;
    // In voxel mode the per-cube detail overlays replace the smooth-surface paving.
    if (this.voxel) this.paving.visible = false;
    else for (const mat of GROUND_MATERIALS) this.voxelOverlays[mat].visible = false;
    if (this.voxel) {
      this.rebuildVoxelBubble(this.vcx === Infinity ? 0 : this.vcx, this.vcz === Infinity ? 0 : this.vcz, this.vr);
    }
    this.dirty = false;
  }

  markDirty(): void {
    this.dirty = true;
  }
  flush(): void {
    if (this.dirty) this.refresh();
  }

  /** Replace the whole field (e.g. on load) and rebuild. */
  load(heights: Float32Array, biomes: Uint8Array, water?: Float32Array | null): void {
    if (heights.length === this.heights.length) this.heights.set(heights);
    if (biomes.length === this.biomes.length) this.biomes.set(biomes);
    if (water && water.length === this.water.length) this.water.set(water);
    else this.water.fill(NaN);
    this.refresh();
  }

  /** Nearest-cell painted water level at world (x, z); NaN if dry. */
  waterAt(x: number, z: number): number {
    const { res, cell, half } = this;
    const xi = clamp(Math.round((x + half) / cell), 0, res - 1);
    const zi = clamp(Math.round((z + half) / cell), 0, res - 1);
    return this.water[zi * res + xi];
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
   * (Circular soft brush — kept for the smooth/flatten/biome tools.)
   */
  forEachCellInRadius(
    cx: number,
    cz: number,
    radius: number,
    fn: (idx: number, falloff: number, wx: number, wz: number) => void,
  ): void {
    this.forEachCellInBrush(cx, cz, radius, 'circle', fn);
  }

  /**
   * Generalised brush iteration over a footprint shape + edge profile:
   *   - 'circle' : round footprint, smooth (domed) falloff — soft hills.
   *   - 'square' : square footprint, smooth falloff — soft rectangular mounds.
   *   - 'pillar' : round footprint, HARD edge (uniform strength) — vertical cylinders / round cliffs.
   *   - 'mesa'   : square footprint, HARD edge (uniform strength) — flat-topped plateaus / rectangular cliffs.
   * `fn` receives the cell index, a weight in [0,1], and the cell's world XZ.
   */
  forEachCellInBrush(
    cx: number,
    cz: number,
    radius: number,
    shape: BrushShape,
    fn: (idx: number, falloff: number, wx: number, wz: number) => void,
  ): void {
    const { res, cell, half } = this;
    const minX = clamp(Math.floor((cx - radius + half) / cell), 0, res - 1);
    const maxX = clamp(Math.ceil((cx + radius + half) / cell), 0, res - 1);
    const minZ = clamp(Math.floor((cz - radius + half) / cell), 0, res - 1);
    const maxZ = clamp(Math.ceil((cz + radius + half) / cell), 0, res - 1);
    const squareFoot = shape === 'square' || shape === 'mesa';
    const hardEdge = shape === 'pillar' || shape === 'mesa';
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const wx = -half + x * cell;
        const wz = -half + z * cell;
        const dx = wx - cx;
        const dz = wz - cz;
        // Normalised distance to the rim: Chebyshev for squares, Euclidean for rounds.
        const dist = squareFoot ? Math.max(Math.abs(dx), Math.abs(dz)) : Math.hypot(dx, dz);
        if (dist > radius) continue;
        let falloff: number;
        if (hardEdge) {
          falloff = 1; // uniform to the rim → vertical sides (cliffs / pillars / mesas)
        } else {
          const f = radius <= 0 ? 1 : 1 - dist / radius;
          falloff = f * f * (3 - 2 * f); // smoothstep → domed
        }
        fn(z * res + x, falloff, wx, wz);
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
    this.paving.geometry.dispose(); // shared material is reused across terrains
    this.voxelMesh.geometry.dispose();
    (this.voxelMesh.material as THREE.Material).dispose();
    for (const mat of GROUND_MATERIALS) this.voxelOverlays[mat].geometry.dispose(); // shared materials reused
  }
}
