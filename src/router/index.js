import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { getHomeRouteRedirect } from '../utils/homeLayout.js'

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
    {
      path: '/mobile',
      name: 'mobile-home',
      // Ленивая загрузка мобильной версии
      component: () => import('../views/MobileHomeView.vue'),
    },
    {
      path: '/invite/:token',
      name: 'invite',
      component: () => import('../views/InvitePage.vue'),
    },
    {
      path: '/workspace-invite/:token',
      name: 'workspace-invite',
      component: () => import('../views/WorkspaceInvitePage.vue'),
    },
  ],
})

// 🟢 ГЛОБАЛЬНЫЙ ГАРД ДЛЯ АВТО-РЕДИРЕКТА
router.beforeEach((to, from, next) => {
  const redirect = getHomeRouteRedirect(to.name, {
    width: window.innerWidth,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  });

  if (redirect) {
    next({ name: redirect, query: to.query, hash: to.hash });
    return;
  }

  // Во всех остальных случаях пускаем куда просили
  next();
});

export default router
