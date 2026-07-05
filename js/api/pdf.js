// Clientseitige Textextraktion aus PDFs via vendored pdf.js (offline-fähig).
// Läuft komplett lokal – es werden keine PDF-Daten an einen Server gesendet.

let pdfjsLib = null;

async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('../../vendor/pdfjs/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjsLib;
}

/**
 * Extrahiert den Text aus einer PDF-Datei (ArrayBuffer).
 * @param {ArrayBuffer} arrayBuffer
 * @param {(p:{page:number,total:number})=>void} [onProgress]
 * @returns {Promise<string>}
 */
export async function extractPdfText(arrayBuffer, onProgress) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const parts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Zeilen anhand der y-Position grob rekonstruieren
    let lastY = null;
    let line = '';
    const lines = [];
    for (const item of content.items) {
      const y = item.transform ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
        lines.push(line);
        line = '';
      }
      line += item.str + (item.hasEOL ? '' : ' ');
      lastY = y;
    }
    if (line) lines.push(line);
    parts.push(lines.join('\n'));
    onProgress?.({ page: i, total: doc.numPages });
  }
  await doc.destroy();
  return parts.join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Liest eine .txt-Datei als String. */
export function readTextFile(file) {
  return file.text();
}

/** Datei → Text, je nach Typ (PDF oder Klartext). */
export async function fileToText(file, onProgress) {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return extractPdfText(await file.arrayBuffer(), onProgress);
  }
  return readTextFile(file);
}
