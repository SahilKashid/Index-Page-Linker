import { pdfjs } from 'react-pdf';

export const getImagesForPages = async (file: File, pageNumbers: number[]): Promise<Map<number, string>> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfDoc = await loadingTask.promise;
  
  const results = new Map<number, string>();

  for (const pageNum of pageNumbers) {
    if (pageNum < 1 || pageNum > pdfDoc.numPages) continue;
    
    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 }); // 1.5 scale matches the quality needed for OCR
      
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      
      if (context) {
          await page.render({ canvasContext: context, viewport } as any).promise;
          results.set(pageNum, canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
      }
    } catch (e) {
      console.error(`Failed to render page ${pageNum}`, e);
    }
  }

  // Clean up
  loadingTask.destroy();
  return results;
};