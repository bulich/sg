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

function drawBlurredBackground(
  ctx: OffscreenCanvasRenderingContext2D,
  smallCtx: OffscreenCanvasRenderingContext2D,
  smallCanvas: OffscreenCanvas,
  source: CanvasImageSource,
  width: number,
  height: number,
  brightness: number,
  saturation: number,
): void {
  const sw = (source as HTMLCanvasElement | OffscreenCanvas).width;
  const sh = (source as HTMLCanvasElement | OffscreenCanvas).height;
  const smallW = smallCanvas.width;
  const smallH = smallCanvas.height;
  const smallScale = Math.max(smallW / sw, smallH / sh);
  const sdw = sw * smallScale;
  const sdh = sh * smallScale;
  smallCtx.imageSmoothingEnabled = true;
  smallCtx.imageSmoothingQuality = 'high';
  smallCtx.clearRect(0, 0, smallW, smallH);
  smallCtx.drawImage(source, (smallW - sdw) / 2, (smallH - sdh) / 2, sdw, sdh);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(smallCanvas, 0, 0, width, height);

  applyBrightnessSaturation(ctx, width, height, brightness, saturation);
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
      antialias: false,
      softwareBackground: true,
    });

    const bgCanvas = new OffscreenCanvas(OUTPUT_WIDTH, OUTPUT_HEIGHT);
    const bgCtx = bgCanvas.getContext('2d');
    if (!bgCtx) throw new Error('2D контекст для фона недоступен');
    const bg = opts.settings.background;
    const blurDownscale = Math.max(1, Math.round(24 + Math.max(0, bg.blurPx)));
    const blurW = Math.max(8, Math.round(OUTPUT_WIDTH / blurDownscale));
    const blurH = Math.max(8, Math.round(OUTPUT_HEIGHT / blurDownscale));
    const bgSmall = new OffscreenCanvas(blurW, blurH);
    const bgSmallCtx = bgSmall.getContext('2d');
    if (!bgSmallCtx) throw new Error('2D контекст для фона недоступен');

    scene.setBackground(opts.settings.background);
    scene.setMainVideo(opts.settings.mainVideo);
    scene.setText(opts.settings.text);
    console.log('[pipeline] scene.setLogo');
    await scene.setLogo(opts.logoBlob, opts.settings.logo);

    console.log('[pipeline] getPrimaryVideoTrack');
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('Видео-дорожка не найдена');
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
        drawBlurredBackground(bgCtx, bgSmallCtx, bgSmall, wrapped.canvas, OUTPUT_WIDTH, OUTPUT_HEIGHT, bg.brightness, bg.saturation);
        scene.setBackgroundFrame(bgCanvas);
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
