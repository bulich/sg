import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from '@/App.vue';
import { router } from '@/app/router';
import { requestPersistentStorage } from '@/storage/persistent';
import { installLogBus } from '@/debug/logBus';
import '@/fonts';
import '@/styles/global.css';

installLogBus();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');

requestPersistentStorage();
