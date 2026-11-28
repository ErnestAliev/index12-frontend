// PDF.js viewports include crop boxes, rotation and PDF UserUnit. Millimetres are
// physical dimensions, independent of zoom, phone pixels and PNG resolution.
export function pdfMarkGeometry(mark, asset, viewport) {
  const pixelsPerMm = viewport.scale * 72 / 25.4;
  const ratio = asset.width / asset.height;
  const turned = (mark.turn || 0) % 2;
  const widthFactor = turned ? 1 / ratio : 1, heightFactor = turned ? 1 : 1 / ratio;
  const maximum = Math.min(viewport.width / widthFactor, viewport.height / heightFactor) * .95 / pixelsPerMm;
  const widthMm = Math.min(Math.max(5, mark.widthMm), maximum);
  const imageWidth = widthMm * pixelsPerMm, imageHeight = imageWidth / ratio;
  const width = imageWidth * widthFactor, height = imageWidth * heightFactor;
  const left = Math.max(0, Math.min(viewport.width - width, mark.x * viewport.width - width / 2));
  const top = Math.max(0, Math.min(viewport.height - height, mark.y * viewport.height - height / 2));
  const a = viewport.convertToPdfPoint(left, top), b = viewport.convertToPdfPoint(left + width, top + height);
  return { widthMm, imageWidth, imageHeight, left: left / viewport.width, top: top / viewport.height, width: width / viewport.width, height: height / viewport.height,
    rect: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])], rotation: viewport.rotation };
}

export async function preparePdfMark(file) {
  if (file.size > 10 * 1024 * 1024) throw Error('Выберите изображение до 10 МБ.');
  if (!/^image\/(png|jpeg|webp|heic|heif)$/i.test(file.type) && !/\.(png|jpe?g|webp|heic|heif)$/i.test(file.name))
    throw Error('Выберите изображение подписи или печати в PNG, JPEG или WebP.');
  const source = URL.createObjectURL(file), image = new Image();
  try {
    image.src = source;
    try { await image.decode(); } catch { throw Error('Не удалось прочитать изображение. Выберите PNG, JPEG или WebP.'); }
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height || width * height > 20 * 1024 * 1024) throw Error('Выберите изображение до 20 мегапикселей.');
    // Inspect a bounded sample rather than allocating a full phone photo's RGBA buffer.
    const scale = Math.min(1, 1024 / Math.max(width, height));
    const scan = document.createElement('canvas'); scan.width = Math.max(1, Math.round(width * scale)); scan.height = Math.max(1, Math.round(height * scale));
    const context = scan.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, scan.width, scan.height);
    const { data } = context.getImageData(0, 0, scan.width, scan.height);
    let left = scan.width, top = scan.height, right = -1, bottom = -1;
    for (let y = 0; y < scan.height; y++) for (let x = 0; x < scan.width; x++) {
      if (data[(y * scan.width + x) * 4 + 3] > 8) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
    }
    if (right < 0) throw Error('Изображение полностью прозрачное. Выберите другое.');
    // Keep a sample-pixel margin so faint antialiased edges are not cut off.
    left = Math.max(0, left - 1); top = Math.max(0, top - 1); right = Math.min(scan.width, right + 2); bottom = Math.min(scan.height, bottom + 2);
    const sx = left * width / scan.width, sy = top * height / scan.height;
    const sw = (right - left) * width / scan.width, sh = (bottom - top) * height / scan.height;
    const outputScale = Math.min(1, 1600 / Math.max(sw, sh));
    const output = document.createElement('canvas'); output.width = Math.max(1, Math.round(sw * outputScale)); output.height = Math.max(1, Math.round(sh * outputScale));
    output.getContext('2d').drawImage(image, sx, sy, sw, sh, 0, 0, output.width, output.height);
    const blob = await new Promise(resolve => output.toBlob(resolve, 'image/png'));
    if (!blob) throw Error('Не удалось подготовить изображение.');
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const id = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return { id, file: new File([blob], 'pdf-mark.png', { type: 'image/png' }), width: output.width, height: output.height };
  } finally { image.src = ''; URL.revokeObjectURL(source); }
}

// Bake layer transforms into the exported image; the PDF annotation itself keeps
// the page's rotation. Preview and exported file use the same transform order.
export async function pdfMarkBitmap(asset, mark) {
  const bitmap = await createImageBitmap(asset.file);
  const turn = mark.turn || 0;
  if (!turn && !mark.flipX && !mark.flipY) return bitmap;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = turn % 2 ? bitmap.height : bitmap.width;
    canvas.height = turn % 2 ? bitmap.width : bitmap.height;
    const context = canvas.getContext('2d');
    context.translate(canvas.width / 2, canvas.height / 2);
    context.scale(mark.flipX ? -1 : 1, mark.flipY ? -1 : 1);
    context.rotate(turn * Math.PI / 2);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    return await createImageBitmap(canvas);
  } finally { bitmap.close(); }
}
