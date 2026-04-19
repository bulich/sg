import {
  Application,
  BlurFilter,
  Color,
  ColorMatrixFilter,
  Container,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from 'pixi.js';
import type { ColorSource } from 'pixi.js';
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from '@/constants';
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
  backgroundColor?: ColorSource;
  antialias?: boolean;
}

export class Scene {
  private app: Application;
  private root: Container;
  private bgSprite: Sprite;
  private bgBlur: BlurFilter;
  private bgColor: ColorMatrixFilter;
  private videoSprite: Sprite;
  private logoSprite: Sprite;
  private textSprite: Text;
  private frameTexture: Texture | null = null;
  private logoTexture: Texture | null = null;
  private initialized = false;
  private width: number;
  private height: number;

  constructor() {
    this.app = new Application();
    this.root = new Container();
    this.bgSprite = new Sprite();
    this.bgBlur = new BlurFilter({ strength: 40, quality: 4, kernelSize: 9 });
    this.bgColor = new ColorMatrixFilter();
    this.bgSprite.filters = [this.bgBlur, this.bgColor];
    this.videoSprite = new Sprite();
    this.logoSprite = new Sprite();
    this.logoSprite.visible = false;
    this.textSprite = new Text({ text: '', style: this.buildTextStyle() });
    this.textSprite.visible = false;
    this.width = OUTPUT_WIDTH;
    this.height = OUTPUT_HEIGHT;
  }

  async init(options: SceneInitOptions): Promise<void> {
    this.width = options.width ?? OUTPUT_WIDTH;
    this.height = options.height ?? OUTPUT_HEIGHT;
    await this.app.init({
      canvas: options.canvas as HTMLCanvasElement,
      width: this.width,
      height: this.height,
      backgroundColor: options.backgroundColor ?? 0x000000,
      antialias: options.antialias ?? true,
      autoStart: false,
      preference: 'webgl',
      resolution: 1,
      preserveDrawingBuffer: true,
    });
    this.root.addChild(this.bgSprite);
    this.root.addChild(this.videoSprite);
    this.root.addChild(this.logoSprite);
    this.root.addChild(this.textSprite);
    this.app.stage.addChild(this.root);
    this.initialized = true;
  }

  setFrame(source: FrameSource | null): void {
    if (this.frameTexture) {
      this.frameTexture.destroy(true);
      this.frameTexture = null;
    }
    if (!source) {
      this.bgSprite.visible = false;
      this.videoSprite.visible = false;
      return;
    }
    this.frameTexture = Texture.from(source, true);
    this.bgSprite.texture = this.frameTexture;
    this.videoSprite.texture = this.frameTexture;
    this.bgSprite.visible = true;
    this.videoSprite.visible = true;
    this.layoutBackground();
    this.layoutMainVideo(this._lastMainVideo);
  }

  private _lastMainVideo: MainVideoSettings = { widthPercent: 100, offsetY: 0 };

  setBackground(settings: BackgroundSettings): void {
    this.bgBlur.strength = Math.max(0, settings.blurPx);
    this.bgColor.reset();
    this.bgColor.brightness(settings.brightness, false);
    this.bgColor.saturate(settings.saturation - 1, true);
  }

  setMainVideo(settings: MainVideoSettings): void {
    this._lastMainVideo = settings;
    this.layoutMainVideo(settings);
  }

  async setLogo(blob: Blob | null, settings: LogoSettings): Promise<void> {
    if (!blob) {
      this.logoSprite.visible = false;
      this.logoSprite.texture = Texture.EMPTY;
      if (this.logoTexture) {
        this.logoTexture.destroy(true);
        this.logoTexture = null;
      }
      return;
    }
    const texture = await loadBlobTexture(blob);
    if (this.logoTexture) this.logoTexture.destroy(true);
    this.logoTexture = texture;
    this.logoSprite.texture = texture;
    this.applyLogoSettings(settings);
  }

  updateLogoSettings(settings: LogoSettings): void {
    if (!this.logoTexture) return;
    this.applyLogoSettings(settings);
  }

