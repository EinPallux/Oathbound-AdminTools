// The 3D viewport: renderer, scene, orbit camera, lighting and a render loop. Editor
// layers (terrain, water/roads, assets, markers, gizmos) are added to `scene`.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly canvas: HTMLCanvasElement;
  private raf = 0;
  private last = 0;
  private updateCb: ((dt: number) => void) | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = false;

    this.scene.background = new THREE.Color(0x9fc6e8);
    this.scene.fog = new THREE.Fog(0x9fc6e8, 360, 900);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.5, 4000);
    this.camera.position.set(120, 130, 200);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495; // don't drop below the ground
    this.controls.minDistance = 4;
    this.controls.maxDistance = 1600;
    this.controls.target.set(0, 0, 0);

    // Lighting: soft sky/ground hemisphere + a key sun for low-poly shading.
    const hemi = new THREE.HemisphereLight(0xdfeeff, 0x5b6648, 0.95);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    sun.position.set(180, 320, 140);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbcd0ff, 0.25);
    fill.position.set(-160, 120, -120);
    this.scene.add(fill);

    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  private onResize = (): void => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  /** Recompute size from the canvas's CSS box (call after layout changes). */
  resize(): void {
    this.onResize();
  }

  start(update: (dt: number) => void): void {
    this.updateCb = update;
    this.last = performance.now();
    const tick = (now: number): void => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.controls.update();
      this.updateCb?.(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  /** Convert a pointer event to normalized device coordinates. */
  private toNDC(ev: PointerEvent | MouseEvent): THREE.Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    return this.ndc;
  }

  /** Raycast from a pointer event against `objects`; returns the closest hit or null. */
  raycast(ev: PointerEvent | MouseEvent, objects: THREE.Object3D[]): THREE.Intersection | null {
    this.raycaster.setFromCamera(this.toNDC(ev), this.camera);
    const hits = this.raycaster.intersectObjects(objects, false);
    return hits.length ? hits[0] : null;
  }

  /** A raycaster set from the given pointer event (for instanced picks). */
  raycasterFrom(ev: PointerEvent | MouseEvent): THREE.Raycaster {
    this.raycaster.setFromCamera(this.toNDC(ev), this.camera);
    return this.raycaster;
  }

  enableControls(on: boolean): void {
    this.controls.enabled = on;
  }
}
