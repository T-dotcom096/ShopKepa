import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ComposedChart
} from 'recharts';
import { Sale, Expense, Product } from './types';
import { formatCurrency } from './utils';

interface RechartsDashboardProps {
  sales: Sale[];
  expenses: Expense[];
  products?: Product[];
  currency: string;
  storeName: string;
  lowStockThreshold?: number;
  onNavigate: (route: string) => void;
  onOpenDebtReminder?: () => void;
  onQuickRestock?: (productId: string) => void;
}

type TimeHorizon = 'week' | 'month' | 'year';
type ChartStyle = 'composed' | 'area' | 'bar';

const CATEGORY_COLORS: Record<string, string> = {
  'Generator Fuel & Power': '#f97316',
  'Shop Rent': '#3b82f6',
  'Delivery & Logistics': '#06b6d4',
  'Staff Wages & Salaries': '#10b981',
  'Inventory Procurement': '#6366f1',
  'Packaging & Bags': '#8b5cf6',
  'Market Levies & Taxes': '#ec4899',
  'Maintenance & Repairs': '#eab308',
  'Marketing & Ads': '#14b8a6',
  'General Overheads': '#94a3b8'
};

const DEFAULT_COLORS = ['#f97316', '#3b82f6', '#06b6d4', '#8b5cf6', '#ec4899', '#eab308', '#10b981', '#6366f1'];

