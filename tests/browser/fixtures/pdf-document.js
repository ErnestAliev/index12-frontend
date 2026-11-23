// Small, valid, synthetic PDFs with all four page edges and selectable text.
export function pdfDocument(pages = [{ width: 595, height: 842, rotation: 0 }]) {
  const objects = [], fontId = 3 + pages.length * 2;
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + 2 * i} 0 R`).join(' ')}] >>`);
  pages.forEach(({ width, height, rotation = 0 }, i) => {
    const text = `q 0 0 0 RG 2 w 8 8 ${width - 16} ${height - 16} re S\nBT /F1 16 Tf 20 ${height - 36} Td (PAGE ${i + 1} - ORIGINAL DOCUMENT) Tj ET\nBT /F1 12 Tf 20 20 Td (BOTTOM LEFT) Tj ET Q\n`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Rotate ${rotation} /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${4 + 2 * i} 0 R >>`);
    objects.push(`<< /Length ${text.length} >>\nstream\n${text}endstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let pdf = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}
