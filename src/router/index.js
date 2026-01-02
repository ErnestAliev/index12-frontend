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
  ],
})

// 🟢 ГЛОБАЛЬНЫЙ ГАРД ДЛЯ АВТО-РЕДИРЕКТА
router.beforeEach((to, from, next) => {
  // Проверяем ширину экрана (меньше 1024px считаем мобильным/планшетом)
  // или наличие ключевых слов в User-Agent
  const isSmallScreen = window.innerWidth < 1024;
  const isMobileAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const shouldBeMobile = isSmallScreen || isMobileAgent;

  // 1. Если пользователь на телефоне, но пытается открыть Десктоп (Home)
  if (shouldBeMobile && to.name === 'home') {
    next({ name: 'mobile-home' });
    return;
  }

  // 2. Если пользователь на ПК, но пытается открыть Мобилку (Опционально, можно убрать если хотите тестить на ПК)
  // if (!shouldBeMobile && to.name === 'mobile-home') {
  //   next({ name: 'home' });
  //   return;
  // }

  // Во всех остальных случаях пускаем куда просили
  next();
});

export default router