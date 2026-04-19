# Shorts PWA — техническая документация

Offline-first PWA для превращения горизонтального FHD (1920×1080) в вертикальное 1080×1920 видео с размытым фоном, логотипом и подписью. Работает в iOS Safari 26+ (standalone) и десктопных Chromium/Safari.

---

## 1. Стек

| Слой | Библиотека | Назначение |
|---|---|---|
| UI | Vue 3.5 (`<script setup>` + Composition API) | шаблоны/реактивность |
| State | Pinia 2 | `projects`, `editor` |
| Router | vue-router 4 | 3 маршрута (projects / editor / export) |
| Utils | @vueuse/core | композаблы |
| Валидация | valibot | схема `EditorSettings`, импорт шаблонов |
| Хранилище | Dexie 4 (IndexedDB) | проекты, шаблоны, логотипы |
| Видео I/O | mediabunny | демукс/мукс MP4, WebCodecs-обёртка |
| Композитор | PixiJS 8 | WebGL-рендер слоёв (blur, color, sprites, text) |
| Drag/Resize | vue3-moveable | хэндлы над canvas'ом |
| Сборка | Vite 6 + `vite-plugin-pwa` (Workbox) | precache, SW, manifest |
| TS | TypeScript 5.7 (strict + `noUncheckedIndexedAccess`) | |

Node 20+, `pnpm`.

---

## 2. Структура

```
src/
├── app/router.ts             # vue-router
├── main.ts                   # createApp + persistent storage
├── App.vue                   # <RouterView> + Toast
├── constants.ts              # OUTPUT_*/INPUT_*/MAX_DURATION_SEC/DEFAULT_SETTINGS/FONT_FAMILIES
├── types/editor.ts           # доменные типы
├── styles/global.css         # сброс, safe-area, тёмная тема
├── fonts/index.ts            # импорт @fontsource css (@font-face)
│
├── storage/
│   ├── db.ts                 # Dexie-схема (projects/templates/logos)
│   ├── repositories.ts       # CRUD-функции
│   ├── schema.ts             # valibot-схема EditorSettings
│   └── persistent.ts         # navigator.storage.persist()
│
├── stores/
│   ├── projects.ts           # список, import, CRUD
│   └── editor.ts             # текущий проект + debounce-save
│
├── composables/
│   ├── usePreviewFrame.ts    # кадр превью (CanvasSink)
│   ├── useProjectThumbnail.ts# object URL + cleanup
│   ├── useScene.ts           # Scene ↔ editor-store + fonts
│   └── useToast.ts           # глобальный тост
│
├── video/
│   ├── pipeline.ts           # readInputMeta / extractThumbnail / renderVideo
│   ├── scene.ts              # Scene (Pixi.Application + слои)
│   ├── validation.ts         # проверка входа (1920×1080, H.264, ≤60с)
│   ├── worker.ts             # воркер-entrypoint (message API)
│   └── workerClient.ts       # renderVideoInWorker() промис-обёртка
│
├── pages/
│   ├── ProjectsPage.vue
│   ├── EditorPage.vue
│   └── ExportPage.vue
│
└── components/
    ├── common/       # Toast, ActionSheet, PromptDialog, NumberSlider, SegmentedControl, IconButton
    ├── projects/     # ProjectCard
    ├── editor/       # MoveableOverlay
    └── inspector/    # Background/MainVideo/Logo/Text panels + InspectorTabs
```

Алиас `@/` → `src/`. Precache регулируется `vite-plugin-pwa` (см. `vite.config.ts`).

---

## 3. Доменная модель

```ts
interface EditorSettings {
  background: { blurPx; brightness; saturation };
  mainVideo:  { widthPercent; offsetY };
  logo:       { assetId: string|null; x; y; width; height; opacity };
  text:       { content; fontFamily; fontSize; color; x; y; align };
}

interface Project {
  id; name; createdAt; updatedAt;
  thumbnailBlob: Blob|null;
  videoBlob:     Blob|null;       // исходный MP4, хранится целиком
  videoMeta:     VideoMeta|null;  // 1920×1080, durationSec, codec, hasAudio
  settings:      EditorSettings;
}

interface Template     { id; name; createdAt; settings: EditorSettings; }
interface LogoAsset    { id; blob: Blob; mimeType; width; height; }
```

Система координат — внутренняя канвы, `1080×1920` (см. `OUTPUT_WIDTH/HEIGHT` в `src/constants.ts`). Все позиции лого/текста хранятся в этих пикселях.

