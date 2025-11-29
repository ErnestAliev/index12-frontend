export const config = {
  matcher: ['/', '/mobile'],
};

export default function middleware(request) {
  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent') || '';
  
  // Простая проверка на мобильное устройство
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  
  // Если пользователь на главной (/) и это мобильное устройство -> редирект на /mobile
  if (isMobile && url.pathname === '/') {
    return Response.redirect(new URL('/mobile', request.url));
  }
  
  // (Опционально) Обратный редирект для десктопа можно раскомментировать при необходимости
  // if (!isMobile && url.pathname === '/mobile') {
  //   return Response.redirect(new URL('/', request.url));
  // }

  // Продолжаем выполнение запроса
  return;
}