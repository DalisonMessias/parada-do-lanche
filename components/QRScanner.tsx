import React, { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X } from 'lucide-react';

interface QRScannerProps {
    onScanSuccess: (decodedText: string) => void;
    onClose: () => void;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScanSuccess, onClose }) => {
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const [isStarted, setIsStarted] = React.useState(false);

    useEffect(() => {
        if (isStarted && !scannerRef.current) {
            // Give React a moment to render the #reader div
            const scanner = new Html5QrcodeScanner(
                'reader',
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    rememberLastUsedCamera: true,
                    aspectRatio: 1.0
                },
                /* verbose= */ false
            );
            scannerRef.current = scanner;

            scanner.render(
                (decodedText) => {
                    onScanSuccess(decodedText);
                    scanner.clear().catch(console.error);
                },
                (errorMessage) => {
                    // Error callback (ignored)
                }
            );
        }
    }, [isStarted, onScanSuccess]);

    useEffect(() => {
        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch((error) => {
                    console.error('Failed to clear scanner', error);
                });
            }
        };
    }, []);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm px-6">
            <div className="bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl relative">
                <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-tighter text-gray-900 leading-none">Scanner de Mesa</h3>
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-2">Acesso rapido ao cardapio</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2.5 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-8">
                    {!isStarted ? (
                        <div className="space-y-8 py-4">
                            <div className="w-20 h-20 mx-auto bg-primary/10 rounded-3xl flex items-center justify-center text-primary">
                                <svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                                    <circle cx="12" cy="13" r="3" />
                                </svg>
                            </div>
                            <div className="text-center space-y-3">
                                <h4 className="text-lg font-black text-gray-800 uppercase tracking-tighter italic">Pronto para escanear?</h4>
                                <p className="text-sm text-gray-500 font-bold leading-relaxed px-4">
                                    Precisamos de acesso a sua camera para ler o QR Code da mesa.
                                </p>
                            </div>
                            <button
                                onClick={() => setIsStarted(true)}
                                className="w-full bg-gray-900 text-white p-5 rounded-2xl font-black uppercase tracking-widest text-sm shadow-[0_8px_20px_rgba(15,23,42,0.15)] transition-transform active:scale-95"
                            >
                                Ativar Camera
                            </button>
                        </div>
                    ) : (
                        <div className="animate-in fade-in duration-500">
                            <div id="reader" className="w-full overflow-hidden rounded-2xl border border-gray-200 shadow-inner"></div>
                            <div className="mt-8 text-center">
                                <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] animate-pulse">
                                    Buscando QR Code...
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-8 pt-0">
                    <button
                        onClick={onClose}
                        className="w-full py-4 border border-gray-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:bg-gray-50 transition-all"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QRScanner;
