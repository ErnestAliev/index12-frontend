// NCALayer's local file dialog returns the actual path; no file bytes are read or uploaded.
export function selectEdsFile({ currentPath = '', signal, WebSocketImpl = WebSocket } = {}) {
  return new Promise((resolve, reject) => {
    let socket, timer, settled = false;
    const finish = (value, error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (socket) { socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null; socket.close(); }
      if (error) reject(error); else resolve(value);
    };
    const abort = () => finish(null);
    if (signal?.aborted) return finish(null);
    signal?.addEventListener('abort', abort, { once: true });
    try { socket = new WebSocketImpl('wss://127.0.0.1:13579/'); }
    catch { finish(null, new Error('Запустите NCALayer для выбора файла ЭЦП')); return; }
    timer = setTimeout(() => finish(null, new Error('NCALayer не отвечает. Запустите программу и повторите выбор файла')), 5000);
    socket.onopen = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(null, new Error('Время выбора файла истекло. Повторите выбор')), 180000);
      const separator = Math.max(currentPath.lastIndexOf('/'), currentPath.lastIndexOf('\\'));
      const directory = separator > 0 ? currentPath.slice(0, separator) : '';
      socket.send(JSON.stringify({ module: 'kz.gov.pki.knca.commonUtils', method: 'showFileChooser', args: ['ALL', directory] }));
    };
    socket.onmessage = event => {
      let data;
      try { data = JSON.parse(event.data); } catch { finish(null, new Error('NCALayer вернул некорректный ответ')); return; }
      // The initial version handshake is unrelated to the dialog result.
      if (data.code === undefined) return;
      if (String(data.code) !== '200') {
        if (/cancel|canceled|cancelled|отмен/i.test(String(data.message || ''))) return finish(null);
        return finish(null, new Error('Не удалось выбрать файл в NCALayer. Обновите программу и повторите выбор'));
      }
      const path = data.responseObject;
      if (path == null || path === '') return finish(null);
      if (typeof path !== 'string' || /[\0\r\n]/.test(path) || !/\.(p12|pfx)$/i.test(path) || path.includes('fakepath') || (!path.startsWith('/') && !/^[a-z]:[\\/]/i.test(path))) return finish(null, new Error('Выберите локальный файл ЭЦП .p12 или .pfx'));
      finish(path);
    };
    socket.onerror = () => finish(null, new Error('Запустите NCALayer для выбора файла ЭЦП'));
    socket.onclose = () => finish(null, new Error('Соединение с NCALayer закрыто. Повторите выбор файла'));
  });
}
