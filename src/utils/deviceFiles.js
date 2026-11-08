export function deviceFile(blob, metadata) {
  return new File([blob], metadata.name, {
    type: metadata.mimeType || blob.type || 'application/octet-stream',
  });
}
export function canShareDeviceFile(file) {
  if (!file || typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try { return navigator.canShare({ files: [file] }); }
  catch { return false; }
}
export function shareDeviceFile(file) {
  if (!canShareDeviceFile(file)) throw Error('Этот браузер не поддерживает передачу этого файла. Скачайте его на устройство.');
  // File bytes are prepared before the tap, preserving the mobile user gesture.
  return navigator.share({ files: [file] });
}
export function saveDeviceFile(file, container = document.body) {
  const url = URL.createObjectURL(file), anchor = document.createElement('a');
  anchor.href = url; anchor.download = file.name; anchor.hidden = true;
  anchor.addEventListener('click', event => event.stopPropagation());
  try { container.appendChild(anchor); anchor.click(); }
  finally {
    anchor.remove();
    // Keep the URL alive while the browser's download manager consumes it.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
