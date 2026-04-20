import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
} from 'mediabunny';
import { Scene } from './scene';
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from '@/constants';
import type { EditorSettings, VideoMeta } from '@/types/editor';

export async function readInputMeta(blob: Blob): Promise<VideoMeta> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      throw new Error('Видео-дорожка не найдена');
    }
    const audioTrack = await input.getPrimaryAudioTrack();
    const duration = await input.computeDuration();
    return {
      width: videoTrack.displayWidth,
      height: videoTrack.displayHeight,
      durationSec: duration,
      codec: videoTrack.codec ?? 'unknown',
      hasAudio: audioTrack !== null,
    };
  } finally {
    input.dispose();
  }
}

export async function extractThumbnail(
  blob: Blob,
  timeSec = 0.5,
  maxWidth = 540,
): Promise<Blob> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('Видео-дорожка не найдена');

    const aspect = videoTrack.displayWidth / videoTrack.displayHeight;
    const width = Math.min(maxWidth, videoTrack.displayWidth);
    const height = Math.round(width / aspect);

    const sink = new CanvasSink(videoTrack, { width, height, fit: 'contain' });
    const duration = await input.computeDuration();
    const t = Math.min(timeSec, Math.max(0, duration - 0.1));
    const wrapped = await sink.getCanvas(t);
    if (!wrapped) throw new Error('Не удалось извлечь кадр');
    return await canvasToBlob(wrapped.canvas, 'image/jpeg', 0.82);
  } finally {
    input.dispose();
  }
}

async function buildStaticBackground(
  videoTrack: NonNullable<Awaited<ReturnType<Input['getPrimaryVideoTrack']>>>,
  timeSec: number,
  bg: { blurPx: number; brightness: number; saturation: number },
): Promise<OffscreenCanvas> {
  const sampleW = Math.min(960, videoTrack.displayWidth);
  const sampleH = Math.max(
    1,
    Math.round(sampleW * (videoTrack.displayHeight / videoTrack.displayWidth)),
  );
  const sink = new CanvasSink(videoTrack, {
    width: sampleW,
    height: sampleH,
    fit: 'contain',
    poolSize: 1,
  });
  const t = Math.max(0, timeSec);
  const wrapped = await sink.getCanvas(t);
  if (!wrapped) throw new Error('Не удалось извлечь кадр для фона');

  const out = new OffscreenCanvas(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2D контекст для фона недоступен');

  const sw = (wrapped.canvas as OffscreenCanvas).width;
  const sh = (wrapped.canvas as OffscreenCanvas).height;
  const scale = Math.max(OUTPUT_WIDTH / sw, OUTPUT_HEIGHT / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = (OUTPUT_WIDTH - dw) / 2;
  const dy = (OUTPUT_HEIGHT - dh) / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

  const blurStrength = Math.max(0, bg.blurPx);
  if (blurStrength > 0) {
    if (canvasFilterBlurWorks()) {
      const filterCtx = ctx as unknown as { filter: string };
      filterCtx.filter = `blur(${blurStrength}px)`;
      const pad = Math.ceil(blurStrength * 2);
      ctx.drawImage(wrapped.canvas, dx - pad, dy - pad, dw + pad * 2, dh + pad * 2);
      filterCtx.filter = 'none';
    } else {
      drawSoftwareBlurred(ctx, wrapped.canvas, dx, dy, dw, dh, blurStrength);
    }
  } else {
    ctx.drawImage(wrapped.canvas, dx, dy, dw, dh);
  }

  applyBrightnessSaturation(ctx, OUTPUT_WIDTH, OUTPUT_HEIGHT, bg.brightness, bg.saturation);
  return out;
}

let filterBlurSupport: boolean | null = null;
function canvasFilterBlurWorks(): boolean {
  if (filterBlurSupport !== null) return filterBlurSupport;
  try {
    const src = new OffscreenCanvas(16, 16);
    const sctx = src.getContext('2d');
    if (!sctx) { filterBlurSupport = false; return false; }
    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, 16, 16);
    sctx.fillStyle = '#fff';
    sctx.fillRect(7, 7, 2, 2);

    const dst = new OffscreenCanvas(16, 16);
    const dctx = dst.getContext('2d');
    if (!dctx) { filterBlurSupport = false; return false; }
    const fctx = dctx as unknown as { filter: string };
    fctx.filter = 'blur(4px)';
    dctx.drawImage(src, 0, 0);
    fctx.filter = 'none';

    const corner = dctx.getImageData(0, 0, 1, 1).data;
    filterBlurSupport = (corner[0]! + corner[1]! + corner[2]!) > 0;
  } catch {
    filterBlurSupport = false;
  }
  console.log('[pipeline] canvas filter blur support:', filterBlurSupport);
  return filterBlurSupport;
}

function drawSoftwareBlurred(
  dstCtx: OffscreenCanvasRenderingContext2D,
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
  const tmp = new OffscreenCanvas(sw, sh);
  const tctx = tmp.getContext('2d');
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
  dstCtx.drawImage(tmp, dx, dy, dw, dh);
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

function applyBrightnessSaturation(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  brightness: number,
  saturation: number,
): void {
  if (brightness === 1 && saturation === 1) return;
  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]!;
    let g = data[i + 1]!;
    let b = data[i + 2]!;
    const gray = 0.2989 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * saturation;
    g = gray + (g - gray) * saturation;
    b = gray + (b - gray) * saturation;
    r *= brightness;
    g *= brightness;
    b *= brightness;
    data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  ctx.putImageData(img, 0, 0);
}

async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return await canvas.convertToBlob({ type, quality });
  }
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas → Blob failed'))),
      type,
      quality,
    );
  });
}

