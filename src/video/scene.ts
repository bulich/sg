import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from '@/constants';
import { renderBlurredBackground } from './bgBlur';
import type {
  BackgroundSettings,
  LogoSettings,
  MainVideoSettings,
  TextSettings,
} from '@/types/editor';

export type FrameSource = ImageBitmap | VideoFrame | HTMLCanvasElement | OffscreenCanvas;

export interface SceneInitOptions {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width?: number;
  height?: number;
  backgroundColor?: string;
  softwareBackground?: boolean;
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export class Scene {
  private canvas: AnyCanvas | null = null;
  private ctx: Ctx | null = null;
  private width = OUTPUT_WIDTH;
  private height = OUTPUT_HEIGHT;
  private backgroundColor = '#000000';
  private softwareBackground = false;

  private frameSource: FrameSource | null = null;
  private bgFrameSource: FrameSource | null = null;
  private logoSource: ImageBitmap | null = null;
  private textCanvas: AnyCanvas | null = null;
  private cachedBlurCanvas: AnyCanvas | null = null;
  private cachedBlurKey = '';

  private bgSettings: BackgroundSettings = { blurPx: 0, brightness: 1, saturation: 1 };
  private mainVideoSettings: MainVideoSettings = { widthPercent: 100, offsetY: 0 };
  private logoSettings: LogoSettings = {
    assetId: null, x: 0, y: 0, width: 0, height: 0, opacity: 1,
  };
  private textPosition = { x: 0, y: 0 };

  async init(options: SceneInitOptions): Promise<void> {
    this.width = options.width ?? OUTPUT_WIDTH;
    this.height = options.height ?? OUTPUT_HEIGHT;
    this.backgroundColor = options.backgroundColor ?? '#000000';
    this.softwareBackground = options.softwareBackground ?? false;
    this.canvas = options.canvas;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    const ctx = this.canvas.getContext('2d', { alpha: false }) as Ctx | null;
    if (!ctx) throw new Error('2D контекст недоступен');
    this.ctx = ctx;
  }

  setFrame(source: FrameSource | null): void {
    if (source !== this.frameSource) {
      this.cachedBlurCanvas = null;
      this.cachedBlurKey = '';
    }
    this.frameSource = source;
  }

  setBackgroundFrame(source: FrameSource | null): void {
    this.bgFrameSource = source;
  }

  setBackground(settings: BackgroundSettings): void {
    if (this.bgSettings.blurPx !== settings.blurPx) {
      this.cachedBlurCanvas = null;
      this.cachedBlurKey = '';
    }
    this.bgSettings = settings;
  }

  setMainVideo(settings: MainVideoSettings): void {
    this.mainVideoSettings = settings;
  }

  async setLogo(blob: Blob | null, settings: LogoSettings): Promise<void> {
    this.logoSettings = settings;
    if (this.logoSource) {
      try { this.logoSource.close(); } catch { /* noop */ }
      this.logoSource = null;
    }
    if (!blob) return;
    this.logoSource = await loadLogoBitmap(blob);
  }

  updateLogoSettings(settings: LogoSettings): void {
    this.logoSettings = settings;
  }

  setText(settings: TextSettings): void {
    const content = settings.content;
    if (!content) {
      this.textCanvas = null;
      return;
    }
    const rendered = renderTextCanvas(content, settings);
    this.textCanvas = rendered.canvas;
    const anchorX = settings.align === 'center' ? 0.5 : settings.align === 'right' ? 1 : 0;
    this.textPosition = {
      x: settings.x - anchorX * rendered.canvas.width + rendered.offsetX,
      y: settings.y - rendered.padding,
    };
  }

  render(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(0, 0, this.width, this.height);

    this.drawBackground(ctx);
    this.drawMainVideo(ctx);
    this.drawLogo(ctx);
    this.drawText(ctx);

    ctx.restore();
  }

  async extractBlob(type = 'image/jpeg', quality = 0.9): Promise<Blob> {
    if (!this.canvas) throw new Error('Scene не инициализирована');
    if (isOffscreen(this.canvas)) {
      return await this.canvas.convertToBlob({ type, quality });
    }
    const html = this.canvas;
    return await new Promise<Blob>((resolve, reject) => {
      html.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('canvas → blob failed'))),
        type,
        quality,
      );
    });
  }

  destroy(): void {
    if (this.logoSource) {
      try { this.logoSource.close(); } catch { /* noop */ }
      this.logoSource = null;
    }
    this.frameSource = null;
    this.bgFrameSource = null;
    this.textCanvas = null;
    this.cachedBlurCanvas = null;
    this.cachedBlurKey = '';
    this.ctx = null;
    this.canvas = null;
  }

  private drawBackground(ctx: Ctx): void {
    if (this.bgFrameSource) {
      const { w, h } = sourceSize(this.bgFrameSource);
      if (w === this.width && h === this.height) {
        ctx.drawImage(this.bgFrameSource, 0, 0);
      } else {
        const fit = fitCover(w, h, this.width, this.height);
        ctx.drawImage(this.bgFrameSource, fit.dx, fit.dy, fit.dw, fit.dh);
      }
      return;
    }
    if (this.softwareBackground || !this.frameSource) return;

    const bg = this.bgSettings;
    const blur = Math.max(0, bg.blurPx);
    const { w, h } = sourceSize(this.frameSource);

    const key = `${w}x${h}|${blur}`;
    if (!this.cachedBlurCanvas || this.cachedBlurKey !== key) {
      this.cachedBlurCanvas = renderBlurredBackground(
        this.frameSource as CanvasImageSource,
        w,
        h,
        this.width,
        this.height,
        blur,
      );
      this.cachedBlurKey = key;
    }

    const parts: string[] = [];
    if (bg.brightness !== 1) parts.push(`brightness(${bg.brightness})`);
    if (bg.saturation !== 1) parts.push(`saturate(${bg.saturation})`);
    ctx.filter = parts.length > 0 ? parts.join(' ') : 'none';
    ctx.drawImage(this.cachedBlurCanvas, 0, 0);
    ctx.filter = 'none';
  }

  private drawMainVideo(ctx: Ctx): void {
    if (!this.frameSource) return;
    const s = this.mainVideoSettings;
    const { w, h } = sourceSize(this.frameSource);
    const scale = (this.width * s.widthPercent) / 100 / w;
    const targetW = w * scale;
    const targetH = h * scale;
    const x = (this.width - targetW) / 2;
    const y = (this.height - targetH) / 2 + s.offsetY;
    ctx.drawImage(this.frameSource, x, y, targetW, targetH);
  }

  private drawLogo(ctx: Ctx): void {
    if (!this.logoSource) return;
    const s = this.logoSettings;
    ctx.globalAlpha = Math.max(0, Math.min(1, s.opacity));
    ctx.drawImage(this.logoSource, s.x, s.y, s.width, s.height);
    ctx.globalAlpha = 1;
  }

  private drawText(ctx: Ctx): void {
    if (!this.textCanvas) return;
    ctx.drawImage(this.textCanvas, this.textPosition.x, this.textPosition.y);
  }
}

