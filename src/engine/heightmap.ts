// Heightmap import: load an image and resample its brightness into a row-major height
// grid (white = high, black = low — or inverted), bilinearly fitted to the map's
// resolution. Pure browser APIs (Image + canvas) — no dependencies.

export interface HeightmapOptions {
  /** Height (m) for black pixels. */
  minHeight: number;
  /** Height (m) for white pixels. */
  maxHeight: number;
  /** Treat dark as high instead of low. */
  invert: boolean;
}

function gray(data: Uint8ClampedArray, cw: number, x: number, y: number): number {
  const i = (y * cw + x) * 4;
  return (data[i] + data[i + 1] + data[i + 2]) / 3;
}

function bilinearGray(data: Uint8ClampedArray, cw: number, ch: number, fx: number, fy: number): number {
  const x0 = Math.max(0, Math.floor(fx));
  const y0 = Math.max(0, Math.floor(fy));
  const x1 = Math.min(cw - 1, x0 + 1);
  const y1 = Math.min(ch - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = gray(data, cw, x0, y0) + (gray(data, cw, x1, y0) - gray(data, cw, x0, y0)) * tx;
  const b = gray(data, cw, x0, y1) + (gray(data, cw, x1, y1) - gray(data, cw, x0, y1)) * tx;
  return a + (b - a) * ty;
}

/** Load an image file and resample it into `res`×`res` row-major heights. */
export async function loadHeightmap(file: File, res: number, opts: HeightmapOptions): Promise<Float32Array> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not decode image'));
      i.src = url;
    });
    const cw = img.naturalWidth;
    const ch = img.naturalHeight;
    if (!cw || !ch) throw new Error('Empty image');
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, cw, ch).data;

    const heights = new Float32Array(res * res);
    const range = opts.maxHeight - opts.minHeight;
    for (let z = 0; z < res; z++) {
      for (let x = 0; x < res; x++) {
        const u = res > 1 ? x / (res - 1) : 0;
        const v = res > 1 ? z / (res - 1) : 0;
        const g = bilinearGray(data, cw, ch, u * (cw - 1), v * (ch - 1)) / 255;
        const t = opts.invert ? 1 - g : g;
        heights[z * res + x] = opts.minHeight + t * range;
      }
    }
    return heights;
  } finally {
    URL.revokeObjectURL(url);
  }
}
