import assert from 'node:assert/strict';
import process from 'node:process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5194, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.SCROLL_TEST_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  await mkdir(`${root}/output/playwright`, { recursive: true });
  for (const variant of [{ name: 'desktop-dark', width: 1280, height: 900 }, { name: 'desktop-light', width: 1280, height: 900, light: true }, { name: 'tablet-light', width: 820, height: 1180, light: true }, { name: 'mobile-dark', width: 390, height: 844, mobile: true }, { name: 'mobile-light', width: 320, height: 640, mobile: true, light: true }]) {
    const context = await browser.newContext({ viewport: { width: variant.width, height: variant.height }, isMobile: !!variant.mobile, hasTouch: !!variant.mobile });
    await context.addInitScript(light => {
      localStorage.setItem('app_data_version', '1'); localStorage.setItem('theme', light ? 'light' : 'dark');
      window.__voiceTracks = []; window.__denyMicrophone = false;
      Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => {
        if (window.__denyMicrophone) throw new DOMException('Permission denied', 'NotAllowedError');
        const track = { enabled: true, readyState: 'live', stop() { this.readyState = 'ended'; } }; window.__voiceTracks.push(track);
        return { getTracks: () => [track], getAudioTracks: () => [track] };
      } } });
      window.RTCPeerConnection = class {
        constructor() { this.iceGatheringState = 'complete'; this.connectionState = 'new'; window.__voicePeer = this; }
        createDataChannel() { this.channel = { close() { this.onclose?.(); } }; return this.channel; }
        addTrack() {} createOffer() { return { type: 'offer', sdp: 'v=0\r\nsynthetic offer' }; }
        setLocalDescription(value) { this.localDescription = value; }
        setRemoteDescription(value) { this.remoteDescription = value; this.connectionState = 'connected'; this.onconnectionstatechange?.(); }
        close() { this.connectionState = 'closed'; this.onconnectionstatechange?.(); }
      };
      window.SpeechRecognition = class { start() { this.onresult?.({ results: [[{ transcript: 'Текст диктовки' }]] }); } stop() { this.onend?.(); } };
    }, !!variant.light);
    const page = await context.newPage(), errors = [], starts = [], stops = [], answers = [];
    page.on('pageerror', error => errors.push(error.message));
    let sessionId, events = [], state = 'listening', pendingRequests = [];
    const history = [{ id: 'hello', role: 'assistant', content: 'Тестовый чат готов.' }];
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname; let data = [];
      if (path.endsWith('/auth/me')) data = { _id: 'actor', currentWorkspaceId: 'workspace', role: 'admin', workspaceRole: 'admin', createdAt: '2026-01-01' };
      if (path.endsWith('/snapshot')) data = { timestamp: new Date().toISOString(), accountBalances: {}, companyBalances: {}, individualBalances: {}, contractorBalances: {} };
      if (path.endsWith('/codex/status')) data = { connected: true, configured: true, voiceAvailable: true };
      if (path.endsWith('/codex/chats')) data = { chats: [{ id: 'chat', title: 'Проверка голоса', threadId: 'thread' }] };
      if (path.endsWith('/codex/chats/chat')) data = { chat: { id: 'chat', threadId: 'thread' }, cachedHistory: { messages: history } };
      if (path.endsWith('/codex/chats/chat/jobs')) data = { job: { status: 'completed', result: { messages: history } } };
      if (path.endsWith('/codex/chats/chat/voice')) {
        const body = request.postDataJSON(); starts.push(body); sessionId = body.requestId; events = []; state = 'listening';
        data = { session: { id: sessionId, state }, sdp: 'v=0 synthetic answer' };
      }
      if (/\/codex\/voice\/[^/]+$/.test(path)) data = { id: sessionId, state, jobId: pendingRequests.length ? 'voice-job' : null, pendingRequests, events: events.filter(e => e.seq > Number(new URL(request.url()).searchParams.get('after') || 0)) };
      if (/\/codex\/voice\/[^/]+\/stop$/.test(path)) { stops.push(path); data = { stopped: true }; }
      if (path.endsWith('/answer')) { answers.push(request.postDataJSON()); pendingRequests = []; data = { accepted: true }; }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`http://127.0.0.1:5194/${variant.mobile ? 'mobile' : ''}`);
    await page.evaluate(light => document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark'), !!variant.light);
    await page.getByRole('button', { name: 'Открыть чат Codex' }).click();
    const dialog = page.getByRole('dialog', { name: 'Чат Codex' });
    await dialog.getByText('Тестовый чат готов.').waitFor();
    await page.waitForFunction(() => !document.querySelector('.codex-typing'));
    const composer = dialog.locator('.codex-input-container'), field = dialog.getByRole('textbox');
    if (variant.mobile || variant.width === 820) {
      assert.ok((await composer.locator('.codex-input-wrapper').boundingBox()).height <= 60);
      const plus = await composer.getByRole('button', { name: 'Прикрепить файл', exact: true }).boundingBox();
      const mic = await composer.getByRole('button', { name: 'Голосовой ввод', exact: true }).boundingBox();
      assert.ok(Math.abs(plus.y - mic.y) < 2);
      await field.focus();
      await page.waitForFunction(() => document.querySelector('.codex-input-container').classList.contains('expanded'));
      assert.ok((await composer.locator('.codex-input-wrapper').boundingBox()).height >= 94);
    }
    if (variant.width === 820) {
      await page.evaluate(() => { Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 480 }); window.visualViewport.dispatchEvent(new Event('resize')); });
      await page.waitForFunction(() => document.querySelector('.codex-chat-window').classList.contains('keyboard-open'));
      const keyboard = await dialog.boundingBox(); assert.ok(keyboard.y + keyboard.height <= 480, 'Tablet window follows the visible viewport above the keyboard');
      await page.evaluate(() => { delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event('resize')); });
      await page.waitForFunction(() => !document.querySelector('.codex-chat-window').classList.contains('keyboard-open'));
    }
    await dialog.getByRole('button', { name: 'Голосовой ввод', exact: true }).click();
    assert.equal(await dialog.getByRole('textbox').inputValue(), 'Текст диктовки');
    assert.equal(starts.length, 0, 'dictation never starts a live session');
    assert.equal(await dialog.getByRole('button', { name: 'Начать голосовой диалог', exact: true }).count(), 0, 'Text switches voice action to Send');
    await dialog.getByRole('button', { name: 'Отправить', exact: true }).waitFor();
    await field.fill('');

    await dialog.getByRole('button', { name: 'Начать голосовой диалог', exact: true }).click();
    const panel = dialog.getByRole('region', { name: 'Голосовой диалог' });
    await panel.getByRole('status').filter({ hasText: 'Слушаю' }).waitFor();
    assert.equal(starts.length, 1); assert.ok(starts[0].sdp.startsWith('v=0'));
    await panel.getByRole('button', { name: 'Выключить микрофон' }).click();
    assert.equal(await page.evaluate(() => window.__voiceTracks.at(-1).enabled), false);
    await panel.getByRole('button', { name: 'Включить микрофон' }).click();
    assert.equal(await page.evaluate(() => window.__voiceTracks.at(-1).enabled), true);
    events = [{ seq: 1, type: 'transcript', itemId: 'audio-1', text: 'Сколько осталось на счёте?' }]; state = 'thinking';
    await panel.getByRole('status').filter({ hasText: 'Думаю' }).waitFor();
    pendingRequests = [{ id: 'voice-question', prompt: { kind: 'approval', message: 'Продолжить синтетическую проверку?' } }];
    await dialog.getByRole('button', { name: 'Разрешить', exact: true }).click();
    assert.equal(answers.length, 1); assert.equal(answers[0].action, 'accept');
    events.push({ seq: 2, type: 'result', itemId: 'audio-1', text: 'На счёте 12 345,67 ₸.', threadId: 'thread' }); state = 'listening';
    history.push({ id: 'voice-user', role: 'user', content: 'Сколько осталось на счёте?' }, { id: 'voice-answer', role: 'assistant', content: 'На счёте 12 345,67 ₸.' });
    await dialog.locator('.codex-message.assistant').filter({ hasText: 'На счёте 12 345,67 ₸.' }).waitFor();
    await page.evaluate(() => window.__voicePeer.channel.onmessage({ data: JSON.stringify({ type: 'output_audio_buffer.started' }) }));
    await panel.getByRole('status').filter({ hasText: 'Отвечаю' }).waitFor();
    const width = await panel.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
    assert.ok(width.scroll <= width.client + 1, JSON.stringify(width));
    await page.screenshot({ path: `${root}/output/playwright/voice-${variant.name}.png` });
    await panel.getByRole('button', { name: 'Завершить голосовой диалог' }).click();
    await dialog.getByRole('button', { name: 'Начать голосовой диалог' }).waitFor();
    assert.equal(await page.evaluate(() => window.__voiceTracks.every(track => track.readyState === 'ended')), true);
    assert.equal(await dialog.getByRole('textbox').inputValue(), '', 'empty draft survives voice mode');
    assert.equal(stops.length, 1);
    await page.waitForFunction(() => !document.querySelector('.codex-typing'));
    await dialog.getByRole('button', { name: 'Начать голосовой диалог' }).click();
    await dialog.getByRole('region', { name: 'Голосовой диалог' }).waitFor();
    await dialog.getByRole('button', { name: 'Закрыть чат Codex' }).click();
    await page.waitForFunction(() => window.__voiceTracks.every(track => track.readyState === 'ended'));
    await page.getByRole('button', { name: 'Открыть чат Codex' }).click();
    await page.waitForFunction(() => !document.querySelector('.codex-typing'));
    await page.evaluate(() => { window.__denyMicrophone = true; });
    await dialog.getByRole('button', { name: 'Начать голосовой диалог' }).click();
    await dialog.getByRole('alert').filter({ hasText: 'Разрешите доступ к микрофону' }).waitFor();
    assert.equal(await dialog.getByRole('region', { name: 'Голосовой диалог' }).count(), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS ${variant.name}: separate dictation/live controls, mute, reply, approval, cleanup, permission denial`);
    await context.close();
  }
} finally { await browser?.close(); await server.close(); }