function sourceSize(source: FrameSource): { w: number; h: number } {
  if (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame) {
    return { w: source.displayWidth, h: source.displayHeight };
  }
  return { w: (source as ImageBitmap).width, h: (source as ImageBitmap).height };
}

function fitCover(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { dx: number; dy: number; dw: number; dh: number } {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const dw = srcW * scale;
  const dh = srcH * scale;
  const dx = (dstW - dw) / 2;
  const dy = (dstH - dh) / 2;
  return { dx, dy, dw, dh };
}

function isOffscreen(canvas: AnyCanvas): canvas is OffscreenCanvas {
  return typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas;
}

function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

interface RenderedText {
  canvas: AnyCanvas;
  padding: number;
  offsetX: number;
}

function renderTextCanvas(text: string, settings: TextSettings): RenderedText {
  const fontFamily = `"${settings.fontFamily}", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  const fontSize = Math.max(1, settings.fontSize);
  const font = `600 ${fontSize}px ${fontFamily}`;
  const padding = Math.ceil(fontSize * 0.25);
  const lineHeight = fontSize * 1.2;

  const measureCanvas = createCanvas(1, 1);
  const measureCtx = measureCanvas.getContext('2d') as Ctx | null;
  if (!measureCtx) throw new Error('2D контекст недоступен');
  measureCtx.font = font;

  const lines = text.split('\n');
  let maxWidth = 0;
  for (const line of lines) {
    const w = measureCtx.measureText(line || ' ').width;
    if (w > maxWidth) maxWidth = w;
  }

  const ascent = fontSize * 0.8;
  const descent = fontSize * 0.25;
  const textHeight = ascent + descent + (lines.length - 1) * lineHeight;

  const canvasWidth = Math.max(1, Math.ceil(maxWidth) + padding * 2);
  const canvasHeight = Math.max(1, Math.ceil(textHeight) + padding * 2);

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('2D контекст недоступен');
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = settings.color;
  ctx.textAlign =
    settings.align === 'center' ? 'center'
    : settings.align === 'right' ? 'right'
    : 'left';

  const x =
    settings.align === 'center' ? canvasWidth / 2
    : settings.align === 'right' ? canvasWidth - padding
    : padding;

  for (let i = 0; i < lines.length; i++) {
    const y = padding + ascent + i * lineHeight;
    ctx.fillText(lines[i]!, x, y);
  }

  const offsetX =
    settings.align === 'left' ? -padding
    : settings.align === 'right' ? padding
    : 0;

  return { canvas, padding, offsetX };
}

async function loadLogoBitmap(blob: Blob): Promise<ImageBitmap> {
  if (blob.type === 'image/svg+xml') {
    return await rasterizeSvgBlob(blob);
  }
  return await createImageBitmap(blob);
}

async function rasterizeSvgBlob(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob);
  } catch {
    // iOS Safari fails createImageBitmap on SVG — fall through to <img> rasterization
  }
  const text = await blob.text();
  const { width, height } = readSvgSize(text);
  const source = await loadSvgAsImageSource(text, width, height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('2D контекст недоступен');
  ctx.drawImage(source, 0, 0, width, height);
  return await createImageBitmap(canvas);
}

function readSvgSize(svg: string): { width: number; height: number } {
  const widthMatch = svg.match(/\swidth="(\d+(?:\.\d+)?)"/);
  const heightMatch = svg.match(/\sheight="(\d+(?:\.\d+)?)"/);
  const viewBox = svg.match(/viewBox="([\d.\s-]+)"/);
  let w = widthMatch ? Number(widthMatch[1]) : 0;
  let h = heightMatch ? Number(heightMatch[1]) : 0;
  if ((!w || !h) && viewBox) {
    const parts = viewBox[1]?.trim().split(/\s+/).map(Number) ?? [];
    if (parts.length === 4) {
      w = w || parts[2] || 0;
      h = h || parts[3] || 0;
    }
  }
  return { width: w || 512, height: h || 512 };
}

async function loadSvgAsImageSource(
  svg: string,
  width: number,
  height: number,
): Promise<CanvasImageSource> {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  if (typeof Image !== 'undefined') {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image(width, height);
      img.decoding = 'async';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Не удалось загрузить SVG'));
        img.src = url;
      });
      if (typeof img.decode === 'function') {
        try { await img.decode(); } catch { /* noop */ }
      }
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return await createImageBitmap(blob);
}
