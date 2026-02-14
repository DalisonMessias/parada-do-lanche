import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type StickerPdfProgress = {
  current: number;
  total: number;
};

type GenerateStickerPdfOptions = {
  pages: HTMLElement[];
  fileName: string;
  onProgress?: (progress: StickerPdfProgress) => void;
};

const waitForImages = async (container: HTMLElement, timeoutMs = 12000) => {
  const images = Array.from(container.querySelectorAll('img'));
  if (images.length === 0) return;

  const deadline = Date.now() + timeoutMs;

  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          const finish = () => resolve();
          const removeListeners = () => {
            img.removeEventListener('load', onEvent);
            img.removeEventListener('error', onEvent);
          };
          const onEvent = () => {
            // Small delay allows fallback QR replacement to update src/load state.
            window.setTimeout(check, 60);
          };
          const check = () => {
            const loaded = img.complete && img.naturalWidth > 0;
            const timedOut = Date.now() >= deadline;
            if (loaded || timedOut) {
              removeListeners();
              finish();
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

export const generateStickerPdf = async ({ pages, fileName, onProgress }: GenerateStickerPdfOptions) => {
  if (!pages || pages.length === 0) {
    throw new Error('Nenhuma pagina fornecida para gerar PDF.');
  }

  if (document.fonts?.status !== 'loaded') {
    await document.fonts.ready;
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: false,
    putOnlyUsedFonts: true,
  });

  for (let index = 0; index < pages.length; index += 1) {
    const pageElement = pages[index];
    onProgress?.({ current: index + 1, total: pages.length });

    await waitForImages(pageElement);

    const canvas = await html2canvas(pageElement, {
      backgroundColor: '#ffffff',
      scale: Math.max(4, Math.min(5, window.devicePixelRatio * 3)),
      useCORS: true,
      allowTaint: false,
      logging: false,
      windowWidth: pageElement.scrollWidth,
      windowHeight: pageElement.scrollHeight,
    });

    const imageData = canvas.toDataURL('image/png', 1.0);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const maxRenderWidth = pdfWidth - 10;
    const maxRenderHeight = pdfHeight - 10;
    const imageRatio = canvas.width / canvas.height;

    let renderWidth = maxRenderWidth;
    let renderHeight = renderWidth / imageRatio;

    if (renderHeight > maxRenderHeight) {
      renderHeight = maxRenderHeight;
      renderWidth = renderHeight * imageRatio;
    }

    const x = (pdfWidth - renderWidth) / 2;
    const y = 5;

    if (index > 0) pdf.addPage();
    pdf.addImage(imageData, 'PNG', x, y, renderWidth, renderHeight, undefined, 'SLOW');
  }

  pdf.save(fileName);
};
