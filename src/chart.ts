import * as d3 from 'd3';
import { Expense, Sale } from './types.ts';
import { formatCurrency } from './utils.ts';

export type TimeGranularity = 'weekly' | 'monthly' | 'yearly';
export type ChartMetricView = 'all' | 'profit' | 'debt';

export interface TrendDataBucket {
  id: string;
  label: string;
  subLabel: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  debt: number;
  totalVolume: number;
  realizedPct: number;
  completedOrdersCount: number;
  pendingDebtCount: number;
  expenseCount: number;
}

/**
 * Computes time-bucketed financial trend data for D3 visualization.
 */
export function computeTrendBuckets(
  sales: Sale[],
  timeframe: TimeGranularity,
  expenses: Expense[] = []
): TrendDataBucket[] {
  const now = new Date();
  const buckets: TrendDataBucket[] = [];

  if (timeframe === 'weekly') {
    // 7 Days: 6 days ago up to today
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' }); // e.g. Mon, Tue
      const fullDateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); // e.g. Oct 27

      const daySales = sales.filter((s) => s.createdAt.startsWith(dayStr));
      const completed = daySales.filter((s) => s.status === 'completed');
      const pending = daySales.filter((s) => s.status === 'pending');

      const rev = completed.reduce((sum, s) => sum + s.totalAmount, 0);
      const debt = pending.reduce((sum, s) => sum + s.totalAmount, 0);
      const vol = rev + debt;

      const dayExpenses = expenses.filter((e) => (e.date || e.createdAt).startsWith(dayStr));
      const expSum = dayExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const netProfit = rev - expSum;

      buckets.push({
        id: `day-${i}`,
        label: `${dayLabel} ${d.getDate()}`,
        subLabel: fullDateStr,
        revenue: rev,
        expenses: expSum,
        netProfit,
        debt,
        totalVolume: vol,
        realizedPct: vol > 0 ? Math.round((rev / vol) * 100) : 0,
        completedOrdersCount: completed.length,
        pendingDebtCount: pending.length,
        expenseCount: dayExpenses.length,
      });
    }
  } else if (timeframe === 'monthly') {
    // 4 Weeks: 4 7-day intervals
    for (let w = 3; w >= 0; w--) {
      const startDay = new Date(now);
      startDay.setDate(startDay.getDate() - (w + 1) * 7);
      startDay.setHours(0, 0, 0, 0);

      const endDay = new Date(now);
      endDay.setDate(endDay.getDate() - w * 7);
      endDay.setHours(23, 59, 59, 999);

      const weekNum = 4 - w;
      const startFormatted = startDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endFormatted = endDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const weekSales = sales.filter((s) => {
        const t = new Date(s.createdAt).getTime();
        return t >= startDay.getTime() && t <= endDay.getTime();
      });

      const completed = weekSales.filter((s) => s.status === 'completed');
      const pending = weekSales.filter((s) => s.status === 'pending');

      const rev = completed.reduce((sum, s) => sum + s.totalAmount, 0);
      const debt = pending.reduce((sum, s) => sum + s.totalAmount, 0);
      const vol = rev + debt;

      const weekExpenses = expenses.filter((e) => {
        const t = new Date(e.date || e.createdAt).getTime();
        return t >= startDay.getTime() && t <= endDay.getTime();
      });
      const expSum = weekExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const netProfit = rev - expSum;

      buckets.push({
        id: `week-${w}`,
        label: `Wk ${weekNum}`,
        subLabel: `${startFormatted} - ${endFormatted}`,
        revenue: rev,
        expenses: expSum,
        netProfit,
        debt,
        totalVolume: vol,
        realizedPct: vol > 0 ? Math.round((rev / vol) * 100) : 0,
        completedOrdersCount: completed.length,
        pendingDebtCount: pending.length,
        expenseCount: weekExpenses.length,
      });
    }
  } else {
    // Yearly: 12 Months
    for (let m = 11; m >= 0; m--) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthLabel = d.toLocaleDateString('en-US', { month: 'short' }); // Jan, Feb...
      const subLabel = `${monthLabel} ${year}`;

      const monthSales = sales.filter((s) => {
        const st = new Date(s.createdAt);
        return st.getFullYear() === year && st.getMonth() === month;
      });

      const completed = monthSales.filter((s) => s.status === 'completed');
      const pending = monthSales.filter((s) => s.status === 'pending');

      const rev = completed.reduce((sum, s) => sum + s.totalAmount, 0);
      const debt = pending.reduce((sum, s) => sum + s.totalAmount, 0);
      const vol = rev + debt;

      const monthExpenses = expenses.filter((e) => {
        const st = new Date(e.date || e.createdAt);
        return st.getFullYear() === year && st.getMonth() === month;
      });
      const expSum = monthExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const netProfit = rev - expSum;

      buckets.push({
        id: `month-${m}`,
        label: monthLabel,
        subLabel,
        revenue: rev,
        expenses: expSum,
        netProfit,
        debt,
        totalVolume: vol,
        realizedPct: vol > 0 ? Math.round((rev / vol) * 100) : 0,
        completedOrdersCount: completed.length,
        pendingDebtCount: pending.length,
        expenseCount: monthExpenses.length,
      });
    }
  }

  return buckets;
}

