import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { AlertTriangle, Calendar, CheckCircle, ChevronDown, Clock3, CreditCard, Lock, RefreshCcw, Sparkles, User, XCircle } from 'lucide-react';

type PlanStatus = 'PAID' | 'OPEN' | 'OVERDUE' | 'SUSPENDED';

type PlanSnapshot = {
  plan_name: string;
  plan_price: number;
  next_plan_price: number | null;
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

type PlanManagementResponse = {
  success: boolean;
  message: string;
  current_due_date?: string | null;
  plan_status?: PlanStatus;
};

type PlanNextPriceResponse = {
  success: boolean;
  message: string;
  next_plan_price?: number | null;
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

const isoDateToMaskedDate = (value?: string | null) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return '';
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year.padStart(4, '0')}`;
};

const maskDateInput = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const parseMaskedDateToIso = (raw: string): { valid: boolean; iso: string | null } => {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: true, iso: null };

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length !== 8) return { valid: false, iso: null };

  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  const dt = new Date(year, month - 1, day);

  if (
    Number.isNaN(dt.getTime()) ||
    dt.getDate() !== day ||
    dt.getMonth() !== month - 1 ||
    dt.getFullYear() !== year
  ) {
    return { valid: false, iso: null };
  }

  return {
    valid: true,
    iso: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
};

const maskCurrencyInput = (raw: string) => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return formatCurrency(Number(digits) / 100);
};

const parseCurrencyInput = (raw: string) => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  return Number(digits) / 100;
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
  const [managementDueDateInput, setManagementDueDateInput] = useState('');
  const [managementStatus, setManagementStatus] = useState<PlanStatus>('OPEN');
  const [managementNote, setManagementNote] = useState('');
  const [managementLoading, setManagementLoading] = useState(false);
  const [managementMessage, setManagementMessage] = useState('');
  const [nextPlanPriceInput, setNextPlanPriceInput] = useState('');
  const [nextPlanPriceLoading, setNextPlanPriceLoading] = useState(false);
  const [nextPlanPriceMessage, setNextPlanPriceMessage] = useState('');

  const isLogged = Boolean(dashboard?.success);
  const snapshot = dashboard?.snapshot || null;
  const pendingItems = dashboard?.pending_items || [];
  const dueSoonItems = dashboard?.due_soon_items || [];
  const historyItems = dashboard?.history || [];

  useEffect(() => {
    if (!snapshot) return;
    setManagementDueDateInput(isoDateToMaskedDate(snapshot.current_due_date));
    setManagementStatus((snapshot.plan_status || 'OPEN') as PlanStatus);
    setNextPlanPriceInput(
      snapshot.next_plan_price == null || Number.isNaN(Number(snapshot.next_plan_price))
        ? ''
        : formatCurrency(Number(snapshot.next_plan_price))
    );
  }, [snapshot?.current_due_date, snapshot?.next_plan_price, snapshot?.plan_status]);

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
    setNextPlanPriceMessage('');

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

  const handleApplyManagementUpdate = async (forcedStatus?: PlanStatus) => {
    const resolvedUsername = username.trim();
    const resolvedPassword = password.trim();
    if (!resolvedUsername || !resolvedPassword) return;

    const parsedDueDate = parseMaskedDateToIso(managementDueDateInput);
    if (!parsedDueDate.valid) {
      setManagementMessage('Data invalida. Use o formato DD/MM/AAAA.');
      return;
    }

    setManagementLoading(true);
    setManagementMessage('');
    try {
      const nextStatus = forcedStatus || managementStatus;
      const { data, error } = await supabase.rpc('set_plan_management_state', {
        p_username: resolvedUsername,
        p_password: resolvedPassword,
        p_new_due_date: parsedDueDate.iso,
        p_new_status: nextStatus || null,
        p_note: managementNote.trim() || null,
      });

      if (error) {
        setManagementMessage(error.message || 'Falha ao aplicar ajustes administrativos.');
        return;
      }

      const response = (data || {}) as PlanManagementResponse;
      if (!response.success) {
        setManagementMessage(response.message || 'Nao foi possivel aplicar ajustes.');
        return;
      }

      setManagementMessage(response.message || 'Ajustes aplicados com sucesso.');
      setManagementNote('');
      await loadDashboard(resolvedUsername, resolvedPassword);
    } catch (err: any) {
      setManagementMessage(err?.message || 'Falha ao aplicar ajustes administrativos.');
    } finally {
      setManagementLoading(false);
    }
  };

  const handleSetNextPlanPrice = async () => {
    const resolvedUsername = username.trim();
    const resolvedPassword = password.trim();
    if (!resolvedUsername || !resolvedPassword) return;

    const parsedNextPrice = parseCurrencyInput(nextPlanPriceInput);
    if (parsedNextPrice == null || !Number.isFinite(parsedNextPrice) || parsedNextPrice < 0) {
      setNextPlanPriceMessage('Informe um valor valido (maior ou igual a zero).');
      return;
    }

    setNextPlanPriceLoading(true);
    setNextPlanPriceMessage('');
    try {
      const { data, error } = await supabase.rpc('set_plan_next_price', {
        p_username: resolvedUsername,
        p_password: resolvedPassword,
        p_next_price: parsedNextPrice,
        p_note: managementNote.trim() || null,
      });

      if (error) {
        setNextPlanPriceMessage(error.message || 'Falha ao salvar valor do proximo mes.');
        return;
      }

      const response = (data || {}) as PlanNextPriceResponse;
      if (!response.success) {
        setNextPlanPriceMessage(response.message || 'Nao foi possivel salvar valor do proximo mes.');
        return;
      }

      setNextPlanPriceMessage(response.message || 'Valor do proximo mes atualizado.');
      await loadDashboard(resolvedUsername, resolvedPassword);
    } catch (err: any) {
      setNextPlanPriceMessage(err?.message || 'Falha ao salvar valor do proximo mes.');
    } finally {
      setNextPlanPriceLoading(false);
    }
  };

  if (!isLogged) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.20),transparent_45%),linear-gradient(180deg,#f8fafc_0%,#e2e8f0_100%)]">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-16 -left-12 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="absolute top-1/3 -right-16 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl" />
          <div className="absolute -bottom-20 left-1/4 h-72 w-72 rounded-full bg-emerald-300/15 blur-3xl" />
        </div>

        <div className="relative min-h-screen flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200/70 bg-white/90 backdrop-blur-xl shadow-[0_28px_90px_rgba(15,23,42,0.18)] p-8">
            <div className="mb-8">
              <div className="h-16 w-16 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-lg">
                <Lock className="w-8 h-8" />
              </div>
              <p className="mt-5 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-700">
                <Sparkles className="w-4 h-4" />
                Acesso interno
              </p>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight mt-2">Painel /uaitech</h1>
              <p className="text-slate-500 mt-2 font-semibold text-sm">Autenticacao obrigatoria para gerenciar cobranca.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Usuario</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="appearance-none w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/70 text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-cyan-400 focus:bg-white"
                    placeholder="Digite o usuario"
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/70 text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-cyan-400 focus:bg-white"
                  placeholder="Digite a senha"
                />
              </div>

              {loginError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 inline-flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={!canTryLogin}
                className={`w-full py-3.5 rounded-xl font-black uppercase tracking-[0.16em] text-white transition ${
                  !canTryLogin
                    ? 'bg-slate-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-700 hover:brightness-110 active:scale-[0.99]'
                }`}
              >
                {loginLoading ? 'Verificando...' : 'Entrar no painel'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const statusUi = getStatusUi(snapshot?.plan_status || 'PAID');

  return (
    <div className="min-h-screen relative overflow-hidden bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.12),transparent_45%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-4 md:p-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 left-0 h-80 w-80 rounded-full bg-cyan-300/18 blur-3xl" />
        <div className="absolute top-1/3 right-0 h-72 w-72 rounded-full bg-indigo-300/12 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto space-y-6">
        <div className="rounded-[30px] border border-slate-200/80 bg-white/90 backdrop-blur-xl p-6 md:p-8 shadow-[0_28px_90px_rgba(15,23,42,0.14)] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-700">
              <Sparkles className="w-4 h-4" />
              Painel de pagamentos
            </p>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mt-2">Visao completa do plano</h1>
            <p className="text-sm text-slate-500 font-semibold mt-2">Sem componentes padrao, com controle total de cobranca.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => loadDashboard()}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-black text-xs uppercase tracking-[0.14em] hover:bg-slate-50 inline-flex items-center gap-2"
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
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-black text-xs uppercase tracking-[0.14em] hover:bg-slate-50"
            >
              Sair
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white/95 rounded-2xl border border-slate-200/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Status atual</p>
            <div className={`mt-3 inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-black uppercase tracking-wider ${statusUi.classes}`}>
              {statusUi.label}
            </div>
          </div>

          <div className="bg-white/95 rounded-2xl border border-slate-200/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Valor do plano</p>
            <p className="mt-3 text-2xl font-black text-slate-900">{formatCurrency(Number(snapshot?.plan_price || 0))}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">
              Proximo mes: {snapshot?.next_plan_price == null ? '-' : formatCurrency(Number(snapshot.next_plan_price))}
            </p>
          </div>

          <div className="bg-white/95 rounded-2xl border border-slate-200/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Vencimento atual</p>
            <p className="mt-3 text-xl font-black text-slate-900 inline-flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-700" />
              {formatDate(snapshot?.current_due_date)}
            </p>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {snapshot?.days_to_due == null ? '-' : `${snapshot.days_to_due} dia(s) para vencer`}
            </p>
          </div>

          <div className="bg-white/95 rounded-2xl border border-slate-200/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Ultimo pagamento</p>
            <p className="mt-3 text-sm font-black text-slate-900 inline-flex items-center gap-2">
              <Clock3 className="w-4 h-4 text-cyan-700" />
              {formatDateTime(snapshot?.plan_paid_at)}
            </p>
            <p className="mt-1 text-xs font-bold text-slate-500">Dia de vencimento: {snapshot?.plan_due_day ?? '-'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="bg-white/95 rounded-2xl border border-slate-200/80 p-5 xl:col-span-2 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-800">Historico de pagamentos</h2>
              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{historyItems.length} registro(s)</span>
            </div>

            {historyItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-400">
                Nenhum pagamento confirmado ainda.
              </div>
            ) : (
              <div className="overflow-auto rounded-xl border border-slate-100">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-left text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 bg-slate-50">
                      <th className="py-3 px-3">Confirmado em</th>
                      <th className="py-3 px-3">Valor</th>
                      <th className="py-3 px-3">Status anterior</th>
                      <th className="py-3 px-3">Vencimento anterior</th>
                      <th className="py-3 px-3">Novo vencimento</th>
                      <th className="py-3 px-3">Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyItems.map((item) => (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="py-3 px-3 font-bold text-slate-700">{formatDateTime(item.confirmed_at)}</td>
                        <td className="py-3 px-3 font-black text-slate-900">{formatCurrency(Number(item.paid_amount || 0))}</td>
                        <td className="py-3 px-3 text-slate-700">{item.previous_status || '-'}</td>
                        <td className="py-3 px-3 text-slate-700">{formatDate(item.previous_due_date)}</td>
                        <td className="py-3 px-3 text-slate-700">{formatDate(item.new_due_date)}</td>
                        <td className="py-3 px-3 text-slate-700">{item.actor_username || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-white/95 rounded-2xl border border-slate-200/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-800 mb-3">Pendencias</h2>
              {pendingItems.length === 0 ? (
                <p className="text-sm font-bold text-green-600 inline-flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Nenhuma pendencia no momento.
                </p>
              ) : (
                <div className="space-y-2">
                  {pendingItems.map((item, index) => (
                    <div key={`${item.title}-${index}`} className="rounded-xl border border-red-100 bg-red-50 p-3">
                      <p className="text-sm font-black text-red-700">{item.title}</p>
                      <p className="text-xs font-bold text-red-600 mt-1">Vencimento: {formatDate(item.due_date)}</p>
                      <p className="text-xs font-bold text-red-600">Valor: {formatCurrency(Number(item.amount || 0))}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white/95 rounded-2xl border border-slate-200/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-800 mb-3">A vencer</h2>
              {dueSoonItems.length === 0 ? (
                <p className="text-sm font-bold text-slate-500">Sem vencimento critico nos proximos dias.</p>
              ) : (
                <div className="space-y-2">
                  {dueSoonItems.map((item, index) => (
                    <div key={`${item.title}-${index}`} className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                      <p className="text-sm font-black text-amber-700">{item.title}</p>
                      <p className="text-xs font-bold text-amber-600 mt-1">Vence em: {formatDate(item.due_date)}</p>
                      <p className="text-xs font-bold text-amber-600">Faltam: {item.days_to_due ?? '-'} dia(s)</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white/95 rounded-2xl border border-slate-200/80 p-5 space-y-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-800">Acao de pagamento</h2>
              <p className="text-xs font-bold text-slate-500">
                Registre o pagamento do ciclo atual para atualizar vencimento e historico.
              </p>
              <textarea
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="Observacao (opcional)"
                className="appearance-none w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm font-semibold outline-none focus:border-cyan-400 focus:bg-white"
                rows={3}
              />
              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={paymentLoading}
                className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-[0.14em] text-white ${
                  paymentLoading ? 'bg-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-cyan-700 to-indigo-700 hover:brightness-110'
                }`}
              >
                {paymentLoading ? 'Processando...' : 'Confirmar pagamento'}
              </button>
              {paymentMessage && (
                <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-xs font-bold text-cyan-700 inline-flex items-start gap-2">
                  {paymentMessage.toLowerCase().includes('sucesso') ? (
                    <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  )}
                  <span>{paymentMessage}</span>
                </div>
              )}
            </div>

            <div className="bg-white/95 rounded-2xl border border-slate-200/80 p-5 space-y-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-800">Ajustes administrativos</h2>
              <p className="text-xs font-bold text-slate-500">
                Altere vencimento e status manualmente. Pode bloquear a loja imediatamente, se necessario.
              </p>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Data de vencimento</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={managementDueDateInput}
                  onChange={(e) => setManagementDueDateInput(maskDateInput(e.target.value))}
                  maxLength={10}
                  placeholder="DD/MM/AAAA"
                  className="appearance-none w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm font-bold outline-none focus:border-cyan-400 focus:bg-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Status do plano</label>
                <div className="relative">
                  <select
                    value={managementStatus}
                    onChange={(e) => setManagementStatus(e.target.value as PlanStatus)}
                    className="appearance-none w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 pr-10 text-sm font-bold outline-none focus:border-cyan-400 focus:bg-white"
                  >
                    <option value="PAID">PAID (Pago)</option>
                    <option value="OPEN">OPEN (Em aberto)</option>
                    <option value="OVERDUE">OVERDUE (Vencido)</option>
                    <option value="SUSPENDED">SUSPENDED (Bloqueado)</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <textarea
                value={managementNote}
                onChange={(e) => setManagementNote(e.target.value)}
                placeholder="Motivo/observacao (opcional)"
                className="appearance-none w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm font-semibold outline-none focus:border-cyan-400 focus:bg-white"
                rows={2}
              />

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                  Valor do proximo mes (mascara BRL)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={nextPlanPriceInput}
                  onChange={(e) => setNextPlanPriceInput(maskCurrencyInput(e.target.value))}
                  placeholder="R$ 0,00"
                  className="appearance-none w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm font-bold outline-none focus:border-cyan-400 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={handleSetNextPlanPrice}
                  disabled={nextPlanPriceLoading}
                  className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-[0.14em] text-white ${
                    nextPlanPriceLoading ? 'bg-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-slate-800 to-slate-700 hover:brightness-110'
                  }`}
                >
                  {nextPlanPriceLoading ? 'Salvando valor...' : 'Salvar valor do proximo mes'}
                </button>
                {nextPlanPriceMessage && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs font-bold text-slate-700">
                    {nextPlanPriceMessage}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleApplyManagementUpdate()}
                disabled={managementLoading}
                className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-[0.14em] text-white ${
                  managementLoading ? 'bg-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-700 to-blue-700 hover:brightness-110'
                }`}
              >
                {managementLoading ? 'Aplicando...' : 'Aplicar ajuste'}
              </button>

              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyManagementUpdate('SUSPENDED')}
                  disabled={managementLoading}
                  className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-[0.14em] text-white ${
                    managementLoading ? 'bg-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-red-700 to-rose-700 hover:brightness-110'
                  }`}
                >
                  Bloquear imediato
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyManagementUpdate('OPEN')}
                  disabled={managementLoading}
                  className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-[0.14em] text-white ${
                    managementLoading ? 'bg-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-emerald-700 to-green-700 hover:brightness-110'
                  }`}
                >
                  Desbloquear (em aberto)
                </button>
              </div>

              {managementMessage && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs font-bold text-indigo-700">
                  {managementMessage}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white/95 rounded-2xl border border-slate-200/80 p-4 md:p-5 flex items-start gap-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          <CreditCard className="w-5 h-5 text-cyan-700 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-black text-slate-800">Acesso interno Uaitech</p>
            <p className="text-xs font-bold text-slate-500 mt-1">
              Painel totalmente customizado com campo de valor em mascara de moeda (BRL).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicPlanPayment;
