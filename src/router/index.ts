import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/home',
    },
    {
      path: '/home',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/conversation/:id?',
      name: 'conversation',
      component: () => import('@/views/ConversationView.vue'),
    },
    {
      path: '/conversation/:id/detail',
      redirect: (to) => `/conversation/${String(to.params.id ?? '')}`,
    },
    {
      path: '/settings/:section?',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
    {
      path: '/skills',
      name: 'skills-market',
      component: () => import('@/views/SkillsMarketView.vue'),
    },
  ],
})

export default router
