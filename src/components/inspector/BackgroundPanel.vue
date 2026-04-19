<script setup lang="ts">
import { useEditorStore } from '@/stores/editor';
import NumberSlider from '@/components/common/NumberSlider.vue';

const store = useEditorStore();
</script>

<template>
  <div class="panel">
    <NumberSlider
      label="Размытие"
      :model-value="store.settings.background.blurPx"
      :min="0"
      :max="120"
      :step="1"
      unit="px"
      @update:model-value="(v: number) => store.updateBackground({ blurPx: v })"
    />
    <NumberSlider
      label="Яркость"
      :model-value="store.settings.background.brightness"
      :min="0"
      :max="2"
      :step="0.05"
      @update:model-value="(v: number) => store.updateBackground({ brightness: v })"
    />
    <NumberSlider
      label="Насыщенность"
      :model-value="store.settings.background.saturation"
      :min="0"
      :max="2"
      :step="0.05"
      @update:model-value="(v: number) => store.updateBackground({ saturation: v })"
    />
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  padding: 4px 16px 16px;
}
</style>