/**
 * Format compact currency tick numbers (e.g. ₦1.5k, ₦20k, ₦1M)
 */
function formatCompactCurrency(val: number, symbol: string): string {
  if (val === 0) return `${symbol}0`;
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    return `${sign}${symbol}${(abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${symbol}${(abs / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}k`;
  }
  return `${sign}${symbol}${abs.toLocaleString()}`;
}

export interface D3ChartRenderOptions {
  container: HTMLElement;
  sales: Sale[];
  timeframe: TimeGranularity;
  currency: string;
  expenses?: Expense[];
  metricView?: ChartMetricView;
}

/**
 * Interactive D3.js chart renderer that visualizes weekly, monthly, and yearly revenue, overhead expenses, and debt trends.
 */
export class D3TrendChartComponent {
  private container: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;
  private tooltipEl: HTMLDivElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(
    sales: Sale[],
    timeframe: TimeGranularity,
    currency: string = '₦',
    expenses: Expense[] = [],
    metricView: ChartMetricView = 'all'
  ): void {
    // Clear existing container contents
    this.container.innerHTML = '';

    const buckets = computeTrendBuckets(sales, timeframe, expenses);

    // Create wrapper layout
    const chartWrapper = document.createElement('div');
    chartWrapper.className = 'd3-chart-wrapper';
    chartWrapper.style.position = 'relative';
    chartWrapper.style.width = '100%';
    this.container.appendChild(chartWrapper);

    // Create floating tooltip element
    let tooltip = document.getElementById('d3-chart-tooltip') as HTMLDivElement | null;
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'd3-chart-tooltip';
      tooltip.className = 'd3-chart-tooltip';
      document.body.appendChild(tooltip);
    }
    this.tooltipEl = tooltip;

