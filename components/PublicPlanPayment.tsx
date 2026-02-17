import React, { useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { AlertTriangle, Calendar, CheckCircle, CreditCard, Lock, RefreshCcw, User, XCircle } from 'lucide-react';

type PlanStatus = 'PAID' | 'OPEN' | 'OVERDUE' | 'SUSPENDED';

type PlanSnapshot = {
  plan_name: string;
  plan_price: number;
  plan_due_day: number;
  plan_status: PlanStatus;
  current_due_date: string | null;
  plan_paid_at: string | null;
  days_to_due: number | null;
  amount_pending: number;
  is_overdue: boolean;
  is_due_soon: boolean;
};

type PlanTodoItem = {
  title: string;
  due_date: string | null;
  status: PlanStatus;
  amount: number;
  days_to_due: number | null;
};

type PlanPaymentHistoryItem = {
  id: string;
  confirmed_at: string;
  actor_username: string;
  paid_amount: number;
  previous_status: string;
  previous_due_date: string | null;
  new_due_date: string | null;
  payload?: Record<string, any> | null;
};

type PlanDashboardResponse = {
  success: boolean;
  message: string;
  snapshot?: PlanSnapshot;
  pending_items?: PlanTodoItem[];
  due_soon_items?: PlanTodoItem[];
  history?: PlanPaymentHistoryItem[];
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('pt-BR');
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString('pt-BR');
};

const getStatusUi = (status: PlanStatus) => {
  if (status === 'PAID') return { label: 'Pago', classes: 'bg-green-100 text-green-700 border-green-200' };
  if (status === 'OPEN') return { label: 'Em aberto', classes: 'bg-amber-100 text-amber-700 border-amber-200' };
  if (status === 'OVERDUE') return { label: 'Vencido', classes: 'bg-red-100 text-red-700 border-red-200' };
  return { label: 'Suspenso', classes: 'bg-gray-100 text-gray-700 border-gray-200' };
};

const PublicPlanPayment: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [dashboard, setDashboard] = useState<PlanDashboardResponse | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  const isLogged = Boolean(dashboard?.success);
  const snapshot = dashboard?.snapshot || null;
  const pendingItems = dashboard?.pending_items || [];
  const dueSoonItems = dashboard?.due_soon_items || [];
  const historyItems = dashboard?.history || [];

  const canTryLogin = useMemo(
    () => username.trim().length > 0 && password.trim().length > 0 && !loginLoading,
    [username, password, loginLoading]
  );

  const loadDashboard = async (nextUsername?: string, nextPassword?: string) => {
    const resolvedUsername = (nextUsername ?? username).trim();
    const resolvedPassword = (nextPassword ?? password).trim();
    if (!resolvedUsername || !resolvedPassword) return;

    setLoginLoading(true);
    setLoginError('');
    setPaymentMessage('');

    try {
      const { data, error } = await supabase.rpc('get_plan_payment_dashboard', {
        p_username: resolvedUsername,
        p_password: resolvedPassword,
      });

      if (error) {
        setDashboard(null);
        setLoginError(error.message || 'Falha ao carregar painel de pagamento.');
        return;
      }

      const response = (data || {}) as PlanDashboardResponse;
      if (!response.success) {
        setDashboard(null);
        setLoginError(response.message || 'Usuario ou senha invalidos.');
        return;
      }

      setDashboard(response);
    } catch (err: any) {
      setDashboard(null);
      setLoginError(err?.message || 'Falha ao carregar painel de pagamento.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await loadDashboard();
  };

  const handleConfirmPayment = async () => {
    const resolvedUsername = username.trim();
    const resolvedPassword = password.trim();
    if (!resolvedUsername || !resolvedPassword) return;

    setPaymentLoading(true);
    setPaymentMessage('');
    try {
      const { data, error } = await supabase.rpc('confirm_plan_payment', {
        p_username: resolvedUsername,
        p_password: resolvedPassword,
        p_note: paymentNote.trim() || null,
      });

      if (error) {
        setPaymentMessage(error.message || 'Falha ao confirmar pagamento.');
        return;
      }

      const response = (data || {}) as PlanDashboardResponse & { new_due_date?: string };
      if (!response.success) {
        setPaymentMessage(response.message || 'Nao foi possivel confirmar pagamento.');
        return;
      }

      setPaymentMessage(response.message || 'Pagamento confirmado com sucesso.');
      setPaymentNote('');
      await loadDashboard(resolvedUsername, resolvedPassword);
    } catch (err: any) {
      setPaymentMessage(err?.message || 'Falha ao confirmar pagamento.');
    } finally {
      setPaymentLoading(false);
    }
  };

  if (!isLogged) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
          <div className="text-center mb-8">
            <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Painel de Pagamentos</h1>
            <p className="text-gray-500 mt-2">Area administrativa restrita</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
              <div className="relative">
                <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="Digite o usuario..."
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                placeholder="Digite a senha..."
              />
            </div>

            {loginError && (
              <div className="bg-red-50 text-red-700 p-3 rounded-lg flex items-center text-sm">
                <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={!canTryLogin}
              className={`w-full py-3 px-4 rounded-lg font-bold text-white shadow-md transition ${
                !canTryLogin ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99]'
              }`}
            >
              {loginLoading ? 'Verificando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const statusUi = getStatusUi(snapshot?.plan_status || 'PAID');

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Painel de pagamentos</p>
            <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight mt-1">Visao completa do plano</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadDashboard()}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-bold text-sm hover:bg-gray-50 inline-flex items-center gap-2"
            >
              <RefreshCcw className="w-4 h-4" />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => {
                setDashboard(null);
                setLoginError('');
                setPaymentMessage('');
                setPassword('');
              }}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-bold text-sm hover:bg-gray-50"
            >
              Sair
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Status atual</p>
            <div className={`mt-3 inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-black uppercase tracking-wider ${statusUi.classes}`}>
              {statusUi.label}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Valor do plano</p>
            <p className="mt-3 text-2xl font-black text-gray-900">{formatCurrency(Number(snapshot?.plan_price || 0))}</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Vencimento atual</p>
            <p className="mt-3 text-xl font-black text-gray-900 inline-flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-500" />
              {formatDate(snapshot?.current_due_date)}
            </p>
            <p className="mt-1 text-xs font-bold text-gray-500">
              {snapshot?.days_to_due == null ? '-' : `${snapshot.days_to_due} dia(s) para vencer`}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Ultimo pagamento</p>
            <p className="mt-3 text-sm font-black text-gray-900">{formatDateTime(snapshot?.plan_paid_at)}</p>
            <p className="mt-1 text-xs font-bold text-gray-500">Dia de vencimento: {snapshot?.plan_due_day ?? '-'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 xl:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black uppercase tracking-wider text-gray-800">Historico de pagamentos</h2>
              <span className="text-xs font-bold text-gray-500">{historyItems.length} registro(s)</span>
            </div>

            {historyItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm font-bold text-gray-400">
                Nenhum pagamento confirmado ainda.
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-left text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100">
                      <th className="py-2 pr-3">Confirmado em</th>
                      <th className="py-2 pr-3">Valor</th>
                      <th className="py-2 pr-3">Status anterior</th>
                      <th className="py-2 pr-3">Vencimento anterior</th>
                      <th className="py-2 pr-3">Novo vencimento</th>
                      <th className="py-2 pr-3">Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyItems.map((item) => (
                      <tr key={item.id} className="border-b border-gray-50 last:border-b-0">
                        <td className="py-2 pr-3 font-bold text-gray-700">{formatDateTime(item.confirmed_at)}</td>
                        <td className="py-2 pr-3 font-black text-gray-900">{formatCurrency(Number(item.paid_amount || 0))}</td>
                        <td className="py-2 pr-3 text-gray-700">{item.previous_status || '-'}</td>
                        <td className="py-2 pr-3 text-gray-700">{formatDate(item.previous_due_date)}</td>
                        <td className="py-2 pr-3 text-gray-700">{formatDate(item.new_due_date)}</td>
                        <td className="py-2 pr-3 text-gray-700">{item.actor_username || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="text-sm font-black uppercase tracking-wider text-gray-800 mb-3">Pendencias</h2>
              {pendingItems.length === 0 ? (
                <p className="text-sm font-bold text-green-600 inline-flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Nenhuma pendencia no momento.
                </p>
              ) : (
                <div className="space-y-2">
                  {pendingItems.map((item, index) => (
                    <div key={`${item.title}-${index}`} className="rounded-lg border border-red-100 bg-red-50 p-3">
                      <p className="text-sm font-black text-red-700">{item.title}</p>
                      <p className="text-xs font-bold text-red-600 mt-1">Vencimento: {formatDate(item.due_date)}</p>
                      <p className="text-xs font-bold text-red-600">Valor: {formatCurrency(Number(item.amount || 0))}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="text-sm font-black uppercase tracking-wider text-gray-800 mb-3">A vencer</h2>
              {dueSoonItems.length === 0 ? (
                <p className="text-sm font-bold text-gray-500">Sem vencimento critico nos proximos dias.</p>
              ) : (
                <div className="space-y-2">
                  {dueSoonItems.map((item, index) => (
                    <div key={`${item.title}-${index}`} className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                      <p className="text-sm font-black text-amber-700">{item.title}</p>
                      <p className="text-xs font-bold text-amber-600 mt-1">Vence em: {formatDate(item.due_date)}</p>
                      <p className="text-xs font-bold text-amber-600">Faltam: {item.days_to_due ?? '-'} dia(s)</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
              <h2 className="text-sm font-black uppercase tracking-wider text-gray-800">Acao de pagamento</h2>
              <p className="text-xs font-bold text-gray-500">
                Registre o pagamento do ciclo atual para atualizar vencimento e historico.
              </p>
              <textarea
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="Observacao (opcional)"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                rows={3}
              />
              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={paymentLoading}
                className={`w-full py-3 rounded-lg text-sm font-black uppercase tracking-wider text-white ${
                  paymentLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {paymentLoading ? 'Processando...' : 'Confirmar pagamento'}
              </button>
              {paymentMessage && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs font-bold text-blue-700 inline-flex items-start gap-2">
                  {paymentMessage.toLowerCase().includes('sucesso') ? (
                    <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  )}
                  <span>{paymentMessage}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-5 flex items-start gap-3">
          <CreditCard className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-black text-gray-800">Acesso interno Uaitech</p>
            <p className="text-xs font-bold text-gray-500 mt-1">
              Este painel mostra historico completo de pagamentos, pendencias e vencimentos para controle financeiro.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicPlanPayment;

