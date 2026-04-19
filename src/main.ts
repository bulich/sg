import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from '@/App.vue';
import { router } from '@/app/router';
import { requestPersistentStorage } from '@/storage/persistent';
import '@/fonts';
import '@/styles/global.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');

requestPersistentStorage();
