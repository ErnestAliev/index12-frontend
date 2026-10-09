import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldUseMobileHome, getHomeRouteRedirect } from '../src/utils/homeLayout.js';

const safariDesktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
const chromeIPad = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0.0.0 Mobile/15E148 Safari/604.1';

for (const width of [768, 834, 1024, 1366]) {
  test(`iPad Safari desktop mode and Chrome both open the full workspace at ${width}px`, () => {
    assert.equal(shouldUseMobileHome({ width, userAgent: safariDesktop, maxTouchPoints: 5 }), false);
    assert.equal(shouldUseMobileHome({ width, userAgent: chromeIPad, maxTouchPoints: 5 }), false);
  });
}

test('phones continue to open the mobile workspace', () => {
  for (const userAgent of ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'Mozilla/5.0 (Linux; Android 14) Mobile']) {
    assert.equal(shouldUseMobileHome({ width: 390, userAgent, maxTouchPoints: 5 }), true);
    assert.equal(shouldUseMobileHome({ width: 1200, userAgent, maxTouchPoints: 5 }), true);
  }
});

test('desktop computers keep their existing narrow/wide window behavior', () => {
  assert.equal(shouldUseMobileHome({ width: 1440, userAgent: safariDesktop, maxTouchPoints: 0 }), false);
  assert.equal(shouldUseMobileHome({ width: 900, userAgent: safariDesktop, maxTouchPoints: 0 }), true);
  assert.equal(shouldUseMobileHome({ width: 1440, userAgent: 'Windows NT 10.0', maxTouchPoints: 10 }), false);
});

test('the existing Android tablet routing is unaffected by the iPad fix', () => {
  assert.equal(shouldUseMobileHome({ width: 1280, userAgent: 'Mozilla/5.0 (Linux; Android 14)', maxTouchPoints: 5 }), true);
});

test('an iPad reopening the old mobile URL reaches the full workspace without a redirect loop', () => {
  for (const userAgent of [safariDesktop, chromeIPad]) {
    const device = { width: 834, userAgent, maxTouchPoints: 5 };
    assert.equal(getHomeRouteRedirect('mobile-home', device), 'home');
    assert.equal(getHomeRouteRedirect('home', device), null);
    assert.equal(getHomeRouteRedirect('invite', device), null);
    assert.equal(getHomeRouteRedirect('workspace-invite', device), null);
  }
});

test('phones redirect to mobile once and a desktop can still explicitly open the mobile preview', () => {
  const phone = { width: 390, userAgent: 'iPhone', maxTouchPoints: 5 };
  assert.equal(getHomeRouteRedirect('home', phone), 'mobile-home');
  assert.equal(getHomeRouteRedirect('mobile-home', phone), null);
  assert.equal(getHomeRouteRedirect('mobile-home', { width: 1440, userAgent: safariDesktop, maxTouchPoints: 0 }), null);
});
