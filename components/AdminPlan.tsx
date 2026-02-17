import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { StoreSettings } from '../types';
import { LayoutDashboard, CreditCard, Calendar, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

const AdminPlan: React.FC = () => {
    const [settings, setSettings] = useState<StoreSettings | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchSettings = async () => {
        setLoading(true);
        const { data } = await supabase.from('settings').select('*').eq('id', 1).single();
        if (data) setSettings(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Carregando informações do plano...</div>;
    }

    if (!settings) {
        return <div className="p-8 text-center text-red-500">Erro ao carregar configurações.</div>;
    }

    // Default values if columns don't exist yet (graceful fallback)
    const planName = (settings as any).plan_name || 'Básico';
    const planStatus = ((settings as any).plan_status || 'PAID') as 'PAID' | 'OPEN' | 'OVERDUE' | 'SUSPENDED';
    const dueDateStr = (settings as any).plan_current_due_date; // 'YYYY-MM-DD'
    const dueDay = (settings as any).plan_due_day || 15;
    const planPrice = (settings as any).plan_price || 19.90;
    const planDescription = `Assinatura mensal do plano ${planName}`;
    const paidAt = (settings as any).plan_paid_at;
    const pixCheckoutQuery = new URLSearchParams({
        nome: String(planName || '').trim() || 'Plano mensal',
        descricao: String(planDescription || '').trim() || 'Assinatura mensal do sistema',
        valor: String(Number(planPrice || 0)),
    }).toString();
    const pixCheckoutPath = `/checkout/plano?${pixCheckoutQuery}`;

    // Calculate generic due date if missing
    const now = new Date();
    let currentDueDate: Date;

    if (dueDateStr) {
        const parts = dueDateStr.split('-');
        currentDueDate = new Date(
            parseInt(parts[0], 10),
            parseInt(parts[1], 10) - 1,
            parseInt(parts[2], 10),
            23, 59, 59, 999
        );
    } else {
        currentDueDate = new Date(now.getFullYear(), now.getMonth(), dueDay, 23, 59, 59, 999);
    }

    // Check if within 5 days
    const diffTime = currentDueDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const isCloseToDue = diffDays <= 5 && (planStatus === 'OPEN' || planStatus === 'PAID');
    // Logic: Show button if status is OPEN/OVERDUE/SUSPENDED OR if it's PAID but close to next due date (which usually switches to OPEN)
    // Actually, usually we switch to OPEN on day 1 or something.
    // Simplest logic requested: "Quando faltarem 5 dias para vencer, exibir um botão"

    // Status badges
    const getStatusBadge = () => {
        switch (planStatus) {
            case 'PAID':
                return <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800"><CheckCircle className="w-4 h-4 mr-2" />Pago</span>;
            case 'OPEN':
                return <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800"><AlertCircle className="w-4 h-4 mr-2" />Em Aberto</span>;
            case 'OVERDUE':
                return <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800"><AlertCircle className="w-4 h-4 mr-2" />Vencido</span>;
            case 'SUSPENDED':
                return <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800"><XCircle className="w-4 h-4 mr-2" />Suspenso</span>;
            default:
                return null;
        }
    };

    const formatDate = (dateStr: string | Date | null) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('pt-BR');
    };

    const isLate = planStatus === 'OVERDUE' || planStatus === 'SUSPENDED';

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 flex items-center text-gray-800">
                <CreditCard className="w-6 h-6 mr-2" />
                Meu Plano
            </h1>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-700">Detalhes da Assinatura</h2>
                        <p className="text-sm text-gray-500">Gerencie o pagamento do seu sistema</p>
                    </div>
                    <div>
                        {getStatusBadge()}
                    </div>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Info Column */}
                    <div className="space-y-6">
                        <div className="hidden">
                            <label className="block text-sm font-medium text-gray-500 mb-1">Plano Atual</label>
                            <div className="text-xl font-bold text-gray-900">{planName}</div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-1">Vencimento</label>
                            <div className="flex items-center text-gray-900">
                                <Calendar className="w-5 h-5 mr-2 text-gray-400" />
                                <span className="font-medium text-lg">{formatDate(currentDueDate)}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">Todo dia {dueDay} do mês</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-1">Valor</label>
                            <div className="text-xl font-bold text-gray-900">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(planPrice)}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-1">Último Pagamento Confirmado</label>
                            <div className="text-gray-900 font-medium">
                                {paidAt ? new Date(paidAt).toLocaleString('pt-BR') : '-'}
                            </div>
                        </div>
                    </div>

                    {/* Action Column */}
                    <div className="flex flex-col justify-center items-center bg-gray-50 rounded-xl p-6 border border-gray-100">
                        {isLate ? (
                            <div className="text-center mb-4">
                                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-2" />
                                <h3 className="text-lg font-bold text-red-600">Atenção!</h3>
                                <p className="text-sm text-gray-600">
                                    Seu plano está <strong>{planStatus === 'OVERDUE' ? 'Vencido' : 'Suspenso'}</strong>.
                                    Algumas funcionalidades podem estar bloqueadas.
                                </p>
                            </div>
                        ) : (
                            <div className="text-center mb-4">
                                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                                <h3 className="text-lg font-bold text-green-600">Em dia!</h3>
                                <p className="text-sm text-gray-600">Seu sistema está funcionando perfeitamente.</p>
                            </div>
                        )}

                        {/* Button Logic: Show if late OR close to due date (5 days) */}
                        {(isLate || isCloseToDue) && (
                            <div className="w-full">
                                <button
                                    type="button"
                                    onClick={() => window.history.pushState({}, '', pixCheckoutPath)}
                                    className="block w-full py-4 px-6 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white font-bold text-center rounded-lg shadow-lg transform transition hover:scale-[1.02] active:scale-95"
                                >
                                    Pagar com Pix
                                </button>
                                <p className="text-xs text-center text-gray-500 mt-3">
                                    O checkout abre internamente com QR Code e copia e cola.
                                </p>
                            </div>
                        )}

                        {!isLate && !isCloseToDue && (
                            <p className="text-sm text-gray-400 italic">
                                O botão de pagamento aparecerá 5 dias antes do vencimento.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-8 bg-blue-50 border border-blue-100 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-start">
                    <AlertCircle className="w-5 h-5 text-blue-500 mr-3 mt-0.5 shrink-0" />
                    <div>
                        <h4 className="font-semibold text-blue-800 text-sm">Suporte</h4>
                        <p className="text-sm text-blue-600 mt-1">
                            Dúvidas sobre o plano ou pagamentos? Contate o suporte técnico no WhatsApp.
                        </p>
                    </div>
                </div>
                <a
                    href="https://wa.me/553598393707?text=Ol%C3%A1%2C+preciso+de+ajuda+com+meu+plano+no+sistema."
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors whitespace-nowrap"
                >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" className="mr-1">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    WhatsApp
                </a>
            </div>
        </div>
    );
};

export default AdminPlan;

