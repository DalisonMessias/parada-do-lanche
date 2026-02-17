declare module 'qrious' {
  type QRiousErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

  interface QRiousOptions {
    background?: string;
    backgroundAlpha?: number;
    element?: HTMLCanvasElement;
    foreground?: string;
    foregroundAlpha?: number;
    level?: QRiousErrorCorrectionLevel;
    mime?: string;
    padding?: number | null;
    size?: number;
    value?: string;
  }

  export default class QRious {
    constructor(options?: QRiousOptions);
    set(options: QRiousOptions): void;
    toDataURL(mime?: string): string;
  }
}
