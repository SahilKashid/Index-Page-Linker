import { PDFDocument, PDFName, PDFArray } from 'pdf-lib';
import { IndexLink } from '../types';

export const exportModifiedPdf = async (
  originalFile: File,
  analyses: Record<number, IndexLink[]>
): Promise<Blob> => {
  const fileArrayBuffer = await originalFile.arrayBuffer();
  const pdfDoc = await PDFDocument.load(fileArrayBuffer);
  const pages = pdfDoc.getPages();

  for (const [pageStr, links] of Object.entries(analyses)) {
    const pageNum = parseInt(pageStr, 10);
    const pageIndex = pageNum - 1;

    // Ensure page index is valid
    if (pageIndex < 0 || pageIndex >= pages.length) continue;

    const page = pages[pageIndex];
    const { width, height } = page.getSize();

    for (const link of links) {
      // Calculate coordinates
      const xmin = (link.box.xmin / 1000) * width;
      const xmax = (link.box.xmax / 1000) * width;
      
      const ymin = height - ((link.box.ymax / 1000) * height); 
      const ymax = height - ((link.box.ymin / 1000) * height);

      const targetPageIndex = link.targetPage - 1;
      
      if (targetPageIndex >= 0 && targetPageIndex < pages.length) {
        
        const rect = [Number(xmin), Number(ymin), Number(xmax), Number(ymax)];

        // Create the Link Annotation
        // Using an Action (GoTo) is often more reliable than Dest for compatibility
        const linkAnnot = pdfDoc.context.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('Link'),
          Rect: rect,
          Border: [0, 0, 0],
          // A = Action dictionary
          A: pdfDoc.context.obj({
            Type: PDFName.of('Action'),
            S: PDFName.of('GoTo'),
            // D = Destination: [Page Ref, /Fit]
            // /Fit ensures the whole page is visible
            D: [pages[targetPageIndex].ref, PDFName.of('Fit')]
          })
        });

        const linkAnnotRef = pdfDoc.context.register(linkAnnot);

        // Safely add to page annotations
        const pageNode = page.node;
        let annots = pageNode.Annots();

        if (!annots) {
          annots = pdfDoc.context.obj([]);
          pageNode.set(PDFName.of('Annots'), annots);
        }
        
        // Ensure we are working with a PDFArray before pushing
        if (annots instanceof PDFArray) {
            annots.push(linkAnnotRef);
        }
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
};