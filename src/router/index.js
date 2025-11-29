import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../views/AboutView.vue'),
    },
    // 🟢 Новый маршрут для мобильной версии
    {
      path: '/mobile',
      name: 'mobile-home',
      component: () => import('../views/MobileHomeView.vue'),
    },
  ],
})

export default router