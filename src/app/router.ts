import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'projects',
    component: () => import('@/pages/ProjectsPage.vue'),
  },
  {
    path: '/editor/:id',
    name: 'editor',
    component: () => import('@/pages/EditorPage.vue'),
    props: true,
  },
  {
    path: '/logs',
    name: 'logs',
    component: () => import('@/pages/LogsPage.vue'),
  },
  {
    path: '/export/:id',
    name: 'export',
    component: () => import('@/pages/ExportPage.vue'),
    props: true,
  },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});
