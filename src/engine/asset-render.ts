// Renders placed props as instanced meshes (one draw call per asset id), with a
// raycast helper that maps a hit back to its placement index for select/delete. Built-in
// geometry comes from the game's prop builders; custom assets are merged from primitives.

import * as THREE from 'three';
import type { EditorTerrain } from './terrain';
import type { AssetDef, PlacedAsset } from '../format/map';
import { builtinGeometry, customAssetGeometry } from '../oathbound/geometry';
import { builtinById, builtinYLift, parseBuiltin, type BuiltinKind } from '../format/assets-builtin';
import { presetById } from '../format/presets';

// Kinds that read better smooth-shaded (canopies, blooms) vs faceted low-poly.
const SMOOTH_KINDS = new Set<BuiltinKind>(['tree', 'flower', 'lily']);

const smoothMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

const _obj = new THREE.Object3D();
const geoCache = new Map<string, THREE.BufferGeometry>();

function geometryFor(assetId: string, customAssets: AssetDef[]): THREE.BufferGeometry | null {
  const cached = geoCache.get(assetId);
  if (cached) return cached;
  let geo: THREE.BufferGeometry | null = null;
  const builtin = parseBuiltin(assetId);
  if (builtin) {
    geo = builtinGeometry(builtin.kind, builtin.variant);
  } else if (assetId.startsWith('preset:')) {
    const def = presetById(assetId.slice('preset:'.length));
    if (def) geo = customAssetGeometry(def);
  } else if (assetId.startsWith('custom:')) {
    const def = customAssets.find((d) => `custom:${d.id}` === assetId);
    if (def) geo = customAssetGeometry(def);
  }
  if (geo) geoCache.set(assetId, geo);
  return geo;
}

/** Invalidate a cached custom-asset geometry after it's edited in the Asset Builder. */
export function invalidateAssetGeometry(assetId: string): void {
  geoCache.get(assetId)?.dispose();
  geoCache.delete(assetId);
}

function yLiftFor(assetId: string, scale: number): number {
  const b = parseBuiltin(assetId);
  return b ? builtinYLift(b.kind, b.variant, scale) : 0;
}

function isSmooth(assetId: string): boolean {
  const b = parseBuiltin(assetId);
  return b ? SMOOTH_KINDS.has(b.kind) : false;
}

interface LayerMesh {
  mesh: THREE.InstancedMesh;
  /** Placement index in the source array for each instance slot. */
  indices: number[];
}

/** Manages the instanced meshes for all placed assets; rebuilt on change. */
export class AssetLayer {
  readonly group = new THREE.Group();
  private meshes: LayerMesh[] = [];

  constructor() {
    this.group.name = 'assets';
  }

  rebuild(assets: PlacedAsset[], customAssets: AssetDef[], terrain: EditorTerrain): void {
    for (const m of this.meshes) {
      this.group.remove(m.mesh);
      m.mesh.dispose();
    }
    this.meshes = [];

    // Group placement indices by asset id.
    const byId = new Map<string, number[]>();
    for (let i = 0; i < assets.length; i++) {
      const id = assets[i].asset;
      const arr = byId.get(id);
      if (arr) arr.push(i);
      else byId.set(id, [i]);
    }

    for (const [assetId, indices] of byId) {
      const geo = geometryFor(assetId, customAssets);
      if (!geo) continue;
      const mat = isSmooth(assetId) ? smoothMat : flatMat;
      const mesh = new THREE.InstancedMesh(geo, mat, indices.length);
      mesh.frustumCulled = false;
      mesh.name = `asset:${assetId}`;
      for (let s = 0; s < indices.length; s++) {
        const p = assets[indices[s]];
        const y = terrain.heightAt(p.x, p.z) + yLiftFor(assetId, p.scale);
        _obj.position.set(p.x, y, p.z);
        _obj.rotation.set(0, p.rot, 0);
        _obj.scale.setScalar(p.scale);
        _obj.updateMatrix();
        mesh.setMatrixAt(s, _obj.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
      this.meshes.push({ mesh, indices });
    }
  }

  /** Raycast the placed assets; returns the hit placement index or null. */
  pick(raycaster: THREE.Raycaster): number | null {
    let best: { dist: number; index: number } | null = null;
    for (const m of this.meshes) {
      const hits = raycaster.intersectObject(m.mesh, false);
      for (const h of hits) {
        if (h.instanceId == null) continue;
        const index = m.indices[h.instanceId];
        if (!best || h.distance < best.dist) best = { dist: h.distance, index };
      }
    }
    return best ? best.index : null;
  }
}

/** A single ghost/preview mesh for the asset currently being placed. */
export function makePreviewMesh(assetId: string, customAssets: AssetDef[]): THREE.Mesh | null {
  const geo = geometryFor(assetId, customAssets);
  if (!geo) return null;
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    flatShading: !isSmooth(assetId),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'asset-preview';
  return mesh;
}

export function previewYLift(assetId: string, scale: number): number {
  return yLiftFor(assetId, scale);
}

/** Default placement scale for an asset id (built-in catalog default, else 1). */
export function defaultScaleFor(assetId: string): number {
  return builtinById(assetId)?.scale ?? 1;
}