Дефолты — `DEFAULT_SETTINGS` в `src/constants.ts`.

---

## 4. Хранилище (IndexedDB через Dexie)

`src/storage/db.ts`:

```
projects: 'id, updatedAt, createdAt'
templates: 'id, createdAt'
logos: 'id'
```

Блобы (видео, thumbnail, логотипы) хранятся **целиком в IndexedDB**. Никаких отдельных BLOB-стораджей/URL — только Dexie.

`src/storage/persistent.ts` вызывается из `main.ts` один раз при старте: запрашивает `navigator.storage.persist()`, чтобы iOS не вычистил базу при переполнении. Если API недоступно — no-op.

`src/storage/repositories.ts` — чистые функции (`createProject`, `setProjectVideo`, `setProjectSettings`, `saveLogo`, `applyTemplate`, …). Stores вызывают только их, не ходят в Dexie напрямую.

`src/storage/schema.ts` — valibot-схемы с диапазонами (blurPx 0–200, fontSize 8–400, color в `#rrggbb` и т.д.). Используется при импорте шаблонов через `validateEditorSettings()` / `safeValidateEditorSettings()`.

---

## 5. Pinia stores

### `stores/projects.ts`
- `projects: Project[]`, `loading`
- `loadAll()` — сортировка по `updatedAt`
- `create(name)`, `remove(id)`, `rename(id, name)`, `replace(project)`
- `importVideo(projectId, file)` — читает meta, валидирует (`validateInputMeta`), делает thumbnail, сохраняет — всё через `repositories`. Используется и при первичном импорте из `ProjectsPage`, и при замене исходного видео в `EditorPage`: `setProjectVideo` трогает только `videoBlob`/`videoMeta`/`thumbnailBlob`, так что `settings` (фон, лого, текст, позиции) сохраняются.

### `stores/editor.ts`
- Состояние: `project`, `settings`, `logoBlob`, `previewTimeSec`, `dirty`, `saving`
- `openProject(id)` — загружает проект, клонирует settings (`structuredClone`), подтягивает `logoBlob` из таблицы `logos` по `settings.logo.assetId`
- Апдейтеры `updateBackground/updateMainVideo/updateLogo/updateText` — сливают patch + `scheduleSave()` (debounce 400 мс → `setProjectSettings` в IndexedDB)
- `flushSave()` — принудительный сброс дебаунса (вызывается перед навигацией в export, уходом из редактора и заменой исходного видео)
- `cloneSettings` — `JSON.parse(JSON.stringify(...))`, НЕ `structuredClone`: Vue reactive proxy не structured-cloneable, в Dexie и worker.postMessage уходит только plain-объект
- `setLogoFromBlob(blob)` — сохраняет в `logos`, обновляет settings.logo.assetId и `logoBlob`
- `removeLogo()` — обнуляет ссылку

---

## 6. Валидация входа

`src/video/validation.ts` — `validateInputMeta(meta)` бросает `VideoValidationError`, если:

- разрешение ≠ 1920×1080,
- длительность > 60.5 сек,
- кодек ≠ `avc` (H.264).

Контейнер — MP4 (ограничение сверху в `pipeline.readInputMeta`, где `Input` использует `ALL_FORMATS`, но валидатор режет по кодеку).

---

## 7. Модуль video

### `src/video/pipeline.ts`

Три функции, все изолированные (открывают свой `Input`, всегда `dispose()` в `finally`).

| Функция | Описание |
|---|---|
| `readInputMeta(blob)` | `Input(BlobSource) → getPrimaryVideoTrack/AudioTrack + computeDuration`. Возвращает `VideoMeta`. |
| `extractThumbnail(blob, timeSec=0.5, maxWidth=540)` | `CanvasSink` на уменьшенном разрешении → `getCanvas(t)` → JPEG (quality 0.82). |
| `renderVideo(opts)` | Полный экспорт. Описан ниже. |

#### `renderVideo(opts: RenderOptions) → Blob`

