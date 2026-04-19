import type { Ref } from 'vue';

type ToastApi = {
  show: (text: string, options?: { kind?: 'info' | 'error' | 'success'; duration?: number }) => void;
};

type ToastComponent = { show: ToastApi['show'] };

let current: ToastApi | null = null;

export function registerToast(ref: Ref<ToastComponent | null>) {
  current = {
    show(text, options) {
      ref.value?.show(text, options);
    },
  };
}

export function toast(): ToastApi {
  return current ?? { show: () => {} };
}
