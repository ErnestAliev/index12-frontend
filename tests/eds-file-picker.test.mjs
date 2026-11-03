import assert from 'node:assert/strict';
import test from 'node:test';
import { selectEdsFile } from '../src/utils/edsFilePicker.js';

function fixture() {
  let socket;
  class LocalSocket {
    constructor(url) { this.url = url; this.messages = []; this.closed = false; socket = this; }
    send(message) { this.messages.push(JSON.parse(message)); }
    close() { this.closed = true; }
    respond(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
  }
  const controller = new AbortController();
  const promise = selectEdsFile({ currentPath: '/Users/test/old.p12', signal: controller.signal, WebSocketImpl: LocalSocket });
  return { socket, promise, controller };
}
test('the local chooser returns a real path, never reads file bytes and ignores the NCALayer version handshake', async () => {
  const { socket, promise } = fixture();
  assert.equal(socket.url, 'wss://127.0.0.1:13579/'); socket.onopen();
  assert.deepEqual(socket.messages, [{ module: 'kz.gov.pki.knca.commonUtils', method: 'showFileChooser', args: ['ALL', '/Users/test'] }]);
  socket.respond({ result: { version: '1.4' } });
  socket.respond({ code: '200', responseObject: '/Users/test/My company.p12' });
  assert.equal(await promise, '/Users/test/My company.p12'); assert.equal(socket.closed, true);
});
test('cancel and closing the company modal leave the existing selection untouched', async () => {
  for (const response of [{ code: '200', responseObject: '' }, { code: '500', message: 'action.canceled' }]) {
    const { socket, promise } = fixture(); socket.onopen(); socket.respond(response); assert.equal(await promise, null);
  }
  const { socket, promise, controller } = fixture(); controller.abort();
  assert.equal(await promise, null); assert.equal(socket.closed, true);
});
test('fake browser paths, relative names and non-key files are not saved as usable EDS paths', async () => {
  for (const path of ['C:\\fakepath\\key.p12', 'key.p12', '/Users/test/file.txt', { path: '/key.p12' }]) {
    const { socket, promise } = fixture(); socket.onopen(); socket.respond({ code: '200', responseObject: path });
    await assert.rejects(promise, /локальный файл/); assert.equal(socket.closed, true);
  }
});
test('NCALayer availability errors produce an actionable error and close the socket', async () => {
  const { socket, promise } = fixture(); socket.onerror();
  await assert.rejects(promise, /Запустите NCALayer/); assert.equal(socket.closed, true);
});