```
1. new Input({ BlobSource(opts.input), ALL_FORMATS })
2. OffscreenCanvas(1080, 1920) + new Scene() + init
   → Scene.setBackground/setMainVideo/setText/setLogo
3. new Output({ format: Mp4OutputFormat({ fastStart: 'in-memory' }),
                target: new BufferTarget() })
4. new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH, keyFrameInterval: 2 })
   → output.addVideoTrack(videoSource)
5. Если audioTrack есть и codec известен:
     new EncodedAudioPacketSource(codec) + output.addAudioTrack(audioSource)
6. await output.start()
7. Параллельно две задачи:
   • videoTask (CanvasSink, НЕ VideoSampleSink):
       sink = new CanvasSink(videoTrack, { poolSize: 2 })
       for await wrapped of sink.canvases(0, duration):
         ts = Math.max(0, wrapped.timestamp);
         scene.setFrame(wrapped.canvas); scene.render();
         await videoSource.add(ts, wrapped.duration);
         onProgress({ currentSec, frame, fps })
       videoSource.close();
   • audioTask (copy-through, без перекодирования):
       for await packet of EncodedPacketSink(audioTrack).packets():
         if (packet.timestamp < 0) continue;  // дроп pre-roll / priming
         await audioSource.add(packet, first ? { decoderConfig } : undefined);
       audioSource.close();
8. output.finalize()
9. Blob из BufferTarget.buffer, mime: 'video/mp4'
```

Отмена — через `opts.signal?.aborted` на каждом шаге. При исключении: `output.cancel().catch(noop)`, затем проброс.

Прогресс считается от `wrapped.timestamp / duration`, FPS — от `performance.now()` с момента старта.

**Почему `CanvasSink`, а не `VideoSampleSink`.** Pixi v8 под `WebWorkerAdapter` ненадёжно грузит текстуры из `VideoFrame` (битый `TextureSource` → `videoSprite` рендерился с невалидным scale и перекрывал сцену, настройки не применялись). `CanvasSink.canvases(0, duration)` выдаёт `{ canvas, timestamp, duration }` — `OffscreenCanvas` Pixi рендерит корректно. Бонусом `canvases(0, duration)` сам скипает pre-roll (edit list / negative CTS), так что timestamp'ы не требуют сдвига.

**A/V-синхронизация.** Никаких глобальных offset'ов: video пишется как `Math.max(0, wrapped.timestamp)`, audio — как есть. Аудио-пакеты с `timestamp < 0` (AAC priming / edit list pre-roll) дропаются до вызова `audioSource.add`, иначе муксер бросает `Timestamps must be non-negative`. Полностью соответствует поведению, когда оригинал имеет `videoFirstTs < 0` / `audioFirstTs < 0`.

### `src/video/scene.ts` — Pixi-композитор

`Scene` — обёртка над `Pixi.Application`. Работает и с `HTMLCanvasElement`, и с `OffscreenCanvas` (одинаково).

Слои (порядок = z-order):
1. `bgSprite` — тот же фрейм-`Texture`, центрированный, cover 1080×1920, с двумя фильтрами:
   - `BlurFilter({ strength: blurPx, quality: 4, kernelSize: 9 })`
   - `ColorMatrixFilter` — `.brightness(b, false)` + `.saturate(s-1, true)` (умножение)
2. `videoSprite` — тот же `Texture`, ширина = `OUTPUT_WIDTH * widthPercent / 100`, Y — центр + `offsetY`
3. `logoSprite` — из текстуры логотипа, abs-координаты x/y, size/opacity
4. `textSprite` (Pixi `Text`) — fontFamily + emoji-fallback (`Apple Color Emoji`, `Segoe UI Emoji`, `sans-serif`), fontWeight 600, align → anchorX (0 / 0.5 / 1)

**API:** `init`, `setFrame(source)`, `setBackground`, `setMainVideo`, `setLogo(blob, settings)`, `updateLogoSettings`, `setText`, `render`, `extractBlob`, `destroy`.

Важно: `setFrame` каждый кадр делает `this.frameTexture?.destroy(true)` + `Texture.from(source, true)` со `skipCache = true`. `skipCache` обязателен, потому что `CanvasSink` ротирует пул из двух `OffscreenCanvas`'ов — без него Pixi возвращал бы закэшированный, уже уничтоженный `TextureSource` по тому же canvas-ключу. Для 60-секундного ролика на ~30 fps это ~1800 текстур; если уткнёмся в память — заменить на `TextureSource.update()` с переиспользованием.

SVG-логотип растеризуется через `createImageBitmap(svgBlob)` с фолбэком на `OffscreenCanvas + drawImage`. **Pixi `Assets.load` не используется** — он тянет `HTMLImageElement` и падает в воркере.

### `src/video/worker.ts` + `workerClient.ts`

