import * as v from 'valibot';
import type { EditorSettings } from '@/types/editor';
import { FONT_FAMILIES } from '@/constants';

const BackgroundSchema = v.object({
  blurPx: v.pipe(v.number(), v.minValue(0), v.maxValue(200)),
  brightness: v.pipe(v.number(), v.minValue(0), v.maxValue(3)),
  saturation: v.pipe(v.number(), v.minValue(0), v.maxValue(3)),
});

const MainVideoSchema = v.object({
  widthPercent: v.pipe(v.number(), v.minValue(50), v.maxValue(150)),
  offsetY: v.pipe(v.number(), v.minValue(-1000), v.maxValue(1000)),
});

const LogoSchema = v.object({
  assetId: v.nullable(v.string()),
  x: v.number(),
  y: v.number(),
  width: v.pipe(v.number(), v.minValue(1)),
  height: v.pipe(v.number(), v.minValue(1)),
  opacity: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
});

const TextSchema = v.object({
  content: v.string(),
  fontFamily: v.picklist(FONT_FAMILIES),
  fontSize: v.pipe(v.number(), v.minValue(8), v.maxValue(400)),
  color: v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/)),
  x: v.number(),
  y: v.number(),
  align: v.picklist(['left', 'center', 'right']),
});

export const EditorSettingsSchema = v.object({
  background: BackgroundSchema,
  mainVideo: MainVideoSchema,
  logo: LogoSchema,
  text: TextSchema,
});

export function validateEditorSettings(input: unknown): EditorSettings {
  return v.parse(EditorSettingsSchema, input);
}

export function safeValidateEditorSettings(
  input: unknown,
): { ok: true; value: EditorSettings } | { ok: false; error: string } {
  const result = v.safeParse(EditorSettingsSchema, input);
  if (result.success) return { ok: true, value: result.output };
  const first = result.issues[0];
  return { ok: false, error: first ? `${first.path?.map((p) => p.key).join('.') ?? ''}: ${first.message}` : 'invalid' };
}