export const RechartsDashboard: React.FC<RechartsDashboardProps> = ({
  sales,
  expenses,
  products = [],
  currency,
  storeName,
  lowStockThreshold = 5,
  onNavigate,
  onOpenDebtReminder,
  onQuickRestock,
}) => {
  const [timeHorizon, setTimeHorizon] = useState<TimeHorizon>('month');
  const [chartStyle, setChartStyle] = useState<ChartStyle>('composed');

  // Inventory & Stock metrics
  const inventoryStats = useMemo(() => {
    const list = products || [];
    const totalUnits = list.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
    const lowStockItems = list.filter((p) => p.stock > 0 && p.stock <= lowStockThreshold);
    const outOfStockItems = list.filter((p) => p.stock <= 0);
    return {
      totalProducts: list.length,
      totalUnits,
      lowStockCount: lowStockItems.length,
      outOfStockCount: outOfStockItems.length,
      lowStockItems,
      outOfStockItems,
    };
  }, [products, lowStockThreshold]);

  // Overall financial metrics
  const totals = useMemo(() => {
    const totalSalesCash = sales
      .filter((s) => s.status === 'completed')
      .reduce((sum, s) => sum + s.totalAmount, 0);

    const totalUnpaidDebts = sales
      .filter((s) => s.status === 'pending')
      .reduce((sum, s) => sum + s.totalAmount, 0);

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const netProfit = totalSalesCash - totalExpenses;
    const profitMargin = totalSalesCash > 0 ? ((netProfit / totalSalesCash) * 100).toFixed(1) : '0';
    const expenseRatio = totalSalesCash > 0 ? ((totalExpenses / totalSalesCash) * 100).toFixed(1) : '0';

    return {
      totalSalesCash,
      totalUnpaidDebts,
      totalExpenses,
      netProfit,
      profitMargin,
      expenseRatio,
      isProfitable: netProfit >= 0,
      completedSalesCount: sales.filter((s) => s.status === 'completed').length,
      expensesCount: expenses.length,
      pendingDebtorsCount: sales.filter((s) => s.status === 'pending').length
    };
  }, [sales, expenses]);

  // Aggregate data points based on selected timeHorizon
  const timelineData = useMemo(() => {
    const now = new Date();

    if (timeHorizon === 'week') {
      // Last 7 days
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const result: { name: string; fullDate: string; sales: number; expenses: number; netProfit: number }[] = [];

      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dayKey = d.toISOString().split('T')[0];
        const dayLabel = days[d.getDay()] + ' ' + (d.getMonth() + 1) + '/' + d.getDate();

        const daySales = sales
          .filter((s) => s.status === 'completed' && (s.createdAt || '').startsWith(dayKey))
          .reduce((sum, s) => sum + s.totalAmount, 0);

        const dayExpenses = expenses
          .filter((e) => ((e.date || e.createdAt) || '').startsWith(dayKey))
          .reduce((sum, e) => sum + e.amount, 0);

        result.push({
          name: dayLabel,
          fullDate: dayKey,
          sales: daySales,
          expenses: dayExpenses,
          netProfit: daySales - dayExpenses
        });
      }
      return result;
    } else if (timeHorizon === 'month') {
      // Last 4 weeks
      const result: { name: string; sales: number; expenses: number; netProfit: number }[] = [];
      for (let w = 3; w >= 0; w--) {
        const startDay = new Date(now.getTime() - (w + 1) * 7 * 86400000);
        const endDay = new Date(now.getTime() - w * 7 * 86400000);
        const label = w === 0 ? 'This Week' : `${w} Wk${w > 1 ? 's' : ''} Ago`;

        const periodSales = sales
          .filter((s) => {
            if (s.status !== 'completed') return false;
            const t = new Date(s.createdAt).getTime();
            return t >= startDay.getTime() && t <= endDay.getTime();
          })
          .reduce((sum, s) => sum + s.totalAmount, 0);

        const periodExpenses = expenses
          .filter((e) => {
            const t = new Date(e.date || e.createdAt).getTime();
            return t >= startDay.getTime() && t <= endDay.getTime();
          })
          .reduce((sum, e) => sum + e.amount, 0);

        result.push({
          name: label,
          sales: periodSales,
          expenses: periodExpenses,
          netProfit: periodSales - periodExpenses
        });
      }
      return result;
    } else {
      // Last 12 months
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const result: { name: string; sales: number; expenses: number; netProfit: number }[] = [];

      for (let m = 11; m >= 0; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const monthYearKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = `${monthNames[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;

        const monthSales = sales
          .filter((s) => s.status === 'completed' && (s.createdAt || '').startsWith(monthYearKey))
          .reduce((sum, s) => sum + s.totalAmount, 0);

        const monthExpenses = expenses
          .filter((e) => ((e.date || e.createdAt) || '').startsWith(monthYearKey))
          .reduce((sum, e) => sum + e.amount, 0);

        result.push({
          name: label,
          sales: monthSales,
          expenses: monthExpenses,
          netProfit: monthSales - monthExpenses
        });
      }
      return result;
    }
  }, [sales, expenses, timeHorizon]);

  // Expenses by Category for Donut Chart
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      const cat = e.category || 'General Overheads';
      map[cat] = (map[cat] || 0) + e.amount;
    });

    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  // Custom Dark Tooltip Component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const sVal = payload.find((p: any) => p.dataKey === 'sales')?.value ?? 0;
      const eVal = payload.find((p: any) => p.dataKey === 'expenses')?.value ?? 0;
      const profitVal = sVal - eVal;
      const isProfitable = profitVal >= 0;

      return (
        <div
          style={{
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '12px 14px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            fontSize: '12px',
            color: '#f8fafc',
            minWidth: '160px',
            maxWidth: 'calc(100vw - 32px)'
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '6px', color: '#94a3b8' }}>{label}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: '#10b981', marginBottom: '3px' }}>
            <span>● Total Sales:</span>
            <span style={{ fontWeight: 700 }}>{formatCurrency(sVal, currency)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: '#f97316', marginBottom: '6px' }}>
            <span>● Shop Expenses:</span>
            <span style={{ fontWeight: 700 }}>{formatCurrency(eVal, currency)}</span>
          </div>
          <div
            style={{
              borderTop: '1px solid #1e293b',
              paddingTop: '6px',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              color: isProfitable ? '#34d399' : '#fb7185'
            }}
          >
            <span>Take-Home Profit:</span>
            <span style={{ fontWeight: 800 }}>
              {isProfitable ? '+' : ''}
              {formatCurrency(profitVal, currency)}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Row */}
      <div className="page-header-row">
        <div className="page-title-group">
          <h1>📊 Performance Dashboard (Recharts Visualizer)</h1>
          <p>
            Summarize sales cash, store overheads, and real take-home profit for <strong>{storeName}</strong>.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onNavigate('#/inventory')}
            title="Manage stock catalog and view stock alerts"
          >
            📦 Inventory ({inventoryStats.totalProducts})
          </button>
          <button
            type="button"
            className="btn btn-success btn-sm"
            onClick={() => onNavigate('#/new-sale')}
          >
            + Record Sale
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ borderColor: 'rgba(249,115,22,0.4)', color: '#fb923c' }}
            onClick={() => onNavigate('#/new-expense')}
          >
            + Record Expense
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onNavigate('#/analytics')}
          >
            📈 Detailed Reports
          </button>
        </div>
      </div>

      {/* KPI Headline Cards */}
      <section className="metrics-grid" aria-label="Executive Financial Summary">
        {/* Total Sales */}
        <div className="metric-card card-revenue">
          <div className="metric-header">
            <span className="metric-label">Total Sales Cash</span>
            <span className="metric-icon">💰</span>
          </div>
          <div className="metric-value text-emerald">{formatCurrency(totals.totalSalesCash, currency)}</div>
          <div className="metric-subtext">Collected from {totals.completedSalesCount} paid sales</div>
        </div>

        {/* Total Expenses */}
        <div className="metric-card metric-card-expense">
          <div className="metric-header">
            <span className="metric-label">Shop Expenses & Bills</span>
            <span className="metric-icon" style={{ color: '#fb923c' }}>💸</span>
          </div>
          <div className="metric-value" style={{ color: '#fb923c' }}>
            {formatCurrency(totals.totalExpenses, currency)}
          </div>
          <div className="metric-subtext">Across {totals.expensesCount} logged overhead bills</div>
        </div>

        {/* Net Take-Home Profit */}
        <div className={`metric-card ${totals.isProfitable ? 'metric-card-profit' : 'metric-card-loss'}`}>
          <div className="metric-header">
            <span className="metric-label">Take-Home Profit</span>
            <span className="metric-icon">{totals.isProfitable ? '📈' : '📉'}</span>
          </div>
          <div className={`metric-value ${totals.isProfitable ? 'text-emerald' : 'text-rose'}`}>
            {totals.isProfitable ? '+' : ''}
            {formatCurrency(totals.netProfit, currency)}
          </div>
          <div className="metric-subtext">
            Profit Margin: {totals.profitMargin}% • Expense Ratio: {totals.expenseRatio}%
          </div>
        </div>

        {/* Customer Debts */}
        <div
          className="metric-card card-debt"
          onClick={() => {
            if (onOpenDebtReminder) onOpenDebtReminder();
            else onNavigate('#/sales');
          }}
          style={{ cursor: 'pointer' }}
          title="Click to view debtors and generate WhatsApp reminders"
        >
          <div className="metric-header">
            <span className="metric-label">Money Customers Owe</span>
            <span className="metric-icon">⏳</span>
          </div>
          <div className="metric-value text-rose">{formatCurrency(totals.totalUnpaidDebts, currency)}</div>
          <div className="metric-subtext">{totals.pendingDebtorsCount} customers yet to pay • Tap for WhatsApp</div>
        </div>
      </section>

      {/* Main Interactive Recharts Card */}
      <div className="chart-card">
        <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              📈 Sales vs. Expenses Performance Trends
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Dynamic comparison of cash in (Sales) versus cash out (Expenses) built with Recharts.
            </p>
          </div>

          {/* Controls: Time Horizon & Chart Style */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', maxWidth: '100%' }}>
            {/* Time Horizon Toggle */}
            <div style={{ display: 'flex', flexWrap: 'wrap', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)', padding: '3px', border: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => setTimeHorizon('week')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: timeHorizon === 'week' ? '#10b981' : 'transparent',
                  color: timeHorizon === 'week' ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease'
                }}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setTimeHorizon('month')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: timeHorizon === 'month' ? '#10b981' : 'transparent',
                  color: timeHorizon === 'month' ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease'
                }}
              >
                4 Weeks
              </button>
              <button
                type="button"
                onClick={() => setTimeHorizon('year')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: timeHorizon === 'year' ? '#10b981' : 'transparent',
                  color: timeHorizon === 'year' ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease'
                }}
              >
                12 Months
              </button>
            </div>

            {/* Chart Style Toggle */}
            <div style={{ display: 'flex', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)', padding: '3px', border: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => setChartStyle('composed')}
                title="Bar & Profit Line"
                style={{
                  padding: '5px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: chartStyle === 'composed' ? '#3b82f6' : 'transparent',
                  color: chartStyle === 'composed' ? '#ffffff' : 'var(--text-secondary)'
                }}
              >
                Bar + Line
              </button>
              <button
                type="button"
                onClick={() => setChartStyle('area')}
                title="Smooth Area Curves"
                style={{
                  padding: '5px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: chartStyle === 'area' ? '#3b82f6' : 'transparent',
                  color: chartStyle === 'area' ? '#ffffff' : 'var(--text-secondary)'
                }}
              >
                Area
              </button>
              <button
                type="button"
                onClick={() => setChartStyle('bar')}
                title="Side by Side Bars"
                style={{
                  padding: '5px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: chartStyle === 'bar' ? '#3b82f6' : 'transparent',
                  color: chartStyle === 'bar' ? '#ffffff' : 'var(--text-secondary)'
                }}
              >
                Side Bars
              </button>
            </div>
          </div>
        </div>

        {/* Recharts SVG Chart Area */}
        <div className="recharts-stage-box">
          <ResponsiveContainer width="100%" height="100%">
            {chartStyle === 'composed' ? (
              <ComposedChart data={timelineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.3} />
                  </linearGradient>
                  <linearGradient id="expensesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#f97316" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#64748b"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }}
                  formatter={(val) => (val === 'sales' ? 'Total Sales (Cash)' : val === 'expenses' ? 'Shop Expenses' : 'Take-Home Profit')}
                />
                <Bar dataKey="sales" name="sales" fill="url(#salesGrad)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="expenses" name="expenses" fill="url(#expensesGrad)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Line
                  type="monotone"
                  dataKey="netProfit"
                  name="netProfit"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#38bdf8' }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            ) : chartStyle === 'area' ? (
              <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expensesArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#64748b"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }}
                  formatter={(val) => (val === 'sales' ? 'Total Sales (Cash)' : 'Shop Expenses')}
                />
                <Area type="monotone" dataKey="sales" stroke="#10b981" fillOpacity={1} fill="url(#salesArea)" strokeWidth={2} />
                <Area type="monotone" dataKey="expenses" stroke="#f97316" fillOpacity={1} fill="url(#expensesArea)" strokeWidth={2} />
              </AreaChart>
            ) : (
              <BarChart data={timelineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#64748b"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }}
                  formatter={(val) => (val === 'sales' ? 'Total Sales' : 'Shop Expenses')}
                />
                <Bar dataKey="sales" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="expenses" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Lower Row: Expense Breakdown Donut & Business Health Insights */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '16px' }}>
        {/* Expenses by Category Donut Chart */}
        <div className="analytics-card">
          <div className="analytics-card-title">
            <span>Expenses by Category (Recharts Donut)</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {expenses.length} records
            </span>
          </div>

          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
            Visual breakdown of store overheads across generator fuel, rent, transport, and supplies.
          </p>

          {categoryData.length === 0 ? (
            <div className="empty-state" style={{ border: 'none', padding: '24px 0' }}>
              <span className="empty-state-icon">💸</span>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>No expense records logged yet.</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onNavigate('#/new-expense')}
                style={{ marginTop: '6px' }}
              >
                + Record First Expense
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ width: '100%', height: '200px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {categoryData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={CATEGORY_COLORS[entry.name] || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any) => [formatCurrency(Number(val), currency), 'Spent']}
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '8px',
                        color: '#f8fafc',
                        fontSize: '12px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Category Legend List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {categoryData.slice(0, 5).map((item, idx) => {
                  const pct = totals.totalExpenses > 0 ? ((item.value / totals.totalExpenses) * 100).toFixed(0) : '0';
                  const color = CATEGORY_COLORS[item.name] || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
                  return (
                    <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color }} />
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.name}</span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#fb923c' }}>
                        {formatCurrency(item.value, currency)} ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Business Health & Actionable Insights */}
        <div className="analytics-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="analytics-card-title">
              <span>Business Health Insights</span>
              <span className={`badge ${totals.isProfitable ? 'badge-paid' : 'badge-owing'}`}>
                {totals.isProfitable ? 'Healthy Margin' : 'Action Needed'}
              </span>
            </div>

            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '0 0 14px 0' }}>
              Key takeaways to optimize cash flow and protect merchant profit margins.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ background: 'var(--bg-surface-elevated)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Net Profit Margin</span>
                  <span style={{ fontWeight: 800, fontSize: '13px', color: totals.isProfitable ? '#34d399' : '#fb7185' }}>
                    {totals.profitMargin}%
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {totals.isProfitable
                    ? 'Your sales comfortably exceed all bills, rent, and fuel overheads.'
                    : 'Your shop overheads currently exceed sales cash. Consider cutting non-essential bills.'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface-elevated)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Expense-to-Sales Ratio</span>
                  <span style={{ fontWeight: 800, fontSize: '13px', color: '#fb923c' }}>
                    {totals.expenseRatio}%
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  For every 100 units of sales, approximately {totals.expenseRatio} goes into operational overheads.
                </div>
              </div>

              {totals.totalUnpaidDebts > 0 && (
                <div style={{ background: 'rgba(244,63,94,0.08)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(244,63,94,0.25)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: '#fb7185', fontWeight: 700 }}>Uncollected Debts Alert</span>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: '#fb7185' }}>
                      {formatCurrency(totals.totalUnpaidDebts, currency)}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    {totals.pendingDebtorsCount} customer{totals.pendingDebtorsCount === 1 ? '' : 's'} still owe money. Send 1-click WhatsApp reminders to recover this cash.
                  </div>
                  <button
                    type="button"
                    className="btn btn-whatsapp-action btn-sm"
                    style={{ fontSize: '11px', padding: '4px 10px', width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      if (onOpenDebtReminder) onOpenDebtReminder();
                      else onNavigate('#/sales');
                    }}
                  >
                    💬 Generate WhatsApp Debt Notices
                  </button>
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ flex: 1 }}
              onClick={() => onNavigate('#/sales')}
            >
              Manage Sales & Debts →
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ flex: 1 }}
              onClick={() => onNavigate('#/expenses')}
            >
              Manage Expenses →
            </button>
          </div>
        </div>
      </div>

      {/* Live Inventory & Stock Health Section */}
      <div className="chart-card" style={{ marginTop: '4px' }}>
        <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📦 Live Inventory & Stock Levels</span>
              {inventoryStats.lowStockCount > 0 && (
                <span className="badge badge-low-stock" style={{ fontSize: '11px', padding: '2px 8px' }}>
                  ⚠️ {inventoryStats.lowStockCount} Low Stock
                </span>
              )}
              {inventoryStats.outOfStockCount > 0 && (
                <span className="badge badge-out-of-stock" style={{ fontSize: '11px', padding: '2px 8px' }}>
                  🚨 {inventoryStats.outOfStockCount} Out of Stock
                </span>
              )}
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Real-time stock units on hand for your store. All additions and restocks update instantly.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onNavigate('#/new-product')}
            >
              + Add New Product
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onNavigate('#/inventory')}
            >
              Full Catalog ({inventoryStats.totalProducts}) →
            </button>
          </div>
        </div>

        {/* 4 Summary Chips */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(135px, 100%), 1fr))', gap: '10px', marginTop: '14px', marginBottom: '18px' }}>
          <div style={{ background: 'var(--bg-surface-elevated)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Unique Products</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>{inventoryStats.totalProducts}</div>
          </div>
          <div style={{ background: 'var(--bg-surface-elevated)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Units on Hand</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--accent-emerald)' }}>{inventoryStats.totalUnits} units</div>
          </div>
          <div style={{ background: 'var(--bg-surface-elevated)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: inventoryStats.lowStockCount > 0 ? '1px solid rgba(245,158,11,0.4)' : '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Low Stock Warning</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: inventoryStats.lowStockCount > 0 ? 'var(--accent-amber)' : 'var(--text-secondary)' }}>
              {inventoryStats.lowStockCount} items
            </div>
          </div>
          <div style={{ background: 'var(--bg-surface-elevated)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: inventoryStats.outOfStockCount > 0 ? '1px solid rgba(244,63,94,0.4)' : '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Out of Stock</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: inventoryStats.outOfStockCount > 0 ? 'var(--accent-rose)' : 'var(--text-secondary)' }}>
              {inventoryStats.outOfStockCount} items
            </div>
          </div>
        </div>

        {/* Product Cards or Empty State */}
        {products.length === 0 ? (
          <div className="empty-state" style={{ padding: '30px 20px', border: '1px dashed var(--border-subtle)' }}>
            <span className="empty-state-icon">📦</span>
            <h3 style={{ fontSize: '15px' }}>No Stock Items Found</h3>
            <p style={{ maxWidth: '440px', margin: '0 auto' }}>
              Add your store items to track live quantities, trigger automated restock warnings, and sell directly to customers.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ marginTop: '12px' }}
              onClick={() => onNavigate('#/new-product')}
            >
              + Add Your First Product
            </button>
          </div>
        ) : (
          <div>
            <div className="dashboard-mini-product-grid">
              {products.slice(0, 8).map((product) => {
                const isOutOfStock = product.stock <= 0;
                const isLowStock = product.stock > 0 && product.stock <= lowStockThreshold;
                return (
                  <div
                    key={product.id}
                    style={{
                      background: 'var(--bg-surface-elevated)',
                      borderRadius: 'var(--radius-md)',
                      border: isOutOfStock
                        ? '1px solid rgba(244,63,94,0.4)'
                        : isLowStock
                        ? '1px solid rgba(245,158,11,0.4)'
                        : '1px solid var(--border-subtle)',
                      padding: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      minWidth: 0
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={product.name}>
                          {product.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {product.category || 'General'}
                        </div>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--accent-emerald)', whiteSpace: 'nowrap' }}>
                        {formatCurrency(product.price, currency)}
                      </div>
                    </div>

                    {product.costPrice !== undefined && (() => {
                      const unitProfit = product.price - product.costPrice;
                      return (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', padding: '3px 6px', background: 'rgba(15,23,42,0.45)', borderRadius: '4px' }}>
                          <span>Cost: {formatCurrency(product.costPrice, currency)}</span>
                          <span style={{ fontWeight: 700, color: unitProfit >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                            Est. Profit: {unitProfit >= 0 ? '+' : ''}{formatCurrency(unitProfit, currency)}
                          </span>
                        </div>
                      );
                    })()}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        {isOutOfStock ? (
                          <span className="badge badge-out-of-stock" style={{ fontSize: '10px', padding: '2px 6px' }}>🚨 0 in stock</span>
                        ) : isLowStock ? (
                          <span className="badge badge-low-stock" style={{ fontSize: '10px', padding: '2px 6px' }}>⚠️ {product.stock} left</span>
                        ) : (
                          <span className="badge badge-in-stock" style={{ fontSize: '10px', padding: '2px 6px' }}>✓ {product.stock} units</span>
                        )}
                      </div>

                      {onQuickRestock && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '11px', padding: '2px 8px', minHeight: '22px' }}
                          title="Add restocked units"
                          onClick={() => onQuickRestock(product.id)}
                        >
                          Add Stock
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 1, fontSize: '11px', padding: '4px' }}
                        onClick={() => onNavigate(`#/new-sale?product=${product.id}`)}
                      >
                        ⚡ Sell
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                        title="Edit product details"
                        onClick={() => onNavigate(`#/edit-product/${product.id}`)}
                      >
                        ✏️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {products.length > 8 && (
              <div style={{ textAlign: 'center', marginTop: '14px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onNavigate('#/inventory')}
                >
                  View all {products.length} products in Inventory Catalog →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
