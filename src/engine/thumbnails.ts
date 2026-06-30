// Renders a small 3D thumbnail (PNG data URL) for any asset id — built-in prop, preset, or
// custom asset — using one shared offscreen WebGL context. Results are cached by id, so the
// library palette only pays the render cost once. Geometry comes from the same builders the
// editor/game use, so a thumbnail matches the placed prop.

import * as THREE from 'three';
import type { AssetDef } from '../format/map';
import { builtinGeometry, customAssetGeometry } from '../oathbound/geometry';
import { parseBuiltin } from '../format/assets-builtin';
import { presetById } from '../format/presets';

const SIZE = 128; // render resolution (displayed smaller in CSS for crispness)
const SMOOTH = new Set(['tree', 'flower', 'lily']);

class ThumbnailRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 0.01, 1000);
  private smoothMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private cache = new Map<string, string>();

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setSize(SIZE, SIZE, false);
    this.renderer.setClearColor(0x000000, 0); // transparent
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x44502f, 1.05));
    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    sun.position.set(3, 6, 4);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xaecbff, 0.3);
    fill.position.set(-4, 2, -3);
    this.scene.add(fill);
  }

  private geoFor(assetId: string, customAssets: AssetDef[]): THREE.BufferGeometry | null {
    const b = parseBuiltin(assetId);
    if (b) return builtinGeometry(b.kind, b.variant);
    if (assetId.startsWith('preset:')) {
      const d = presetById(assetId.slice('preset:'.length));
      return d ? customAssetGeometry(d) : null;
    }
    if (assetId.startsWith('custom:')) {
      const d = customAssets.find((x) => `custom:${x.id}` === assetId);
      return d ? customAssetGeometry(d) : null;
    }
    return null;
  }

  get(assetId: string, customAssets: AssetDef[]): string | null {
    const cached = this.cache.get(assetId);
    if (cached) return cached;
    const geo = this.geoFor(assetId, customAssets);
    if (!geo) return null;

    const builtin = parseBuiltin(assetId);
    const mat = builtin && SMOOTH.has(builtin.kind) ? this.smoothMat : this.flatMat;
    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);

    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const center = bb.getCenter(new THREE.Vector3());
    const size = bb.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 0.4) * 0.5;
    const dist = radius / Math.tan((this.camera.fov * Math.PI) / 360) + radius * 1.15;
    const dir = new THREE.Vector3(1, 0.72, 1.2).normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.lookAt(center);
    this.camera.updateProjectionMatrix();

    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');

    this.scene.remove(mesh);
    geo.dispose();
    this.cache.set(assetId, url);
    return url;
  }

  invalidate(assetId: string): void {
    this.cache.delete(assetId);
  }
}

let inst: ThumbnailRenderer | null = null;

/** PNG data URL thumbnail for an asset id (cached). Null if the id can't be resolved. */
export function assetThumbnail(assetId: string, customAssets: AssetDef[]): string | null {
  if (!inst) inst = new ThumbnailRenderer();
  return inst.get(assetId, customAssets);
}

/** Drop a cached thumbnail (e.g. after editing a custom asset in the Asset Builder). */
export function invalidateThumbnail(assetId: string): void {
  inst?.invalidate(assetId);
}
