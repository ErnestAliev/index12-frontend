// iPad Safari can identify itself as macOS while Chrome identifies itself as
// iPad. Both should open the full workspace; touch input is handled separately.
function isIPad({ userAgent = '', maxTouchPoints = 0 }) {
  return /iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

export function shouldUseMobileHome({ width, userAgent = '', maxTouchPoints = 0 }) {
  if (isIPad({ userAgent, maxTouchPoints })) return false;
  return width < 1024 || /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
}

export function getHomeRouteRedirect(routeName, device) {
  if (routeName === 'home' && shouldUseMobileHome(device)) return 'mobile-home';
  // Chrome may reopen the /mobile URL left by the previous redirect policy.
  if (routeName === 'mobile-home' && isIPad(device)) return 'home';
  return null;
}

// The same column count drives ordering, visible cards and expanded height.
export function getHeaderWidgetColumns({ width, height }) {
  if (width < 768 || width > 1400) return 6;
  return height > width ? 2 : 5;
}