export interface RenderProgress {
  currentSec: number;
  durationSec: number;
  frame: number;
  fps: number;
}

export interface RenderOptions {
  input: Blob;
  settings: EditorSettings;
  logoBlob: Blob | null;
  backgroundTimeSec: number;
  onProgress?: (p: RenderProgress) => void;
  signal?: AbortSignal;
}


export async function renderVideo(opts: RenderOptions): Promise<Blob> {
  console.log('[pipeline:renderVideo] start', {
    inputSize: opts.input.size,
    inputType: opts.input.type,
    hasLogo: !!opts.logoBlob,
  });
  const input = new Input({ source: new BlobSource(opts.input), formats: ALL_FORMATS });
  const canvas = new OffscreenCanvas(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const scene = new Scene();
  let finished = false;
  try {
    console.log('[pipeline] scene.init');
    await scene.init({
      canvas,
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      softwareBackground: true,
    });

    const bg = opts.settings.background;

    scene.setBackground(opts.settings.background);
    scene.setMainVideo(opts.settings.mainVideo);
    scene.setText(opts.settings.text);
    console.log('[pipeline] scene.setLogo');
    await scene.setLogo(opts.logoBlob, opts.settings.logo);

    console.log('[pipeline] getPrimaryVideoTrack');
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('Видео-дорожка не найдена');

    const bgCanvas = await buildStaticBackground(videoTrack, opts.backgroundTimeSec, bg);
    scene.setBackgroundFrame(bgCanvas);
    console.log('[pipeline] track', { w: videoTrack.displayWidth, h: videoTrack.displayHeight, codec: videoTrack.codec });
    const audioTrack = await input.getPrimaryAudioTrack();
    const duration = await input.computeDuration();
    console.log('[pipeline] duration', duration, 'hasAudio', !!audioTrack);

    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget(),
    });

    const videoSource = new CanvasSource(canvas, {
      codec: 'avc',
      bitrate: QUALITY_HIGH,
      keyFrameInterval: 2,
    });
    output.addVideoTrack(videoSource);

    let audioSource: EncodedAudioPacketSource | null = null;
    let audioDecoderConfig: AudioDecoderConfig | null = null;
    if (audioTrack && audioTrack.codec) {
      audioDecoderConfig = await audioTrack.getDecoderConfig();
      audioSource = new EncodedAudioPacketSource(audioTrack.codec);
      output.addAudioTrack(audioSource);
    }

    console.log('[pipeline] output.start');
    await output.start();

    const startTime = performance.now();
    let framesRendered = 0;

    const videoSink = new CanvasSink(videoTrack, { poolSize: 2 });
    const videoTask = (async () => {
      let firstFrameLogged = false;
      for await (const wrapped of videoSink.canvases(0, duration)) {
        if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
        const ts = Math.max(0, wrapped.timestamp);
        if (!firstFrameLogged) {
          console.log('[pipeline] first video frame', { ts: wrapped.timestamp, w: (wrapped.canvas as OffscreenCanvas).width, h: (wrapped.canvas as OffscreenCanvas).height });
          firstFrameLogged = true;
        }
        scene.setFrame(wrapped.canvas);
        scene.render();
        await videoSource.add(ts, wrapped.duration);
        framesRendered += 1;
        const elapsed = (performance.now() - startTime) / 1000;
        opts.onProgress?.({
          currentSec: wrapped.timestamp,
          durationSec: duration,
          frame: framesRendered,
          fps: elapsed > 0 ? framesRendered / elapsed : 0,
        });
      }
      console.log('[pipeline] video loop end, frames', framesRendered);
      videoSource.close();
    })();

    const audioTask = audioSource && audioTrack
      ? (async () => {
          const src = audioSource!;
          const sink = new EncodedPacketSink(audioTrack);
          let first = true;
          for await (const packet of sink.packets()) {
            if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
            if (packet.timestamp < 0) continue;
            if (first) {
              await src.add(
                packet,
                audioDecoderConfig ? { decoderConfig: audioDecoderConfig } : undefined,
              );
              first = false;
            } else {
              await src.add(packet);
            }
          }
          src.close();
        })()
      : Promise.resolve();

    try {
      await Promise.all([videoTask, audioTask]);
    } catch (err) {
      await output.cancel().catch(() => undefined);
      throw err;
    }

    console.log('[pipeline] finalize');
    await output.finalize();
    finished = true;
    console.log('[pipeline] finalized');

    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new Error('Пустой выходной буфер');
    return new Blob([buffer], { type: 'video/mp4' });
  } finally {
    try { scene.destroy(); } catch (err) { console.warn('[pipeline:scene.destroy]', err); }
    try { input.dispose(); } catch (err) { console.warn('[pipeline:input.dispose]', err); }
    void finished;
  }
}
