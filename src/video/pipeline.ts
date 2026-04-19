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
  source: CanvasImageSource,
  width: number,
  height: number,
  filter: string,
): void {
  const sw = (source as HTMLCanvasElement | OffscreenCanvas).width;
  const sh = (source as HTMLCanvasElement | OffscreenCanvas).height;
  const scale = Math.max(width / sw, height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = (width - dw) / 2;
  const dy = (height - dh) / 2;
  ctx.save();
  ctx.filter = 'none';
  ctx.clearRect(0, 0, width, height);
  ctx.filter = filter;
  ctx.drawImage(source, dx, dy, dw, dh);
  ctx.restore();
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
  const input = new Input({ source: new BlobSource(opts.input), formats: ALL_FORMATS });
  const canvas = new OffscreenCanvas(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const scene = new Scene();
  let finished = false;
  try {
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
    const bgFilter = `blur(${Math.max(0, bg.blurPx)}px) brightness(${bg.brightness}) saturate(${bg.saturation})`;

    scene.setBackground(opts.settings.background);
    scene.setMainVideo(opts.settings.mainVideo);
    scene.setText(opts.settings.text);
    await scene.setLogo(opts.logoBlob, opts.settings.logo);

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('Видео-дорожка не найдена');
    const audioTrack = await input.getPrimaryAudioTrack();
    const duration = await input.computeDuration();

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

    await output.start();

    const startTime = performance.now();
    let framesRendered = 0;

    const videoSink = new CanvasSink(videoTrack, { poolSize: 2 });
    const videoTask = (async () => {
      for await (const wrapped of videoSink.canvases(0, duration)) {
        if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
        const ts = Math.max(0, wrapped.timestamp);
        drawBlurredBackground(bgCtx, wrapped.canvas, OUTPUT_WIDTH, OUTPUT_HEIGHT, bgFilter);
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

    await output.finalize();
    finished = true;

    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new Error('Пустой выходной буфер');
    return new Blob([buffer], { type: 'video/mp4' });
  } finally {
    try { scene.destroy(); } catch (err) { console.warn('[pipeline:scene.destroy]', err); }
    try { input.dispose(); } catch (err) { console.warn('[pipeline:input.dispose]', err); }
    void finished;
  }
}
