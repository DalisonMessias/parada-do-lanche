import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { formatCurrency, supabase } from '../services/supabase';
import { OrderStatus, Profile } from '../types';
import { useFeedback } from './feedback/FeedbackProvider';
import CustomSelect, { CustomSelectOption } from './ui/CustomSelect';

type PeriodFilter = 'DAY' | 'WEEK' | 'MONTH' | 'CUSTOM';
type OrderTypeFilter = 'ALL' | 'MESA' | 'ENTREGA' | 'RETIRADA';
type StatusFilter = 'ALL' | OrderStatus;

type PerformanceKpis = {
  total_orders: number;
  total_revenue_cents: number;
  average_ticket_cents: number;
  cancelled_orders: number;
  revenue_orders: number;
};

type PreviousComparison = {
  from: string;
  to: string;
  kpis: PerformanceKpis;
  delta_orders_pct: number;
  delta_revenue_pct: number;
};

type DailyPoint = {
  date: string;
  label: string;
  orders: number;
  revenue_cents: number;
};

type TypeDistributionPoint = {
  type: 'MESA' | 'ENTREGA' | 'RETIRADA';
  label: string;
  orders: number;
  revenue_cents: number;
};

type TopProductPoint = {
  name_snapshot: string;
  qty: number;
  revenue_cents: number;
};

type TicketByTypePoint = {
  type: 'MESA' | 'ENTREGA' | 'RETIRADA';
  label: string;
  total_orders: number;
  revenue_orders: number;
  revenue_cents: number;
  average_ticket_cents: number;
};

type PerformancePayload = {
  period: PeriodFilter;
  from: string;
  to: string;
  filters: {
    order_type: OrderTypeFilter;
    order_status: StatusFilter;
  };
  kpis: PerformanceKpis;
  comparison_previous: PreviousComparison;
  series_daily: DailyPoint[];
  distribution_by_type: TypeDistributionPoint[];
  top_products: TopProductPoint[];
  ticket_by_type: TicketByTypePoint[];
};

interface AdminPerformanceProps {
  profile: Profile | null;
}

const PERIOD_OPTIONS: CustomSelectOption[] = [
  { value: 'DAY', label: 'Hoje' },
  { value: 'WEEK', label: 'Semana atual' },
  { value: 'MONTH', label: 'Mes atual' },
  { value: 'CUSTOM', label: 'Personalizado' },
];

const ORDER_TYPE_OPTIONS: CustomSelectOption[] = [
  { value: 'ALL', label: 'Todos os tipos' },
  { value: 'MESA', label: 'Mesa' },
  { value: 'ENTREGA', label: 'Entrega' },
  { value: 'RETIRADA', label: 'Retirada' },
];

const ORDER_STATUS_OPTIONS: CustomSelectOption[] = [
  { value: 'ALL', label: 'Todos os status' },
  { value: 'PENDING', label: 'Pendente' },
  { value: 'PREPARING', label: 'Em preparo' },
  { value: 'READY', label: 'Pronto' },
  { value: 'FINISHED', label: 'Finalizado' },
  { value: 'CANCELLED', label: 'Cancelado' },
];

const TYPE_COLORS: Record<TypeDistributionPoint['type'], string> = {
  MESA: '#111827',
  ENTREGA: '#2563eb',
  RETIRADA: '#f59e0b',
};

