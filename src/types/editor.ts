export interface BackgroundSettings {
  blurPx: number;
  brightness: number;
  saturation: number;
}

export interface MainVideoSettings {
  widthPercent: number;
  offsetY: number;
}

export interface LogoSettings {
  assetId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

export type TextAlign = 'left' | 'center' | 'right';

export type FontFamily =
  | 'Inter'
  | 'Montserrat'
  | 'Roboto'
  | 'Manrope'
  | 'PT Sans'
  | 'Open Sans'
  | 'Playfair Display'
  | 'Rubik';

export interface TextSettings {
  content: string;
  fontFamily: FontFamily;
  fontSize: number;
  color: string;
  x: number;
  y: number;
  align: TextAlign;
}

export interface EditorSettings {
  background: BackgroundSettings;
  mainVideo: MainVideoSettings;
  logo: LogoSettings;
  text: TextSettings;
}

export interface VideoMeta {
  width: number;
  height: number;
  durationSec: number;
  codec: string;
  hasAudio: boolean;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumbnailBlob: Blob | null;
  videoBlob: Blob | null;
  videoMeta: VideoMeta | null;
  settings: EditorSettings;
}

export interface Template {
  id: string;
  name: string;
  createdAt: number;
  settings: EditorSettings;
}

export interface LogoAsset {
  id: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
}
