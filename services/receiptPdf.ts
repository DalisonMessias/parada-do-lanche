import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type ReceiptPdfOptions = {
  element: HTMLElement;
  fileName: string;
};

const waitForImages = async (container: HTMLElement, timeoutMs = 12000) => {
  const images = Array.from(container.querySelectorAll('img'));
  if (images.length === 0) return;

  const deadline = Date.now() + timeoutMs;
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          const done = () => resolve();
          const removeListeners = () => {
            img.removeEventListener('load', onEvent);
            img.removeEventListener('error', onEvent);
          };
          const onEvent = () => {
            window.setTimeout(check, 60);
          };
          const check = () => {
            const loaded = img.complete && img.naturalWidth > 0;
            const timedOut = Date.now() >= deadline;
            if (loaded || timedOut) {
              removeListeners();
              done();
              return;
            }
            window.setTimeout(check, 80);
          };

          img.addEventListener('load', onEvent);
          img.addEventListener('error', onEvent);
          check();
        })
    )
  );
};

export const downloadReceiptPdf = async ({ element, fileName }: ReceiptPdfOptions) => {
  if (!element) {
    throw new Error('Elemento do cupom nao encontrado para gerar PDF.');
  }

  if (document.fonts?.status !== 'loaded') {
    await document.fonts.ready;
  }

  await waitForImages(element);

  const rect = element.getBoundingClientRect();
  const pxWidth = Math.max(1, rect.width);
  const pxHeight = Math.max(1, rect.height);
  const pxToMm = 25.4 / 96;
  const pdfWidthMm = pxWidth * pxToMm;
  const pdfHeightMm = pxHeight * pxToMm;

  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: Math.max(3, Math.min(5, window.devicePixelRatio * 2)),
    useCORS: true,
    allowTaint: false,
    logging: false,
    windowWidth: Math.ceil(element.scrollWidth),
    windowHeight: Math.ceil(element.scrollHeight),
  });

  const imageData = canvas.toDataURL('image/png', 1.0);
  const pdf = new jsPDF({
    unit: 'mm',
    format: [pdfWidthMm, pdfHeightMm],
    orientation: pdfHeightMm >= pdfWidthMm ? 'portrait' : 'landscape',
    compress: false,
    putOnlyUsedFonts: true,
  });

  pdf.addImage(imageData, 'PNG', 0, 0, pdfWidthMm, pdfHeightMm, undefined, 'FAST');
  pdf.save(fileName);
};
