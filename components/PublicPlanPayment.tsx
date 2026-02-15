import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { Lock, CheckCircle, AlertTriangle, Calendar } from 'lucide-react';

const PublicPlanPayment: React.FC = () => {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string; new_due_date?: string } | null>(null);

    const handleConfirm = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) return;

        setLoading(true);
        setResult(null);

        try {
            const { data, error } = await supabase.rpc('confirm_plan_payment', {
                p_password: password
            });

            if (error) {
                setResult({ success: false, message: error.message });
            } else {
                setResult(data as any);
            }
        } catch (err: any) {
            setResult({ success: false, message: err.message || 'Erro desconhecido' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
                <div className="text-center mb-8">
                    <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock className="w-8 h-8 text-blue-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800">Confirmação de Pagamento</h1>
                    <p className="text-gray-500 mt-2">Área administrativa restrita</p>
                </div>

                {result?.success ? (
                    <div className="text-center">
                        <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                            <CheckCircle className="w-8 h-8 text-green-600" />
                        </div>
                        <h2 className="text-xl font-bold text-green-700 mb-2">Pagamento Confirmado!</h2>
                        <p className="text-gray-600 mb-6">{result.message}</p>

                        {result.new_due_date && (
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 inline-block mb-6">
                                <p className="text-sm text-gray-500 mb-1">Próximo Vencimento</p>
                                <div className="flex items-center justify-center text-gray-800 font-bold text-lg">
                                    <Calendar className="w-5 h-5 mr-2 text-blue-500" />
                                    {new Date(result.new_due_date).toLocaleDateString('pt-BR')}
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => window.location.reload()}
                            className="text-blue-600 hover:text-blue-800 underline text-sm"
                        >
                            Voltar
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleConfirm} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Senha de Liberação
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                                placeholder="Digite a senha..."
                                autoFocus
                            />
                        </div>

                        {result && !result.success && (
                            <div className="bg-red-50 text-red-700 p-3 rounded-lg flex items-center text-sm">
                                <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
                                {result.message}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !password}
                            className={`w-full py-3 px-4 rounded-lg font-bold text-white shadow-md transition
                ${loading || !password
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-700 active:transform active:scale-95'
                                }`}
                        >
                            {loading ? 'Verificando...' : 'Confirmar Pagamento'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default PublicPlanPayment;