  setText(settings: TextSettings): void {
    const content = settings.content;
    this.textSprite.visible = content.length > 0;
    this.textSprite.text = content;
    this.textSprite.style = this.buildTextStyle(settings);
    const align = settings.align;
    const anchorX = align === 'center' ? 0.5 : align === 'right' ? 1 : 0;
    this.textSprite.anchor.set(anchorX, 0);
    this.textSprite.position.set(settings.x, settings.y);
  }

  render(): void {
    if (!this.initialized) return;
    this.app.render();
  }

  async extractBlob(type = 'image/jpeg', quality = 0.9): Promise<Blob> {
    const canvas = this.app.canvas as HTMLCanvasElement | OffscreenCanvas;
    if (isOffscreen(canvas)) {
      return await canvas.convertToBlob({ type, quality });
    }
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('canvas → blob failed'))),
        type,
        quality,
      );
    });
  }

  destroy(): void {
    if (this.frameTexture) this.frameTexture.destroy(true);
    if (this.logoTexture) this.logoTexture.destroy(true);
    this.frameTexture = null;
    this.logoTexture = null;
    this.app.destroy(false, { children: true, texture: false });
    this.initialized = false;
  }

  private layoutBackground(): void {
    if (!this.frameTexture) return;
    const tw = this.frameTexture.width;
    const th = this.frameTexture.height;
    const scale = Math.max(this.width / tw, this.height / th);
    this.bgSprite.anchor.set(0.5);
    this.bgSprite.position.set(this.width / 2, this.height / 2);
    this.bgSprite.scale.set(scale);
  }

  private layoutMainVideo(settings: MainVideoSettings): void {
    if (!this.frameTexture) return;
    const tw = this.frameTexture.width;
    const th = this.frameTexture.height;
    const scale = (this.width * settings.widthPercent) / 100 / tw;
    this.videoSprite.anchor.set(0.5);
    this.videoSprite.scale.set(scale);
    this.videoSprite.position.set(
      this.width / 2,
      this.height / 2 + settings.offsetY,
    );
    this.videoSprite.visible = this.frameTexture !== null;
    void th;
  }

  private applyLogoSettings(settings: LogoSettings): void {
    if (!this.logoTexture) return;
    this.logoSprite.visible = true;
    this.logoSprite.anchor.set(0);
    this.logoSprite.position.set(settings.x, settings.y);
    this.logoSprite.width = settings.width;
    this.logoSprite.height = settings.height;
    this.logoSprite.alpha = settings.opacity;
  }

  private buildTextStyle(settings?: TextSettings): TextStyle {
    const s = settings ?? {
      content: '',
      fontFamily: 'Inter',
      fontSize: 72,
      color: '#ffffff',
      x: 0,
      y: 0,
      align: 'center' as const,
    };
    return new TextStyle({
      fontFamily: [s.fontFamily, 'Apple Color Emoji', 'Segoe UI Emoji', 'sans-serif'],
      fontSize: s.fontSize,
      fill: new Color(s.color).toNumber(),
      align: s.align,
      fontWeight: '600',
      whiteSpace: 'pre',
      wordWrap: false,
    });
  }
}

function isOffscreen(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): canvas is OffscreenCanvas {
  return typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas;
}

async function loadBlobTexture(blob: Blob): Promise<Texture> {
  if (blob.type === 'image/svg+xml') {
    const bitmap = await rasterizeSvgBlob(blob);
    return Texture.from(bitmap);
  }
  const bitmap = await createImageBitmap(blob);
  return Texture.from(bitmap);
}

async function rasterizeSvgBlob(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob);
  } catch {
    const text = await blob.text();
    const { width, height } = readSvgSize(text);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D контекст недоступен');
    const img = await loadImageFromSvgText(text);
    ctx.drawImage(img, 0, 0, width, height);
    return await createImageBitmap(canvas);
  }
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

async function loadImageFromSvgText(svg: string): Promise<ImageBitmap> {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  return await createImageBitmap(blob);
}
