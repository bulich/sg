<script setup lang="ts">
import { useEditorStore } from '@/stores/editor';
import NumberSlider from '@/components/common/NumberSlider.vue';

const store = useEditorStore();

function reset() {
  store.updateMainVideo({ widthPercent: 100, offsetY: 0 });
}
</script>

<template>
  <div class="panel">
    <NumberSlider
      label="Ширина"
      :model-value="store.settings.mainVideo.widthPercent"
      :min="50"
      :max="150"
      :step="1"
      unit="%"
      @update:model-value="(v: number) => store.updateMainVideo({ widthPercent: v })"
    />
    <NumberSlider
      label="Смещение по вертикали"
      :model-value="store.settings.mainVideo.offsetY"
      :min="-400"
      :max="400"
      :step="1"
      unit="px"
      @update:model-value="(v: number) => store.updateMainVideo({ offsetY: v })"
    />
    <button type="button" class="reset" @click="reset">Сбросить</button>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  padding: 4px 16px 16px;
}
.reset {
  margin-top: 8px;
  align-self: flex-start;
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--bg-elev-2);
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
}
</style>
