<script setup lang="ts">
import { useEditorStore } from '@/stores/editor';
import NumberSlider from '@/components/common/NumberSlider.vue';
import SegmentedControl from '@/components/common/SegmentedControl.vue';
import { FONT_FAMILIES } from '@/constants';
import type { FontFamily, TextAlign } from '@/types/editor';

const store = useEditorStore();

const alignOptions: { value: TextAlign; label: string }[] = [
  { value: 'left', label: 'Слева' },
  { value: 'center', label: 'Центр' },
  { value: 'right', label: 'Справа' },
];
</script>

<template>
  <div class="panel">
    <label class="field">
      <span class="caption">Текст</span>
      <textarea
        :value="store.settings.text.content"
        rows="2"
        placeholder="Введите текст (поддерживаются эмодзи)"
        @input="(e) => store.updateText({ content: (e.target as HTMLTextAreaElement).value })"
      />
    </label>

    <label class="field">
      <span class="caption">Шрифт</span>
      <select
        :value="store.settings.text.fontFamily"
        @change="(e) => store.updateText({ fontFamily: (e.target as HTMLSelectElement).value as FontFamily })"
      >
        <option v-for="f in FONT_FAMILIES" :key="f" :value="f" :style="{ fontFamily: f }">{{ f }}</option>
      </select>
    </label>

    <div class="field">
      <span class="caption">Выравнивание</span>
      <SegmentedControl
        :model-value="store.settings.text.align"
        :options="alignOptions"
        @update:model-value="(v: TextAlign) => store.updateText({ align: v })"
      />
    </div>

    <label class="field color-field">
      <span class="caption">Цвет</span>
      <input
        type="color"
        :value="store.settings.text.color"
        @input="(e) => store.updateText({ color: (e.target as HTMLInputElement).value })"
      />
      <span class="hex">{{ store.settings.text.color }}</span>
    </label>

    <NumberSlider
      label="Размер"
      :model-value="store.settings.text.fontSize"
      :min="16"
      :max="240"
      :step="1"
      unit="px"
      @update:model-value="(v: number) => store.updateText({ fontSize: v })"
    />
    <NumberSlider
      label="X"
      :model-value="store.settings.text.x"
      :min="-200"
      :max="1280"
      :step="1"
      unit="px"
      @update:model-value="(v: number) => store.updateText({ x: v })"
    />
    <NumberSlider
      label="Y"
      :model-value="store.settings.text.y"
      :min="-200"
      :max="2100"
      :step="1"
      unit="px"
      @update:model-value="(v: number) => store.updateText({ y: v })"
    />
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  padding: 4px 16px 16px;
  gap: 4px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
}
.caption {
  font-size: 13px;
  color: var(--text-muted);
}
textarea,
select {
  width: 100%;
  padding: 10px 12px;
  font-family: inherit;
  resize: vertical;
}
.color-field {
  flex-direction: row;
  align-items: center;
  gap: 12px;
}
.color-field .caption {
  flex: 1;
}
input[type='color'] {
  width: 44px;
  height: 32px;
  padding: 2px;
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
}
.hex {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  color: var(--text-muted);
  min-width: 70px;
}
</style>
