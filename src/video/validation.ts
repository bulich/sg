import { INPUT_HEIGHT, INPUT_WIDTH, MAX_DURATION_SEC } from '@/constants';
import type { VideoMeta } from '@/types/editor';

export class VideoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoValidationError';
  }
}

export function validateInputMeta(meta: VideoMeta): void {
  if (meta.width !== INPUT_WIDTH || meta.height !== INPUT_HEIGHT) {
    throw new VideoValidationError(
      `Разрешение должно быть ${INPUT_WIDTH}×${INPUT_HEIGHT}. Получено ${meta.width}×${meta.height}.`,
    );
  }
  if (meta.durationSec > MAX_DURATION_SEC + 0.5) {
    throw new VideoValidationError(
      `Длительность не должна превышать ${MAX_DURATION_SEC} секунд. Получено ${Math.round(meta.durationSec)} с.`,
    );
  }
  if (meta.codec !== 'avc') {
    throw new VideoValidationError(`Неподдерживаемый кодек: ${meta.codec}. Нужен H.264 (AVC).`);
  }
}
