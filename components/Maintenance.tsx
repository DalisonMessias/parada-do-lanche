import React from 'react';
import { AlertTriangle } from 'lucide-react';

const Maintenance: React.FC = () => {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4 text-center">
            <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
                <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-6" />
                <h1 className="text-2xl font-bold text-gray-800 mb-2">Sistema em Manutenção</h1>
                <p className="text-gray-600">
                    Estamos realizando ajustes temporários para melhorar sua experiência.
                </p>
                <div className="mt-8 border-t border-gray-100 pt-6">
                    <p className="text-sm text-gray-400">
                        Por favor, tente novamente mais tarde ou chame um atendente.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Maintenance;
