/// <reference lib="webworker" />
import type { FontFamily } from '@/types/editor';

import interLat from '@fontsource/inter/files/inter-latin-600-normal.woff2?url';
import interCyr from '@fontsource/inter/files/inter-cyrillic-600-normal.woff2?url';
import montserratLat from '@fontsource/montserrat/files/montserrat-latin-600-normal.woff2?url';
import montserratCyr from '@fontsource/montserrat/files/montserrat-cyrillic-600-normal.woff2?url';
import robotoLat from '@fontsource/roboto/files/roboto-latin-500-normal.woff2?url';
import robotoCyr from '@fontsource/roboto/files/roboto-cyrillic-500-normal.woff2?url';
import manropeLat from '@fontsource/manrope/files/manrope-latin-600-normal.woff2?url';
import manropeCyr from '@fontsource/manrope/files/manrope-cyrillic-600-normal.woff2?url';
import ptSansLat from '@fontsource/pt-sans/files/pt-sans-latin-700-normal.woff2?url';
import ptSansCyr from '@fontsource/pt-sans/files/pt-sans-cyrillic-700-normal.woff2?url';
import openSansLat from '@fontsource/open-sans/files/open-sans-latin-600-normal.woff2?url';
import openSansCyr from '@fontsource/open-sans/files/open-sans-cyrillic-600-normal.woff2?url';
import playfairLat from '@fontsource/playfair-display/files/playfair-display-latin-600-normal.woff2?url';
import playfairCyr from '@fontsource/playfair-display/files/playfair-display-cyrillic-600-normal.woff2?url';
import rubikLat from '@fontsource/rubik/files/rubik-latin-500-normal.woff2?url';
import rubikCyr from '@fontsource/rubik/files/rubik-cyrillic-500-normal.woff2?url';

const LATIN_RANGE =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const CYRILLIC_RANGE = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116';

interface FontEntry {
  weight: string;
  files: { url: string; range: string }[];
}

const MAP: Record<FontFamily, FontEntry> = {
  Inter: { weight: '600', files: [{ url: interLat, range: LATIN_RANGE }, { url: interCyr, range: CYRILLIC_RANGE }] },
  Montserrat: { weight: '600', files: [{ url: montserratLat, range: LATIN_RANGE }, { url: montserratCyr, range: CYRILLIC_RANGE }] },
  Roboto: { weight: '500', files: [{ url: robotoLat, range: LATIN_RANGE }, { url: robotoCyr, range: CYRILLIC_RANGE }] },
  Manrope: { weight: '600', files: [{ url: manropeLat, range: LATIN_RANGE }, { url: manropeCyr, range: CYRILLIC_RANGE }] },
  'PT Sans': { weight: '700', files: [{ url: ptSansLat, range: LATIN_RANGE }, { url: ptSansCyr, range: CYRILLIC_RANGE }] },
  'Open Sans': { weight: '600', files: [{ url: openSansLat, range: LATIN_RANGE }, { url: openSansCyr, range: CYRILLIC_RANGE }] },
  'Playfair Display': { weight: '600', files: [{ url: playfairLat, range: LATIN_RANGE }, { url: playfairCyr, range: CYRILLIC_RANGE }] },
  Rubik: { weight: '500', files: [{ url: rubikLat, range: LATIN_RANGE }, { url: rubikCyr, range: CYRILLIC_RANGE }] },
};

const loaded = new Set<FontFamily>();

export async function ensureWorkerFont(family: string): Promise<void> {
  const entry = MAP[family as FontFamily];
  if (!entry) return;
  if (loaded.has(family as FontFamily)) return;
  const fonts = (self as unknown as { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof FontFace === 'undefined') return;
  loaded.add(family as FontFamily);
  await Promise.all(
    entry.files.map(async (f) => {
      try {
        const face = new FontFace(family, `url(${f.url}) format('woff2')`, {
          weight: entry.weight,
          unicodeRange: f.range,
        });
        await face.load();
        fonts.add(face);
      } catch (err) {
        console.warn('[workerFonts] failed', family, err);
      }
    }),
  );
}