    const drawChart = () => {
      chartWrapper.innerHTML = '';

      const containerWidth = chartWrapper.getBoundingClientRect().width || 600;
      const height = Math.min(330, Math.max(260, window.innerWidth < 480 ? 260 : 310));
      const isMobile = containerWidth < 520;

      const margin = {
        top: 28,
        right: isMobile ? 14 : 28,
        bottom: isMobile ? 54 : 44,
        left: isMobile ? 48 : 64,
      };

      const innerWidth = containerWidth - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      if (innerWidth <= 0 || innerHeight <= 0) return;

      const svg = d3
        .select(chartWrapper)
        .append('svg')
        .attr('viewBox', `0 0 ${containerWidth} ${height}`)
        .attr('width', '100%')
        .attr('height', height)
        .style('display', 'block')
        .style('overflow', 'visible');

      // Definitions: gradients and drop-shadow filters
      const defs = svg.append('defs');

      // Emerald Revenue Gradient
      const revGradient = defs
        .append('linearGradient')
        .attr('id', 'revenue-gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');
      revGradient.append('stop').attr('offset', '0%').attr('stop-color', '#34d399').attr('stop-opacity', 0.95);
      revGradient.append('stop').attr('offset', '100%').attr('stop-color', '#059669').attr('stop-opacity', 0.85);

      // Amber / Orange Overheads/Expense Gradient
      const expGradient = defs
        .append('linearGradient')
        .attr('id', 'expense-gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');
      expGradient.append('stop').attr('offset', '0%').attr('stop-color', '#fb923c').attr('stop-opacity', 0.95);
      expGradient.append('stop').attr('offset', '100%').attr('stop-color', '#ea580c').attr('stop-opacity', 0.85);

      // Rose Debt Gradient
      const debtGradient = defs
        .append('linearGradient')
        .attr('id', 'debt-gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');
      debtGradient.append('stop').attr('offset', '0%').attr('stop-color', '#fb7185').attr('stop-opacity', 0.95);
      debtGradient.append('stop').attr('offset', '100%').attr('stop-color', '#e11d48').attr('stop-opacity', 0.85);

      // Subtle drop shadow filter for hovered bars
      const filter = defs
        .append('filter')
        .attr('id', 'bar-glow')
        .attr('x', '-20%')
        .attr('y', '-20%')
        .attr('width', '140%')
        .attr('height', '140%');
      filter
        .append('feDropShadow')
        .attr('dx', '0')
        .attr('dy', '2')
        .attr('stdDeviation', '3')
        .attr('flood-color', '#38bdf8')
        .attr('flood-opacity', '0.4');

      // Determine active series keys based on view filter
      let keys: Array<'revenue' | 'expenses' | 'debt'> = ['revenue', 'expenses', 'debt'];
      if (metricView === 'profit') {
        keys = ['revenue', 'expenses'];
      } else if (metricView === 'debt') {
        keys = ['revenue', 'debt'];
      }

      // Scales
      const x0 = d3
        .scaleBand()
        .domain(buckets.map((b) => b.label))
        .range([margin.left, containerWidth - margin.right])
        .paddingInner(isMobile ? 0.2 : 0.28);

      const x1 = d3
        .scaleBand()
        .domain(keys)
        .range([0, x0.bandwidth()])
        .padding(0.08);

      const maxVal =
        d3.max(buckets, (b) => {
          if (metricView === 'profit') return Math.max(b.revenue, b.expenses);
          if (metricView === 'debt') return Math.max(b.revenue, b.debt);
          return Math.max(b.revenue, b.expenses, b.debt);
        }) || 0;

      // Provide clean headroom
      const yCeiling = maxVal > 0 ? maxVal * 1.18 : 1000;

      const y = d3
        .scaleLinear()
        .domain([0, yCeiling])
        .nice()
        .range([height - margin.bottom, margin.top]);

      // Horizontal subtle gridlines
      const yAxisGrid = d3
        .axisLeft(y)
        .ticks(5)
        .tickSize(-innerWidth)
        .tickFormat(() => '');

      svg
        .append('g')
        .attr('class', 'd3-grid-lines')
        .attr('transform', `translate(${margin.left}, 0)`)
        .call(yAxisGrid)
        .selectAll('line')
        .attr('stroke', 'rgba(255, 255, 255, 0.08)')
        .attr('stroke-dasharray', '3,3');

      svg.select('.d3-grid-lines .domain').remove();

      // Zero baseline
      svg
        .append('line')
        .attr('x1', margin.left)
        .attr('x2', containerWidth - margin.right)
        .attr('y1', height - margin.bottom)
        .attr('y2', height - margin.bottom)
        .attr('stroke', 'rgba(148, 163, 184, 0.3)')
        .attr('stroke-width', 1.5);

      // Y-Axis
      const yAxis = d3
        .axisLeft(y)
        .ticks(5)
        .tickFormat((d) => formatCompactCurrency(d.valueOf(), currency));

      const yAxisG = svg
        .append('g')
        .attr('class', 'd3-y-axis')
        .attr('transform', `translate(${margin.left}, 0)`)
        .call(yAxis);

      yAxisG.select('.domain').remove();
      yAxisG.selectAll('.tick line').remove();
      yAxisG
        .selectAll('.tick text')
        .attr('fill', '#94a3b8')
        .attr('font-size', isMobile ? '10px' : '11px')
        .attr('font-family', 'var(--font-mono, monospace)')
        .attr('dx', '-6');

      // X-Axis
      const xAxis = d3.axisBottom(x0).tickSize(0);
      const xAxisG = svg
        .append('g')
        .attr('class', 'd3-x-axis')
        .attr('transform', `translate(0, ${height - margin.bottom + 8})`)
        .call(xAxis);

      xAxisG.select('.domain').remove();
      const xLabels = xAxisG
        .selectAll('.tick text')
        .attr('fill', '#cbd5e1')
        .attr('font-size', isMobile ? '10px' : '11px')
        .attr('font-weight', '600')
        .attr('font-family', 'var(--font-sans, system-ui)');

      if (timeframe === 'yearly' || isMobile) {
        xLabels
          .attr('transform', 'rotate(-30)')
          .style('text-anchor', 'end')
          .attr('dx', '-4px')
          .attr('dy', '2px');
      }

      // Group for Bar Sets
      const barGroups = svg
        .append('g')
        .attr('class', 'd3-bar-groups')
        .selectAll('g')
        .data(buckets)
        .join('g')
        .attr('transform', (d) => `translate(${x0(d.label)}, 0)`)
        .attr('class', 'd3-bucket-group')
        .style('cursor', 'pointer');

      // Background hover column indicator
      barGroups
        .append('rect')
        .attr('class', 'd3-hover-bg')
        .attr('x', 0)
        .attr('y', margin.top)
        .attr('width', x0.bandwidth())
        .attr('height', innerHeight)
        .attr('rx', 6)
        .attr('fill', 'transparent')
        .style('transition', 'fill 0.15s ease');

      // 1. Render Revenue Bars (Emerald) if included
      if (keys.includes('revenue')) {
        const revenueBars = barGroups
          .append('rect')
          .attr('class', 'd3-bar d3-bar-revenue')
          .attr('x', () => x1('revenue') || 0)
          .attr('width', x1.bandwidth())
          .attr('y', height - margin.bottom)
          .attr('height', 0)
          .attr('rx', 3)
          .attr('ry', 3)
          .attr('fill', 'url(#revenue-gradient)');

        revenueBars
          .transition()
          .duration(650)
          .ease(d3.easeCubicOut)
          .attr('y', (d) => (d.revenue > 0 ? y(d.revenue) : height - margin.bottom - 2))
          .attr('height', (d) => (d.revenue > 0 ? Math.max(3, height - margin.bottom - y(d.revenue)) : 2));
      }

      // 2. Render Expense Bars (Amber / Orange) if included
      if (keys.includes('expenses')) {
        const expenseBars = barGroups
          .append('rect')
          .attr('class', 'd3-bar d3-bar-expense')
          .attr('x', () => x1('expenses') || 0)
          .attr('width', x1.bandwidth())
          .attr('y', height - margin.bottom)
          .attr('height', 0)
          .attr('rx', 3)
          .attr('ry', 3)
          .attr('fill', 'url(#expense-gradient)');

        expenseBars
          .transition()
          .duration(650)
          .ease(d3.easeCubicOut)
          .attr('y', (d) => (d.expenses > 0 ? y(d.expenses) : height - margin.bottom - 2))
          .attr('height', (d) => (d.expenses > 0 ? Math.max(3, height - margin.bottom - y(d.expenses)) : 2));
      }

      // 3. Render Debt Bars (Rose) if included
      if (keys.includes('debt')) {
        const debtBars = barGroups
          .append('rect')
          .attr('class', 'd3-bar d3-bar-debt')
          .attr('x', () => x1('debt') || 0)
          .attr('width', x1.bandwidth())
          .attr('y', height - margin.bottom)
          .attr('height', 0)
          .attr('rx', 3)
          .attr('ry', 3)
          .attr('fill', 'url(#debt-gradient)');

        debtBars
          .transition()
          .duration(650)
          .ease(d3.easeCubicOut)
          .attr('y', (d) => (d.debt > 0 ? y(d.debt) : height - margin.bottom - 2))
          .attr('height', (d) => (d.debt > 0 ? Math.max(3, height - margin.bottom - y(d.debt)) : 2));
      }

      // Value Callouts for non-zero points if space allows
      if (!isMobile && buckets.length <= 7) {
        if (keys.includes('revenue')) {
          barGroups
            .filter((d) => d.revenue > 0)
            .append('text')
            .attr('class', 'd3-bar-value-label')
            .attr('x', (x1('revenue') || 0) + x1.bandwidth() / 2)
            .attr('y', (d) => y(d.revenue) - 6)
            .attr('text-anchor', 'middle')
            .attr('fill', '#34d399')
            .attr('font-size', '9px')
            .attr('font-family', 'var(--font-mono, monospace)')
            .attr('font-weight', '700')
            .style('opacity', 0)
            .text((d) => formatCompactCurrency(d.revenue, currency))
            .transition()
            .delay(400)
            .duration(300)
            .style('opacity', 0.9);
        }

        if (keys.includes('expenses')) {
          barGroups
            .filter((d) => d.expenses > 0)
            .append('text')
            .attr('class', 'd3-bar-value-label')
            .attr('x', (x1('expenses') || 0) + x1.bandwidth() / 2)
            .attr('y', (d) => y(d.expenses) - 6)
            .attr('text-anchor', 'middle')
            .attr('fill', '#fb923c')
            .attr('font-size', '9px')
            .attr('font-family', 'var(--font-mono, monospace)')
            .attr('font-weight', '700')
            .style('opacity', 0)
            .text((d) => formatCompactCurrency(d.expenses, currency))
            .transition()
            .delay(400)
            .duration(300)
            .style('opacity', 0.9);
        }

        if (keys.includes('debt')) {
          barGroups
            .filter((d) => d.debt > 0)
            .append('text')
            .attr('class', 'd3-bar-value-label')
            .attr('x', (x1('debt') || 0) + x1.bandwidth() / 2)
            .attr('y', (d) => y(d.debt) - 6)
            .attr('text-anchor', 'middle')
            .attr('fill', '#fb7185')
            .attr('font-size', '9px')
            .attr('font-family', 'var(--font-mono, monospace)')
            .attr('font-weight', '700')
            .style('opacity', 0)
            .text((d) => formatCompactCurrency(d.debt, currency))
            .transition()
            .delay(400)
            .duration(300)
            .style('opacity', 0.9);
        }
      }

      // Empty State Indicator in chart area if all data is 0
      const totalPeriodSum = buckets.reduce((s, b) => s + b.revenue + b.expenses + b.debt, 0);
      if (totalPeriodSum === 0) {
        const emptyG = svg.append('g').attr('class', 'd3-chart-empty-annotation');
        emptyG
          .append('text')
          .attr('x', containerWidth / 2)
          .attr('y', height / 2 - 10)
          .attr('text-anchor', 'middle')
          .attr('fill', '#64748b')
          .attr('font-size', '13px')
          .attr('font-weight', '600')
          .text('📊 No sales or shop expenses recorded in this period');

        emptyG
          .append('text')
          .attr('x', containerWidth / 2)
          .attr('y', height / 2 + 12)
          .attr('text-anchor', 'middle')
          .attr('fill', '#475569')
          .attr('font-size', '11px')
          .text('Your sales cash, shop spending, and customer debts will graph here');
      }

      // Interactive Events for Group / Tooltip
      barGroups
        .on('mouseenter', function (_event, d) {
          d3.select(this).select('.d3-hover-bg').attr('fill', 'rgba(255, 255, 255, 0.04)');
          d3.select(this).selectAll('.d3-bar').attr('filter', 'url(#bar-glow)');

          if (tooltip) {
            const isProfit = d.netProfit >= 0;
            const netProfitClass = isProfit ? 'text-emerald' : 'text-rose';
            const netProfitSign = isProfit ? '+' : '';

            tooltip.innerHTML = `
              <div class="d3-tooltip-header">
                <span class="d3-tooltip-title">${d.label}</span>
                <span class="d3-tooltip-date">${d.subLabel}</span>
              </div>
              <div class="d3-tooltip-body">
                <div class="d3-tooltip-row text-emerald">
                  <span class="d3-tooltip-dot" style="background:#10b981;"></span>
                  <span class="d3-tooltip-label">Sales Cash:</span>
                  <span class="d3-tooltip-val">${formatCurrency(d.revenue, currency)}</span>
                </div>
                <div class="d3-tooltip-row" style="color:#fb923c;">
                  <span class="d3-tooltip-dot" style="background:#f97316;"></span>
                  <span class="d3-tooltip-label">Shop Bills:</span>
                  <span class="d3-tooltip-val">${formatCurrency(d.expenses, currency)}</span>
                </div>
                <div class="d3-tooltip-divider"></div>
                <div class="d3-tooltip-row ${netProfitClass}">
                  <span class="d3-tooltip-label">Take-Home Profit:</span>
                  <span class="d3-tooltip-val" style="font-weight:700;">${netProfitSign}${formatCurrency(d.netProfit, currency)}</span>
                </div>
                <div class="d3-tooltip-row text-rose" style="margin-top:2px;">
                  <span class="d3-tooltip-dot" style="background:#f43f5e;"></span>
                  <span class="d3-tooltip-label">Customer Debt:</span>
                  <span class="d3-tooltip-val">${formatCurrency(d.debt, currency)}</span>
                </div>
                <div class="d3-tooltip-counts">
                  <span>${d.completedOrdersCount} paid sale${d.completedOrdersCount === 1 ? '' : 's'}</span>
                  •
                  <span>${d.expenseCount} bill${d.expenseCount === 1 ? '' : 's'}</span>
                  •
                  <span>${d.pendingDebtCount} debtor${d.pendingDebtCount === 1 ? '' : 's'}</span>
                </div>
              </div>
            `;
            tooltip.style.opacity = '1';
            tooltip.style.pointerEvents = 'none';
          }
        })
        .on('mousemove', function (event) {
          if (!tooltip) return;
          const tooltipWidth = 240;
          let left = event.pageX + 14;
          let top = event.pageY - 60;

          // Keep within window bounds
          if (left + tooltipWidth > window.innerWidth - 12) {
            left = event.pageX - tooltipWidth - 14;
          }
          if (top < 10) {
            top = event.pageY + 14;
          }

          tooltip.style.left = `${left}px`;
          tooltip.style.top = `${top}px`;
        })
        .on('mouseleave', function () {
          d3.select(this).select('.d3-hover-bg').attr('fill', 'transparent');
          d3.select(this).selectAll('.d3-bar').attr('filter', null);
          if (tooltip) {
            tooltip.style.opacity = '0';
          }
        });
    };

    // Initial draw
    drawChart();

    // Responsive Resize Observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        drawChart();
      });
      this.resizeObserver.observe(this.container);
    }
  }

  public destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.tooltipEl && this.tooltipEl.parentNode) {
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }
  }
}
