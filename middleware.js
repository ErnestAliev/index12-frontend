import { NextResponse } from 'next/server';

export function middleware(request) {
  const userAgent = request.headers.get('user-agent') || '';
  
  // Простая проверка на мобильное устройство
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  
  const url = request.nextUrl.clone();
  
  // Если пользователь на главной (/) и это мобильное устройство -> редирект на /mobile
  if (isMobile && url.pathname === '/') {
    url.pathname = '/mobile';
    return NextResponse.redirect(url);
  }
  
  // (Опционально) Если пользователь НЕ на мобильном, но идет на /mobile -> редирект на /
  // const isDesktop = !isMobile;
  // if (isDesktop && url.pathname === '/mobile') {
  //   url.pathname = '/';
  //   return NextResponse.redirect(url);
  // }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/mobile'], // Применять только к этим путям
};