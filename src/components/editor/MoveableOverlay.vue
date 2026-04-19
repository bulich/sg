<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue';
import Moveable from 'vue3-moveable';
import type { OnDrag, OnDragStart, OnResize, OnResizeStart } from 'vue3-moveable';
import { OUTPUT_WIDTH } from '@/constants';
import { useEditorStore } from '@/stores/editor';

const props = defineProps<{ canvas: HTMLCanvasElement | null }>();
const store = useEditorStore();

const logoEl = ref<HTMLDivElement | null>(null);
const textEl = ref<HTMLDivElement | null>(null);
const selected = ref<'logo' | 'text' | null>(null);
const scale = ref(1);

let ro: ResizeObserver | null = null;

function recalcScale() {
  const el = props.canvas;
  if (!el) return;
  const w = el.clientWidth;
  if (w > 0) scale.value = w / OUTPUT_WIDTH;
}

function observe(el: HTMLCanvasElement | null) {
  ro?.disconnect();
  ro = null;
  if (!el) return;
  if (typeof ResizeObserver === 'undefined') return;
  ro = new ResizeObserver(() => recalcScale());
  ro.observe(el);
}

onMounted(() => {
  recalcScale();
  observe(props.canvas);
  window.addEventListener('resize', recalcScale);
});

onBeforeUnmount(() => {
  ro?.disconnect();
  window.removeEventListener('resize', recalcScale);
});

watch(
  () => props.canvas,
  (el) => {
    observe(el);
    recalcScale();
  },
);

const hasLogo = computed(() => Boolean(store.logoBlob));
const hasText = computed(() => store.settings.text.content.length > 0);

watch(hasLogo, (v) => {
  if (!v && selected.value === 'logo') selected.value = null;
});
watch(hasText, (v) => {
  if (!v && selected.value === 'text') selected.value = null;
});

const logoStyle = computed(() => {
  const l = store.settings.logo;
  const s = scale.value;
  return {
    left: `${l.x * s}px`,
    top: `${l.y * s}px`,
    width: `${l.width * s}px`,
    height: `${l.height * s}px`,
  };
});

const textStyle = computed(() => {
  const t = store.settings.text;
  const s = scale.value;
  const translate =
    t.align === 'center' ? 'translateX(-50%)' :
    t.align === 'right' ? 'translateX(-100%)' : 'none';
  return {
    left: `${t.x * s}px`,
    top: `${t.y * s}px`,
    fontSize: `${t.fontSize * s}px`,
    fontFamily: `"${t.fontFamily}", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`,
    textAlign: t.align,
    transform: translate,
  };
});

const moveableTarget = computed<HTMLElement | null>(() => {
  if (selected.value === 'logo') return logoEl.value;
  if (selected.value === 'text') return textEl.value;
  return null;
});

const moveableResizable = computed(() => selected.value === 'logo');
const moveableKeepRatio = computed(() => selected.value === 'logo');

const moveableKey = ref(0);
watch(selected, async () => {
  await nextTick();
  moveableKey.value += 1;
});

const logoDragStart = { x: 0, y: 0 };
const logoResizeStart = { x: 0, y: 0, w: 0, h: 0 };
const textDragStart = { x: 0, y: 0 };

function onDragStart(_e: OnDragStart) {
  if (selected.value === 'logo') {
    logoDragStart.x = store.settings.logo.x;
    logoDragStart.y = store.settings.logo.y;
  } else if (selected.value === 'text') {
    textDragStart.x = store.settings.text.x;
    textDragStart.y = store.settings.text.y;
  }
}

function onDrag(e: OnDrag) {
  const s = scale.value || 1;
  const [bx = 0, by = 0] = e.beforeTranslate;
  const dx = bx / s;
  const dy = by / s;
  if (selected.value === 'logo') {
    store.updateLogo({
      x: Math.round(logoDragStart.x + dx),
      y: Math.round(logoDragStart.y + dy),
    });
  } else if (selected.value === 'text') {
    store.updateText({
      x: Math.round(textDragStart.x + dx),
      y: Math.round(textDragStart.y + dy),
    });
  }
}

function onResizeStart(_e: OnResizeStart) {
  if (selected.value !== 'logo') return;
  logoResizeStart.x = store.settings.logo.x;
  logoResizeStart.y = store.settings.logo.y;
  logoResizeStart.w = store.settings.logo.width;
  logoResizeStart.h = store.settings.logo.height;
}

function onResize(e: OnResize) {
  if (selected.value !== 'logo') return;
  const s = scale.value || 1;
  const [bx = 0, by = 0] = e.drag.beforeTranslate;
  const dx = bx / s;
  const dy = by / s;
  store.updateLogo({
    width: Math.max(20, Math.round(e.width / s)),
    height: Math.max(20, Math.round(e.height / s)),
    x: Math.round(logoResizeStart.x + dx),
    y: Math.round(logoResizeStart.y + dy),
  });
}

function selectLogo(ev: PointerEvent) {
  if (!hasLogo.value) return;
  ev.stopPropagation();
  selected.value = 'logo';
}
function selectText(ev: PointerEvent) {
  if (!hasText.value) return;
  ev.stopPropagation();
  selected.value = 'text';
}
function clearSelection(ev: PointerEvent) {
  if (ev.target === ev.currentTarget) selected.value = null;
}
</script>

<template>
  <div class="overlay" @pointerdown="clearSelection">
    <div
      v-if="hasLogo"
      ref="logoEl"
      class="target target-logo"
      :class="{ selected: selected === 'logo' }"
      :style="logoStyle"
      @pointerdown="selectLogo"
    ></div>
    <div
      v-if="hasText"
      ref="textEl"
      class="target target-text"
      :class="{ selected: selected === 'text' }"
      :style="textStyle"
      @pointerdown="selectText"
    >{{ store.settings.text.content }}</div>

    <Moveable
      v-if="moveableTarget"
      :key="moveableKey"
      :target="moveableTarget"
      :draggable="true"
      :resizable="moveableResizable"
      :keepRatio="moveableKeepRatio"
      :origin="false"
      :edge="false"
      :throttleDrag="0"
      :throttleResize="0"
      :renderDirections="['nw', 'ne', 'sw', 'se']"
      @dragStart="onDragStart"
      @drag="onDrag"
      @resizeStart="onResizeStart"
      @resize="onResize"
    />
  </div>
</template>

<style scoped>
.overlay {
  position: absolute;
  inset: 0;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.target {
  position: absolute;
  box-sizing: border-box;
  cursor: grab;
}
.target:active {
  cursor: grabbing;
}
.target-logo {
  background: transparent;
  border: 1px dashed rgba(255, 255, 255, 0);
}
.target-logo.selected {
  border-color: rgba(255, 255, 255, 0.4);
}
.target-text {
  color: transparent;
  white-space: pre;
  line-height: 1.15;
  font-weight: 600;
  pointer-events: auto;
}
.overlay :deep(.moveable-control) {
  background: #fff;
  border: 2px solid var(--accent, #0a84ff);
  width: 14px;
  height: 14px;
  margin-left: -7px;
  margin-top: -7px;
}
.overlay :deep(.moveable-line) {
  background: var(--accent, #0a84ff);
}
</style>