const emptyPayload: PerformancePayload = {
  period: 'DAY',
  from: '',
  to: '',
  filters: {
    order_type: 'ALL',
    order_status: 'ALL',
  },
  kpis: {
    total_orders: 0,
    total_revenue_cents: 0,
    average_ticket_cents: 0,
    cancelled_orders: 0,
    revenue_orders: 0,
  },
  comparison_previous: {
    from: '',
    to: '',
    kpis: {
      total_orders: 0,
      total_revenue_cents: 0,
      average_ticket_cents: 0,
      cancelled_orders: 0,
      revenue_orders: 0,
    },
    delta_orders_pct: 0,
    delta_revenue_pct: 0,
  },
  series_daily: [],
  distribution_by_type: [
    { type: 'MESA', label: 'Mesa', orders: 0, revenue_cents: 0 },
    { type: 'ENTREGA', label: 'Entrega', orders: 0, revenue_cents: 0 },
    { type: 'RETIRADA', label: 'Retirada', orders: 0, revenue_cents: 0 },
  ],
  top_products: [],
  ticket_by_type: [
    {
      type: 'MESA',
      label: 'Mesa',
      total_orders: 0,
      revenue_orders: 0,
      revenue_cents: 0,
      average_ticket_cents: 0,
    },
    {
      type: 'ENTREGA',
      label: 'Entrega',
      total_orders: 0,
      revenue_orders: 0,
      revenue_cents: 0,
      average_ticket_cents: 0,
    },
    {
      type: 'RETIRADA',
      label: 'Retirada',
      total_orders: 0,
      revenue_orders: 0,
      revenue_cents: 0,
      average_ticket_cents: 0,
    },
  ],
};

const normalizePayload = (raw: any): PerformancePayload => {
  const rawKpis = raw?.kpis || {};
  const rawPrevious = raw?.comparison_previous || {};
  const rawPreviousKpis = rawPrevious?.kpis || {};
  const normalizedDistribution = (raw?.distribution_by_type || []) as any[];
  const ensuredDistribution: TypeDistributionPoint[] = (['MESA', 'ENTREGA', 'RETIRADA'] as const).map((type) => {
    const found = normalizedDistribution.find((row) => row?.type === type) || {};
    return {
      type,
      label:
        type === 'MESA'
          ? 'Mesa'
          : type === 'ENTREGA'
            ? 'Entrega'
            : 'Retirada',
      orders: Number(found.orders || 0),
      revenue_cents: Number(found.revenue_cents || 0),
    };
  });
  const normalizedTicketByType = (raw?.ticket_by_type || []) as any[];
  const ensuredTicketByType: TicketByTypePoint[] = (['MESA', 'ENTREGA', 'RETIRADA'] as const).map((type) => {
    const found = normalizedTicketByType.find((row) => row?.type === type) || {};
    return {
      type,
      label:
        type === 'MESA'
          ? 'Mesa'
          : type === 'ENTREGA'
            ? 'Entrega'
            : 'Retirada',
      total_orders: Number(found.total_orders || 0),
      revenue_orders: Number(found.revenue_orders || 0),
      revenue_cents: Number(found.revenue_cents || 0),
      average_ticket_cents: Number(found.average_ticket_cents || 0),
    };
  });

  return {
    period: (raw?.period || 'DAY') as PeriodFilter,
    from: String(raw?.from || ''),
    to: String(raw?.to || ''),
    filters: {
      order_type: (raw?.filters?.order_type || 'ALL') as OrderTypeFilter,
      order_status: (raw?.filters?.order_status || 'ALL') as StatusFilter,
    },
    kpis: {
      total_orders: Number(rawKpis.total_orders || 0),
      total_revenue_cents: Number(rawKpis.total_revenue_cents || 0),
      average_ticket_cents: Number(rawKpis.average_ticket_cents || 0),
      cancelled_orders: Number(rawKpis.cancelled_orders || 0),
      revenue_orders: Number(rawKpis.revenue_orders || 0),
    },
    comparison_previous: {
      from: String(rawPrevious?.from || ''),
      to: String(rawPrevious?.to || ''),
      kpis: {
        total_orders: Number(rawPreviousKpis.total_orders || 0),
        total_revenue_cents: Number(rawPreviousKpis.total_revenue_cents || 0),
        average_ticket_cents: Number(rawPreviousKpis.average_ticket_cents || 0),
        cancelled_orders: Number(rawPreviousKpis.cancelled_orders || 0),
        revenue_orders: Number(rawPreviousKpis.revenue_orders || 0),
      },
      delta_orders_pct: Number(rawPrevious?.delta_orders_pct || 0),
      delta_revenue_pct: Number(rawPrevious?.delta_revenue_pct || 0),
    },
    series_daily: ((raw?.series_daily || []) as any[]).map((row) => ({
      date: String(row?.date || ''),
      label: String(row?.label || ''),
      orders: Number(row?.orders || 0),
      revenue_cents: Number(row?.revenue_cents || 0),
    })),
    distribution_by_type: ensuredDistribution,
    top_products: ((raw?.top_products || []) as any[]).map((row) => ({
      name_snapshot: String(row?.name_snapshot || 'Item'),
      qty: Number(row?.qty || 0),
      revenue_cents: Number(row?.revenue_cents || 0),
    })),
    ticket_by_type: ensuredTicketByType,
  };
};

const getTodayInputDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDelta = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = Math.abs(safe).toFixed(1);
  if (safe > 0) return `+${rounded}%`;
  if (safe < 0) return `-${rounded}%`;
  return '0.0%';
};

const AdminPerformance: React.FC<AdminPerformanceProps> = ({ profile }) => {
  const { toast } = useFeedback();
  const [period, setPeriod] = useState<PeriodFilter>('DAY');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState(getTodayInputDate());
  const [orderType, setOrderType] = useState<OrderTypeFilter>('ALL');
  const [orderStatus, setOrderStatus] = useState<StatusFilter>('ALL');
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<PerformancePayload>(emptyPayload);
  const loadSeqRef = useRef(0);
  const customRangeInvalid = period === 'CUSTOM' && !!customFrom && !!customTo && customFrom > customTo;

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    if (customRangeInvalid) return;

    const currentLoad = ++loadSeqRef.current;
    setLoading(true);

    const { data, error } = await supabase.rpc('get_performance_dashboard', {
      p_actor_profile_id: profile.id,
      p_period: period,
      p_from: period === 'CUSTOM' ? (customFrom || null) : null,
      p_to: period === 'CUSTOM' ? (customTo || null) : null,
      p_order_type: orderType,
      p_order_status: orderStatus,
    });

    if (currentLoad !== loadSeqRef.current) return;

    if (error) {
      setLoading(false);
      toast(`Erro ao carregar desempenho: ${error.message}`, 'error');
      return;
    }

    setPayload(normalizePayload(data));
    setLoading(false);
  }, [profile?.id, customRangeInvalid, period, customFrom, customTo, orderType, orderStatus, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const donutData = useMemo(
    () =>
      payload.distribution_by_type.map((row) => ({
        ...row,
        value: row.orders,
      })),
    [payload.distribution_by_type]
  );
  const previousLabel =
    payload.comparison_previous.from && payload.comparison_previous.to
      ? `${payload.comparison_previous.from} ate ${payload.comparison_previous.to}`
      : '-';
  const ordersDelta = payload.comparison_previous.delta_orders_pct;
  const revenueDelta = payload.comparison_previous.delta_revenue_pct;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-[28px] p-6">
        <h2 className="text-3xl font-black uppercase tracking-tighter text-gray-900">Desempenho</h2>
        <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-2">
          Analise semanal e mensal de pedidos e faturamento
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-4 grid md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Periodo</label>
          <CustomSelect
            value={period}
            onChange={(nextValue) => setPeriod((nextValue as PeriodFilter) || 'DAY')}
            options={PERIOD_OPTIONS}
            buttonClassName="p-3 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Tipo de pedido</label>
          <CustomSelect
            value={orderType}
            onChange={(nextValue) => setOrderType((nextValue as OrderTypeFilter) || 'ALL')}
            options={ORDER_TYPE_OPTIONS}
            buttonClassName="p-3 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Status</label>
          <CustomSelect
            value={orderStatus}
            onChange={(nextValue) => setOrderStatus((nextValue as StatusFilter) || 'ALL')}
            options={ORDER_STATUS_OPTIONS}
            buttonClassName="p-3 text-sm"
          />
        </div>
        {period === 'CUSTOM' && (
          <>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Data inicial</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full p-3 rounded-xl border border-gray-200 font-bold bg-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Data final</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full p-3 rounded-xl border border-gray-200 font-bold bg-white"
              />
            </div>
          </>
        )}
      </div>

      {customRangeInvalid && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
          <p className="text-[10px] text-red-700 font-black uppercase tracking-widest">
            A data inicial nao pode ser maior que a data final.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Total de pedidos</p>
          <p className="text-3xl font-black text-gray-900 tracking-tighter">{payload.kpis.total_orders}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Faturamento</p>
          <p className="text-3xl font-black text-gray-900 tracking-tighter">{formatCurrency(payload.kpis.total_revenue_cents)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Ticket medio</p>
          <p className="text-3xl font-black text-gray-900 tracking-tighter">{formatCurrency(payload.kpis.average_ticket_cents)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Pedidos cancelados</p>
          <p className="text-3xl font-black text-red-600 tracking-tighter">{payload.kpis.cancelled_orders}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Comparativo vs periodo anterior</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{previousLabel}</p>
        </div>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Pedidos</p>
            <p className={`text-lg font-black tracking-tight ${ordersDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatDelta(ordersDelta)}
            </p>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-1">
              Antes: {payload.comparison_previous.kpis.total_orders}
            </p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Faturamento</p>
            <p className={`text-lg font-black tracking-tight ${revenueDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatDelta(revenueDelta)}
            </p>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-1">
              Antes: {formatCurrency(payload.comparison_previous.kpis.total_revenue_cents)}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Evolucao de pedidos e faturamento</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            {payload.from && payload.to ? `${payload.from} ate ${payload.to}` : '-'}
          </p>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={payload.series_daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700, fill: '#6b7280' }} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fontWeight: 700, fill: '#6b7280' }}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fontWeight: 700, fill: '#6b7280' }}
                tickFormatter={(value) => `R$ ${Math.round(Number(value || 0) / 100)}`}
              />
              <Tooltip
                formatter={(value: any, name: any) => {
                  if (name === 'Faturamento') return [formatCurrency(Number(value || 0)), name];
                  return [Number(value || 0), name];
                }}
              />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="orders" name="Pedidos" stroke="#111827" strokeWidth={3} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="revenue_cents" name="Faturamento" stroke="#16a34a" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Comparacao diaria</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={payload.series_daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 11, fontWeight: 700, fill: '#6b7280' }} />
                <Tooltip
                  formatter={(value: any, name: any) => {
                    if (name === 'Faturamento') return [formatCurrency(Number(value || 0)), name];
                    return [Number(value || 0), name];
                  }}
                />
                <Legend />
                <Bar dataKey="orders" name="Pedidos" fill="#111827" radius={[8, 8, 0, 0]} />
                <Bar dataKey="revenue_cents" name="Faturamento" fill="#22c55e" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Distribuicao por tipo</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={3}
                  label={({ label, percent }) => `${label}: ${(Number(percent || 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {donutData.map((entry) => (
                    <Cell
                      key={`type-${entry.type}`}
                      fill={TYPE_COLORS[entry.type]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any, _name: any, row: any) => {
                    const payloadRow = row?.payload as TypeDistributionPoint | undefined;
                    const revenue = payloadRow?.revenue_cents || 0;
                    return [`${Number(value || 0)} pedido(s) - ${formatCurrency(revenue)}`, payloadRow?.label || 'Tipo'];
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Top produtos (faturamento)</p>
          <div className="space-y-2">
            {payload.top_products.length === 0 && (
              <p className="text-sm font-bold text-gray-400">Sem dados no periodo atual.</p>
            )}
            {payload.top_products.map((product, index) => (
              <div
                key={`${product.name_snapshot}-${index}`}
                className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-black text-gray-800 truncate">
                    {index + 1}. {product.name_snapshot}
                  </p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-1">
                    {product.qty} item(ns)
                  </p>
                </div>
                <p className="text-sm font-black text-gray-900">{formatCurrency(product.revenue_cents)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Ticket medio por tipo</p>
          <div className="space-y-2">
            {payload.ticket_by_type.map((row) => (
              <div
                key={`ticket-${row.type}`}
                className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-black text-gray-800">{row.label}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-1">
                    {row.total_orders} pedidos | {row.revenue_orders} com faturamento
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-gray-900">{formatCurrency(row.average_ticket_cents)}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-1">
                    {formatCurrency(row.revenue_cents)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Atualizando dados...</p>
        </div>
      )}
    </div>
  );
};

export default AdminPerformance;
