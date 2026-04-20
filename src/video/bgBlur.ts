type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

let filterBlurSupport: boolean | null = null;

export function canvasFilterBlurWorks(): boolean {
  if (filterBlurSupport !== null) return filterBlurSupport;
  try {
    const src = createTestCanvas(16, 16);
    const sctx = src.getContext('2d') as AnyCtx | null;
    if (!sctx) { filterBlurSupport = false; return false; }
    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, 16, 16);
    sctx.fillStyle = '#fff';
    sctx.fillRect(7, 7, 2, 2);

    const dst = createTestCanvas(16, 16);
    const dctx = dst.getContext('2d') as AnyCtx | null;
    if (!dctx) { filterBlurSupport = false; return false; }
    const fctx = dctx as unknown as { filter: string };
    fctx.filter = 'blur(4px)';
    dctx.drawImage(src as CanvasImageSource, 0, 0);
    fctx.filter = 'none';

    const corner = dctx.getImageData(0, 0, 1, 1).data;
    filterBlurSupport = (corner[0]! + corner[1]! + corner[2]!) > 0;
  } catch {
    filterBlurSupport = false;
  }
  return filterBlurSupport;
}

function createTestCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function renderBlurredBackground(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  outW: number,
  outH: number,
  blurPx: number,
): AnyCanvas {
  const out = createTestCanvas(outW, outH);
  const ctx = out.getContext('2d') as AnyCtx | null;
  if (!ctx) return out;

  const scale = Math.max(outW / srcW, outH / srcH);
  const dw = srcW * scale;
  const dh = srcH * scale;
  const dx = (outW - dw) / 2;
  const dy = (outH - dh) / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, outW, outH);

  if (blurPx <= 0) {
    ctx.drawImage(source, dx, dy, dw, dh);
    return out;
  }

  if (canvasFilterBlurWorks()) {
    const fctx = ctx as unknown as { filter: string };
    fctx.filter = `blur(${blurPx}px)`;
    const pad = Math.ceil(blurPx * 2);
    ctx.drawImage(source, dx - pad, dy - pad, dw + pad * 2, dh + pad * 2);
    fctx.filter = 'none';
    return out;
  }

  drawSoftwareBlurred(ctx, source, dx, dy, dw, dh, blurPx);
  return out;
}

function drawSoftwareBlurred(
  dstCtx: AnyCtx,
  source: CanvasImageSource,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  blurPx: number,
): void {
  const downscale = Math.max(2, Math.min(16, Math.round(blurPx / 2)));
  const sw = Math.max(4, Math.round(dw / downscale));
  const sh = Math.max(4, Math.round(dh / downscale));
  const tmp = createTestCanvas(sw, sh);
  const tctx = tmp.getContext('2d') as AnyCtx | null;
  if (!tctx) {
    dstCtx.drawImage(source, dx, dy, dw, dh);
    return;
  }
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(source, 0, 0, sw, sh);

  const radius = Math.max(1, Math.round(blurPx / downscale));
  if (radius > 0) {
    const img = tctx.getImageData(0, 0, sw, sh);
    boxBlur(img.data, sw, sh, radius, 3);
    tctx.putImageData(img, 0, 0);
  }

  dstCtx.imageSmoothingEnabled = true;
  dstCtx.imageSmoothingQuality = 'high';
  dstCtx.drawImage(tmp as CanvasImageSource, dx, dy, dw, dh);
}

function boxBlur(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
  passes: number,
): void {
  const tmp = new Uint8ClampedArray(data.length);
  for (let p = 0; p < passes; p++) {
    boxBlurPass(data, tmp, w, h, radius, true);
    boxBlurPass(tmp, data, w, h, radius, false);
  }
}

function boxBlurPass(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
  horizontal: boolean,
): void {
  const n = radius * 2 + 1;
  const inv = 1 / n;
  if (horizontal) {
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      let r = 0, g = 0, b = 0, a = 0;
      for (let i = -radius; i <= radius; i++) {
        const x = i < 0 ? 0 : i >= w ? w - 1 : i;
        const off = row + x * 4;
        r += src[off]!; g += src[off + 1]!; b += src[off + 2]!; a += src[off + 3]!;
      }
      for (let x = 0; x < w; x++) {
        const off = row + x * 4;
        dst[off] = r * inv;
        dst[off + 1] = g * inv;
        dst[off + 2] = b * inv;
        dst[off + 3] = a * inv;
        const xOut = x - radius < 0 ? 0 : x - radius;
        const xIn = x + radius + 1 >= w ? w - 1 : x + radius + 1;
        const oOut = row + xOut * 4;
        const oIn = row + xIn * 4;
        r += src[oIn]! - src[oOut]!;
        g += src[oIn + 1]! - src[oOut + 1]!;
        b += src[oIn + 2]! - src[oOut + 2]!;
        a += src[oIn + 3]! - src[oOut + 3]!;
      }
    }
  } else {
    for (let x = 0; x < w; x++) {
      const col = x * 4;
      let r = 0, g = 0, b = 0, a = 0;
      for (let i = -radius; i <= radius; i++) {
        const y = i < 0 ? 0 : i >= h ? h - 1 : i;
        const off = y * w * 4 + col;
        r += src[off]!; g += src[off + 1]!; b += src[off + 2]!; a += src[off + 3]!;
      }
      for (let y = 0; y < h; y++) {
        const off = y * w * 4 + col;
        dst[off] = r * inv;
        dst[off + 1] = g * inv;
        dst[off + 2] = b * inv;
        dst[off + 3] = a * inv;
        const yOut = y - radius < 0 ? 0 : y - radius;
        const yIn = y + radius + 1 >= h ? h - 1 : y + radius + 1;
        const oOut = yOut * w * 4 + col;
        const oIn = yIn * w * 4 + col;
        r += src[oIn]! - src[oOut]!;
        g += src[oIn + 1]! - src[oOut + 1]!;
        b += src[oIn + 2]! - src[oOut + 2]!;
        a += src[oIn + 3]! - src[oOut + 3]!;
      }
    }
  }
}
