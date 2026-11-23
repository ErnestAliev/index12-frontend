import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;
// Keep fonts, character maps and image decoders on our origin, including built releases.
const assets = import.meta.glob('/node_modules/pdfjs-dist/{cmaps/*.bcmap,standard_fonts/*.{pfb,ttf,otf},wasm/*.{wasm,js}}', { eager: true, query: '?url&no-inline', import: 'default' });
const resources = new Map(Object.entries(assets).map(([path, url]) => [path.split('/pdfjs-dist/')[1], url]));
class PdfResources {
  async fetch({ kind, filename }) {
    const folder = { cMapUrl: 'cmaps', standardFontDataUrl: 'standard_fonts', wasmUrl: 'wasm' }[kind];
    const url = resources.get(`${folder}/${filename}`);
    if (!url) throw Error('Ресурс PDF недоступен');
    const response = await fetch(url);
    if (!response.ok) throw Error('Не удалось загрузить ресурс PDF');
    return new Uint8Array(await response.arrayBuffer());
  }
}
export function loadPdf(bytes) {
  return getDocument({ data: bytes, BinaryDataFactory: PdfResources, useWorkerFetch: false, enableXfa: false });
}