Воркер — ES-модуль (`worker: { format: 'es' }` в vite.config.ts), **первым делом** ставит `DOMAdapter.set(WebWorkerAdapter)` из pixi.js — иначе Pixi дергает `document.createElement('canvas')` и падает с `document is not defined`.

Message API:

```ts
// → worker
{ type: 'render', id, input: Blob, settings: EditorSettings, logoBlob: Blob|null }
{ type: 'abort',  id }

// ← worker
{ type: 'progress', id, currentSec, durationSec, frame, fps }
{ type: 'done',     id, blob: Blob }
{ type: 'error',    id, message }
```

`workerClient.ts`:
- Один ленивый shared `Worker` (`new URL('./worker.ts', import.meta.url)`, `{ type: 'module' }`).
- `renderVideoInWorker({ input, settings, logoBlob, signal, onProgress })` — промис-обёртка.
- **Важно:** `settings` до `postMessage` клонируется `JSON.parse(JSON.stringify(...))`. Приходит из Pinia как Vue-Proxy, который `structured-clone` не умеет сериализовать.
- Abort: `signal` вешается на controller → шлёт `{ type: 'abort', id }` в воркер.

---

## 8. Composables

### `useScene(canvasRef, frameBitmap, store)`
- На mount создаёт `Scene`, подписывается на изменения `store.settings.*` и `store.logoBlob`, апдейтит сцену.
- **Шрифты:** при смене `text.fontFamily/fontSize` ждёт `document.fonts.load('600 <px>px "<family>"')` и только потом вызывает `setText` + `render`. Без этого Pixi меряет текст фолбэком (`@fontsource` грузит woff2 лениво).

### `usePreviewFrame(blobRef, timeRef)`
- Держит `Input + CanvasSink` в замыкании, реактивно скрабит: при изменении времени или blob'a извлекает кадр и конвертит в `ImageBitmap`.
- Монотонно-возрастающий `seq` отбраковывает устаревшие результаты.
- `disposeSink` вызывается на unmount и при смене blob'a.

### `useProjectThumbnail(project)`
- Создаёт/освобождает object URL для `thumbnailBlob`, cleanup на unmount.

### `useToast` — singleton-обёртка над `Toast.vue`, регистрируется из `App.vue` в `onMounted`.

---

## 9. UI

### Страницы

- **`/` — ProjectsPage**: сетка `ProjectCard`'ов, FAB «Новый проект», action sheet (переименовать / удалить / сохранить как шаблон). Импорт файла — через `useFileDialog` (@vueuse) → валидация → `projectsStore.importVideo` → `router.push('editor')`.
- **`/editor/:id` — EditorPage**: canvas 1080×1920 (CSS-масштабируется под экран), `MoveableOverlay` поверх, таймлайн-слайдер для скраб-превью (`v-model.number` на `store.previewTimeSec`), `InspectorTabs` с четырьмя панелями. Автосейв настроек. В хедере рядом с «Экспорт» — иконка-кнопка «Заменить видео»: открывает file picker, прогоняет через `validateInputMeta`, вызывает `projectsStore.importVideo(id, file)` (перезаписывает `videoBlob`/`videoMeta`/`thumbnailBlob`, **настройки проекта сохраняются**), затем `editorStore.openProject(id)` перечитывает проект — превью и таймлайн подхватывают новое видео.
- **`/export/:id` — ExportPage**: фазы `loading → ready → rendering → done/canceled/error`. Прогресс-бар + `fps` + ETA. Кнопки Cancel (AbortController) / Save (`<a download>`) / Share (Web Share API, если `canShare({files})`).

### MoveableOverlay (`components/editor/MoveableOverlay.vue`)

Overlay абсолютно над canvas'ом, `pointer-events: none` вне target'ов.

Scale = `canvas.clientWidth / OUTPUT_WIDTH` (через `ResizeObserver` + `resize`).

Два невидимых div'а-target'а (logo/text). Клик — выделение; клик по пустому месту — сброс. На `drag`/`resize` обрабатывается `beforeTranslate` (screen-px), делится на scale → кладётся в store в координатах канвы. Для лого — keepRatio + четыре угловые ручки. Для текста — только drag.

### Inspector

- **BackgroundPanel** — 3 слайдера (blur 0–100, brightness 0–2, saturation 0–2)
- **MainVideoPanel** — widthPercent 80–120, offsetY −400..400
- **LogoPanel** — upload PNG/WebP/JPEG/SVG (→ `editorStore.setLogoFromBlob`), слайдеры width/opacity, числовые x/y
- **TextPanel** — textarea, dropdown шрифтов, color picker, слайдер размера, align через `SegmentedControl`

