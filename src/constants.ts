import type { EditorSettings, FontFamily } from '@/types/editor';

export const OUTPUT_WIDTH = 1080;
export const OUTPUT_HEIGHT = 1920;
export const INPUT_WIDTH = 1920;
export const INPUT_HEIGHT = 1080;
export const MAX_DURATION_SEC = 60;

export const FONT_FAMILIES: FontFamily[] = [
  'Inter',
  'Montserrat',
  'Roboto',
  'Manrope',
  'PT Sans',
  'Open Sans',
  'Playfair Display',
  'Rubik',
];

export const DEFAULT_SETTINGS: EditorSettings = {
  background: {
    blurPx: 40,
    brightness: 0.6,
    saturation: 0.8,
  },
  mainVideo: {
    widthPercent: 100,
    offsetY: 0,
  },
  logo: {
    assetId: null,
    x: OUTPUT_WIDTH / 2 - 150,
    y: 120,
    width: 300,
    height: 300,
    opacity: 1,
  },
  text: {
    content: '',
    fontFamily: 'Inter',
    fontSize: 72,
    color: '#ffffff',
    x: OUTPUT_WIDTH / 2,
    y: 520,
    align: 'center',
  },
};