---

## 10. Шрифты

`src/fonts/index.ts` импортирует `.css` из `@fontsource/*` (8 семейств × 2–3 веса → `@font-face`). Сами `.woff2` precache'атся Workbox'ом (см. `globPatterns` в vite.config).

Pixi рендерит на canvas, поэтому для применения шрифта нужно **явно** дождаться `document.fonts.load()` — см. `useScene.ts`. В воркере свой `FontFaceSet` на `self.fonts`, и DOM-ные регистрации туда не попадают — **при экспорте текст может быть отрендерен фолбэком**, если шрифт не успел загрузиться. (Фикс — прокидывать `.woff2` URL через `?url` и регистрировать `new FontFace(...)` в воркере на старте.)

---

## 11. PWA

`vite.config.ts`:

```
VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'Shorts Generator', short_name: 'Shorts',
    display: 'standalone', orientation: 'portrait',
    icons: [ 192, 512, maskable 192, maskable 512 ],
    ...
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,woff2,png,svg,webp}'],
    maximumFileSizeToCacheInBytes: 15 MB,
  },
})
```

SW регистрируется автоматически (`injectRegister: 'auto'`). После первой загрузки всё работает offline: HTML, JS, CSS, woff2, иконки — в precache; данные пользователя — в IndexedDB. Фонты теоретически могут подтягиваться в runtime, но они уже в precache.

iOS-специфика:
- `viewport-fit=cover`, safe-area-inset-* в CSS;
- `apple-mobile-web-app-capable`, `black-translucent` статус-бар;
- `<link rel="apple-touch-icon">`;
- persistent storage запрашивается в `main.ts`.

---

## 12. Сборка и скрипты

```bash
pnpm install
pnpm dev            # Vite dev server с HMR, SW отключён
pnpm build          # vue-tsc -b + vite build (генерит manifest + SW)
pnpm preview        # локальный прогон build'а
pnpm typecheck      # vue-tsc --noEmit
```

`tsconfig.app.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `lib: ['ES2023','DOM','DOM.Iterable','WebWorker']`. Алиас `@/` задан там же и в Vite.

Ручные чанки (`rollupOptions.output.manualChunks`): `pixi`, `mediabunny` — вынесены отдельно, чтобы не блокировать первую отрисовку. Ворнинг "chunks larger than 500kB" ожидаемый (pixi ~570 кБ, mediabunny ~260 кБ).

---

## 13. Контракт потоков данных

```
┌──────────────┐     file picker      ┌──────────────────────┐
│ ProjectsPage │─────────────────────▶│ projectsStore.import │
└──────────────┘                      │   pipeline.readMeta  │
                                      │   validation         │
                                      │   pipeline.thumbnail │
                                      │   repositories.*     │
                                      └──────────┬───────────┘
                                                 ▼
                                         Dexie: projects
                                                 │
                                                 ▼
                                         /editor/:id
                                                 │
                                                 ▼
                                      ┌──────────────────────┐
                                      │ editorStore          │
                                      │  openProject         │
                                      │  + Dexie: logos      │
                                      │  autosave (debounce) │
                                      └──────────┬───────────┘
                                                 ▼
                    ┌────────────────────────────┴────────────────────────────┐
                    ▼                                                         ▼
        ┌────────────────────┐                                 ┌────────────────────────┐
        │ usePreviewFrame    │                                 │ MoveableOverlay        │
        │  CanvasSink.getCanvas                                │  pointer ↔ store       │
        └─────────┬──────────┘                                 └───────────┬────────────┘
                  ▼                                                         ▼
          ┌───────────────┐  watch(settings,logoBlob,frame)   ┌───────────────────────┐
          │  useScene     │◀──────────────────────────────────│  InspectorTabs panels │
          │   Scene (Pixi)│                                    └───────────────────────┘
          └───────┬───────┘
                  ▼
            HTML canvas (preview)
                  │
                  ▼
             /export/:id
                  │
                  ▼
        workerClient.renderVideoInWorker()  ← JSON.stringify(settings)
                  │
     postMessage({ type: 'render', ... })
                  ▼
       ┌───────────────────────────┐
       │ worker.ts (WebWorkerAdapter)│
       │  pipeline.renderVideo      │
       │   mediabunny Input         │
       │   VideoSampleSink frames ──▶ Scene (OffscreenCanvas)
       │   CanvasSource (AVC)       │
       │   EncodedAudioPacketSource │
       │   Mp4OutputFormat + Buffer │
       └─────────────┬──────────────┘
                     ▼
              Blob (video/mp4) → Download / Share
```

---

## 14. Что специально **не** сделано / ограничения

- Нет FFmpeg.wasm, нет собственного MP4-муксера — всё через mediabunny.
- Нет собственных WebGL-шейдеров; только Pixi-фильтры.
- Нет multi-logo / multi-text / rotation — один логотип, один текстовый блок.
- Нет i18n — только русский.
- Нет auth/backend/аналитики/светлой темы.
- Воркер-шрифты: не прегружаются; при экспорте кастомный шрифт может отрендериться фолбэком (см. §10).
- `Texture.from` в `Scene.setFrame` аллоцирует новую текстуру на каждый кадр — может упереться в VRAM на длинных видео.
- PNG/maskable/splash-иконки отсутствуют в `public/icons/` — нужно сгенерить из дизайна перед релизом.
- Автотесты не написаны; верификация через `pnpm build` + `pnpm typecheck` + ручное прохождение golden path.

---

## 15. Точки расширения

- **Новый фильтр фона** → дополнить `BackgroundSettings` + `Scene.setBackground` + schema + `BackgroundPanel.vue`.
- **Новый шрифт** → добавить в `FONT_FAMILIES` (`constants.ts`), импортировать нужные веса в `fonts/index.ts`, при желании — прегрузить в воркере.
- **Хранилище шаблонов в UI** → store/репозитории уже готовы (`templates`/`applyTemplate`), нужен только UI.
- **Копирование видеотрека без перекодирования** (когда разрешение уже 1080×1920 и оверлеи не меняют пиксели) — заменить `CanvasSource` на `EncodedVideoPacketSource` + `EncodedPacketSink` по аналогии с аудио. Ускорит экспорт на порядок для «no-op» кейсов.

---

## 16. Типовые проблемы и как диагностировать

| Симптом | Причина | Лечение |
|---|---|---|
| `Failed to postMessage: could not be cloned` | Vue-Proxy в settings | `JSON.parse(JSON.stringify(settings))` перед postMessage (уже сделано) |
| `DataCloneError: structuredClone ... could not be cloned` в editor-store | Vue reactive proxy → `structuredClone` | `cloneSettings` использует JSON round-trip (уже сделано) |
| `document is not defined` в воркере | Pixi BrowserAdapter | `DOMAdapter.set(WebWorkerAdapter)` первой строкой (уже сделано) |
| Шрифт не меняется в превью | `@fontsource` грузит woff2 лениво; Pixi мерит фолбэком | `document.fonts.load()` + повторный `setText+render` (уже в `useScene`) |
| Импорт падает с «Неподдерживаемый кодек» | mediabunny не распознал avc | проверить `videoTrack.codec` в `readInputMeta`; возможно HEVC/MOV вместо H.264 |
| Нет звука в экспорте | Audio codec unknown/отсутствует | `audioTrack.codec` — null → трек не добавляется; копирование не применимо |
| `Timestamps must be non-negative (got -Xs)` при экспорте | У входа отрицательные timestamp'ы (edit list / AAC priming) | Video пишется как `Math.max(0, ts)`; audio-пакеты с `ts < 0` дропаются до `audioSource.add` (уже сделано) |
| Экспорт: первые N секунд — замершее чёрное изображение, настройки не применяются | Ошибочный глобальный offset сдвигал видео вперёд при `videoFirstTs < 0` | Не использовать offset: `CanvasSink.canvases(0, duration)` уже скипает pre-roll и начинает с `srcTs ≈ 0` (уже сделано) |
| Экспорт: видно только исходное видео, без фона/лого/текста | `Texture.from(VideoFrame)` нестабилен под `WebWorkerAdapter` | Использовать `CanvasSink` вместо `VideoSampleSink` (уже сделано) |
| Экспорт: повторный кадр на пулированных canvas'ах | `Texture.from` кэширует по источнику, `destroy(true)` ломает кэш | `Texture.from(source, true)` со `skipCache` (уже сделано) |
| IndexedDB очистился на iOS | не запрошен persistent storage | убедиться, что `requestPersistentStorage()` вернул `true` после установки на Home Screen |
