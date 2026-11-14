import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ChartMetricView, D3TrendChartComponent, computeTrendBuckets } from './chart.ts';
import { RechartsDashboard } from './RechartsDashboard';
import { StorageService } from './storage.ts';
import { EXPENSE_CATEGORIES, Expense, POPULAR_NICHES, Product, Sale, User, UserRole } from './types.ts';
import {
  attachNumberSanitizer,
  buildDebtReminderText,
  copyTextToClipboard,
  escapeHtml,
  exportBuyerLedgerToCSV,
  exportExpensesToCSV,
  exportSalesToCSV,
  fileToBase64,
  formatCurrency,
  formatDate,
  formatNumber,
  generatePasswordSalt,
  generateWhatsAppDebtReminderLink,
  generateWhatsAppOrderLink,
  getDebtDueStatus,
  hashPassword,
  parseSanitizedNumber,
  requestBrowserNotificationPermission,
  sanitizeWhatsAppPhone,
  triggerLowStockBrowserNotification,
} from './utils.ts';

class MultiPageApp {
  private currentUser: User | null = null;
  private currentRoute: string = '';
  private rechartsRoot: Root | null = null;

  // Explore & storefront filters
  private exploreNicheFilter: string = 'All';
  private exploreSearchQuery: string = '';
  private isNicheCollapsed: boolean = false;
  private storefrontStockFilter: 'all' | 'in_stock' | 'out_of_stock' = 'all';

  // Collapsible bar states (Vertical & Collapsible across entire app)
  private isNavCollapsed: boolean = true;
  private isSalesFilterCollapsed: boolean = false;
  private isExpensesFilterCollapsed: boolean = false;
  private isBuyerFilterCollapsed: boolean = false;
  private isAnalyticsControlsCollapsed: boolean = false;

  // Sales & inventory filters
  private salesSearchQuery: string = '';
  private salesStatusFilter: 'all' | 'completed' | 'pending' | 'overdue' = 'all';
  private inventorySearchQuery: string = '';
  private inventoryCategoryFilter: string = 'all';

  // Expense tracking filters & chart metric view
  private expensesSearchQuery: string = '';
  private expensesCategoryFilter: string = 'all';
  private chartMetricView: ChartMetricView = 'all';

  // Analytics timeframe & D3 chart
  private analyticsTimeframe: 'weekly' | 'monthly' | 'yearly' = 'weekly';
  private trendChart: D3TrendChartComponent | null = null;

  // Buyer ledger filters
  private buyerStatusFilter: 'all' | 'completed' | 'pending' = 'all';
  private buyerSearchQuery: string = '';

  // Auth mode state (login vs signup)
  private authTab: 'login' | 'signup' = 'login';

  // State for product page image upload
  private uploadedProductImageBase64: string = '';
  private rawUploadedImageBase64: string = '';

  constructor() {
    this.init();
  }

  private init(): void {
    // Purge any demo showcase stores so real buyers see authentic merchants only
    StorageService.purgeDemoStores();

    this.currentUser = StorageService.getCurrentUser();
    this.authTab = StorageService.getAllUsers().length > 0 ? 'login' : 'signup';

    // Client-side Hash Router
    window.addEventListener('hashchange', () => this.handleRouting());

    if (!window.location.hash) {
      if (!this.currentUser) {
        window.location.hash = '#/auth';
      } else {
        window.location.hash = this.currentUser.role === 'buyer' ? '#/explore' : '#/sales';
      }
      this.handleRouting();
    } else {
      this.handleRouting();
    }
  }

  public showToast(message: string, type: 'success' | 'danger' | 'info' | 'warning' = 'info'): void {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✓' : type === 'danger' ? '✕' : type === 'warning' ? '⚠️' : 'ℹ';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  private handleRouting(): void {
    const hash = window.location.hash || '#/sales';
    if (this.trendChart && !hash.startsWith('#/analytics')) {
      this.trendChart.destroy();
      this.trendChart = null;
    }
    if (hash !== this.currentRoute) {
      this.storefrontStockFilter = 'all';
    }
    this.currentRoute = hash;
    this.render();
  }

  private navigate(route: string): void {
    if (window.location.hash === route) {
      this.handleRouting();
    } else {
      window.location.hash = route;
    }
  }

  private unmountMountedCharts(): void {
    if (this.rechartsRoot) {
      this.rechartsRoot.unmount();
      this.rechartsRoot = null;
    }
    if (this.trendChart) {
      this.trendChart.destroy();
      this.trendChart = null;
    }
  }

  // --- Guest Browsing Shell (Marketplace & WhatsApp Catalog Browsing) ---
  private renderGuestShell(appEl: HTMLElement): void {
    this.unmountMountedCharts();
    const isStorefront = this.currentRoute.startsWith('#/storefront');
    appEl.innerHTML = `
      <div class="app-container">
        <!-- Persistent Top Header for Guest Browsing -->
        <header class="app-header">
          <a href="#/explore" class="brand-section">
            <div class="brand-logo-mark">₦</div>
            <div class="brand-info">
              <span class="brand-title">ShopKepa</span>
              <span class="brand-store-name">Marketplace & Verified Merchants</span>
            </div>
          </a>

          <div class="header-actions">
            <span class="role-indicator-badge" style="background:rgba(59,130,246,0.12); color:#60a5fa; border:1px solid rgba(59,130,246,0.3);">
              🌐 Guest Browsing
            </span>
            <a href="#/auth" class="btn btn-primary btn-sm">
              🔑 Log In / Register
            </a>
          </div>
        </header>

        <!-- Vertical & Collapsible Navigation Section for Guest -->
        <nav class="nav-section-container" aria-label="Page Navigation">
          <div class="nav-section-header">
            <div class="nav-header-left">
              <span class="nav-header-title">Marketplace Navigation</span>
              <span class="badge badge-paid">
                ${isStorefront ? '🛍️ Merchant Storefront' : '🌐 Browse Stores'}
              </span>
            </div>
            <button
              type="button"
              id="btn-toggle-nav-collapse"
              class="btn-toggle-collapse"
              aria-expanded="${!this.isNavCollapsed}"
              title="${this.isNavCollapsed ? 'Open navigation menu' : 'Collapse navigation menu'}"
            >
              <span>${this.isNavCollapsed ? '☰ Show Pages' : 'Collapse'}</span>
              <span class="collapse-icon">${this.isNavCollapsed ? '▼' : '▲'}</span>
            </button>
          </div>

          <div id="nav-collapsible-wrapper" class="nav-collapsible-wrapper ${this.isNavCollapsed ? 'collapsed' : ''}">
            <div class="nav-pages-vertical">
              <a href="#/explore" class="nav-page-link-vertical ${!isStorefront ? 'active' : ''}">
                <span class="nav-link-left">
                  <span class="nav-link-icon">🌐</span>
                  <span class="nav-link-label">Browse Stores & Marketplace</span>
                </span>
              </a>
              <a href="#/auth" class="nav-page-link-vertical">
                <span class="nav-link-left">
                  <span class="nav-link-icon">🏪</span>
                  <span class="nav-link-label">Merchant Login / Create Store</span>
                </span>
                <span class="nav-link-right">
                  <span class="badge badge-paid">Start Free</span>
                </span>
              </a>
            </div>
          </div>
        </nav>

        <!-- Dynamic Multi-Page Router View -->
        <main id="page-viewport" style="display:flex; flex-direction:column; gap:20px;">
          ${this.renderCurrentPageView([], [], { totalRevenue: 0, totalOrders: 0, aov: 0, totalDebt: 0 })}
        </main>

        <!-- Mobile Bottom Navigation for Guests -->
        <nav class="mobile-bottom-nav" aria-label="Quick Mobile Navigation">
          <a href="#/explore" class="mobile-nav-item ${!isStorefront ? 'active' : ''}">
            <span class="mobile-nav-icon">🌐</span>
            <span>Stores</span>
          </a>
          <a href="#/auth" class="mobile-nav-item">
            <span class="mobile-nav-icon">🔑</span>
            <span>Sign In</span>
          </a>
        </nav>
      </div>
    `;

    this.bindCurrentPageEvents([], []);
  }

  // --- Main Shell Renderer ---
  public render(): void {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    this.unmountMountedCharts();

    const isPublicRoute = this.currentRoute === '#/explore' || this.currentRoute.startsWith('#/storefront');
    if (!this.currentUser) {
      if (isPublicRoute && this.currentRoute !== '#/auth') {
        this.renderGuestShell(appEl);
        return;
      }
      this.renderAuthPage(appEl);
      return;
    }

    if (this.currentRoute === '#/auth') {
      this.renderAuthPage(appEl);
      return;
    }

    const sales = StorageService.getSales(this.currentUser.id);
    const products = StorageService.getProducts(this.currentUser.id);
    const expenses = StorageService.getExpenses(this.currentUser.id);
    const metrics = StorageService.calculateMetrics(sales);
    const currency = this.currentUser.currency || '₦';
    const isMerchant = this.currentUser.role === 'merchant';

    const buyerPurchases = !isMerchant ? StorageService.getBuyerPurchases(this.currentUser) : [];
    const pendingDebtsCount = sales.filter((s) => s.status === 'pending').length;
    const buyerUnpaidCount = buyerPurchases.filter((p) => p.status === 'pending').length;

    // Route identification
    const currentPrimary = this.currentRoute.split('?')[0].split('/')[1] || (isMerchant ? 'dashboard' : 'explore');

    // Multi-page navigation links depending on role
    const navItems = isMerchant
      ? [
          { route: '#/dashboard', label: 'Performance Dashboard', icon: '📊' },
          { route: '#/sales', label: 'Sales & Debts', icon: '📝', count: sales.length },
          { route: '#/inventory', label: 'Products & Stock', icon: '📦', count: products.length },
          { route: '#/expenses', label: 'Store Expenses', icon: '💸', count: expenses.length },
          { route: '#/storefront', label: 'My Storefront', icon: '🛍️' },
          { route: '#/explore', label: 'Marketplace', icon: '🌐' },
          { route: '#/analytics', label: 'Business Reports', icon: '📈' },
          { route: '#/settings', label: 'Settings', icon: '⚙️' },
        ]
      : [
          { route: '#/explore', label: 'Browse Stores', icon: '🌐' },
          { route: '#/buyer-ledger', label: 'My Purchases & Debts', icon: '🧾', count: buyerPurchases.length },
          { route: '#/settings', label: 'My Profile & Settings', icon: '⚙️' },
        ];

    const activeItem = navItems.find((item) => item.route.replace('#/', '') === currentPrimary) || navItems[0];

    appEl.innerHTML = `
      <div class="app-container">
        <!-- Persistent Top Header -->
        <header class="app-header">
          <a href="${isMerchant ? '#/dashboard' : '#/explore'}" class="brand-section">
            <div class="brand-logo-mark">${currency}</div>
            <div class="brand-info">
              <span class="brand-title">ShopKepa</span>
              <span class="brand-store-name">
                ${isMerchant ? `${this.currentUser.storeName || 'My Store'} • ${this.currentUser.niche || 'Merchant'}` : `${this.currentUser.name} (Shopper / Buyer)`}
              </span>
            </div>
          </a>

          <div class="header-actions">
            <!-- Role badge & Quick Switch -->
            <span class="role-indicator-badge">
              ${isMerchant ? `🏪 Merchant (${this.currentUser.niche || 'General'})` : '🛒 Buyer'}
            </span>

            ${
              isMerchant
                ? `
              <a href="#/new-sale" class="btn btn-success btn-sm">+ New Sale</a>
              <a href="#/new-expense" class="btn btn-secondary btn-sm" style="border-color:rgba(249,115,22,0.4); color:#fb923c;" title="Record shop expense or bills">+ Expense</a>
              <a href="#/new-product" class="btn btn-primary btn-sm">+ Add Product</a>
            `
                : `
              <a href="#/buyer-ledger" class="btn btn-secondary btn-sm">🧾 Debts & Orders (${buyerPurchases.filter(p => p.status === 'pending').length} Unpaid)</a>
              <a href="#/explore" class="btn btn-primary btn-sm">Browse Stores</a>
            `
            }

            <a href="#/auth" class="btn btn-secondary btn-sm" title="Switch or Create Account">
              Switch
            </a>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-header-logout" title="Log out of this store">
              Log Out
            </button>
          </div>
        </header>

        <!-- Vertical & Collapsible Navigation Section (Strictly No Horizontal Scrolling) -->
        <nav class="nav-section-container" aria-label="Page Navigation">
          <div class="nav-section-header">
            <div class="nav-header-left">
              <span class="nav-header-title">Page Navigation</span>
              <span class="badge badge-paid">
                ${activeItem ? `${activeItem.icon} ${activeItem.label}` : 'Dashboard'}
              </span>
            </div>
            <button
              type="button"
              id="btn-toggle-nav-collapse"
              class="btn-toggle-collapse"
              aria-expanded="${!this.isNavCollapsed}"
              title="${this.isNavCollapsed ? 'Open navigation menu' : 'Collapse navigation menu'}"
            >
              <span>${this.isNavCollapsed ? '☰ Show Pages' : 'Collapse'}</span>
              <span class="collapse-icon">${this.isNavCollapsed ? '▼' : '▲'}</span>
            </button>
          </div>

          <div id="nav-collapsible-wrapper" class="nav-collapsible-wrapper ${this.isNavCollapsed ? 'collapsed' : ''}">
            <div class="nav-pages-vertical">
              ${navItems
                .map((item) => {
                  const itemKey = item.route.replace('#/', '');
                  const isActive = currentPrimary === itemKey;
                  const countBadge = item.count !== undefined ? `<span class="nav-item-count">${item.count}</span>` : '';
                  return `
                  <a href="${item.route}" class="nav-page-link-vertical ${isActive ? 'active' : ''}">
                    <span class="nav-link-left">
                      <span class="nav-link-icon">${item.icon}</span>
                      <span class="nav-link-label">${item.label}</span>
                    </span>
                    <span class="nav-link-right">
                      ${countBadge}
                      <span class="nav-link-arrow">→</span>
                    </span>
                  </a>
                `;
                })
                .join('')}
            </div>
          </div>
        </nav>

        <!-- Dynamic Multi-Page Router View -->
        <main id="page-viewport" style="display:flex; flex-direction:column; gap:20px;">
          ${
            this.currentUser.isDeactivated
              ? `<div class="deactivated-banner">
                   <span>⏸️ <strong>Your storefront is currently deactivated</strong> and hidden from Marketplace buyers.</span>
                   <button type="button" id="btn-banner-reactivate" class="btn btn-success btn-sm">▶️ Reactivate Store</button>
                 </div>`
              : ''
          }
          ${this.renderCurrentPageView(sales, products, metrics)}
        </main>

        <!-- Glassmorphism Mobile Bottom Navigation Bar (Handy for phones <= 680px) -->
        <nav class="mobile-bottom-nav" aria-label="Quick Mobile Navigation">
          ${
            isMerchant
              ? `
            <a href="#/dashboard" class="mobile-nav-item ${currentPrimary === 'dashboard' ? 'active' : ''}">
              <span class="mobile-nav-icon">📊</span>
              <span>Dashboard</span>
            </a>
            <a href="#/inventory" class="mobile-nav-item ${currentPrimary === 'inventory' ? 'active' : ''}">
              <span class="mobile-nav-icon">📦</span>
              <span>Products</span>
            </a>
            <a href="#/new-sale" class="mobile-nav-item mobile-nav-item-action" title="Quick Record Sale">
              <span class="mobile-nav-action-circle">+</span>
              <span style="font-size:10px; font-weight:700;">New Sale</span>
            </a>
            <a href="#/sales" class="mobile-nav-item ${currentPrimary === 'sales' ? 'active' : ''}">
              <span class="mobile-nav-icon">📝</span>
              <span>Sales</span>
              ${pendingDebtsCount > 0 ? `<span class="mobile-nav-badge">${pendingDebtsCount}</span>` : ''}
            </a>
            <a href="#/expenses" class="mobile-nav-item ${currentPrimary === 'expenses' ? 'active' : ''}">
              <span class="mobile-nav-icon">💸</span>
              <span>Expenses</span>
            </a>
            `
              : `
            <a href="#/explore" class="mobile-nav-item ${currentPrimary === 'explore' ? 'active' : ''}">
              <span class="mobile-nav-icon">🌐</span>
              <span>Stores</span>
            </a>
            <a href="#/buyer-ledger" class="mobile-nav-item ${currentPrimary === 'buyer-ledger' ? 'active' : ''}">
              <span class="mobile-nav-icon">🧾</span>
              <span>Debts</span>
              ${buyerUnpaidCount > 0 ? `<span class="mobile-nav-badge">${buyerUnpaidCount}</span>` : ''}
            </a>
            <a href="#/settings" class="mobile-nav-item ${currentPrimary === 'settings' ? 'active' : ''}">
              <span class="mobile-nav-icon">⚙️</span>
              <span>Settings</span>
            </a>
            `
          }
        </nav>
      </div>
    `;

    this.bindCurrentPageEvents(sales, products);
  }

  // --- Page View Router ---
  private renderCurrentPageView(sales: Sale[], products: Product[], metrics: any): string {
    const rawRoute = this.currentRoute || (this.currentUser?.role === 'buyer' ? '#/explore' : '#/dashboard');
    const [path, queryString] = rawRoute.split('?');

    // Enforce buyer route scope so buyers don't accidentally view merchant-only internal routes
    if (this.currentUser?.role === 'buyer') {
      if (path === '#/buyer-ledger') {
        return this.renderBuyerLedgerPageHTML();
      } else if (path === '#/settings') {
        return this.renderSettingsPageHTML();
      } else if (path === '#/storefront' && new URLSearchParams(queryString || '').get('merchant')) {
        return this.renderStorefrontPageHTML(products);
      }
      return this.renderExplorePageHTML();
    }

    if (path === '#/dashboard') {
      return this.renderDashboardPageHTML();
    } else if (path === '#/explore') {
      return this.renderExplorePageHTML();
    } else if (path === '#/buyer-ledger') {
      return this.renderBuyerLedgerPageHTML();
    } else if (path === '#/sales') {
      return this.renderSalesPageHTML(sales, metrics);
    } else if (path === '#/new-sale') {
      return this.renderNewSalePageHTML(products);
    } else if (path === '#/inventory') {
      return this.renderInventoryPageHTML(products);
    } else if (path === '#/new-product') {
      return this.renderNewProductPageHTML();
    } else if (path.startsWith('#/edit-product/')) {
      const prodId = path.replace('#/edit-product/', '');
      return this.renderEditProductPageHTML(prodId);
    } else if (path === '#/expenses') {
      return this.renderExpensesPageHTML();
    } else if (path === '#/new-expense') {
      return this.renderNewExpensePageHTML();
    } else if (path.startsWith('#/edit-expense/')) {
      const expId = path.replace('#/edit-expense/', '');
      return this.renderEditExpensePageHTML(expId);
    } else if (path === '#/storefront') {
      return this.renderStorefrontPageHTML(products);
    } else if (path === '#/analytics') {
      return this.renderAnalyticsPageHTML(sales, metrics);
    } else if (path === '#/settings') {
      return this.renderSettingsPageHTML();
    }

    return this.renderExplorePageHTML();
  }

  // =========================================================================
  // PAGE: RECHARTS PERFORMANCE DASHBOARD (SALES & EXPENSES VISUALIZER)
  // =========================================================================
  private renderDashboardPageHTML(): string {
    return `
      <div id="recharts-dashboard-container" style="min-height: 500px;">
        <!-- Recharts React Root mounts dynamically here -->
      </div>
    `;
  }

  // =========================================================================
  // PAGE: EXPLORE OTHER MERCHANTS & DIRECTORY (BY NICHE)
  // =========================================================================
  private renderExplorePageHTML(): string {
    const allMerchants = StorageService.getAllMerchants();
    const currency = this.currentUser?.currency || '₦';

    // Filter merchants by selected niche
    let filtered = allMerchants;
    if (this.exploreNicheFilter !== 'All') {
      filtered = filtered.filter(
        (m) => (m.niche || '').toLowerCase() === this.exploreNicheFilter.toLowerCase()
      );
    }

    // Search query filter (store name, owner, city, or niche)
    if (this.exploreSearchQuery.trim()) {
      const q = this.exploreSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          (m.storeName || '').toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          (m.niche || '').toLowerCase().includes(q) ||
          (m.city || '').toLowerCase().includes(q) ||
          (m.bio || '').toLowerCase().includes(q)
      );
    }

    const watcherKey = this.currentUser?.id || 'guest';
    const watchlist = StorageService.getStockWatchlist(watcherKey);
    const backInStockItems = watchlist.filter((item) => item.isBackInStock);

    return `
      <!-- Page Header Row -->
      <div class="page-header-row">
        <div class="page-title-group">
          <h1>Explore Marketplace & Merchants</h1>
          <p>Discover verified merchants across various niches, track product stock, and order via WhatsApp.</p>
        </div>

        ${
          this.currentUser?.role === 'buyer'
            ? `<span class="badge badge-paid">🛒 Shopper Mode Active</span>`
            : this.currentUser?.role === 'merchant'
            ? `<a href="#/storefront" class="btn btn-secondary btn-sm">👁️ View My Storefront</a>`
            : `<span class="badge badge-paid">🌐 Guest Browsing</span>`
        }
      </div>

      ${
        watchlist.length > 0
          ? `
        <!-- Buyer Tracked Products & Live Stock Alerts -->
        <section class="alert-banner-box" style="margin-bottom:16px; border-color:${backInStockItems.length > 0 ? 'rgba(16,185,129,0.45)' : 'var(--border-strong)'}; background:${backInStockItems.length > 0 ? 'rgba(16,185,129,0.08)' : 'var(--bg-surface)'};">
          <div class="alert-banner-header">
            <div class="alert-banner-title">
              <span>${backInStockItems.length > 0 ? `🎉 ${backInStockItems.length} Tracked Product(s) Back in Stock!` : `🔔 Tracked Products (${watchlist.length})`}</span>
            </div>
            <span style="font-size:11px; color:var(--text-secondary);">Live stock status updates automatically</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
            ${watchlist
              .map(({ product, merchant, isBackInStock }) => {
                const storeTitle = merchant?.storeName || merchant?.name || 'Store';
                const prodCurrency = merchant?.currency || currency;
                const statusBadge =
                  product.stock <= 0
                    ? `<span class="badge badge-out-of-stock">🚨 Out of Stock</span>`
                    : isBackInStock
                    ? `<span class="badge badge-in-stock">🎉 Back in Stock (${product.stock})</span>`
                    : product.stock < 5
                    ? `<span class="badge badge-low-stock">⚠️ Low Stock (${product.stock} left)</span>`
                    : `<span class="badge badge-in-stock">✓ In Stock (${product.stock})</span>`;

                const waLink = merchant?.phone
                  ? generateWhatsAppOrderLink({
                      phone: merchant.phone,
                      storeName: storeTitle,
                      productName: product.name,
                      price: product.price,
                      currency: prodCurrency,
                    })
                  : '';

                return `
                  <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding:10px 12px; background:var(--bg-surface-elevated); border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
                    <div style="display:flex; flex-direction:column; gap:2px;">
                      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <strong style="font-size:var(--text-sm); color:var(--text-primary);">${product.name}</strong>
                        ${statusBadge}
                      </div>
                      <span style="font-size:11px; color:var(--text-secondary);">
                        ${storeTitle} • <strong>${formatCurrency(product.price, prodCurrency)}</strong>
                      </span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                      <a href="#/storefront?merchant=${product.userId}" class="btn btn-secondary btn-sm">View Store</a>
                      ${
                        product.stock > 0 && waLink
                          ? `<a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp btn-sm">💬 Order</a>`
                          : ''
                      }
                      <button type="button" class="btn btn-secondary btn-sm btn-unwatch-product" data-product-id="${product.id}" title="Stop tracking this product" style="padding:4px 8px;">✕</button>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </section>
      `
          : ''
      }

      <!-- Search & Niche Filter Bar -->
      <section class="section-toolbar" style="gap:16px;">
        <div class="search-input-wrapper" style="max-width:480px;">
          <span class="search-icon">🔍</span>
          <input
            type="text"
            id="explore-search-input"
            class="search-input"
            placeholder="Search stores by name, niche, location (e.g. Lagos, Fashion, Gadgets)..."
            value="${escapeHtml(this.exploreSearchQuery)}"
          />
        </div>
      </section>

      <!-- Collapsible Niche Filter Section -->
      <section class="niche-section-container">
        <div class="niche-section-header">
          <div class="niche-header-title">
            <span style="font-weight:700; font-size:var(--text-xs); text-transform:uppercase; letter-spacing:0.05em; color:var(--text-secondary);">
              Filter by Niche:
            </span>
            <span class="badge badge-niche">
              ${this.exploreNicheFilter === 'All' ? '🌟 All Niches' : this.exploreNicheFilter}
            </span>
          </div>

          <button
            type="button"
            id="btn-toggle-niche-collapse"
            class="btn-toggle-collapse"
            aria-expanded="${!this.isNicheCollapsed}"
            title="${this.isNicheCollapsed ? 'Expand niches' : 'Collapse niches'}"
          >
            <span>${this.isNicheCollapsed ? 'Show Niches' : 'Collapse'}</span>
            <span class="collapse-icon">${this.isNicheCollapsed ? '▼' : '▲'}</span>
          </button>
        </div>

        <div id="niche-collapsible-wrapper" class="niche-collapsible-wrapper ${this.isNicheCollapsed ? 'collapsed' : ''}">
          <!-- Niche Tabs (Vertical Layout) -->
          <div class="niche-filter-bar">
            <button class="niche-filter-btn ${this.exploreNicheFilter === 'All' ? 'active' : ''}" data-niche="All">
              <span class="niche-btn-left">
                <span class="niche-emoji">🌟</span>
                <span class="niche-name">All Niches</span>
              </span>
              <span class="niche-count-pill">${allMerchants.length}</span>
            </button>
            ${POPULAR_NICHES.map((niche) => {
              const count = allMerchants.filter((m) => (m.niche || '').toLowerCase() === niche.toLowerCase()).length;
              let icon = '🏷️';
              if (niche === 'Fashion') icon = '👗';
              else if (niche === 'Beauty') icon = '💄';
              else if (niche === 'Tech Gadgets') icon = '📱';
              else if (niche === 'Foodstuff & Provisions') icon = '🥫';
              else if (niche === 'Health & Wellness') icon = '🌿';
              else if (niche === 'Home & Living') icon = '🏠';
              else if (niche === 'Electronics') icon = '⚡';
              else if (niche === 'General Merchandise') icon = '🎁';

              return `
                <button class="niche-filter-btn ${this.exploreNicheFilter === niche ? 'active' : ''}" data-niche="${niche}">
                  <span class="niche-btn-left">
                    <span class="niche-emoji">${icon}</span>
                    <span class="niche-name">${niche}</span>
                  </span>
                  <span class="niche-count-pill">${count}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      </section>

      <!-- Merchants Directory Grid -->
      <div class="merchant-grid" id="explore-merchant-grid">
        ${this.renderExploreGridInnerHTML(allMerchants, filtered)}
      </div>
    `;
  }

  private renderExploreGridInnerHTML(allMerchantsInput?: User[], filteredInput?: User[]): string {
    const allMerchants = allMerchantsInput || StorageService.getAllMerchants();
    let filtered = filteredInput;
    if (!filtered) {
      filtered = allMerchants;
      if (this.exploreNicheFilter !== 'All') {
        filtered = filtered.filter(
          (m) => (m.niche || '').toLowerCase() === this.exploreNicheFilter.toLowerCase()
        );
      }
      if (this.exploreSearchQuery.trim()) {
        const q = this.exploreSearchQuery.toLowerCase();
        filtered = filtered.filter(
          (m) =>
            (m.storeName || '').toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q) ||
            (m.niche || '').toLowerCase().includes(q) ||
            (m.city || '').toLowerCase().includes(q) ||
            (m.bio || '').toLowerCase().includes(q)
        );
      }
    }

    if (allMerchants.length === 0) {
      return `<div class="empty-state" style="grid-column:1 / -1; padding:48px 24px; border:1px dashed var(--border-subtle); border-radius:var(--radius-lg);">
        <span class="empty-state-icon">🏪</span>
        <h3 style="font-size:var(--text-lg); margin-top:8px;">No Public Stores Published Yet</h3>
        <p style="max-width:480px; margin:8px auto; color:var(--text-secondary); line-height:1.6;">
          All demo showcase stores have been cleared. As real verified merchants register and configure their store contact details, they will appear here for buyers to browse and place WhatsApp orders.
        </p>
        ${
          this.currentUser?.role === 'merchant'
            ? `<a href="#/settings" class="btn btn-primary btn-sm" style="margin-top:12px;">
                 ⚙️ Set Up Your Store Profile to Publish Here
               </a>`
            : `<a href="#/auth" class="btn btn-primary btn-sm" style="margin-top:12px;">
                 + Register Your Store on ShopKepa
               </a>`
        }
       </div>`;
    }

    if (filtered.length === 0) {
      return `<div class="empty-state" style="grid-column:1 / -1;">
        <span class="empty-state-icon">🔍</span>
        <h3>No merchants found</h3>
        <p>No verified stores found matching your search in the "${this.exploreNicheFilter}" niche.</p>
        <button id="btn-reset-explore-filters" class="btn btn-secondary btn-sm" style="margin-top:8px;">
          Show All Stores
        </button>
       </div>`;
    }

    return filtered
      .map((merchant) => {
        const merchantProds = StorageService.getProducts(merchant.id);
        const inStockCount = merchantProds.filter((p) => p.stock > 0).length;

        const waPhone = sanitizeWhatsAppPhone(merchant.phone);
        const waMessage = encodeURIComponent(
          `Hello ${merchant.storeName || merchant.name}!\nI found your store on ShopKepa (${merchant.niche || 'Marketplace'}). I would like to inquire about your products.`
        );
        const waLink = `https://wa.me/${waPhone}?text=${waMessage}`;

        return `
  <div class="merchant-card">
    <div class="merchant-card-header">
      <div>
        <h2 class="merchant-card-title">${merchant.storeName || merchant.name}</h2>
        <div class="merchant-card-owner">
          by <strong>${merchant.name}</strong> • ${merchant.city || 'Nigeria'}
        </div>
      </div>
      <span class="badge badge-niche">
        ${merchant.niche || 'Merchant'}
      </span>
    </div>

    <p class="merchant-card-bio">
      ${merchant.bio || 'Verified micro-merchant on ShopKepa. Contact for instant WhatsApp ordering.'}
    </p>

    <div class="merchant-card-meta">
      <span>📦 <strong>${inStockCount}</strong> In Stock (${merchantProds.length} Listed)</span>
      <span>${merchant.phone ? `📞 ${merchant.phone}` : 'No phone listed'}</span>
    </div>

    <div class="merchant-card-actions">
      ${
        merchant.phone
          ? `<a
              href="${waLink}"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-whatsapp btn-sm"
              style="flex:1; text-decoration:none;"
            >
              💬 Chat on WhatsApp
            </a>`
          : `<button class="btn btn-secondary btn-sm" disabled style="flex:1;">No WhatsApp</button>`
      }
      <a
        href="#/storefront?merchant=${merchant.id}"
        class="btn btn-secondary btn-sm"
        title="View this merchant's digital catalog"
      >
        View Catalog
      </a>
    </div>
  </div>
`;
      })
      .join('');
  }

  // =========================================================================
  // PAGE: STOREFRONT (Viewing Own Store OR Another Merchant's Store)
  // =========================================================================
  private renderStorefrontPageHTML(products: Product[]): string {
    const currency = this.currentUser?.currency || '₦';

    // Check if viewing a specific merchant from Explore directory
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const merchantId = urlParams.get('merchant');
    const targetMerchant = merchantId ? StorageService.getUserById(merchantId) : this.currentUser;

    if (!targetMerchant) {
      return `
        <div class="empty-state">
          <p>Merchant not found.</p>
          <a href="#/explore" class="btn btn-secondary">← Back to Explore Marketplace</a>
        </div>
      `;
    }

    const isViewingOther = targetMerchant.id !== this.currentUser?.id;
    const storeProducts = isViewingOther ? StorageService.getProducts(targetMerchant.id) : products;
    const phone = targetMerchant.phone || '';
    const cleanPhone = sanitizeWhatsAppPhone(phone);
    const storeName = targetMerchant.storeName || targetMerchant.name;
    const niche = targetMerchant.niche || 'General';
    const storeCurrency = targetMerchant.currency || currency;
    const watcherKey = this.currentUser?.id || 'guest';

    const inStockCount = storeProducts.filter((p) => p.stock > 0).length;
    const outOfStockCount = storeProducts.filter((p) => p.stock <= 0).length;

    const restockedHere = StorageService.getStockWatchlist(watcherKey).filter(
      (item) => item.product.userId === targetMerchant.id && item.isBackInStock
    );

    let visibleProducts = storeProducts;
    if (this.storefrontStockFilter === 'in_stock') {
      visibleProducts = storeProducts.filter((p) => p.stock > 0);
    } else if (this.storefrontStockFilter === 'out_of_stock') {
      visibleProducts = storeProducts.filter((p) => p.stock <= 0);
    }

    return `
      ${
        isViewingOther
          ? `<div><a href="#/explore" class="page-back-link">← Back to Explore Marketplace</a></div>`
          : ''
      }

      ${
        restockedHere.length > 0
          ? `
        <div class="alert-banner-box" style="margin-bottom:14px; border-color:rgba(16,185,129,0.45); background:rgba(16,185,129,0.08);">
          <div class="alert-banner-header">
            <div class="alert-banner-title">
              <span>🎉 Back in Stock at ${storeName}!</span>
            </div>
          </div>
          <p class="alert-banner-desc" style="margin-top:4px;">
            Products you tracked are now available: <strong>${restockedHere.map((r) => `${r.product.name} (${r.product.stock} left)`).join(', ')}</strong>.
          </p>
        </div>
      `
          : ''
      }

      <!-- Page Header Row -->
      <div class="page-header-row">
        <div class="page-title-group">
          <h1>${storeName} — WhatsApp Storefront</h1>
          <p>Niche: <strong>${niche}</strong> • Location: ${targetMerchant.city || 'Verified Merchant'}</p>
        </div>

        ${
          storeProducts.length > 0
            ? `<button id="btn-copy-catalog-summary" class="btn btn-secondary btn-sm">📋 Copy Catalog Text</button>`
            : ''
        }
      </div>

      <!-- Merchant Banner -->
      <section class="storefront-banner">
        <div class="storefront-banner-text">
          <h2>📱 ${storeName} Direct WhatsApp</h2>
          <p>Contact Phone: <strong>${phone || 'No phone set'}</strong></p>
          ${targetMerchant.bio ? `<p style="font-size:var(--text-xs); color:#d1fae5; margin-top:2px;">"${targetMerchant.bio}"</p>` : ''}
        </div>

        ${
          cleanPhone
            ? `<a
                href="https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hello ${storeName}! I am browsing your ShopKepa storefront.`)}"
                target="_blank"
                rel="noopener noreferrer"
                class="btn btn-whatsapp btn-sm"
              >
                💬 Open WhatsApp Chat
              </a>`
            : !isViewingOther
            ? `<a href="#/settings" class="btn btn-secondary btn-sm">Set Phone in Settings</a>`
            : `<span class="badge badge-unpaid">No WhatsApp Phone</span>`
        }
      </section>

      ${
        storeProducts.length > 0
          ? `
        <!-- Buyer Stock Availability Filter -->
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <button type="button" class="btn btn-sm ${this.storefrontStockFilter === 'all' ? 'btn-primary' : 'btn-secondary'} storefront-stock-filter-btn" data-stock-filter="all">
            All Items (${storeProducts.length})
          </button>
          <button type="button" class="btn btn-sm ${this.storefrontStockFilter === 'in_stock' ? 'btn-primary' : 'btn-secondary'} storefront-stock-filter-btn" data-stock-filter="in_stock">
            ✓ In Stock (${inStockCount})
          </button>
          <button type="button" class="btn btn-sm ${this.storefrontStockFilter === 'out_of_stock' ? 'btn-primary' : 'btn-secondary'} storefront-stock-filter-btn" data-stock-filter="out_of_stock">
            Out of Stock (${outOfStockCount})
          </button>
        </div>
      `
          : ''
      }

      ${
        storeProducts.length === 0
          ? `<!-- Clean Empty State When User Has Not Filled Any Products -->
            <div class="empty-state">
              <span class="empty-state-icon">🛍️</span>
              <h3>${isViewingOther ? `${storeName} has no products listed yet` : 'Your WhatsApp Storefront is Empty'}</h3>
              <p>${
                isViewingOther
                  ? 'This merchant has not added items yet. You can still message them on WhatsApp.'
                  : 'No products in your catalog yet. Once you add items in Inventory, your buyer product cards with 1-click WhatsApp order links will appear here.'
              }</p>
              ${
                !isViewingOther
                  ? `<a href="#/new-product" class="btn btn-primary btn-lg" style="margin-top:8px;">+ Add Products to Storefront</a>`
                  : `<a href="#/explore" class="btn btn-secondary btn-sm" style="margin-top:8px;">Browse Other Stores</a>`
              }
            </div>`
          : visibleProducts.length === 0
          ? `<div class="empty-state">
              <span class="empty-state-icon">📦</span>
              <h3>No products match this stock filter</h3>
              <p>${this.storefrontStockFilter === 'in_stock' ? 'No items are currently in stock. Track out-of-stock items to get alerted when restocked.' : 'All items in this store are currently in stock!'}</p>
              <button type="button" class="btn btn-secondary btn-sm storefront-stock-filter-btn" data-stock-filter="all" style="margin-top:8px;">
                Show All Items
              </button>
            </div>`
          : `<div class="product-grid">
              ${visibleProducts
                .map((product) => {
                  const waLink = generateWhatsAppOrderLink({
                    phone,
                    storeName,
                    productName: product.name,
                    price: product.price,
                    currency: storeCurrency,
                  });

                  const stockStatusText =
                    product.stock === 0
                      ? 'Out of Stock'
                      : product.stock < 5
                      ? `Low Stock (${product.stock} left)`
                      : `In Stock (${product.stock})`;

                  const isOut = product.stock === 0;
                  const isWatched = StorageService.isProductWatched(watcherKey, product.id);

                  return `
                <div class="product-card" style="border: 1px solid rgba(37, 211, 102, 0.25);">
                  <div class="product-card-image-box">
                    ${
                      product.image
                        ? `<img src="${product.image}" alt="${product.name}" class="product-card-img" />`
                        : `<span class="product-card-img-placeholder">🛍️</span>`
                    }
                  </div>

                  <div class="product-card-body">
                    <div class="product-card-header">
                      <div>
                        <h3 class="product-card-title">${product.name}</h3>
                        <span class="product-card-category">${product.category}</span>
                      </div>
                    </div>

                    <div style="margin:2px 0;">
                      <span class="badge ${isOut ? 'badge-out-of-stock' : product.stock < 5 ? 'badge-low-stock' : 'badge-in-stock'}">
                        ${stockStatusText}
                      </span>
                    </div>

                    <div class="product-card-price-row">
                      <span class="product-card-price text-emerald">${formatCurrency(product.price, storeCurrency)}</span>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:6px; margin-top:6px;">
                      <a
                        href="${waLink}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="btn btn-whatsapp btn-sm"
                        style="width:100%; text-decoration:none;"
                      >
                        💬 ${isOut ? 'Inquire' : 'Order'}
                      </a>
                      ${
                        isViewingOther
                          ? `<button
                              type="button"
                              class="btn btn-sm ${isWatched ? 'btn-primary' : 'btn-secondary'} btn-toggle-watch-product"
                              data-product-id="${product.id}"
                              style="width:100%;"
                              title="${isWatched ? 'Tracking live stock & restocks' : 'Track stock status & restock alerts'}"
                            >
                              ${isWatched ? '🔔 Tracking' : '🔔 Track'}
                            </button>`
                          : ''
                      }
                    </div>
                  </div>
                </div>
              `;
                })
                .join('')}
            </div>`
      }
    `;
  }

  // =========================================================================
  // PAGE: SALES & DEBT LEDGER
  // =========================================================================
  private renderSalesPageHTML(sales: Sale[], metrics: any): string {
    const currency = this.currentUser?.currency || '₦';
    const lowStockThreshold = this.currentUser?.lowStockThreshold ?? 5;
    const products = this.currentUser ? StorageService.getProducts(this.currentUser.id) : [];
    const outOfStockItems = products.filter((p) => p.stock <= 0);
    const lowStockItems = products.filter((p) => p.stock > 0 && p.stock <= lowStockThreshold);
    const hasInventoryAlert = outOfStockItems.length > 0 || lowStockItems.length > 0;

    const pendingDebts = sales.filter((s) => s.status === 'pending');
    const overdueDebts = pendingDebts.filter((s) => {
      const dueInfo = getDebtDueStatus(s.dueDate);
      return dueInfo.status === 'overdue' || dueInfo.status === 'due_today';
    });
    const overdueTotalSum = overdueDebts.reduce((sum, s) => sum + s.totalAmount, 0);

    let filtered = sales;
    if (this.salesStatusFilter === 'completed') {
      filtered = filtered.filter((s) => s.status === 'completed');
    } else if (this.salesStatusFilter === 'pending') {
      filtered = filtered.filter((s) => s.status === 'pending');
    } else if (this.salesStatusFilter === 'overdue') {
      filtered = filtered.filter((s) => {
        if (s.status !== 'pending') return false;
        const dueInfo = getDebtDueStatus(s.dueDate);
        return dueInfo.status === 'overdue' || dueInfo.status === 'due_today';
      });
    }

    if (this.salesSearchQuery.trim()) {
      const q = this.salesSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.customerName.toLowerCase().includes(q) ||
          s.customerPhone?.toLowerCase().includes(q) ||
          s.items.some((i) => i.productName.toLowerCase().includes(q)) ||
          s.id.toLowerCase().includes(q)
      );
    }

    return `
      <!-- Top Dynamic Metrics Grid (Always 0 when empty) -->
      <section class="metrics-grid" aria-label="Quick Financial Stats">
        <div class="metric-card card-revenue">
          <div class="metric-header">
            <span class="metric-label">Money Collected</span>
            <span class="metric-icon">💰</span>
          </div>
          <div class="metric-value text-emerald">${formatCurrency(metrics.totalRevenue, currency)}</div>
          <div class="metric-subtext">Cash received from paid sales</div>
        </div>

        <div class="metric-card card-orders">
          <div class="metric-header">
            <span class="metric-label">Paid Sales</span>
            <span class="metric-icon">📦</span>
          </div>
          <div class="metric-value text-cyan">${formatNumber(metrics.totalOrders)}</div>
          <div class="metric-subtext">Completed sales transactions</div>
        </div>

        <div class="metric-card card-aov">
          <div class="metric-header">
            <span class="metric-label">Average Sale</span>
            <span class="metric-icon">📊</span>
          </div>
          <div class="metric-value">${formatCurrency(metrics.aov, currency)}</div>
          <div class="metric-subtext">Average amount per sale</div>
        </div>

        <div class="metric-card card-debt">
          <div class="metric-header">
            <span class="metric-label">Money Customers Owe</span>
            <span class="metric-icon">⏳</span>
          </div>
          <div class="metric-value text-rose">${formatCurrency(metrics.totalDebt, currency)}</div>
          <div class="metric-subtext">${pendingDebts.length} customer${pendingDebts.length === 1 ? '' : 's'} yet to pay</div>
        </div>
      </section>

      <!-- Dashboard Highlight System: Overdue Debt Collection Banner -->
      ${
        overdueDebts.length > 0
          ? `
          <div class="alert-banner-box alert-banner-overdue" style="margin-top:16px;">
            <div class="alert-banner-header">
              <div class="alert-banner-title">
                <span>⏰ Attention: Unpaid Customer Debts Due (${overdueDebts.length})</span>
              </div>
              <span class="badge badge-overdue">${formatCurrency(overdueTotalSum, currency)} Total Overdue</span>
            </div>
            <p class="alert-banner-desc">
              Payment is due or past due for the customers below. Tap <strong>"💬 WhatsApp Reminder"</strong> to send a ready-made WhatsApp message with their item details, amount owed, and your bank account info.
            </p>
            <div class="alert-debtor-grid">
              ${overdueDebts
                .map((s) => {
                  const due = getDebtDueStatus(s.dueDate);
                  const isLate = due.status === 'overdue';
                  return `
                  <div class="alert-debtor-card">
                    <div class="alert-debtor-header">
                      <div>
                        <strong style="color:var(--text-primary); font-size:var(--text-sm);">${s.customerName}</strong>
                        <div style="font-size:var(--text-xs); color:var(--text-muted);">${s.customerPhone || 'Phone not set'}</div>
                      </div>
                      <span class="badge ${isLate ? 'badge-overdue' : 'badge-due-today'}">${due.label}</span>
                    </div>
                    <div style="font-size:var(--text-xs); color:var(--text-secondary); line-height:1.4;">
                      <strong>Goods:</strong> ${s.items.map((i) => `${i.productName} (x${i.quantity})`).join(', ')}
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
                      <span class="text-rose" style="font-family:var(--font-mono); font-weight:800; font-size:var(--text-base);">
                        ${formatCurrency(s.totalAmount, currency)}
                      </span>
                      <button
                        type="button"
                        class="btn btn-sm btn-whatsapp-action btn-send-debt-wa"
                        data-sale-id="${s.id}"
                        title="Send pre-formatted WhatsApp debt notice detailing goods and due balance"
                      >
                        💬 WhatsApp Reminder
                      </button>
                    </div>
                  </div>
                `;
                })
                .join('')}
            </div>
          </div>
          `
          : ''
      }

      <!-- Dashboard Highlight System: Low Stock Alert Banner -->
      ${
        hasInventoryAlert
          ? `
          <div class="alert-banner-box alert-banner-stock" style="margin-top:16px;">
            <div class="alert-banner-header">
              <div class="alert-banner-title">
                <span>⚠️ Inventory Low Stock Warning (Threshold: ≤ ${lowStockThreshold} units)</span>
              </div>
              <div style="display:flex; gap:8px;">
                <a href="#/inventory" class="btn btn-secondary btn-sm">📦 View Inventory</a>
                <a href="#/settings" class="btn btn-secondary btn-sm" title="Adjust your custom stock threshold">⚙️ Configure Threshold</a>
              </div>
            </div>
            <p class="alert-banner-desc">
              ${outOfStockItems.length > 0 ? `<strong>${outOfStockItems.length} item(s) are completely Out of Stock!</strong> ` : ''}
              ${lowStockItems.length > 0 ? `${lowStockItems.length} item(s) have fallen to or below your custom threshold (${lowStockThreshold} units). Restock to keep sales uninterrupted.` : ''}
            </p>
            <div class="alert-stock-chips">
              ${outOfStockItems
                .map(
                  (p) => `
                <div class="alert-stock-chip out-of-stock">
                  <span>🚨 <strong>${p.name}</strong>: 0 units (Out of Stock)</span>
                  <a href="#/edit-product/${p.id}" class="btn btn-outline-danger btn-sm" style="padding:2px 8px; min-height:22px; font-size:10px;">Restock</a>
                </div>
              `
                )
                .join('')}
              ${lowStockItems
                .map(
                  (p) => `
                <div class="alert-stock-chip low-stock">
                  <span>⚠️ <strong>${p.name}</strong>: ${p.stock} units left (Low)</span>
                  <a href="#/edit-product/${p.id}" class="btn btn-secondary btn-sm" style="padding:2px 8px; min-height:22px; font-size:10px;">Restock</a>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
          `
          : ''
      }

      <!-- Page Header Row -->
      <div class="page-header-row" style="margin-top:16px;">
        <div class="page-title-group">
          <h1>Sales & Customer Debts</h1>
          <p>Record your daily sales, keep track of who owes you money, and send WhatsApp reminders.</p>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          ${
            pendingDebts.length > 0
              ? `
              <button id="btn-open-wa-debt-hub" class="btn btn-whatsapp-action btn-sm" title="Generate pre-filled WhatsApp payment reminders for customers owing debt">
                💬 WhatsApp Debt Notices (${pendingDebts.length})
              </button>
              `
              : ''
          }
          ${
            sales.length > 0
              ? `
              <button id="btn-export-pdf" class="btn btn-secondary btn-sm" title="Print or save as PDF receipt">
                📄 Print / PDF
              </button>
              <button id="btn-export-csv" class="btn btn-secondary btn-sm" title="Download Excel-ready CSV spreadsheet">
                📥 Download Excel/CSV
              </button>
              `
              : ''
          }
          <a href="#/new-sale" class="btn btn-success btn-sm">
            + Record Sale or Debt
          </a>
        </div>
      </div>

      ${
        sales.length === 0
          ? `<!-- Clean Empty State When User Has Not Filled Any Sales -->
            <div class="empty-state">
              <span class="empty-state-icon">📋</span>
              <h3>No Sales Recorded Yet</h3>
              <p>You haven't recorded any sales or customer debts yet. Tap the button below to record your first sale or customer credit.</p>
              <a href="#/new-sale" class="btn btn-success btn-lg" style="margin-top:8px;">
                + Record Your First Sale
              </a>
            </div>`
          : `<section class="section-toolbar">
              <div class="search-filter-bar">
                <div class="search-input-wrapper">
                  <span class="search-icon">🔍</span>
                  <input
                    type="text"
                    id="sales-search-input"
                    class="search-input"
                    placeholder="Search by customer name, item, or phone number..."
                    value="${escapeHtml(this.salesSearchQuery)}"
                  />
                </div>
              </div>
            </section>

            <!-- Collapsible Sales Status Filter Section (Vertical Layout) -->
            <section class="collapsible-filter-container">
              <div class="collapsible-filter-header">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-weight:700; font-size:var(--text-xs); text-transform:uppercase; letter-spacing:0.04em; color:var(--text-secondary);">
                    Show Sales:
                  </span>
                  <span class="badge ${this.salesStatusFilter === 'completed' ? 'badge-paid' : this.salesStatusFilter === 'pending' ? 'badge-pending' : this.salesStatusFilter === 'overdue' ? 'badge-overdue' : 'badge-niche'}">
                    ${this.salesStatusFilter === 'all' ? `All (${sales.length})` : this.salesStatusFilter === 'completed' ? `Paid (${sales.filter((s) => s.status === 'completed').length})` : this.salesStatusFilter === 'pending' ? `Unpaid Debts (${pendingDebts.length})` : `Overdue (${overdueDebts.length})`}
                  </span>
                </div>
                <button
                  type="button"
                  id="btn-toggle-sales-filter-collapse"
                  class="btn-toggle-collapse"
                  aria-expanded="${!this.isSalesFilterCollapsed}"
                  title="${this.isSalesFilterCollapsed ? 'Show filters' : 'Hide filters'}"
                >
                  <span>${this.isSalesFilterCollapsed ? 'Show Filter Options' : 'Hide Options'}</span>
                  <span class="collapse-icon">${this.isSalesFilterCollapsed ? '▼' : '▲'}</span>
                </button>
              </div>

              <div id="sales-filter-collapsible-wrapper" class="collapsible-filter-body ${this.isSalesFilterCollapsed ? 'collapsed' : ''}">
                <div class="filter-bar-vertical">
                  <button class="filter-btn-vertical ${this.salesStatusFilter === 'all' ? 'active' : ''}" data-sales-filter="all">
                    <span>📋 All Sales & Debts</span>
                    <span class="filter-count-pill">${sales.length}</span>
                  </button>
                  <button class="filter-btn-vertical ${this.salesStatusFilter === 'completed' ? 'active' : ''}" data-sales-filter="completed">
                    <span>✓ Fully Paid (Cash in Hand)</span>
                    <span class="filter-count-pill">${sales.filter((s) => s.status === 'completed').length}</span>
                  </button>
                  <button class="filter-btn-vertical ${this.salesStatusFilter === 'pending' ? 'active' : ''}" data-sales-filter="pending">
                    <span>⏳ Customers Owing (Unpaid)</span>
                    <span class="filter-count-pill">${pendingDebts.length}</span>
                  </button>
                  ${
                    overdueDebts.length > 0
                      ? `<button class="filter-btn-vertical ${this.salesStatusFilter === 'overdue' ? 'active' : ''}" data-sales-filter="overdue">
                          <span style="color:#fb7185;">⏰ Due/Overdue Debts</span>
                          <span class="filter-count-pill" style="background:rgba(244,63,94,0.2); color:#fda4af;">${overdueDebts.length}</span>
                        </button>`
                      : ''
                  }
                </div>
              </div>
            </section>

            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Customer</th>
                    <th>Products / Qty</th>
                    <th>Total Amount</th>
                    <th>Payment Status & Due Date</th>
                    <th>Payment Method</th>
                    <th style="text-align:right;">Actions</th>
                  </tr>
                </thead>
                <tbody id="sales-table-body">
                  ${this.renderSalesTableBodyHTML(sales, filtered, currency)}
                </tbody>
              </table>
            </div>`
      }
    `;
  }

  private renderSalesTableBodyHTML(sales: Sale[], filteredInput?: Sale[], currencyInput?: string): string {
    const currency = currencyInput || this.currentUser?.currency || '₦';
    let filtered = filteredInput;
    if (!filtered) {
      filtered = sales;
      if (this.salesStatusFilter === 'completed') {
        filtered = filtered.filter((s) => s.status === 'completed');
      } else if (this.salesStatusFilter === 'pending') {
        filtered = filtered.filter((s) => s.status === 'pending');
      } else if (this.salesStatusFilter === 'overdue') {
        filtered = filtered.filter((s) => {
          if (s.status !== 'pending') return false;
          const dueInfo = getDebtDueStatus(s.dueDate);
          return dueInfo.status === 'overdue' || dueInfo.status === 'due_today';
        });
      }

      if (this.salesSearchQuery.trim()) {
        const q = this.salesSearchQuery.toLowerCase();
        filtered = filtered.filter(
          (s) =>
            s.customerName.toLowerCase().includes(q) ||
            s.customerPhone?.toLowerCase().includes(q) ||
            s.items.some((i) => i.productName.toLowerCase().includes(q)) ||
            s.id.toLowerCase().includes(q)
        );
      }
    }

    if (filtered.length === 0) {
      return `<tr><td colspan="7"><div class="empty-state" style="border:none; margin:16px auto;">
          <p>No transactions match your search filter.</p>
         </div></td></tr>`;
    }

    return filtered
      .map((sale) => {
        const isPaid = sale.status === 'completed';
        const dueInfo = getDebtDueStatus(sale.dueDate);

        let badgeHtml = '';
        if (isPaid) {
          badgeHtml = `<span class="badge badge-paid">✓ Paid</span>`;
        } else if (dueInfo.status === 'overdue') {
          badgeHtml = `
            <div>
              <span class="badge badge-overdue">⚠️ ${dueInfo.label}</span>
              <div style="font-size:10px; color:#fb7185; margin-top:2px;">Due: ${sale.dueDate}</div>
            </div>
          `;
        } else if (dueInfo.status === 'due_today') {
          badgeHtml = `
            <div>
              <span class="badge badge-due-today">⏳ Due Today</span>
              <div style="font-size:10px; color:#fbbf24; margin-top:2px;">Due: ${sale.dueDate}</div>
            </div>
          `;
        } else if (dueInfo.status === 'upcoming') {
          badgeHtml = `
            <div>
              <span class="badge badge-upcoming">📅 ${dueInfo.label}</span>
              <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">Due: ${sale.dueDate}</div>
            </div>
          `;
        } else {
          badgeHtml = `<span class="badge badge-pending">⏳ Pending Debt</span>`;
        }

        return `
    <tr>
      <td style="color:var(--text-secondary); font-size:var(--text-xs);">
        ${formatDate(sale.createdAt)}
      </td>
      <td>
        <div style="font-weight:700;">${sale.customerName}</div>
        ${sale.customerPhone ? `<div style="font-size:var(--text-xs); color:var(--text-muted);">${sale.customerPhone}</div>` : ''}
      </td>
      <td>
        <div style="font-size:var(--text-xs);">
          ${sale.items.map((i) => `<span>${i.productName} <strong style="color:var(--text-secondary);">(x${i.quantity})</strong></span>`).join(', ')}
        </div>
        ${sale.notes ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px; font-style:italic;">"${sale.notes}"</div>` : ''}
      </td>
      <td class="table-amount ${isPaid ? 'text-emerald' : 'text-rose'}">
        ${formatCurrency(sale.totalAmount, currency)}
      </td>
      <td>
        ${badgeHtml}
      </td>
      <td style="font-size:var(--text-xs); color:var(--text-secondary);">
        ${sale.paymentMethod}
      </td>
      <td style="text-align:right; white-space:nowrap;">
        ${
          !isPaid
            ? `
          <button
            type="button"
            class="btn btn-sm btn-whatsapp-action btn-send-debt-wa"
            data-sale-id="${sale.id}"
            title="Send pre-formatted WhatsApp debt notice detailing items and due balance"
            style="margin-right:6px;"
          >
            💬 WhatsApp Notice
          </button>
        `
            : ''
        }
        <button
          class="btn btn-sm ${isPaid ? 'btn-secondary' : 'btn-success'} btn-toggle-status"
          data-sale-id="${sale.id}"
          title="${isPaid ? 'Revert to Pending Debt' : 'Mark Debt as Paid'}"
        >
          ${isPaid ? 'Revert' : '✓ Mark Paid'}
        </button>
        <button
          class="btn btn-outline-danger btn-sm btn-delete-sale"
          data-sale-id="${sale.id}"
          title="Delete record"
          style="margin-left:6px;"
        >
          🗑️
        </button>
      </td>
    </tr>
  `;
      })
      .join('');
  }

  // =========================================================================
  // PAGE: DEDICATED RECORD NEW SALE
  // =========================================================================
  private renderNewSalePageHTML(products: Product[]): string {
    const currency = this.currentUser?.currency || '₦';

    const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const preselectedProductId = urlParams.get('product') || '';
    const preselectedProd = products.find((p) => p.id === preselectedProductId);

    const defaultDueDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    return `
      <div>
        <a href="#/sales" class="page-back-link">← Back to Sales & Debts</a>
      </div>

      <div class="form-page-card">
        <div class="page-title-group">
          <h1>Record Sale or Customer Debt</h1>
          <p>Record a cash sale or customer debt with WhatsApp payment reminders.</p>
        </div>

        <form id="form-record-sale-page" style="display:flex; flex-direction:column; gap:16px;">
          <div class="form-group">
            <label class="form-label" for="sale-customer-name">Customer Name</label>
            <input type="text" id="sale-customer-name" class="form-input" placeholder="e.g. Alhaji Musa or Walk-in Customer" required />
          </div>

          <div class="form-group">
            <label class="form-label" for="sale-customer-phone">Customer Phone (WhatsApp Number)</label>
            <input type="tel" id="sale-customer-phone" class="form-input" placeholder="e.g. 08023456789 or 2348012345678" />
            <span class="form-hint">Required for sending automated WhatsApp payment due reminders and itemized debt receipts.</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="sale-product-select">Select from Inventory (Optional)</label>
            <select id="sale-product-select" class="form-select">
              <option value="">-- Choose from inventory or enter custom item below --</option>
              ${products
                .map(
                  (p) => `
                <option value="${p.id}" data-price="${p.price}" data-name="${escapeHtml(p.name)}" data-stock="${p.stock}" ${p.id === preselectedProductId ? 'selected' : ''}>
                  ${escapeHtml(p.name)} (${formatCurrency(p.price, currency)}) — Stock: ${p.stock}
                </option>
              `
                )
                .join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="sale-custom-item-name">Item Description</label>
            <input
              type="text"
              id="sale-custom-item-name"
              class="form-input"
              placeholder="e.g. Silk Ankara Kaftan"
              value="${preselectedProd ? escapeHtml(preselectedProd.name) : ''}"
              required
            />
          </div>

          <div class="form-grid-2col">
            <div class="form-group">
              <label class="form-label" for="sale-quantity">Quantity (Units)</label>
              <input type="number" id="sale-quantity" class="form-input" min="1" value="1" required />
              <span id="sale-stock-warning" class="form-hint" style="color:var(--accent-amber);"></span>
            </div>

            <div class="form-group">
              <label class="form-label" for="sale-unit-price">Unit Price (${currency})</label>
              <input
                type="text"
                id="sale-unit-price"
                class="form-input"
                placeholder="0.00"
                value="${preselectedProd ? preselectedProd.price.toFixed(2) : '0.00'}"
                required
              />
            </div>
          </div>

          <div style="background:var(--bg-surface-elevated); padding:14px; border-radius:var(--radius-md); display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:var(--text-sm); font-weight:600;">Total Sale Amount:</span>
            <span id="sale-computed-total" style="font-size:var(--text-xl); font-weight:800; font-family:var(--font-mono); color:var(--accent-emerald);">
              ${formatCurrency(preselectedProd ? preselectedProd.price : 0, currency)}
            </span>
          </div>

          <div class="form-group">
            <label class="form-label" for="sale-status">Transaction Status</label>
            <select id="sale-status" class="form-select">
              <option value="completed">✓ Completed Sale (Paid in Full)</option>
              <option value="pending">⏳ Pending Debt (Customer Owes / Pay Later)</option>
            </select>
          </div>

          <div class="form-group" id="group-sale-due-date">
            <label class="form-label" for="sale-due-date">Payment Due Date (For Debts / Credit)</label>
            <input type="date" id="sale-due-date" class="form-input" value="${defaultDueDate}" />
            <span class="form-hint">When this deadline arrives or passes, you can dispatch an automated WhatsApp debt notice stating all goods owed.</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="sale-payment-method">Payment Method</label>
            <select id="sale-payment-method" class="form-select">
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer (OPay, Kuda, Moniepoint, etc.)</option>
              <option value="POS Card">POS / Debit Card</option>
              <option value="Debt (Pay Later)">Debt (Pay Later)</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="sale-notes">Notes / Special Agreements</label>
            <textarea id="sale-notes" class="form-textarea" rows="2" placeholder="e.g. Promised to clear balance on market day"></textarea>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px;">
            <a href="#/sales" class="btn btn-secondary">Cancel</a>
            <button type="submit" class="btn btn-success">Save Transaction</button>
          </div>
        </form>
      </div>
    `;
  }

  // =========================================================================
  // PAGE: INVENTORY & STOCK MANAGEMENT
  // =========================================================================
  private renderInventoryPageHTML(products: Product[]): string {
    const currency = this.currentUser?.currency || '₦';
    const lowStockThreshold = this.currentUser?.lowStockThreshold ?? 5;
    const categories = Array.from(new Set(products.map((p) => p.category || 'General'))).sort();

    const outOfStockItems = products.filter((p) => p.stock <= 0);
    const lowStockItems = products.filter((p) => p.stock > 0 && p.stock <= lowStockThreshold);
    const hasInventoryAlert = outOfStockItems.length > 0 || lowStockItems.length > 0;

    let filtered = products;
    if (this.inventoryCategoryFilter !== 'all') {
      filtered = filtered.filter((p) => p.category === this.inventoryCategoryFilter);
    }
    if (this.inventorySearchQuery.trim()) {
      const q = this.inventorySearchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
      );
    }

    return `
      <!-- Dashboard Highlight System: Low Stock Alert Banner -->
      ${
        hasInventoryAlert
          ? `
          <div class="alert-banner-box alert-banner-stock" style="margin-bottom:18px;">
            <div class="alert-banner-header">
              <div class="alert-banner-title">
                <span>⚠️ Stock Alert (Your Warning Threshold: ≤ ${lowStockThreshold} units)</span>
              </div>
              <a href="#/settings" class="btn btn-secondary btn-sm">⚙️ Configure Threshold</a>
            </div>
            <p class="alert-banner-desc">
              ${outOfStockItems.length > 0 ? `<strong>${outOfStockItems.length} product(s) are completely OUT OF STOCK!</strong> ` : ''}
              ${lowStockItems.length > 0 ? `${lowStockItems.length} product(s) are below your threshold of ${lowStockThreshold} units. Restock soon to prevent missed sales.` : ''}
            </p>
          </div>
          `
          : ''
      }

      <!-- Page Header Row -->
      <div class="page-header-row">
        <div class="page-title-group">
          <h1>Inventory & Stock Catalog</h1>
          <p>Track stock units, set prices in your niche (${this.currentUser?.niche || 'General'}), and monitor alerts.</p>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <a href="#/settings" class="btn btn-secondary btn-sm">
            ⚙️ Threshold: ≤ ${lowStockThreshold}
          </a>
          <a href="#/new-product" class="btn btn-primary btn-sm">
            + Add New Product
          </a>
        </div>
      </div>

      ${
        products.length === 0
          ? `<!-- Clean Empty State When User Has Not Filled Any Products -->
            <div class="empty-state">
              <span class="empty-state-icon">📦</span>
              <h3>Your Inventory is Empty</h3>
              <p>Add your store's items to start tracking stock units, receive low stock alerts, and generate instant WhatsApp order links for customers.</p>
              <a href="#/new-product" class="btn btn-primary btn-lg" style="margin-top:8px;">
                + Add Your First Product
              </a>
            </div>`
          : `${(() => {
              const totalStockUnits = products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
              const totalStockValue = products.reduce((sum, p) => sum + (Number(p.price) || 0) * (Number(p.stock) || 0), 0);
              const pricedProds = products.filter((p) => p.costPrice !== undefined);
              const totalEstProfit = pricedProds.reduce(
                (sum, p) => sum + ((Number(p.price) || 0) - (Number(p.costPrice) || 0)) * (Number(p.stock) || 0),
                0
              );
              return `
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(150px, 100%), 1fr)); gap:10px; margin-bottom:14px;">
                <div style="background:var(--bg-surface-elevated); padding:10px 14px; border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
                  <div style="font-size:11px; color:var(--text-muted);">Total Stock</div>
                  <div style="font-size:16px; font-weight:800; color:var(--text-primary);">${formatNumber(totalStockUnits)} units</div>
                </div>
                <div style="background:var(--bg-surface-elevated); padding:10px 14px; border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
                  <div style="font-size:11px; color:var(--text-muted);">Total Selling Value</div>
                  <div style="font-size:16px; font-weight:800; color:var(--text-primary); font-family:var(--font-mono);">${formatCurrency(totalStockValue, currency)}</div>
                </div>
                <div style="background:var(--bg-surface-elevated); padding:10px 14px; border-radius:var(--radius-md); border:1px solid rgba(16,185,129,0.28);">
                  <div style="font-size:11px; color:var(--text-muted);">Est. Profit ${pricedProds.length < products.length && pricedProds.length > 0 ? `(${pricedProds.length}/${products.length} priced)` : ''}</div>
                  <div style="font-size:16px; font-weight:800; font-family:var(--font-mono); color:${pricedProds.length === 0 ? 'var(--text-muted)' : totalEstProfit >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
                    ${pricedProds.length === 0 ? 'Add cost prices' : `${totalEstProfit >= 0 ? '+' : ''}${formatCurrency(totalEstProfit, currency)}`}
                  </div>
                </div>
              </div>
              `;
            })()}
            <section class="section-toolbar">
              <div class="search-filter-bar">
                <div class="search-input-wrapper">
                  <span class="search-icon">🔍</span>
                  <input
                    type="text"
                    id="inventory-search-input"
                    class="search-input"
                    placeholder="Search product name or category..."
                    value="${escapeHtml(this.inventorySearchQuery)}"
                  />
                </div>

                <select id="inventory-category-select" class="form-select inventory-cat-select">
                  <option value="all">All Categories (${products.length})</option>
                  ${categories
                    .map((c) => `<option value="${c}" ${this.inventoryCategoryFilter === c ? 'selected' : ''}>${c}</option>`)
                    .join('')}
                </select>
              </div>
            </section>

            <div class="product-grid" id="inventory-product-grid">
              ${this.renderInventoryGridInnerHTML(products, filtered)}
            </div>`
      }

      <!-- In-App Product Delete Confirmation Modal (avoids sandboxed window.confirm blocks) -->
      <div id="modal-delete-product" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-del-prod-title">
        <div class="modal-card" style="max-width:440px; border-color:var(--accent-rose);">
          <div class="modal-header">
            <h2 id="modal-del-prod-title" class="modal-title" style="color:var(--accent-rose); display:flex; align-items:center; gap:8px;">
              <span>🗑️</span> Confirm Product Deletion
            </h2>
            <button type="button" class="modal-close-btn" id="btn-close-delete-prod-modal" aria-label="Close modal">&times;</button>
          </div>
          <div class="modal-body" style="display:flex; flex-direction:column; gap:12px;">
            <p style="font-size:var(--text-sm); color:var(--text-primary); font-weight:600; margin:0;">
              Are you sure you want to delete this product from your inventory?
            </p>
            <div style="background:var(--bg-surface-elevated); padding:14px; border-radius:var(--radius-md); font-size:var(--text-xs); color:var(--text-secondary); line-height:1.6; border:1px solid var(--border-subtle);">
              <div style="font-size:var(--text-sm); font-weight:700; color:var(--text-primary); margin-bottom:6px;" id="del-modal-prod-name"></div>
              <div>• Category: <strong id="del-modal-prod-category" style="color:var(--text-primary);"></strong></div>
              <div>• Price: <strong id="del-modal-prod-price" style="color:var(--accent-emerald);"></strong></div>
              <div>• Current Stock: <strong id="del-modal-prod-stock" style="color:var(--text-primary);"></strong></div>
            </div>
            <p style="font-size:var(--text-xs); color:var(--accent-rose); margin:0; font-weight:600;">
              ⚠️ This will remove the item from your digital catalog and storefront. Existing completed sales records remain preserved.
            </p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-delete-prod">Cancel</button>
            <button type="button" class="btn btn-outline-danger btn-sm" id="btn-confirm-delete-prod">
              🗑️ Delete Product
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderInventoryGridInnerHTML(products: Product[], filteredInput?: Product[]): string {
    const currency = this.currentUser?.currency || '₦';
    const lowStockThreshold = this.currentUser?.lowStockThreshold ?? 5;
    let filtered = filteredInput;
    if (!filtered) {
      filtered = products;
      if (this.inventoryCategoryFilter !== 'all') {
        filtered = filtered.filter((p) => p.category === this.inventoryCategoryFilter);
      }
      if (this.inventorySearchQuery.trim()) {
        const q = this.inventorySearchQuery.toLowerCase();
        filtered = filtered.filter(
          (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
        );
      }
    }

    if (filtered.length === 0) {
      return `<div class="empty-state" style="grid-column:1 / -1; border:none; padding:24px 16px;">
          <p style="margin-bottom:8px;">No products match your current search or category filter (${products.length} products total in catalog).</p>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-reset-inventory-filters">
            🔄 Reset Filters & Show All Products
          </button>
         </div>`;
    }

    return filtered
      .map((product) => {
        let stockBadge = '';
        if (product.stock === 0) {
          stockBadge = `<span class="badge badge-out-of-stock">🚨 Out of Stock (0)</span>`;
        } else if (product.stock <= lowStockThreshold) {
          stockBadge = `<span class="badge badge-low-stock">⚠️ Low Stock: ${product.stock} left (≤${lowStockThreshold})</span>`;
        } else {
          stockBadge = `<span class="badge badge-in-stock">✓ ${product.stock} in stock</span>`;
        }

        const hasCost = product.costPrice !== undefined;
        const costPrice = product.costPrice ?? 0;
        const unitProfit = product.price - costPrice;
        const marginPct = product.price > 0 ? Math.round((unitProfit / product.price) * 100) : 0;

        return `
  <div class="product-card ${product.stock <= lowStockThreshold ? 'border-amber' : ''}">
    <div class="product-card-image-box">
      ${
        product.image
          ? `<img src="${product.image}" alt="${product.name}" class="product-card-img" />`
          : `<span class="product-card-img-placeholder">🏷️</span>`
      }
    </div>

    <div class="product-card-body">
      <div class="product-card-header">
        <div>
          <h3 class="product-card-title">${product.name}</h3>
          <span class="product-card-category">${product.category}</span>
        </div>
      </div>

      <div style="margin:4px 0;">
        ${stockBadge}
      </div>

      ${
        hasCost
          ? `<div class="product-card-profit-row">
              <span style="color:var(--text-secondary);">Cost: <strong style="color:var(--text-primary);">${formatCurrency(costPrice, currency)}</strong></span>
              <span class="${unitProfit >= 0 ? 'text-emerald' : 'text-rose'}" style="font-weight:700;">
                Est. Profit: ${unitProfit >= 0 ? '+' : ''}${formatCurrency(unitProfit, currency)} (${marginPct}%)
              </span>
            </div>`
          : `<div class="product-card-profit-row" style="color:var(--text-muted);">
              <span>Cost price not set</span>
              <a href="#/edit-product/${product.id}" style="color:var(--accent-emerald); font-weight:600; text-decoration:none;">+ Set cost</a>
            </div>`
      }

      <div class="product-card-price-row">
        <span class="product-card-price">${formatCurrency(product.price, currency)}</span>
        <button
          type="button"
          class="btn btn-secondary btn-sm btn-add-stock"
          data-product-id="${product.id}"
          title="Add restocked units & update price if changed"
        >
          Add Stock
        </button>
      </div>

      <div class="product-card-footer">
        <a href="#/new-sale?product=${product.id}" class="btn btn-secondary btn-sm" style="flex:1; min-width:0;">
          ⚡ Sell
        </a>
        <a href="#/edit-product/${product.id}" class="btn btn-secondary btn-sm" title="Edit product">
          ✏️
        </a>
        <button type="button" class="btn btn-outline-danger btn-sm btn-delete-product" data-product-id="${product.id}" title="Delete product">
          🗑️
        </button>
      </div>
    </div>
  </div>
`;
      })
      .join('');
  }

  // =========================================================================
  // PAGE: DEDICATED ADD PRODUCT
  // =========================================================================
  private renderNewProductPageHTML(): string {
    const currency = this.currentUser?.currency || '₦';
    const defaultNicheCategory = this.currentUser?.niche || 'Fashion';
    this.uploadedProductImageBase64 = '';
    this.rawUploadedImageBase64 = '';

    return `
      <div>
        <a href="#/inventory" class="page-back-link">← Back to Inventory</a>
      </div>

      <div class="form-page-card">
        <div class="page-title-group">
          <h1>Add New Product</h1>
          <p>Create an inventory product in your niche to track stock and sell via WhatsApp.</p>
        </div>

        <form id="form-new-product-page" style="display:flex; flex-direction:column; gap:16px;">
          <div class="form-group">
            <label class="form-label" for="product-name">Product Name</label>
            <input type="text" id="product-name" class="form-input" placeholder="e.g. Vintage Silk Fabric or Wireless ANC Earbuds" required />
          </div>

          <div class="form-grid-2col">
            <div class="form-group">
              <label class="form-label" for="product-cost-price">Cost Price (${currency})</label>
              <input type="text" id="product-cost-price" class="form-input" placeholder="0.00" />
              <span class="form-hint">Your purchase/cost price per unit</span>
            </div>
            <div class="form-group">
              <label class="form-label" for="product-price">Selling Price (${currency})</label>
              <input type="text" id="product-price" class="form-input" placeholder="0.00" required />
              <span class="form-hint">Price customers pay per unit</span>
            </div>
          </div>

          <!-- Automatic Estimated Profit Calculator -->
          <div id="product-profit-preview" class="profit-preview-box is-neutral">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
              <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-secondary);">
                📈 Estimated Profit
              </span>
              <span id="profit-margin-badge" class="badge badge-paid" style="font-size:10px;">Enter prices</span>
            </div>
            <div class="profit-preview-grid">
              <div class="profit-preview-item">
                <span class="profit-preview-label">Est. Profit per Unit</span>
                <span id="profit-per-unit-val" class="profit-preview-value">${formatCurrency(0, currency)}</span>
              </div>
              <div class="profit-preview-item">
                <span class="profit-preview-label">Est. Total Stock Profit (<span id="profit-stock-units">10</span> units)</span>
                <span id="profit-total-stock-val" class="profit-preview-value">${formatCurrency(0, currency)}</span>
              </div>
            </div>
          </div>

          <div class="form-grid-2col">
            <div class="form-group">
              <label class="form-label" for="product-stock">Stock Units Available</label>
              <input type="number" id="product-stock" class="form-input" min="0" placeholder="0" value="10" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="product-category">Category / Niche Tag</label>
              <input type="text" id="product-category" class="form-input" value="${defaultNicheCategory}" list="category-suggestions" required />
              <datalist id="category-suggestions">
                ${POPULAR_NICHES.map((n) => `<option value="${n}" />`).join('')}
              </datalist>
            </div>
          </div>

          <!-- HTML FileReader API Image Upload -->
          <div class="form-group">
            <label class="form-label">Product Image (Offline via FileReader)</label>
            <div class="file-upload-zone" id="file-upload-trigger">
              <span style="font-size:1.8rem;">📸</span>
              <div style="font-size:var(--text-xs); color:var(--text-secondary); margin-top:4px;">
                Click to browse photo from your phone or device
              </div>
              <input type="file" id="product-image-file" accept="image/*" style="display:none;" />
            </div>
            <div id="product-image-preview-container" style="display:none; margin-top:8px;">
              <div class="image-preview-wrapper">
                <img id="product-image-preview" src="" alt="Preview" class="image-preview" />
                <button type="button" id="btn-remove-image" class="image-remove-btn" title="Remove image">✕</button>
              </div>
              <div style="display:flex; gap:8px; margin-top:8px; align-items:center; flex-wrap:wrap;">
                <button type="button" class="btn btn-secondary btn-sm" id="btn-trigger-adjuster" title="Crop, brighten, and sharpen photo">
                  🎨 Adjust Photo
                </button>
              </div>
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px;">
            <a href="#/inventory" class="btn btn-secondary">Cancel</a>
            <button type="submit" class="btn btn-primary">Save Product</button>
          </div>
        </form>
      </div>
    `;
  }

  // =========================================================================
  // PAGE: EDIT PRODUCT
  // =========================================================================
  private renderEditProductPageHTML(productId: string): string {
    const product = StorageService.getProduct(productId);
    if (!product) {
      return `
        <div class="empty-state">
          <p>Product not found.</p>
          <a href="#/inventory" class="btn btn-secondary">Back to Inventory</a>
        </div>
      `;
    }

    const currency = this.currentUser?.currency || '₦';
    this.uploadedProductImageBase64 = product.image || '';
    this.rawUploadedImageBase64 = product.image || '';

    return `
      <div>
        <a href="#/inventory" class="page-back-link">← Back to Inventory</a>
      </div>

      <div class="form-page-card">
        <div class="page-title-group">
          <h1>Edit Product</h1>
          <p>Update inventory details, stock quantity, or price.</p>
        </div>

        <form id="form-edit-product-page" style="display:flex; flex-direction:column; gap:16px;">
          <input type="hidden" id="product-id" value="${product.id}" />

          <div class="form-group">
            <label class="form-label" for="product-name">Product Name</label>
            <input type="text" id="product-name" class="form-input" value="${escapeHtml(product.name)}" required />
          </div>

          <div class="form-grid-2col">
            <div class="form-group">
              <label class="form-label" for="product-cost-price">Cost Price (${currency})</label>
              <input type="text" id="product-cost-price" class="form-input" placeholder="0.00" value="${product.costPrice !== undefined ? product.costPrice.toFixed(2) : ''}" />
              <span class="form-hint">Your purchase/cost price per unit</span>
            </div>
            <div class="form-group">
              <label class="form-label" for="product-price">Selling Price (${currency})</label>
              <input type="text" id="product-price" class="form-input" value="${product.price.toFixed(2)}" required />
              <span class="form-hint">Price customers pay per unit</span>
            </div>
          </div>

          <!-- Automatic Estimated Profit Calculator -->
          <div id="product-profit-preview" class="profit-preview-box is-neutral">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
              <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-secondary);">
                📈 Estimated Profit
              </span>
              <span id="profit-margin-badge" class="badge badge-paid" style="font-size:10px;">Enter prices</span>
            </div>
            <div class="profit-preview-grid">
              <div class="profit-preview-item">
                <span class="profit-preview-label">Est. Profit per Unit</span>
                <span id="profit-per-unit-val" class="profit-preview-value">${formatCurrency(0, currency)}</span>
              </div>
              <div class="profit-preview-item">
                <span class="profit-preview-label">Est. Total Stock Profit (<span id="profit-stock-units">${product.stock}</span> units)</span>
                <span id="profit-total-stock-val" class="profit-preview-value">${formatCurrency(0, currency)}</span>
              </div>
            </div>
          </div>

          <div class="form-grid-2col">
            <div class="form-group">
              <label class="form-label" for="product-stock">Stock Units Available</label>
              <input type="number" id="product-stock" class="form-input" min="0" value="${product.stock}" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="product-category">Category</label>
              <input type="text" id="product-category" class="form-input" value="${escapeHtml(product.category)}" list="category-suggestions" required />
              <datalist id="category-suggestions">
                ${POPULAR_NICHES.map((n) => `<option value="${n}" />`).join('')}
              </datalist>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Product Image</label>
            <div class="file-upload-zone" id="file-upload-trigger">
              <span style="font-size:1.8rem;">📸</span>
              <div style="font-size:var(--text-xs); color:var(--text-secondary); margin-top:4px;">
                Click to change photo
              </div>
              <input type="file" id="product-image-file" accept="image/*" style="display:none;" />
            </div>
            <div id="product-image-preview-container" style="display:${product.image ? 'block' : 'none'}; margin-top:8px;">
              <div class="image-preview-wrapper">
                <img id="product-image-preview" src="${product.image || ''}" alt="Preview" class="image-preview" />
                <button type="button" id="btn-remove-image" class="image-remove-btn" title="Remove image">✕</button>
              </div>
              <div style="display:flex; gap:8px; margin-top:8px; align-items:center; flex-wrap:wrap;">
                <button type="button" class="btn btn-secondary btn-sm" id="btn-trigger-adjuster" title="Crop, brighten, and sharpen photo">
                  🎨 Adjust Photo
                </button>
              </div>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:12px; flex-wrap:wrap;">
            <button type="button" id="btn-delete-product-from-edit" class="btn btn-outline-danger btn-sm" data-product-id="${product.id}">
              🗑️ Delete Product
            </button>
            <div style="display:flex; gap:10px;">
              <a href="#/inventory" class="btn btn-secondary">Cancel</a>
              <button type="submit" class="btn btn-primary">Save Changes</button>
            </div>
          </div>
        </form>
      </div>
    `;
  }

  // =========================================================================
  // PAGE: EXPENSES & BUSINESS OVERHEADS
  // =========================================================================
  private renderExpensesPageHTML(): string {
    if (!this.currentUser) return '';
    const currency = this.currentUser.currency || '₦';
    const expenses = StorageService.getExpenses(this.currentUser.id);
    const sales = StorageService.getSales(this.currentUser.id);
    const finSummary = StorageService.calculateFinancialSummary(sales, expenses);

    // Filter expenses by category and search query
    let filtered = expenses;
    if (this.expensesCategoryFilter !== 'all') {
      filtered = filtered.filter((e) => e.category === this.expensesCategoryFilter);
    }
    if (this.expensesSearchQuery.trim()) {
      const q = this.expensesSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          (e.vendor || '').toLowerCase().includes(q) ||
          (e.notes || '').toLowerCase().includes(q)
      );
    }

    const isProfitable = finSummary.netProfit >= 0;

    return `
      <!-- Page Header Row -->
      <div class="page-header-row">
        <div class="page-title-group">
          <h1>Shop Expenses & Bills</h1>
          <p>Track your daily business spending like generator fuel, shop rent, deliveries, nylon bags, and market fees.</p>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          ${
            expenses.length > 0
              ? `<button id="btn-export-expenses-csv" class="btn btn-secondary btn-sm" title="Download expenses spreadsheet">
                  📥 Download Excel/CSV
                 </button>`
              : ''
          }
          <a href="#/analytics" class="btn btn-secondary btn-sm">
            📈 View Profit & Loss
          </a>
          <a href="#/new-expense" class="btn btn-primary btn-sm" style="background:#f97316; border-color:#ea580c;">
            + Add Expense
          </a>
        </div>
      </div>

      <!-- Financial Health Metrics Strip -->
      <section class="metrics-grid" aria-label="Financial Health Overview">
        <div class="metric-card card-revenue">
          <div class="metric-header">
            <span class="metric-label">Sales Cash Received</span>
            <span class="metric-icon">💰</span>
          </div>
          <div class="metric-value text-emerald">${formatCurrency(finSummary.totalRevenue, currency)}</div>
          <div class="metric-subtext">Total cash from paid sales</div>
        </div>

        <div class="metric-card metric-card-expense">
          <div class="metric-header">
            <span class="metric-label">Total Spent on Bills</span>
            <span class="metric-icon" style="color:#fb923c;">💸</span>
          </div>
          <div class="metric-value" style="color:#fb923c;">${formatCurrency(finSummary.totalExpenses, currency)}</div>
          <div class="metric-subtext">${expenses.length} expense record${expenses.length === 1 ? '' : 's'}</div>
        </div>

        <div class="metric-card ${isProfitable ? 'metric-card-profit' : 'metric-card-loss'}">
          <div class="metric-header">
            <span class="metric-label">Actual Profit (Take-Home)</span>
            <span class="metric-icon">${isProfitable ? '📈' : '📉'}</span>
          </div>
          <div class="metric-value ${isProfitable ? 'text-emerald' : 'text-rose'}">
            ${isProfitable ? '+' : ''}${formatCurrency(finSummary.netProfit, currency)}
          </div>
          <div class="metric-subtext">${isProfitable ? 'Sales minus all shop expenses' : 'Expenses higher than sales'}</div>
        </div>

        <div class="metric-card card-debt">
          <div class="metric-header">
            <span class="metric-label">Money Customers Owe</span>
            <span class="metric-icon">⏳</span>
          </div>
          <div class="metric-value text-rose">${formatCurrency(finSummary.totalDebt, currency)}</div>
          <div class="metric-subtext">Awaiting payment from buyers</div>
        </div>
      </section>

      ${
        expenses.length === 0
          ? `<!-- Clean Empty State When User Has Not Filled Any Expenses -->
            <div class="empty-state">
              <span class="empty-state-icon">💸</span>
              <h3>No Shop Expenses Recorded</h3>
              <p>Record your bills like generator petrol, shop rent, dispatch deliveries, and nylon bags to see your true take-home profit.</p>
              <a href="#/new-expense" class="btn btn-primary btn-lg" style="background:#f97316; border-color:#ea580c; margin-top:8px;">
                + Record Your First Expense
              </a>
            </div>`
          : `
          <!-- Toolbar with Search and Category Filter -->
          <section class="section-toolbar">
            <div class="search-filter-bar">
              <div class="search-input-wrapper">
                <span class="search-icon">🔍</span>
                <input
                  type="text"
                  id="expenses-search-input"
                  class="search-input"
                  placeholder="Search expenses by item, vendor name, or note..."
                  value="${escapeHtml(this.expensesSearchQuery)}"
                />
              </div>
            </div>
          </section>

          <!-- Collapsible Expense Category Filter Section (Vertical Layout) -->
          <section class="collapsible-filter-container">
            <div class="collapsible-filter-header">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-weight:700; font-size:var(--text-xs); text-transform:uppercase; letter-spacing:0.04em; color:var(--text-secondary);">
                  Expense Type:
                </span>
                <span class="badge badge-niche">
                  ${this.expensesCategoryFilter === 'all' ? `All Expenses (${expenses.length})` : this.expensesCategoryFilter}
                </span>
              </div>
              <button
                type="button"
                id="btn-toggle-expenses-filter-collapse"
                class="btn-toggle-collapse"
                aria-expanded="${!this.isExpensesFilterCollapsed}"
                title="${this.isExpensesFilterCollapsed ? 'Show types' : 'Hide types'}"
              >
                <span>${this.isExpensesFilterCollapsed ? 'Show Expense Types' : 'Hide Types'}</span>
                <span class="collapse-icon">${this.isExpensesFilterCollapsed ? '▼' : '▲'}</span>
              </button>
            </div>

            <div id="expenses-filter-collapsible-wrapper" class="collapsible-filter-body ${this.isExpensesFilterCollapsed ? 'collapsed' : ''}">
              <div class="filter-bar-vertical">
                <button class="filter-btn-vertical ${this.expensesCategoryFilter === 'all' ? 'active' : ''}" data-expense-cat="all">
                  <span>💸 All Shop Expenses</span>
                  <span class="filter-count-pill">${expenses.length}</span>
                </button>
                ${EXPENSE_CATEGORIES.map((cat) => {
                  const count = expenses.filter((e) => e.category === cat).length;
                  let icon = '🏷️';
                  if (cat.includes('Fuel') || cat.includes('Power')) icon = '⚡';
                  else if (cat.includes('Rent')) icon = '🏬';
                  else if (cat.includes('Delivery') || cat.includes('Logistics')) icon = '🚚';
                  else if (cat.includes('Packaging') || cat.includes('Bags')) icon = '🛍️';
                  else if (cat.includes('Levies') || cat.includes('Taxes')) icon = '🏛️';
                  else if (cat.includes('Wages') || cat.includes('Salaries')) icon = '👥';
                  else if (cat.includes('Freight')) icon = '📦';
                  else if (cat.includes('Maintenance')) icon = '🔧';
                  else if (cat.includes('Marketing') || cat.includes('Data')) icon = '📶';

                  return `
                    <button class="filter-btn-vertical ${this.expensesCategoryFilter === cat ? 'active' : ''}" data-expense-cat="${cat}">
                      <span>${icon} ${cat}</span>
                      <span class="filter-count-pill">${count}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          </section>

          <!-- Expenses Data Table -->
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Expense / Bill</th>
                  <th>Category</th>
                  <th>Vendor / Payee</th>
                  <th>Payment Method</th>
                  <th style="text-align:right;">Amount</th>
                  <th style="text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody id="expenses-table-body">
                ${this.renderExpensesTableBodyHTML(filtered, currency)}
              </tbody>
            </table>
          </div>
          `
      }
    `;
  }

  private renderExpensesTableBodyHTML(filteredInput?: Expense[], currencyInput?: string): string {
    const currency = currencyInput || this.currentUser?.currency || '₦';
    let filtered = filteredInput;
    if (!filtered && this.currentUser) {
      let expenses = StorageService.getExpenses(this.currentUser.id);
      if (this.expensesCategoryFilter !== 'all') {
        expenses = expenses.filter((e) => e.category === this.expensesCategoryFilter);
      }
      if (this.expensesSearchQuery.trim()) {
        const q = this.expensesSearchQuery.toLowerCase();
        expenses = expenses.filter(
          (e) =>
            e.title.toLowerCase().includes(q) ||
            e.category.toLowerCase().includes(q) ||
            (e.vendor || '').toLowerCase().includes(q) ||
            (e.notes || '').toLowerCase().includes(q)
        );
      }
      filtered = expenses;
    }

    const list = filtered || [];
    if (list.length === 0) {
      return `<tr><td colspan="7"><div class="empty-state" style="border:none; margin:16px auto;">
          <p>No expense records match your search filter.</p>
         </div></td></tr>`;
    }

    return list
      .map((exp) => {
        const dateStr = new Date(exp.date || exp.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

        return `
    <tr>
      <td style="color:var(--text-secondary); font-size:var(--text-xs); white-space:nowrap;">
        ${dateStr}
      </td>
      <td>
        <div style="font-weight:700; color:var(--text-primary);">${exp.title}</div>
        ${exp.notes ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px; font-style:italic;">"${exp.notes}"</div>` : ''}
      </td>
      <td>
        <span class="expense-category-tag">
          🏷️ ${exp.category}
        </span>
      </td>
      <td style="font-size:var(--text-xs); color:var(--text-secondary);">
        ${exp.vendor || '—'}
      </td>
      <td style="font-size:var(--text-xs); color:var(--text-secondary);">
        ${exp.paymentMethod || 'Cash'}
      </td>
      <td class="table-amount" style="color:#fb923c; text-align:right;">
        ${formatCurrency(exp.amount, currency)}
      </td>
      <td style="text-align:right; white-space:nowrap;">
        <a
          href="#/edit-expense/${exp.id}"
          class="btn btn-secondary btn-sm"
          title="Edit expense"
        >
          ✏️ Edit
        </a>
        <button
          class="btn btn-outline-danger btn-sm btn-delete-expense"
          data-expense-id="${exp.id}"
          title="Delete expense"
          style="margin-left:6px;"
        >
          🗑️
        </button>
      </td>
    </tr>
  `;
      })
      .join('');
  }

  // =========================================================================
  // PAGE: RECORD NEW EXPENSE
  // =========================================================================
  private renderNewExpensePageHTML(): string {
    const currency = this.currentUser?.currency || '₦';
    const defaultDate = new Date().toISOString().split('T')[0];

    return `
      <div>
        <a href="#/expenses" class="page-back-link">← Back to Shop Expenses</a>
      </div>

      <div class="form-page-card">
        <div class="page-title-group">
          <h1>Record Shop Expense or Bill</h1>
          <p>Record shop spending such as fuel, shop rent, transport, bags & packaging, and bills.</p>
        </div>

        <form id="form-new-expense-page" style="display:flex; flex-direction:column; gap:16px;">
          <div class="form-group">
            <label class="form-label" for="expense-title">Expense Title / Description</label>
            <input
              type="text"
              id="expense-title"
              class="form-input"
              placeholder="e.g. Generator Petrol (25 Litres) or Shop Rent Contribution"
              required
            />
          </div>

          <div class="form-grid-2col">
            <div class="form-group">
              <label class="form-label" for="expense-amount">Amount Spent (${currency})</label>
              <input
                type="text"
                id="expense-amount"
                class="form-input"
                placeholder="e.g. 15,000"
                required
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="expense-date">Expense Date</label>
              <input
                type="date"
                id="expense-date"
                class="form-input"
                value="${defaultDate}"
                required
              />
            </div>
          </div>

          <div class="form-grid-2col">
            <div class="form-group">
              <label class="form-label" for="expense-category">Expense Category</label>
              <select id="expense-category" class="form-select" required>
                ${EXPENSE_CATEGORIES.map((cat) => `<option value="${cat}">${cat}</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="expense-payment-method">Payment Channel</label>
              <select id="expense-payment-method" class="form-select">
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="POS">POS / Debit Card</option>
                <option value="Personal Pocket">Personal Pocket / Owner Draw</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="expense-vendor">Vendor / Supplier / Payee (Optional)</label>
            <input
              type="text"
              id="expense-vendor"
              class="form-input"
              placeholder="e.g. TotalEnergies, Market Plaza Management, Oshodi Bags"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="expense-notes">Notes / Receipt Reference (Optional)</label>
            <textarea
              id="expense-notes"
              class="form-textarea"
              rows="2"
              placeholder="e.g. Fueled during 8-hour grid blackout, invoice receipt #402"
            ></textarea>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:8px;">
            <a href="#/expenses" class="btn btn-secondary">Cancel</a>
            <button type="submit" class="btn btn-primary" style="background:#f97316; border-color:#ea580c;">
              Save Expense Record
            </button>
          </div>
        </form>
      </div>
    `;
  }

  // =========================================================================
  // PAGE: EDIT EXPENSE
  // =========================================================================
  private renderEditExpensePageHTML(expenseId: string): string {
    const expense = StorageService.getExpense(expenseId);
    if (!expense) {
      return `
        <div class="empty-state">
          <h3>Expense Not Found</h3>
          <p>The requested expense record does not exist or has been removed.</p>
          <a href="#/expenses" class="btn btn-secondary" style="margin-top:8px;">← Return to Expenses</a>
        </div>
      `;
    }

    const currency = this.currentUser?.currency || '₦';
    const dateVal = (expense.date || expense.createdAt).split('T')[0];

    return `
      <div>
        <a href="#/expenses" class="page-back-link">← Back to Shop Expenses</a>
      </div>

      <div class="form-page-card">
        <div class="page-title-group">
          <h1>Edit Expense Record</h1>
          <p>Update expense details or amount.</p>
        </div>

        <form id="form-edit-expense-page" style="display:flex; flex-direction:column; gap:16px;">
          <input type="hidden" id="edit-expense-id" value="${expense.id}" />

          <div class="form-group">
            <label class="form-label" for="edit-expense-title">Expense Title / Description</label>
            <input
              type="text"
              id="edit-expense-title"
              class="form-input"
              value="${escapeHtml(expense.title)}"
              required
            />
          </div>

          <div class="form-grid-2col">
            <div class="form-group">
              <label class="form-label" for="edit-expense-amount">Amount Spent (${currency})</label>
              <input
                type="text"
                id="edit-expense-amount"
                class="form-input"
                value="${expense.amount.toFixed(2)}"
                required
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="edit-expense-date">Expense Date</label>
              <input
                type="date"
                id="edit-expense-date"
                class="form-input"
                value="${dateVal}"
                required
              />
            </div>
          </div>

          <div class="form-grid-2col">
            <div class="form-group">
              <label class="form-label" for="edit-expense-category">Expense Category</label>
              <select id="edit-expense-category" class="form-select" required>
                ${EXPENSE_CATEGORIES.map(
                  (cat) => `<option value="${cat}" ${expense.category === cat ? 'selected' : ''}>${cat}</option>`
                ).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="edit-expense-payment-method">Payment Channel</label>
              <select id="edit-expense-payment-method" class="form-select">
                <option value="Cash" ${expense.paymentMethod === 'Cash' ? 'selected' : ''}>Cash</option>
                <option value="Bank Transfer" ${expense.paymentMethod === 'Bank Transfer' ? 'selected' : ''}>Bank Transfer</option>
                <option value="POS" ${expense.paymentMethod === 'POS' ? 'selected' : ''}>POS / Debit Card</option>
                <option value="Personal Pocket" ${expense.paymentMethod === 'Personal Pocket' ? 'selected' : ''}>Personal Pocket / Owner Draw</option>
                <option value="Other" ${expense.paymentMethod === 'Other' ? 'selected' : ''}>Other</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="edit-expense-vendor">Vendor / Supplier / Payee (Optional)</label>
            <input
              type="text"
              id="edit-expense-vendor"
              class="form-input"
              value="${escapeHtml(expense.vendor || '')}"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="edit-expense-notes">Notes / Reference (Optional)</label>
            <textarea
              id="edit-expense-notes"
              class="form-textarea"
              rows="2"
            >${escapeHtml(expense.notes || '')}</textarea>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:8px;">
            <a href="#/expenses" class="btn btn-secondary">Cancel</a>
            <button type="submit" class="btn btn-primary" style="background:#f97316; border-color:#ea580c;">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    `;
  }
  // =========================================================================
  // PAGE: FINANCIAL ANALYTICS & REVENUE VS OVERHEAD TRENDS
  // =========================================================================
  private renderAnalyticsPageHTML(sales: Sale[], metrics: any): string {
    const currency = this.currentUser?.currency || '₦';
    const expenses = this.currentUser ? StorageService.getExpenses(this.currentUser.id) : [];
    const finSummary = StorageService.calculateFinancialSummary(sales, expenses);

    const totalVolume = metrics.totalRevenue + metrics.totalDebt;
    const revenuePct = totalVolume > 0 ? ((metrics.totalRevenue / totalVolume) * 100).toFixed(1) : '0';
    const debtPct = totalVolume > 0 ? ((metrics.totalDebt / totalVolume) * 100).toFixed(1) : '0';

    const methodsMap: { [key: string]: number } = {};
    sales.forEach((s) => {
      const m = s.paymentMethod || 'Other';
      methodsMap[m] = (methodsMap[m] || 0) + s.totalAmount;
    });

    // Calculate time-based buckets for the D3 performance trend chart including expenses
    const buckets = computeTrendBuckets(sales, this.analyticsTimeframe, expenses);
    const totalPeriodRevenue = buckets.reduce((s, b) => s + b.revenue, 0);
    const totalPeriodExpenses = buckets.reduce((s, b) => s + b.expenses, 0);
    const totalPeriodNetProfit = totalPeriodRevenue - totalPeriodExpenses;
    const totalPeriodDebt = buckets.reduce((s, b) => s + b.debt, 0);
    const periodVolume = totalPeriodRevenue + totalPeriodDebt;
    const periodRecoveryPct = periodVolume > 0 ? ((totalPeriodRevenue / periodVolume) * 100).toFixed(0) : '0';

    const isPeriodProfitable = totalPeriodNetProfit >= 0;
    const isOverallProfitable = finSummary.netProfit >= 0;

    // Calculate category expense breakdown
    const categoryExpensesMap: { [cat: string]: number } = {};
    expenses.forEach((e) => {
      const c = e.category || 'General Overheads';
      categoryExpensesMap[c] = (categoryExpensesMap[c] || 0) + (Number(e.amount) || 0);
    });
    const sortedCategories = Object.entries(categoryExpensesMap).sort((a, b) => b[1] - a[1]);

    return `
      <!-- Page Header Row -->
      <div class="page-header-row">
        <div class="page-title-group">
          <h1>Business Reports & Charts</h1>
          <p>See your sales cash, shop spending, actual profit, and customer debts at a glance.</p>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <a href="#/dashboard" class="btn btn-primary btn-sm">
            📊 Performance Dashboard
          </a>
          <a href="#/new-expense" class="btn btn-secondary btn-sm" style="border-color:rgba(249,115,22,0.4); color:#fb923c;">
            + Record Bill / Expense
          </a>
          <a href="#/expenses" class="btn btn-secondary btn-sm">
            💸 Shop Bills (${expenses.length})
          </a>
          ${
            sales.length > 0
              ? `<button id="btn-analytics-pdf" class="btn btn-secondary btn-sm" title="Export printable statement as PDF">
                  📄 Export PDF Statement
                 </button>`
              : ''
          }
          <a href="#/new-sale" class="btn btn-success btn-sm">
            + Record Sale
          </a>
        </div>
      </div>

      <!-- Financial Metrics Grid -->
      <section class="metrics-grid" aria-label="Financial Metrics">
        <div class="metric-card card-revenue">
          <div class="metric-header">
            <span class="metric-label">Total Sales Cash</span>
            <span class="metric-icon">💰</span>
          </div>
          <div class="metric-value text-emerald">${formatCurrency(finSummary.totalRevenue, currency)}</div>
          <div class="metric-subtext">Cash in hand from paid sales</div>
        </div>

        <div class="metric-card metric-card-expense">
          <div class="metric-header">
            <span class="metric-label">Total Shop Bills</span>
            <span class="metric-icon" style="color:#fb923c;">💸</span>
          </div>
          <div class="metric-value" style="color:#fb923c;">${formatCurrency(finSummary.totalExpenses, currency)}</div>
          <div class="metric-subtext">${expenses.length} recorded bills & spending</div>
        </div>

        <div class="metric-card ${isOverallProfitable ? 'metric-card-profit' : 'metric-card-loss'}">
          <div class="metric-header">
            <span class="metric-label">Actual Profit (In Pocket)</span>
            <span class="metric-icon">${isOverallProfitable ? '📈' : '📉'}</span>
          </div>
          <div class="metric-value ${isOverallProfitable ? 'text-emerald' : 'text-rose'}">
            ${isOverallProfitable ? '+' : ''}${formatCurrency(finSummary.netProfit, currency)}
          </div>
          <div class="metric-subtext">Profit Margin: ${finSummary.netMarginPct}% • Spending Ratio: ${finSummary.expenseRatioPct}%</div>
        </div>

        <div class="metric-card card-debt">
          <div class="metric-header">
            <span class="metric-label">Money Customers Owe</span>
            <span class="metric-icon">⏳</span>
          </div>
          <div class="metric-value text-rose">${formatCurrency(finSummary.totalDebt, currency)}</div>
          <div class="metric-subtext">Unpaid debts waiting for payment</div>
        </div>
      </section>

      ${
        sales.length === 0 && expenses.length === 0
          ? `<!-- Clean Empty State When User Has Not Filled Any Activity -->
            <div class="empty-state">
              <span class="empty-state-icon">📈</span>
              <h3>No Sales or Bills Yet</h3>
              <p>Once you record completed sales, shop bills, and customer debts, visual charts (Weekly, Monthly, Yearly) and business reports will appear here automatically.</p>
              <div style="display:flex; gap:10px; justify-content:center; margin-top:8px;">
                <a href="#/new-sale" class="btn btn-success btn-lg">+ Record Sale</a>
                <a href="#/new-expense" class="btn btn-secondary btn-lg">+ Log Bill / Expense</a>
              </div>
            </div>`
          : `
          <!-- Interactive D3 Performance Trend Chart: Weekly, Monthly, Yearly -->
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title-group">
                <h2>📈 Business Trends & Charts</h2>
                <p>Compare your sales cash, shop bills, and customer debts across days, weeks, or months.</p>
              </div>

              <!-- Collapsible Chart Controls (Vertical, No Horizontal Scroll) -->
              <div class="collapsible-filter-container" style="margin-top:12px;">
                <div class="collapsible-filter-header">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-weight:700; font-size:var(--text-xs); text-transform:uppercase; letter-spacing:0.04em; color:var(--text-secondary);">
                      Chart & Time Period:
                    </span>
                    <span class="badge badge-paid">
                      ${this.analyticsTimeframe.toUpperCase()} • ${this.chartMetricView === 'profit' ? 'Sales vs Bills' : this.chartMetricView === 'debt' ? 'Sales vs Debts' : 'All Together'}
                    </span>
                  </div>
                  <button
                    type="button"
                    id="btn-toggle-analytics-controls-collapse"
                    class="btn-toggle-collapse"
                    aria-expanded="${!this.isAnalyticsControlsCollapsed}"
                    title="${this.isAnalyticsControlsCollapsed ? 'Expand controls' : 'Collapse controls'}"
                  >
                    <span>${this.isAnalyticsControlsCollapsed ? 'Show Controls' : 'Collapse'}</span>
                    <span class="collapse-icon">${this.isAnalyticsControlsCollapsed ? '▼' : '▲'}</span>
                  </button>
                </div>

                <div id="analytics-controls-collapsible-wrapper" class="collapsible-filter-body ${this.isAnalyticsControlsCollapsed ? 'collapsed' : ''}">
                  <div style="display:flex; flex-direction:column; gap:12px; padding-top:6px;">
                    <div>
                      <span style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; display:block; margin-bottom:4px;">
                        What to Compare:
                      </span>
                      <div class="filter-bar-vertical">
                        <button type="button" class="filter-btn-vertical chart-metric-btn ${this.chartMetricView === 'all' ? 'active' : ''}" data-metric-view="all">
                          <span>📊 Everything (Sales, Bills & Debts)</span>
                        </button>
                        <button type="button" class="filter-btn-vertical chart-metric-btn ${this.chartMetricView === 'profit' ? 'active' : ''}" data-metric-view="profit">
                          <span>💰 Sales vs Shop Bills (Take-Home Profit)</span>
                        </button>
                        <button type="button" class="filter-btn-vertical chart-metric-btn ${this.chartMetricView === 'debt' ? 'active' : ''}" data-metric-view="debt">
                          <span>⏳ Sales vs Customer Debts</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <span style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; display:block; margin-bottom:4px;">
                        Time Period:
                      </span>
                      <div class="filter-bar-vertical">
                        <button type="button" class="filter-btn-vertical chart-time-tab ${this.analyticsTimeframe === 'weekly' ? 'active' : ''}" data-timeframe="weekly">
                          <span>📅 Weekly (Last 7 Days)</span>
                        </button>
                        <button type="button" class="filter-btn-vertical chart-time-tab ${this.analyticsTimeframe === 'monthly' ? 'active' : ''}" data-timeframe="monthly">
                          <span>🗓️ Monthly (Last 4 Weeks)</span>
                        </button>
                        <button type="button" class="filter-btn-vertical chart-time-tab ${this.analyticsTimeframe === 'yearly' ? 'active' : ''}" data-timeframe="yearly">
                          <span>📊 Yearly (Last 12 Months)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Summary Strip for Selected Timeframe -->
            <div class="chart-summary-strip">
              <div class="chart-summary-item">
                <span class="chart-summary-label">${this.analyticsTimeframe.toUpperCase()} SALES CASH</span>
                <span id="summary-period-revenue" class="chart-summary-val text-emerald">${formatCurrency(totalPeriodRevenue, currency)}</span>
              </div>
              <div class="chart-summary-item">
                <span class="chart-summary-label">${this.analyticsTimeframe.toUpperCase()} SHOP BILLS</span>
                <span id="summary-period-expenses" class="chart-summary-val" style="color:#fb923c;">${formatCurrency(totalPeriodExpenses, currency)}</span>
              </div>
              <div class="chart-summary-item">
                <span class="chart-summary-label">${this.analyticsTimeframe.toUpperCase()} TAKE-HOME PROFIT</span>
                <span id="summary-period-profit" class="chart-summary-val ${isPeriodProfitable ? 'text-emerald' : 'text-rose'}">
                  ${isPeriodProfitable ? '+' : ''}${formatCurrency(totalPeriodNetProfit, currency)}
                </span>
              </div>
              <div class="chart-summary-item">
                <span class="chart-summary-label">${this.analyticsTimeframe.toUpperCase()} CUSTOMER DEBT</span>
                <span id="summary-period-debt" class="chart-summary-val text-rose">${formatCurrency(totalPeriodDebt, currency)}</span>
              </div>
            </div>

            <!-- D3 Interactive Trend Chart SVG Mount -->
            <div id="d3-trend-chart-mount" class="d3-chart-container"></div>

            <div class="chart-legend">
              <div class="chart-legend-item">
                <span class="legend-dot dot-revenue"></span>
                <span style="color:var(--text-secondary); font-weight:600;">Sales Cash (In Hand)</span>
              </div>
              <div class="chart-legend-item">
                <span class="legend-dot" style="background:#f97316;"></span>
                <span style="color:var(--text-secondary); font-weight:600;">Shop Bills & Expenses</span>
              </div>
              <div class="chart-legend-item">
                <span class="legend-dot dot-debt"></span>
                <span style="color:var(--text-secondary); font-weight:600;">Money Customers Owe (Debts)</span>
              </div>
            </div>
          </div>

          <section class="analytics-section">
            <!-- Operating Expenses Breakdown by Category -->
            <div class="analytics-card">
              <div class="analytics-card-title">
                <span>Shop Spending by Category</span>
                <a href="#/expenses" style="font-size:var(--text-xs); color:var(--accent-cyan); text-decoration:none;">
                  Manage Expenses →
                </a>
              </div>

              <p style="font-size:var(--text-xs); color:var(--text-secondary);">
                Where your shop money goes: fuel, shop rent, transport, bags & packaging, and bills.
              </p>

              ${
                sortedCategories.length === 0
                  ? `<div class="empty-state" style="border:none; padding:20px 0;">
                      <p style="font-size:var(--text-xs); color:var(--text-muted);">No shop expenses or bills recorded yet.</p>
                      <a href="#/new-expense" class="btn btn-secondary btn-sm" style="margin-top:6px;">+ Record First Bill</a>
                     </div>`
                  : `
                  <div style="display:flex; flex-direction:column; gap:10px; margin-top:8px;">
                    ${sortedCategories
                      .map(([category, amount]) => {
                        const pct = finSummary.totalExpenses > 0 ? ((amount / finSummary.totalExpenses) * 100).toFixed(0) : '0';
                        return `
                        <div>
                          <div style="display:flex; justify-content:space-between; font-size:var(--text-xs); margin-bottom:4px;">
                            <span style="font-weight:600; color:var(--text-primary);">${category}</span>
                            <span class="font-mono" style="color:#fb923c;">${formatCurrency(amount, currency)} (${pct}%)</span>
                          </div>
                          <div style="width:100%; height:7px; background:var(--bg-surface-elevated); border-radius:4px; overflow:hidden;">
                            <div style="width:${pct}%; height:100%; background: #f97316; border-radius:4px;"></div>
                          </div>
                        </div>
                      `;
                      })
                      .join('')}
                  </div>
                  `
              }
            </div>

            <!-- Revenue Realization & Payment Channels -->
            <div class="analytics-card">
              <div class="analytics-card-title">
                <span>Sales Cash vs. Customer Debts</span>
                <span class="badge ${Number(debtPct) > 30 ? 'badge-low-stock' : 'badge-paid'}">
                  ${revenuePct}% Cash Collected
                </span>
              </div>

              <p style="font-size:var(--text-xs); color:var(--text-secondary);">
                Comparison showing how much money is already paid in cash vs money customers still owe.
              </p>

              <div class="debt-ratio-bar-wrapper">
                <div class="debt-ratio-bar" title="Collected: ${revenuePct}% | Owed: ${debtPct}%">
                  <div class="debt-ratio-fill-revenue" style="width: ${revenuePct}%;"></div>
                  <div class="debt-ratio-fill-debt" style="width: ${debtPct}%;"></div>
                </div>
                <div class="debt-ratio-legend">
                  <span class="text-emerald">● Paid Sales: ${formatCurrency(finSummary.totalRevenue, currency)} (${revenuePct}%)</span>
                  <span class="text-rose">● Unpaid Debts: ${formatCurrency(finSummary.totalDebt, currency)} (${debtPct}%)</span>
                </div>
              </div>

              <div class="form-grid-2col" style="margin-top:12px;">
                <div style="background:var(--bg-surface-elevated); padding:12px; border-radius:var(--radius-md);">
                  <div style="font-size:var(--text-xs); color:var(--text-secondary);">Profit Margin</div>
                  <div style="font-size:var(--text-lg); font-weight:800; font-family:var(--font-mono); color:${isOverallProfitable ? '#34d399' : '#fb7185'};">
                    ${finSummary.netMarginPct}%
                  </div>
                </div>
                <div style="background:var(--bg-surface-elevated); padding:12px; border-radius:var(--radius-md);">
                  <div style="font-size:var(--text-xs); color:var(--text-secondary);">Spending Ratio</div>
                  <div style="font-size:var(--text-lg); font-weight:800; font-family:var(--font-mono); color:#fb923c;">
                    ${finSummary.expenseRatioPct}%
                  </div>
                </div>
              </div>
            </div>
          </section>`
      }
    `;
  }

  // =========================================================================
  // PAGE: SETTINGS (MERCHANT OR BUYER)
  // =========================================================================
  private renderSettingsPageHTML(): string {
    const currency = this.currentUser?.currency || '₦';
    const isMerchant = this.currentUser?.role === 'merchant';
    const allUsers = StorageService.getAllUsers();

    return `
      <div>
        <a href="${isMerchant ? '#/sales' : '#/explore'}" class="page-back-link">
          ← Back to ${isMerchant ? 'Dashboard' : 'Explore Marketplace'}
        </a>
      </div>

      <div class="form-page-card">
        <div class="page-title-group">
          <h1>Profile & Account Settings</h1>
          <p>Logged in as: <strong>${this.currentUser?.name}</strong> (${isMerchant ? `Merchant • ${this.currentUser?.niche || 'General'}` : 'Buyer'})</p>
        </div>

        <form id="form-settings-page" style="display:flex; flex-direction:column; gap:16px;">
          <div class="form-group">
            <label class="form-label" for="settings-name">Your Full Name</label>
            <input type="text" id="settings-name" class="form-input" value="${escapeHtml(this.currentUser?.name || '')}" required />
          </div>

          <div class="form-group">
            <label class="form-label" for="settings-role">Account Role</label>
            <select id="settings-role" class="form-select">
              <option value="merchant" ${isMerchant ? 'selected' : ''}>Merchant (Business Owner selling goods)</option>
              <option value="buyer" ${!isMerchant ? 'selected' : ''}>Buyer (Shopper exploring stores & ordering)</option>
            </select>
          </div>

          <div id="settings-merchant-fields" style="display:${isMerchant ? 'flex' : 'none'}; flex-direction:column; gap:16px;">
            <div class="form-group">
              <label class="form-label" for="settings-store-name">Business / Store Name</label>
              <input type="text" id="settings-store-name" class="form-input" value="${escapeHtml(this.currentUser?.storeName || '')}" />
            </div>

            <div class="form-group">
              <label class="form-label" for="settings-niche">Business Niche</label>
              <select id="settings-niche" class="form-select">
                ${POPULAR_NICHES.map((n) => `<option value="${n}" ${this.currentUser?.niche === n ? 'selected' : ''}>${n}</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="settings-city">Location / City</label>
              <input type="text" id="settings-city" class="form-input" value="${escapeHtml(this.currentUser?.city || '')}" placeholder="e.g. Lagos, Abuja, Accra, Nairobi" />
            </div>

            <div class="form-group">
              <label class="form-label" for="settings-bio">Store Bio / Description</label>
              <textarea id="settings-bio" class="form-textarea" rows="2" placeholder="Briefly describe what you sell for buyers in Explore...">${escapeHtml(this.currentUser?.bio || '')}</textarea>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="settings-phone">WhatsApp Contact Phone Number</label>
            <input type="tel" id="settings-phone" class="form-input" value="${escapeHtml(this.currentUser?.phone || '')}" placeholder="e.g. 08023456789 or 2348012345678" required />
            <span class="form-hint">Direct link for buyer inquiries or merchant orders via WhatsApp wa.me</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="settings-currency">Preferred Currency Symbol</label>
            <select id="settings-currency" class="form-select">
              <option value="₦" ${currency === '₦' ? 'selected' : ''}>₦ - Nigerian Naira</option>
              <option value="$" ${currency === '$' ? 'selected' : ''}>$ - US Dollar</option>
              <option value="₵" ${currency === '₵' ? 'selected' : ''}>₵ - Ghana Cedi</option>
              <option value="KSh" ${currency === 'KSh' ? 'selected' : ''}>KSh - Kenya Shilling</option>
              <option value="£" ${currency === '£' ? 'selected' : ''}>£ - British Pound</option>
              <option value="€" ${currency === '€' ? 'selected' : ''}>€ - Euro</option>
              <option value="R" ${currency === 'R' ? 'selected' : ''}>R - South African Rand</option>
            </select>
          </div>

          ${
            isMerchant
              ? `
          <!-- Low Stock Alert & Browser Notification Settings -->
          <div style="background:var(--bg-surface-elevated); padding:16px; border-radius:var(--radius-lg); border:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="form-label" style="color:var(--accent-amber); font-weight:800;">🔔 Low Stock Warning & Browser Notifications</span>
              <span id="perm-indicator-badge" class="badge ${typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'badge-paid' : 'badge-pending'}">
                ${typeof Notification !== 'undefined' && Notification.permission === 'granted' ? '✓ Browser Popups Active' : '🔕 Popups Inactive'}
              </span>
            </div>
            <p style="font-size:var(--text-xs); color:var(--text-secondary); margin:0; line-height:1.4;">
              Define your low-stock threshold. Whenever sales deduct product inventory to or below this level, ShopKepa flashes dashboard highlights and delivers an instant browser notification.
            </p>

            <div class="form-group">
              <label class="form-label" for="settings-stock-threshold">Low Stock Warning Threshold (Units)</label>
              <input
                type="number"
                id="settings-stock-threshold"
                class="form-input"
                min="1"
                max="500"
                value="${this.currentUser?.lowStockThreshold ?? 5}"
                required
              />
              <span class="form-hint">E.g. Set to 5 units to get alerted when 5 or fewer items remain in stock.</span>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-top:1px solid var(--border-subtle); padding-top:10px;">
              <span style="font-size:var(--text-xs); color:var(--text-muted);">
                Test or grant browser notification permission:
              </span>
              <div style="display:flex; gap:8px;">
                <button type="button" id="btn-request-notification-perm" class="btn btn-secondary btn-sm">
                  ${typeof Notification !== 'undefined' && Notification.permission === 'granted' ? '✓ Allowed' : '🔔 Allow Browser Notifications'}
                </button>
                <button type="button" id="btn-test-notification" class="btn btn-secondary btn-sm">
                  🧪 Test Stock Alert
                </button>
              </div>
            </div>
          </div>

          <!-- Bank Payment Details for Automated WhatsApp Invoices -->
          <div class="form-group">
            <label class="form-label" for="settings-bank-details">🏦 Bank Payment Details for WhatsApp Debt Reminders (Optional)</label>
            <textarea
              id="settings-bank-details"
              class="form-textarea"
              rows="2"
              placeholder="e.g. Bank: Zenith Bank | Acct No: 1234567890 | Acct Name: Treasure David"
            >${this.currentUser?.bankPaymentDetails || ''}</textarea>
            <span class="form-hint">These bank transfer details will automatically be included in WhatsApp overdue debt notices sent to buyers.</span>
          </div>
          `
              : ''
          }

          <div class="form-group" style="border-top:1px solid var(--border-subtle); padding-top:16px;">
            <label class="form-label" for="settings-new-password">🔒 ${this.currentUser?.passwordHash ? 'Change Account Password (Optional)' : 'Set Account Password (Optional)'}</label>
            <div class="password-input-wrapper">
              <input
                type="password"
                id="settings-new-password"
                class="form-input"
                minlength="4"
                autocomplete="new-password"
                placeholder="${this.currentUser?.passwordHash ? 'Leave blank to keep current password' : 'Set a password (min. 4 characters)'}"
              />
              <button type="button" class="btn-toggle-password" data-target="settings-new-password" aria-label="Toggle password visibility">Show</button>
            </div>
            <span class="form-hint">Minimum 4 characters. Protects logins and account switching on this device.</span>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:8px;">
            <button type="submit" class="btn btn-primary">Save Profile Settings</button>
          </div>

          <!-- Switch User Section -->
          <div style="border-top:1px solid var(--border-subtle); padding-top:20px; margin-top:8px;">
            <label class="form-label">Switch Between User Accounts</label>
            <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
              ${allUsers
                .map((u) => {
                  const isCurrent = u.id === this.currentUser?.id;
                  return `
                  <button
                    type="button"
                    class="btn btn-sm ${isCurrent ? 'btn-primary' : 'btn-secondary'} btn-switch-user"
                    data-user-id="${u.id}"
                    ${isCurrent ? 'disabled' : ''}
                  >
                    ${u.role === 'merchant' ? '🏪' : '🛒'} ${u.storeName || u.name} (${u.role})
                  </button>
                `;
                })
                .join('')}
              <a href="#/auth" class="btn btn-sm btn-secondary">+ New Account</a>
            </div>
          </div>

          <!-- Account Visibility & Deactivation (Temporary Pause) -->
          <div style="border-top:1px solid var(--border-subtle); padding-top:20px; margin-top:8px;">
            <label class="form-label">Account Visibility & Deactivation</label>
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-top:8px; background:var(--bg-surface-elevated); padding:16px; border-radius:var(--radius-lg); border:1px solid var(--border-subtle);">
              <div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span class="badge ${this.currentUser?.isDeactivated ? 'badge-low-stock' : 'badge-paid'}">
                    ${this.currentUser?.isDeactivated ? '⏸️ Storefront Deactivated' : '🟢 Storefront Active & Public'}
                  </span>
                </div>
                <p style="font-size:var(--text-xs); color:var(--text-secondary); margin-top:6px; max-width:390px; line-height:1.4;">
                  ${
                    this.currentUser?.isDeactivated
                      ? 'Your store is unlisted from the Explore Directory and WhatsApp buyer orders are paused. Your sales records and inventory data remain 100% safe.'
                      : 'Your store is active and discoverable by buyers in the Explore directory. You can temporarily pause it at any time.'
                  }
                </p>
              </div>
              <button
                type="button"
                id="btn-toggle-deactivation"
                class="btn btn-sm ${this.currentUser?.isDeactivated ? 'btn-success' : 'btn-secondary'}"
                style="${this.currentUser?.isDeactivated ? '' : 'border-color:var(--accent-amber); color:var(--accent-amber);'}"
              >
                ${this.currentUser?.isDeactivated ? '▶️ Reactivate Store' : '⏸️ Temporarily Deactivate'}
              </button>
            </div>
          </div>

          <!-- Account Session: Log Out & Switch -->
          <div class="settings-card" style="margin-top:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
              <div>
                <span class="form-label" style="margin:0;">Account Session & Security</span>
                <p style="font-size:var(--text-xs); color:var(--text-secondary); margin-top:4px; line-height:1.4;">
                  Logged in as <strong>${this.currentUser?.name}</strong> (${this.currentUser?.storeName || 'Store'}). Log out to switch to another store or return to the welcome screen.
                </p>
              </div>
              <button type="button" id="btn-settings-logout" class="btn btn-secondary btn-sm">
                🚪 Log Out of Store
              </button>
            </div>
          </div>

          <!-- Danger Zone: Permanent Deletion & Data Clearing -->
          <div class="danger-zone-box" style="margin-top:12px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
              <div>
                <span class="form-label" style="color:var(--accent-rose); font-weight:700;">Permanent Account Deletion</span>
                <p style="font-size:var(--text-xs); color:var(--text-secondary); margin-top:4px; max-width:420px; line-height:1.4;">
                  Permanently erase your merchant profile, all inventory items, sales records, and customer debt records from this browser. This operation is irreversible.
                </p>
              </div>
              <button type="button" id="btn-open-delete-modal" class="btn btn-outline-danger btn-sm">
                🗑️ Delete Account Permanently
              </button>
            </div>

            ${
              isMerchant
                ? `<div style="border-top:1px dashed rgba(244,63,94,0.3); padding-top:12px; margin-top:4px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <span style="font-size:var(--text-xs); color:var(--text-muted);">Want to keep your profile but start with an empty store?</span>
                    <button type="button" id="btn-wipe-data" class="btn btn-secondary btn-sm" style="font-size:11px;">
                      Clear Sales & Products Only
                    </button>
                   </div>`
                : ''
            }
          </div>
        </form>
      </div>

      <!-- Delete Confirmation Modal (Strictly in Settings) -->
      <div id="modal-delete-account" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-delete-title">
        <div class="modal-card" style="max-width:480px; border-color:var(--accent-rose);">
          <div class="modal-header">
            <h2 id="modal-delete-title" class="modal-title" style="color:var(--accent-rose);">⚠️ Confirm Account Deletion</h2>
            <button class="modal-close-btn" id="btn-close-delete-modal">&times;</button>
          </div>
          <div class="modal-body">
            <p style="font-size:var(--text-sm); color:var(--text-primary); font-weight:600;">
              Are you sure you want to permanently delete your account?
            </p>
            <div style="background:var(--bg-surface-elevated); padding:14px; border-radius:var(--radius-md); font-size:var(--text-xs); color:var(--text-secondary); line-height:1.6;">
              This will permanently erase from this browser:
              <ul style="margin-left:18px; margin-top:6px;">
                <li>Your profile: <strong>${this.currentUser?.name}</strong> (${this.currentUser?.storeName || 'Merchant'})</li>
                <li>All products in your catalog</li>
                <li>All sales transactions and pending debt records</li>
              </ul>
            </div>
            <p style="font-size:var(--text-xs); color:var(--accent-rose); font-weight:700;">
              This operation is permanent and cannot be undone.
            </p>
            <div class="form-group">
              <label class="form-label" for="input-confirm-delete">Type <strong>DELETE</strong> below to confirm:</label>
              <input type="text" id="input-confirm-delete" class="form-input" placeholder="Type DELETE" autocomplete="off" />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="btn-cancel-delete-modal">Cancel</button>
            <button type="button" class="btn btn-outline-danger" id="btn-execute-permanent-delete" disabled style="opacity:0.4; cursor:not-allowed;">
              Permanently Delete Account
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // PAGE: BUYER PURCHASES & DEBTS LEDGER
  // =========================================================================
  private renderBuyerLedgerPageHTML(): string {
    if (!this.currentUser) return '';
    const currency = this.currentUser.currency || '₦';
    const allPurchases = StorageService.getBuyerPurchases(this.currentUser);
    const bMetrics = StorageService.calculateBuyerMetrics(allPurchases);

    let filtered = allPurchases;
    if (this.buyerStatusFilter !== 'all') {
      filtered = filtered.filter((p) => p.status === this.buyerStatusFilter);
    }
    if (this.buyerSearchQuery.trim()) {
      const q = this.buyerSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.merchantStoreName?.toLowerCase().includes(q) ||
          p.customerName.toLowerCase().includes(q) ||
          p.items.some((i) => i.productName.toLowerCase().includes(q)) ||
          p.notes?.toLowerCase().includes(q)
      );
    }

    return `
      <!-- Page Header Row -->
      <div class="page-header-row">
        <div class="page-title-group">
          <h1>My Purchases & Debts I Owe</h1>
          <p>Track what you bought, what you have paid, and what you still owe to sellers.</p>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          ${
            allPurchases.length > 0
              ? `<button id="btn-export-buyer-csv" class="btn btn-secondary btn-sm" title="Download my purchase history as CSV">
                  📥 Export CSV
                 </button>`
              : ''
          }
          <button id="btn-open-log-purchase-modal" class="btn btn-primary btn-sm">
            + Record What I Bought
          </button>
        </div>
      </div>

      <!-- Buyer Financial Metrics Grid -->
      <section class="metrics-grid" aria-label="Buyer Summary Stats">
        <div class="metric-card card-revenue">
          <div class="metric-header">
            <span class="metric-label">What I've Paid</span>
            <span class="metric-icon">🛍️</span>
          </div>
          <div class="metric-value text-emerald">${formatCurrency(bMetrics.totalPaid, currency)}</div>
          <div class="metric-subtext">${bMetrics.totalOrders} fully paid orders</div>
        </div>

        <div class="metric-card card-debt">
          <div class="metric-header">
            <span class="metric-label">Money I Still Owe</span>
            <span class="metric-icon">⏳</span>
          </div>
          <div class="metric-value text-rose">${formatCurrency(bMetrics.totalDebt, currency)}</div>
          <div class="metric-subtext">Unpaid debts owed to sellers</div>
        </div>

        <div class="metric-card card-orders">
          <div class="metric-header">
            <span class="metric-label">Items Bought</span>
            <span class="metric-icon">📦</span>
          </div>
          <div class="metric-value text-cyan">${formatNumber(bMetrics.totalItems)} items</div>
          <div class="metric-subtext">Total goods recorded</div>
        </div>
      </section>

      ${
        bMetrics.totalDebt > 0
          ? `
          <div class="buyer-debt-alert-banner">
            <div class="buyer-debt-alert-info">
              <h3>⚠️ Reminder: Debts You Owe</h3>
              <p>You owe <strong>${formatCurrency(bMetrics.totalDebt, currency)}</strong> to sellers. Tap the WhatsApp button below to message the seller directly and arrange payment.</p>
            </div>
            <button id="btn-filter-only-debts" class="btn btn-outline-danger btn-sm">
              View Only Debts I Owe (${allPurchases.filter((p) => p.status === 'pending').length})
            </button>
          </div>
          `
          : ''
      }

      ${
        allPurchases.length === 0
          ? `
            <div class="empty-state">
              <span class="empty-state-icon">🛒</span>
              <h3>No Purchases or Debts Yet</h3>
              <p>When you buy items or record debts, they will appear here so you never forget what you owe or what you have paid.</p>
              <div style="display:flex; gap:10px; margin-top:8px;">
                <button id="btn-open-log-purchase-modal-empty" class="btn btn-primary">
                  + Record What I Bought
                </button>
                <a href="#/explore" class="btn btn-secondary">
                  Browse Marketplace Stores
                </a>
              </div>
            </div>
            `
          : `
            <section class="section-toolbar">
              <div class="search-filter-bar">
                <div class="search-input-wrapper">
                  <span class="search-icon">🔍</span>
                  <input
                    type="text"
                    id="buyer-search-input"
                    class="search-input"
                    placeholder="Search seller, product, or note..."
                    value="${escapeHtml(this.buyerSearchQuery)}"
                  />
                </div>
              </div>
            </section>

            <!-- Collapsible Buyer Filter Section (Vertical Layout) -->
            <section class="collapsible-filter-container">
              <div class="collapsible-filter-header">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-weight:700; font-size:var(--text-xs); text-transform:uppercase; letter-spacing:0.04em; color:var(--text-secondary);">
                    Show Purchases:
                  </span>
                  <span class="badge ${this.buyerStatusFilter === 'completed' ? 'badge-paid' : this.buyerStatusFilter === 'pending' ? 'badge-pending' : 'badge-niche'}">
                    ${this.buyerStatusFilter === 'all' ? `All (${allPurchases.length})` : this.buyerStatusFilter === 'completed' ? `Paid (${allPurchases.filter((p) => p.status === 'completed').length})` : `Debts I Owe (${allPurchases.filter((p) => p.status === 'pending').length})`}
                  </span>
                </div>
                <button
                  type="button"
                  id="btn-toggle-buyer-filter-collapse"
                  class="btn-toggle-collapse"
                  aria-expanded="${!this.isBuyerFilterCollapsed}"
                  title="${this.isBuyerFilterCollapsed ? 'Expand filters' : 'Collapse filters'}"
                >
                  <span>${this.isBuyerFilterCollapsed ? 'Show Filters' : 'Collapse'}</span>
                  <span class="collapse-icon">${this.isBuyerFilterCollapsed ? '▼' : '▲'}</span>
                </button>
              </div>

              <div id="buyer-filter-collapsible-wrapper" class="collapsible-filter-body ${this.isBuyerFilterCollapsed ? 'collapsed' : ''}">
                <div class="filter-bar-vertical">
                  <button class="filter-btn-vertical ${this.buyerStatusFilter === 'all' ? 'active' : ''}" data-buyer-filter="all">
                    <span>🛍️ All Purchases</span>
                    <span class="filter-count-pill">${allPurchases.length}</span>
                  </button>
                  <button class="filter-btn-vertical ${this.buyerStatusFilter === 'completed' ? 'active' : ''}" data-buyer-filter="completed">
                    <span>✓ Fully Paid</span>
                    <span class="filter-count-pill">${allPurchases.filter((p) => p.status === 'completed').length}</span>
                  </button>
                  <button class="filter-btn-vertical ${this.buyerStatusFilter === 'pending' ? 'active' : ''}" data-buyer-filter="pending">
                    <span>⏳ Debts I Still Owe</span>
                    <span class="filter-count-pill" style="color:var(--accent-rose);">${allPurchases.filter((p) => p.status === 'pending').length}</span>
                  </button>
                </div>
              </div>
            </section>

            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Seller / Store</th>
                    <th>Products / Qty</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th style="text-align:right;">Actions</th>
                  </tr>
                </thead>
                <tbody id="buyer-table-body">
                  ${this.renderBuyerTableBodyHTML(filtered, currency)}
                </tbody>
              </table>
            </div>
            `
      }

      <!-- Modal: Log a Buyer Purchase or Debt -->
      <div id="modal-log-buyer-purchase" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-buyer-title">
        <div class="modal-card" style="max-width:500px;">
          <div class="modal-header">
            <h2 id="modal-buyer-title" class="modal-title">🧾 Log a Purchase or Debt</h2>
            <button class="modal-close-btn" id="btn-close-buyer-modal">&times;</button>
          </div>
          <form id="form-log-buyer-purchase">
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label" for="buyer-merchant-name">Merchant / Business Name</label>
                <input type="text" id="buyer-merchant-name" class="form-input" placeholder="e.g. Island Fabrics or Yaba Electronics" required />
              </div>

              <div class="form-group">
                <label class="form-label" for="buyer-merchant-phone">Merchant WhatsApp Phone (Optional)</label>
                <input type="tel" id="buyer-merchant-phone" class="form-input" placeholder="e.g. 08012345678" />
              </div>

              <div class="form-grid-2-1">
                <div class="form-group">
                  <label class="form-label" for="buyer-item-name">Product / Item Name</label>
                  <input type="text" id="buyer-item-name" class="form-input" placeholder="e.g. Organic Serum" required />
                </div>
                <div class="form-group">
                  <label class="form-label" for="buyer-quantity">Quantity</label>
                  <input type="number" id="buyer-quantity" class="form-input" min="1" value="1" required />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="buyer-amount">Total Amount (${currency})</label>
                <input type="text" id="buyer-amount" class="form-input" placeholder="0.00" required />
              </div>

              <div class="form-group">
                <label class="form-label">Payment Status</label>
                <div class="form-grid-2col">
                  <label style="background:var(--bg-surface-elevated); padding:10px; border-radius:var(--radius-md); border:1px solid var(--border-subtle); display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="radio" name="buyer-status" value="completed" checked />
                    <span style="font-size:var(--text-xs); font-weight:700; color:var(--accent-emerald);">✓ Fully Paid</span>
                  </label>
                  <label style="background:var(--bg-surface-elevated); padding:10px; border-radius:var(--radius-md); border:1px solid var(--border-subtle); display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="radio" name="buyer-status" value="pending" />
                    <span style="font-size:var(--text-xs); font-weight:700; color:var(--accent-rose);">⏳ Owing Debt</span>
                  </label>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="buyer-notes">Notes / Receipt details (Optional)</label>
                <input type="text" id="buyer-notes" class="form-input" placeholder="e.g. Promised to transfer balance Friday" />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="btn-cancel-buyer-modal">Cancel</button>
              <button type="submit" class="btn btn-primary">Save Purchase Record</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  private renderBuyerTableBodyHTML(filteredInput?: Sale[], currencyInput?: string): string {
    const currency = currencyInput || this.currentUser?.currency || '₦';
    let filtered = filteredInput;
    if (!filtered && this.currentUser) {
      let allPurchases = StorageService.getBuyerPurchases(this.currentUser);
      if (this.buyerStatusFilter !== 'all') {
        allPurchases = allPurchases.filter((p) => p.status === this.buyerStatusFilter);
      }
      if (this.buyerSearchQuery.trim()) {
        const q = this.buyerSearchQuery.toLowerCase();
        allPurchases = allPurchases.filter(
          (p) =>
            p.merchantStoreName?.toLowerCase().includes(q) ||
            p.customerName.toLowerCase().includes(q) ||
            p.items.some((i) => i.productName.toLowerCase().includes(q)) ||
            p.notes?.toLowerCase().includes(q)
        );
      }
      filtered = allPurchases;
    }

    const list = filtered || [];
    if (list.length === 0) {
      return `<tr><td colspan="6"><div class="empty-state" style="border:none; margin:16px auto;"><p>No records match your filter.</p></div></td></tr>`;
    }

    return list
      .map((p) => {
        const isPaid = p.status === 'completed';
        const merchantName = p.merchantStoreName || 'Marketplace Merchant';
        const waPhone = sanitizeWhatsAppPhone(p.merchantPhone || '');
        const waMessage = encodeURIComponent(
          `Hello ${merchantName}! 👋\nI am contacting you from ShopKepa regarding my order (${p.items.map((i) => i.productName).join(', ')}) of ${formatCurrency(p.totalAmount, currency)}.`
        );
        const waLink = waPhone ? `https://wa.me/${waPhone}?text=${waMessage}` : '';

        return `
          <tr>
            <td style="color:var(--text-secondary); font-size:var(--text-xs);">
              ${formatDate(p.createdAt)}
            </td>
            <td>
              <div style="font-weight:700;">${merchantName}</div>
              ${p.merchantPhone ? `<div style="font-size:var(--text-xs); color:var(--text-muted);">${p.merchantPhone}</div>` : ''}
            </td>
            <td>
              <div style="font-size:var(--text-xs);">
                ${p.items.map((i) => `<span>${i.productName} <strong style="color:var(--text-secondary);">(x${i.quantity})</strong></span>`).join(', ')}
              </div>
              ${p.notes ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px; font-style:italic;">"${p.notes}"</div>` : ''}
            </td>
            <td class="table-amount ${isPaid ? 'text-emerald' : 'text-rose'}">
              ${formatCurrency(p.totalAmount, currency)}
            </td>
            <td>
              <span class="badge ${isPaid ? 'badge-paid' : 'badge-owing'}">
                ${isPaid ? '✓ Paid' : `⏳ Owing ${formatCurrency(p.totalAmount, currency)}`}
              </span>
            </td>
            <td style="text-align:right; white-space:nowrap;">
              ${
                !isPaid && waLink
                  ? `<a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp btn-sm" style="text-decoration:none; margin-right:6px;" title="Chat with seller on WhatsApp to pay debt">
                      💬 Message Seller on WhatsApp
                     </a>`
                  : ''
              }
              <button
                class="btn btn-sm ${isPaid ? 'btn-secondary' : 'btn-success'} btn-toggle-buyer-status"
                data-purchase-id="${p.id}"
                title="${isPaid ? 'Revert to Owing Debt' : 'Mark Debt as Settled / Paid'}"
              >
                ${isPaid ? 'Revert' : '✓ Mark Paid'}
              </button>
              <button
                class="btn btn-outline-danger btn-sm btn-delete-buyer-record"
                data-purchase-id="${p.id}"
                title="Delete record"
                style="margin-left:6px;"
              >
                🗑️
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  // =========================================================================
  // ADD STOCK / RESTOCK MODAL (WITH FLEXIBLE PRICE CHANGE PROMPT)
  // =========================================================================
  private openAddStockModal(productId: string): void {
    const product = StorageService.getProduct(productId);
    if (!product) return;
    const currency = this.currentUser?.currency || '₦';

    let modal = document.getElementById('modal-add-stock');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-add-stock';
      modal.className = 'modal-overlay';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);
    }

    const closeModal = () => {
      modal?.classList.remove('open');
    };

    const currentCostStr = product.costPrice !== undefined ? formatCurrency(product.costPrice, currency) : 'Not set';

    modal.innerHTML = `
      <div class="modal-card" style="max-width:460px;">
        <div class="modal-header">
          <h2 class="modal-title" style="display:flex; align-items:center; gap:8px;">
            <span>📦</span> Add Stock
          </h2>
          <button type="button" class="modal-close-btn" id="btn-close-add-stock-modal" aria-label="Close modal">&times;</button>
        </div>

        <form id="form-add-stock-modal">
          <div class="modal-body" style="gap:14px;">
            <div style="background:var(--bg-surface-elevated); padding:12px 14px; border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
              <div style="font-size:var(--text-sm); font-weight:700; color:var(--text-primary); margin-bottom:4px;">
                ${product.name}
              </div>
              <div style="font-size:var(--text-xs); color:var(--text-secondary); display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                <span>${product.category || 'General'}</span>
                <span>Current Stock: <strong style="color:var(--text-primary);">${product.stock} units</strong></span>
              </div>
              <div style="font-size:11px; color:var(--text-muted); display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-top:6px; padding-top:6px; border-top:1px solid var(--border-subtle);">
                <span>Current Cost: <strong style="color:var(--text-secondary);">${currentCostStr}</strong></span>
                <span>Current Selling Price: <strong style="color:var(--accent-emerald);">${formatCurrency(product.price, currency)}</strong></span>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="add-stock-qty-input">Quantity Restocked (Units to Add)</label>
              <input
                type="number"
                id="add-stock-qty-input"
                class="form-input"
                min="1"
                step="1"
                placeholder="Enter number of units added (e.g. 12)"
                required
              />
              <span class="form-hint" id="add-stock-preview-hint">
                Enter how many new units you restocked to add to your current ${product.stock} units.
              </span>
            </div>

            <!-- Ask merchant if restock price changed -->
            <div class="form-group">
              <label class="form-label">Did the price change with this restock?</label>
              <div class="form-grid-2col">
                <label class="role-card-option active" id="opt-keep-price" style="padding:10px 12px; gap:2px; border-width:1px;">
                  <div style="display:flex; align-items:center; gap:6px; font-size:var(--text-xs); font-weight:700;">
                    <input type="radio" name="restock-price-changed" value="no" checked />
                    <span>No, keep current price</span>
                  </div>
                </label>
                <label class="role-card-option" id="opt-change-price" style="padding:10px 12px; gap:2px; border-width:1px;">
                  <div style="display:flex; align-items:center; gap:6px; font-size:var(--text-xs); font-weight:700;">
                    <input type="radio" name="restock-price-changed" value="yes" />
                    <span>Yes, update price</span>
                  </div>
                </label>
              </div>
            </div>

            <div id="add-stock-price-fields" style="display:none; flex-direction:column; gap:12px; background:var(--bg-surface-elevated); padding:12px; border-radius:var(--radius-md); border:1px solid var(--border-strong);">
              <div class="form-grid-2col">
                <div class="form-group">
                  <label class="form-label" for="add-stock-cost-price">New Cost Price (${currency})</label>
                  <input
                    type="text"
                    id="add-stock-cost-price"
                    class="form-input"
                    placeholder="0.00"
                    value="${product.costPrice !== undefined ? product.costPrice.toFixed(2) : ''}"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label" for="add-stock-sell-price">New Selling Price (${currency})</label>
                  <input
                    type="text"
                    id="add-stock-sell-price"
                    class="form-input"
                    placeholder="0.00"
                    value="${product.price.toFixed(2)}"
                  />
                </div>
              </div>
              <div id="add-stock-profit-hint" style="font-size:11px; color:var(--text-secondary);"></div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-add-stock">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm">Save Restock</button>
          </div>
        </form>
      </div>
    `;

    modal.classList.add('open');

    const qtyInput = document.getElementById('add-stock-qty-input') as HTMLInputElement | null;
    const previewHint = document.getElementById('add-stock-preview-hint');
    const priceFieldsBox = document.getElementById('add-stock-price-fields');
    const costInput = document.getElementById('add-stock-cost-price') as HTMLInputElement | null;
    const sellInput = document.getElementById('add-stock-sell-price') as HTMLInputElement | null;
    const profitHint = document.getElementById('add-stock-profit-hint');
    const optKeep = document.getElementById('opt-keep-price');
    const optChange = document.getElementById('opt-change-price');

    const updateProfitPreview = () => {
      if (!profitHint || !sellInput || !costInput) return;
      const sellVal = parseSanitizedNumber(sellInput.value);
      const costRaw = costInput.value.trim();
      if (!costRaw) {
        profitHint.innerHTML = `New selling price: <strong style="color:var(--accent-emerald);">${formatCurrency(sellVal, currency)}</strong> (enter cost price to estimate profit)`;
        return;
      }
      const costVal = parseSanitizedNumber(costRaw);
      const profit = sellVal - costVal;
      const margin = sellVal > 0 ? Math.round((profit / sellVal) * 100) : 0;
      profitHint.innerHTML = `Updated Est. Profit: <strong style="color:${profit >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">${profit >= 0 ? '+' : ''}${formatCurrency(profit, currency)}/unit (${margin}% margin)</strong>`;
    };

    if (costInput) attachNumberSanitizer(costInput, updateProfitPreview);
    if (sellInput) attachNumberSanitizer(sellInput, updateProfitPreview);
    updateProfitPreview();

    modal.querySelectorAll('input[name="restock-price-changed"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const val = (e.target as HTMLInputElement).value;
        const isChanging = val === 'yes';
        if (priceFieldsBox) priceFieldsBox.style.display = isChanging ? 'flex' : 'none';
        optKeep?.classList.toggle('active', !isChanging);
        optChange?.classList.toggle('active', isChanging);
        if (isChanging) {
          updateProfitPreview();
          setTimeout(() => sellInput?.focus(), 30);
        }
      });
    });

    setTimeout(() => qtyInput?.focus(), 40);

    qtyInput?.addEventListener('input', () => {
      const added = parseInt(qtyInput.value, 10);
      if (!previewHint) return;
      if (!isNaN(added) && added > 0) {
        previewHint.innerHTML = `New Total Stock: <strong style="color:var(--accent-emerald);">${product.stock} + ${added} = ${product.stock + added} units</strong>`;
      } else {
        previewHint.textContent = `Enter how many new units you restocked to add to your current ${product.stock} units.`;
      }
    });

    document.getElementById('btn-close-add-stock-modal')?.addEventListener('click', closeModal);
    document.getElementById('btn-cancel-add-stock')?.addEventListener('click', closeModal);
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };

    document.getElementById('form-add-stock-modal')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const added = parseInt(qtyInput?.value || '0', 10);
      if (isNaN(added) || added <= 0) {
        this.showToast('Please enter at least 1 unit to add.', 'warning');
        return;
      }

      const freshProd = StorageService.getProduct(productId);
      if (!freshProd) {
        closeModal();
        return;
      }

      const isPriceChanging =
        (modal?.querySelector('input[name="restock-price-changed"]:checked') as HTMLInputElement | null)?.value === 'yes';

      let nextPrice = freshProd.price;
      let nextCostPrice = freshProd.costPrice;

      if (isPriceChanging) {
        const parsedSell = parseSanitizedNumber(sellInput?.value || '0');
        if (parsedSell <= 0) {
          this.showToast('Please enter a valid selling price greater than 0.', 'danger');
          return;
        }
        nextPrice = parsedSell;
        const rawCost = costInput?.value.trim() || '';
        nextCostPrice = rawCost !== '' ? parseSanitizedNumber(rawCost) : undefined;
      }

      const updated = StorageService.saveProduct({
        ...freshProd,
        stock: freshProd.stock + added,
        price: nextPrice,
        costPrice: nextCostPrice,
      });

      closeModal();
      const priceNote = isPriceChanging ? ` Price updated to ${formatCurrency(updated.price, currency)}.` : '';
      this.showToast(`Added +${added} units to ${updated.name} (Now ${updated.stock} in stock).${priceNote}`, 'success');
      this.render();
    });
  }

  // =========================================================================
  // REUSABLE IN-APP CONFIRMATION MODAL FOR VITAL & DESTRUCTIVE ACTIONS
  // =========================================================================
  private openConfirmActionModal(options: {
    title: string;
    message: string;
    detailHtml?: string;
    warning?: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  }): void {
    let modal = document.getElementById('modal-confirm-vital-action');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-confirm-vital-action';
      modal.className = 'modal-overlay';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);
    }

    const closeModal = () => {
      modal?.classList.remove('open');
    };

    const isDanger = options.danger !== false;

    modal.innerHTML = `
      <div class="modal-card" style="max-width:440px; border-color:${isDanger ? 'var(--accent-rose)' : 'var(--border-focus)'};">
        <div class="modal-header">
          <h2 class="modal-title" style="color:${isDanger ? 'var(--accent-rose)' : 'var(--text-primary)'}; display:flex; align-items:center; gap:8px;">
            <span>${isDanger ? '⚠️' : 'ℹ️'}</span> ${options.title}
          </h2>
          <button type="button" class="modal-close-btn" id="btn-close-confirm-vital" aria-label="Close modal">&times;</button>
        </div>
        <div class="modal-body" style="gap:12px;">
          <p style="font-size:var(--text-sm); color:var(--text-primary); font-weight:600; margin:0; line-height:1.45;">
            ${options.message}
          </p>
          ${
            options.detailHtml
              ? `<div style="background:var(--bg-surface-elevated); padding:12px 14px; border-radius:var(--radius-md); font-size:var(--text-xs); color:var(--text-secondary); line-height:1.55; border:1px solid var(--border-subtle);">
                  ${options.detailHtml}
                 </div>`
              : ''
          }
          ${
            options.warning
              ? `<p style="font-size:var(--text-xs); color:${isDanger ? 'var(--accent-rose)' : 'var(--accent-amber)'}; margin:0; font-weight:600;">
                  ${options.warning}
                 </p>`
              : ''
          }
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-confirm-vital">Cancel</button>
          <button type="button" class="btn ${isDanger ? 'btn-outline-danger' : 'btn-primary'} btn-sm" id="btn-proceed-confirm-vital">
            ${options.confirmLabel}
          </button>
        </div>
      </div>
    `;

    modal.classList.add('open');

    document.getElementById('btn-close-confirm-vital')?.addEventListener('click', closeModal);
    document.getElementById('btn-cancel-confirm-vital')?.addEventListener('click', closeModal);
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };

    document.getElementById('btn-proceed-confirm-vital')?.addEventListener('click', () => {
      closeModal();
      options.onConfirm();
    });
  }

  private bindPasswordToggles(root: ParentNode = document): void {
    root.querySelectorAll<HTMLButtonElement>('.btn-toggle-password').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        if (!targetId) return;
        const input = document.getElementById(targetId) as HTMLInputElement | null;
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.textContent = isPassword ? 'Hide' : 'Show';
      });
    });
  }

  private openSwitchAccountPasswordModal(targetUser: User): void {
    let modal = document.getElementById('modal-switch-account-password');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-switch-account-password';
      modal.className = 'modal-overlay';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);
    }

    const closeModal = () => {
      modal?.classList.remove('open');
    };

    const label = escapeHtml(targetUser.storeName || targetUser.name);

    modal.innerHTML = `
      <div class="modal-card" style="max-width:400px;">
        <div class="modal-header">
          <h2 class="modal-title" style="display:flex; align-items:center; gap:8px;">
            <span>🔒</span> Verify Account Password
          </h2>
          <button type="button" class="modal-close-btn" id="btn-close-switch-pw" aria-label="Close modal">&times;</button>
        </div>
        <form id="form-switch-account-pw">
          <div class="modal-body" style="gap:12px;">
            <p style="font-size:var(--text-sm); color:var(--text-secondary); margin:0; line-height:1.45;">
              Enter the password for <strong style="color:var(--text-primary);">${label}</strong> to switch accounts.
            </p>
            <div class="form-group">
              <label class="form-label" for="switch-account-password">Password</label>
              <div class="password-input-wrapper">
                <input
                  type="password"
                  id="switch-account-password"
                  class="form-input"
                  placeholder="Enter account password"
                  autocomplete="current-password"
                  required
                />
                <button type="button" class="btn-toggle-password" data-target="switch-account-password" aria-label="Toggle password visibility">Show</button>
              </div>
            </div>
            <div id="switch-pw-error" class="auth-error-msg" role="alert"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-switch-pw">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm">Verify & Switch</button>
          </div>
        </form>
      </div>
    `;

    modal.classList.add('open');
    this.bindPasswordToggles(modal);

    const pwInput = document.getElementById('switch-account-password') as HTMLInputElement | null;
    const errBox = document.getElementById('switch-pw-error');
    setTimeout(() => pwInput?.focus(), 40);

    document.getElementById('btn-close-switch-pw')?.addEventListener('click', closeModal);
    document.getElementById('btn-cancel-switch-pw')?.addEventListener('click', closeModal);
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };

    document.getElementById('form-switch-account-pw')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const entered = pwInput?.value || '';
      const valid = await StorageService.verifyUserPassword(targetUser.id, entered);
      if (!valid) {
        if (errBox) {
          errBox.textContent = 'Incorrect password. Please try again.';
          errBox.classList.add('visible');
        }
        pwInput?.select();
        return;
      }

      const switched = StorageService.switchUser(targetUser.id);
      closeModal();
      if (switched) {
        this.currentUser = switched;
        this.showToast(`Switched account to: ${switched.storeName || switched.name} (${switched.role})`, 'info');
        this.navigate(switched.role === 'merchant' ? '#/sales' : '#/explore');
      }
    });
  }

  // =========================================================================
  // WHATSAPP DEBT TEMPLATE GENERATOR MODAL
  // =========================================================================
  private openWhatsAppDebtTemplateModal(initialSaleId?: string): void {
    if (!this.currentUser) return;
    const currency = this.currentUser.currency || '₦';
    const allSales = StorageService.getSales(this.currentUser.id);
    const pendingDebts = allSales.filter((s) => s.status === 'pending');

    if (pendingDebts.length === 0) {
      this.showToast('You currently have no customers owing debt! 🎉', 'info');
      return;
    }

    let currentSaleId =
      initialSaleId && pendingDebts.some((s) => s.id === initialSaleId)
        ? initialSaleId
        : pendingDebts[0].id;

    let selectedTone: 'friendly' | 'formal' | 'urgent' = 'formal';
    let currentSale = pendingDebts.find((s) => s.id === currentSaleId) || pendingDebts[0];
    const initialDue = getDebtDueStatus(currentSale.dueDate);
    if (initialDue.status === 'overdue') {
      selectedTone = 'urgent';
    }

    let modal = document.getElementById('modal-wa-debt-template');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-wa-debt-template';
      modal.className = 'modal-overlay';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);
    }

    const renderModalContent = () => {
      currentSale = pendingDebts.find((s) => s.id === currentSaleId) || pendingDebts[0];
      const dueInfo = getDebtDueStatus(currentSale.dueDate);
      const isOverdue = dueInfo.status === 'overdue';
      const isDueToday = dueInfo.status === 'due_today';
      const dueBadgeClass = isOverdue ? 'badge-overdue' : isDueToday ? 'badge-due-today' : 'badge-pending';

      const itemsSummary = currentSale.items
        .map((i) => `${i.productName} (x${i.quantity})`)
        .join(', ');

      const bankInfo = this.currentUser?.bankPaymentDetails?.trim();

      modal!.innerHTML = `
        <div class="modal-card" style="max-width:680px; width:95%; max-height:92vh;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title" style="display:flex; align-items:center; gap:8px;">
                <span>💬 WhatsApp Debt Message Generator</span>
              </h2>
              <div style="font-size:var(--text-xs); color:var(--text-secondary); margin-top:2px;">
                Pre-filled message template using customer contact information stored in ShopKepa.
              </div>
            </div>
            <button class="modal-close-btn" id="btn-close-wa-debt-modal">&times;</button>
          </div>

          <div class="modal-body" style="padding:18px 20px; gap:14px;">
            ${
              pendingDebts.length > 1
                ? `
                <div>
                  <label class="form-label" for="wa-debtor-select" style="font-size:var(--text-xs);">
                    Select Customer Owing Debt (${pendingDebts.length} debtors):
                  </label>
                  <select id="wa-debtor-select" class="form-select" style="font-weight:600;">
                    ${pendingDebts
                      .map(
                        (d) => `
                        <option value="${d.id}" ${d.id === currentSale.id ? 'selected' : ''}>
                          ${d.customerName} — ${formatCurrency(d.totalAmount, currency)} (${getDebtDueStatus(d.dueDate).label})
                        </option>
                      `
                      )
                      .join('')}
                  </select>
                </div>
              `
                : ''
            }

            <!-- Customer Contact & Debt Info Box -->
            <div class="wa-debtor-info-box">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
                <div>
                  <div style="font-size:var(--text-base); font-weight:800; color:var(--text-primary);">
                    ${currentSale.customerName}
                  </div>
                  <div style="font-size:var(--text-xs); color:var(--text-muted); margin-top:2px;">
                    Goods: <span style="color:var(--text-secondary);">${itemsSummary}</span>
                  </div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:var(--text-base); font-weight:800; color:#fb7185; font-family:var(--font-mono);">
                    ${formatCurrency(currentSale.totalAmount, currency)}
                  </div>
                  <span class="badge ${dueBadgeClass}" style="margin-top:2px;">
                    ${dueInfo.label}
                  </span>
                </div>
              </div>

              <!-- Customer Stored Phone (Editable with Instant Save) -->
              <div style="margin-top:4px; padding-top:10px; border-top:1px dashed var(--border-subtle);">
                <label class="form-label" style="font-size:var(--text-xs); margin-bottom:4px;" for="wa-customer-phone-input">
                  Customer WhatsApp Phone Number (Stored Contact):
                </label>
                <div class="wa-phone-input-row">
                  <input
                    type="tel"
                    id="wa-customer-phone-input"
                    class="form-input"
                    style="flex:1; font-family:var(--font-mono); font-size:var(--text-sm);"
                    placeholder="e.g. 08023456789 or 2348012345678"
                    value="${currentSale.customerPhone || ''}"
                  />
                  <button
                    type="button"
                    id="wa-btn-save-phone"
                    class="btn btn-secondary btn-sm"
                    title="Save this phone number to the customer's permanent record"
                    style="white-space:nowrap;"
                  >
                    💾 Save Phone
                  </button>
                </div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">
                  Phone number is stored locally and used to route direct WhatsApp chat messages.
                </div>
              </div>
            </div>

            <!-- Message Tone Selector -->
            <div>
              <label class="form-label" style="font-size:var(--text-xs); margin-bottom:4px;">
                Choose Message Style / Tone:
              </label>
              <div class="wa-tone-selector">
                <button
                  type="button"
                  class="wa-tone-btn ${selectedTone === 'friendly' ? 'active' : ''}"
                  data-tone="friendly"
                >
                  🤝 Gentle & Friendly
                </button>
                <button
                  type="button"
                  class="wa-tone-btn ${selectedTone === 'formal' ? 'active' : ''}"
                  data-tone="formal"
                >
                  📋 Business Invoice
                </button>
                <button
                  type="button"
                  class="wa-tone-btn ${selectedTone === 'urgent' ? 'active' : ''}"
                  data-tone="urgent"
                >
                  ⚠️ Urgent Overdue Notice
                </button>
              </div>
            </div>

            <!-- Pre-filled Message Text Preview (Editable) -->
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <label class="form-label" for="wa-message-textarea" style="font-size:var(--text-xs); margin:0;">
                  📝 Pre-Filled WhatsApp Template (You can edit before sending):
                </label>
                <span id="wa-char-counter" style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);"></span>
              </div>
              <textarea id="wa-message-textarea" class="wa-message-preview" rows="9"></textarea>
            </div>

            <!-- Bank Transfer Status Callout -->
            ${
              bankInfo
                ? `
                <div class="wa-bank-callout">
                  <span>🏦</span>
                  <div style="line-height:1.3;">
                    <strong>Bank Details Included:</strong> ${bankInfo.replace(/\n/g, ' • ')}
                  </div>
                </div>
              `
                : `
                <div class="wa-bank-callout warning">
                  <span>💡</span>
                  <div style="line-height:1.3;">
                    <strong>Add Bank Transfer Details:</strong> You haven't configured your bank account in
                    <a href="#/settings" class="text-amber" style="font-weight:700; text-decoration:underline;">Settings</a>.
                    Add your bank info so customers can transfer directly to your account.
                  </div>
                </div>
              `
            }
          </div>

          <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-close-wa-debt-cancel">
              Close
            </button>
            <div style="display:flex; gap:8px;">
              <button
                type="button"
                id="btn-copy-wa-template"
                class="btn btn-secondary btn-sm"
                title="Copy formatted WhatsApp text to clipboard"
              >
                📋 Copy Text
              </button>
              <a
                id="link-open-wa-chat"
                class="btn btn-whatsapp-action btn-sm"
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                title="Open WhatsApp chat with pre-filled message"
              >
                💬 Open WhatsApp Chat
              </a>
            </div>
          </div>
        </div>
      `;

      attachModalEvents();
    };

    const attachModalEvents = () => {
      const phoneInput = document.getElementById('wa-customer-phone-input') as HTMLInputElement;
      const savePhoneBtn = document.getElementById('wa-btn-save-phone');
      const messageTextarea = document.getElementById('wa-message-textarea') as HTMLTextAreaElement;
      const charCounter = document.getElementById('wa-char-counter');
      const copyBtn = document.getElementById('btn-copy-wa-template');
      const openWaBtn = document.getElementById('link-open-wa-chat') as HTMLAnchorElement;
      const debtorSelect = document.getElementById('wa-debtor-select') as HTMLSelectElement;

      const refreshMessage = () => {
        const text = buildDebtReminderText({
          buyerPhone: phoneInput?.value || currentSale.customerPhone || '',
          buyerName: currentSale.customerName,
          merchantStoreName: this.currentUser?.storeName || this.currentUser?.name || 'ShopKepa Store',
          merchantPhone: this.currentUser?.phone,
          sale: currentSale,
          currency: this.currentUser?.currency || '₦',
          bankPaymentDetails: this.currentUser?.bankPaymentDetails,
          tone: selectedTone,
        });

        if (messageTextarea) {
          messageTextarea.value = text;
        }
        updateLinkAndCount();
      };

      const updateLinkAndCount = () => {
        const currentText = messageTextarea?.value || '';
        const phone = phoneInput?.value.trim() || '';
        if (charCounter) {
          charCounter.textContent = `${currentText.length} characters`;
        }
        if (openWaBtn) {
          const cleanPhone = sanitizeWhatsAppPhone(phone);
          openWaBtn.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(currentText)}`;
        }
      };

      refreshMessage();

      // Listen for debtor selector switch
      debtorSelect?.addEventListener('change', () => {
        currentSaleId = debtorSelect.value;
        currentSale = pendingDebts.find((s) => s.id === currentSaleId) || pendingDebts[0];
        const dueInfo = getDebtDueStatus(currentSale.dueDate);
        selectedTone = dueInfo.status === 'overdue' ? 'urgent' : 'formal';
        renderModalContent();
      });

      // Listen for tone buttons
      modal!.querySelectorAll('.wa-tone-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const tone = (e.currentTarget as HTMLElement).dataset.tone as 'friendly' | 'formal' | 'urgent';
          if (tone) {
            selectedTone = tone;
            modal!.querySelectorAll('.wa-tone-btn').forEach((b) => b.classList.remove('active'));
            (e.currentTarget as HTMLElement).classList.add('active');
            refreshMessage();
          }
        });
      });

      // Typing in textarea updates character count and link
      messageTextarea?.addEventListener('input', updateLinkAndCount);

      // Typing in phone input updates link
      phoneInput?.addEventListener('input', updateLinkAndCount);

      // Save phone button
      savePhoneBtn?.addEventListener('click', () => {
        const newPhone = phoneInput?.value.trim() || '';
        if (!newPhone) {
          this.showToast('Please enter a valid phone number to save.', 'warning');
          return;
        }
        StorageService.updateCustomerPhone(currentSale.id, newPhone);
        currentSale.customerPhone = newPhone;
        this.showToast(`Saved phone number for ${currentSale.customerName}!`, 'success');
        updateLinkAndCount();
      });

      // Copy text button
      copyBtn?.addEventListener('click', async () => {
        const text = messageTextarea?.value || '';
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          this.showToast('WhatsApp template copied to clipboard! Ready to paste.', 'success');
        } catch {
          messageTextarea.select();
          document.execCommand('copy');
          this.showToast('WhatsApp template copied to clipboard!', 'success');
        }
      });

      // Open WhatsApp button click validation
      openWaBtn?.addEventListener('click', (e) => {
        const phone = phoneInput?.value.trim();
        if (!phone) {
          e.preventDefault();
          this.showToast("Please enter the customer's WhatsApp phone number before opening chat.", 'warning');
          phoneInput?.focus();
          return;
        }
        this.showToast(`Opening WhatsApp chat for ${currentSale.customerName}...`, 'info');
      });

      // Close modal
      const closeModal = () => modal?.classList.remove('open');
      document.getElementById('btn-close-wa-debt-modal')?.addEventListener('click', closeModal);
      document.getElementById('btn-close-wa-debt-cancel')?.addEventListener('click', closeModal);
      modal!.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    };

    renderModalContent();
    modal.classList.add('open');
  }

  // =========================================================================
  // INTERACTIVE PHOTO ADJUSTER & PREVIEW MODAL
  // =========================================================================
  private openPhotoAdjusterModal(
    initialImageBase64: string,
    onApply: (adjustedBase64: string) => void
  ): void {
    if (!initialImageBase64) {
      this.showToast('Please select or upload an image first.', 'info');
      return;
    }

    let scale = 1.0;
    let panX = 0; // % offset (-50 to 50)
    let panY = 0; // % offset (-50 to 50)
    let brightness = 100; // % (70 to 150)
    let sharpness = 0; // % (0 to 100)
    let aspectRatio: 'original' | '1:1' | '3:4' | '4:3' = 'original';

    let modal = document.getElementById('modal-photo-adjuster');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-photo-adjuster';
      modal.className = 'modal-overlay';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-card photo-adjuster-card">
        <!-- SVG Sharpen Filter Definition for live preview -->
        <svg style="position:absolute; width:0; height:0; pointer-events:none;" aria-hidden="true">
          <filter id="adjuster-sharpen-filter">
            <feConvolveMatrix id="adjuster-sharpen-matrix" order="3" preserveAlpha="true" kernelMatrix="0 0 0 0 1 0 0 0 0" />
          </filter>
        </svg>

        <div class="modal-header">
          <div>
            <h2 class="modal-title" style="display:flex; align-items:center; gap:8px;">
              <span>✂️ Adjust Photo</span>
            </h2>
            <div style="font-size:var(--text-xs); color:var(--text-secondary); margin-top:2px;">
              Crop to your preferred shape, and make your photo sharper and brighter.
            </div>
          </div>
          <button class="modal-close-btn" id="btn-close-adjuster">&times;</button>
        </div>

        <div class="modal-body" style="padding:16px 20px; gap:16px;">
          <!-- Interactive Preview Stage -->
          <div style="display:flex; flex-direction:column; align-items:center; gap:6px;">
            <div class="photo-adjuster-stage">
              <div id="adjuster-viewport" class="photo-adjuster-viewport" style="max-width:280px; max-height:280px;">
                <img
                  id="adjuster-preview-img"
                  src="${initialImageBase64}"
                  class="photo-adjuster-img"
                  alt="Adjusting preview"
                />
              </div>
            </div>
            <span style="font-size:11px; color:var(--text-muted);">✋ Drag photo to reposition inside crop box</span>
          </div>

          <!-- Controls Section: Crop, Brighten, Sharpen ONLY -->
          <div style="display:flex; flex-direction:column; gap:14px;">
            <!-- 1. Crop & Framing -->
            <div class="adjuster-section">
              <div class="adjuster-section-title">
                <span>1. Crop & Framing</span>
              </div>
              <div class="adjuster-chip-group" id="adjuster-aspect-chips">
                <button type="button" class="adjuster-chip active" data-aspect="original" title="Keeps entire photo with zero cutting">
                  🌿 Full Photo (No Crop)
                </button>
                <button type="button" class="adjuster-chip" data-aspect="1:1" title="Square 1:1 format">
                  🔲 Square (1:1)
                </button>
                <button type="button" class="adjuster-chip" data-aspect="3:4" title="Vertical portrait">
                  📱 Portrait (3:4)
                </button>
                <button type="button" class="adjuster-chip" data-aspect="4:3" title="Landscape format">
                  🖥️ Landscape (4:3)
                </button>
              </div>
            </div>

            <!-- Zoom & Pan Position for Framing the Crop -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:12px;">
              <div class="adjuster-section">
                <div class="adjuster-section-title">
                  <span>Zoom / Crop Scale</span>
                  <span id="label-zoom-val" class="adjuster-slider-val">100%</span>
                </div>
                <div class="adjuster-slider-row">
                  <span style="font-size:12px;">🔍</span>
                  <input type="range" id="slider-zoom" class="adjuster-slider" min="100" max="250" value="100" step="5" />
                  <button type="button" id="btn-zoom-reset" class="btn btn-secondary btn-sm" style="padding:2px 8px; font-size:10px;">Reset</button>
                </div>
              </div>

              <div class="adjuster-section">
                <div class="adjuster-section-title">
                  <span>Reposition Crop (Pan)</span>
                  <button type="button" id="btn-pan-center" class="btn btn-secondary btn-sm" style="padding:2px 8px; font-size:10px;">Center</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:6px;">
                  <div class="adjuster-slider-row">
                    <span style="font-size:11px; color:var(--text-muted); width:20px;">↔️</span>
                    <input type="range" id="slider-panx" class="adjuster-slider" min="-50" max="50" value="0" step="2" />
                    <span id="label-panx-val" class="adjuster-slider-val" style="min-width:32px;">0%</span>
                  </div>
                  <div class="adjuster-slider-row">
                    <span style="font-size:11px; color:var(--text-muted); width:20px;">↕️</span>
                    <input type="range" id="slider-pany" class="adjuster-slider" min="-50" max="50" value="0" step="2" />
                    <span id="label-pany-val" class="adjuster-slider-val" style="min-width:32px;">0%</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 2. Brighten & Sharpen -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:12px;">
              <div class="adjuster-section">
                <div class="adjuster-section-title">
                  <span>☀️ Brighten</span>
                  <span id="label-bright-val" class="adjuster-slider-val">100%</span>
                </div>
                <div class="adjuster-slider-row">
                  <span style="font-size:11px; color:var(--text-muted);">🔆</span>
                  <input type="range" id="slider-brightness" class="adjuster-slider" min="70" max="150" value="100" step="2" />
                </div>
              </div>

              <div class="adjuster-section">
                <div class="adjuster-section-title">
                  <span>✨ Sharpen</span>
                  <span id="label-sharp-val" class="adjuster-slider-val">Normal</span>
                </div>
                <div class="adjuster-slider-row">
                  <span style="font-size:11px; color:var(--text-muted);">💎</span>
                  <input type="range" id="slider-sharpness" class="adjuster-slider" min="0" max="100" value="0" step="2" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-adjuster-reset">
            ↺ Reset
          </button>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-adjuster-cancel">
              Cancel
            </button>
            <button type="button" class="btn btn-primary btn-sm" id="btn-adjuster-apply">
              ✓ Apply Adjustments
            </button>
          </div>
        </div>
      </div>
    `;

    // Elements
    const viewport = document.getElementById('adjuster-viewport');
    const previewImg = document.getElementById('adjuster-preview-img') as HTMLImageElement;
    const sliderZoom = document.getElementById('slider-zoom') as HTMLInputElement;
    const labelZoomVal = document.getElementById('label-zoom-val');
    const btnZoomReset = document.getElementById('btn-zoom-reset');
    const sliderPanX = document.getElementById('slider-panx') as HTMLInputElement;
    const labelPanXVal = document.getElementById('label-panx-val');
    const sliderPanY = document.getElementById('slider-pany') as HTMLInputElement;
    const labelPanYVal = document.getElementById('label-pany-val');
    const btnPanCenter = document.getElementById('btn-pan-center');
    const sliderBrightness = document.getElementById('slider-brightness') as HTMLInputElement;
    const labelBrightVal = document.getElementById('label-bright-val');
    const sliderSharpness = document.getElementById('slider-sharpness') as HTMLInputElement;
    const labelSharpVal = document.getElementById('label-sharp-val');
    const btnReset = document.getElementById('btn-adjuster-reset');
    const btnCancel = document.getElementById('btn-adjuster-cancel');
    const btnClose = document.getElementById('btn-close-adjuster');
    const btnApply = document.getElementById('btn-adjuster-apply');

    // Natural image dimensions and base viewport size
    let natW = 300;
    let natH = 300;
    let baseW = 240;
    let baseH = 240;
    let vpW = 240;
    let vpH = 240;

    const updateViewportSize = () => {
      if (!viewport || !previewImg) return;
      const maxStageH = 260;
      const maxStageW = 280;

      if (aspectRatio === 'original') {
        const ratio = (natW > 0 && natH > 0) ? (natW / natH) : 1;
        let w = maxStageW;
        let h = w / ratio;
        if (h > maxStageH) {
          h = maxStageH;
          w = h * ratio;
        }
        vpW = Math.max(100, Math.round(w));
        vpH = Math.max(100, Math.round(h));
        baseW = vpW;
        baseH = vpH;
      } else if (aspectRatio === '1:1') {
        vpW = 230;
        vpH = 230;
      } else if (aspectRatio === '3:4') {
        vpW = 195;
        vpH = 260;
      } else if (aspectRatio === '4:3') {
        vpW = 260;
        vpH = 195;
      }

      if (aspectRatio !== 'original') {
        const coverScale = Math.max(vpW / natW, vpH / natH);
        baseW = Math.round(natW * coverScale);
        baseH = Math.round(natH * coverScale);
      }

      viewport.style.width = `${vpW}px`;
      viewport.style.height = `${vpH}px`;

      // Explicitly size previewImg so photos fit the box without overflowing
      previewImg.style.width = `${baseW}px`;
      previewImg.style.height = `${baseH}px`;
      previewImg.style.minWidth = `${baseW}px`;
      previewImg.style.minHeight = `${baseH}px`;
      previewImg.style.maxWidth = 'none';
      previewImg.style.maxHeight = 'none';
    };

    const updateTransform = () => {
      if (!previewImg) return;
      previewImg.style.transform = `translate(${panX}%, ${panY}%) scale(${scale})`;

      // Update live SVG sharpen filter
      const matrixEl = document.getElementById('adjuster-sharpen-matrix');
      if (matrixEl) {
        const k = (sharpness / 100) * 1.0;
        const c = 1 + 4 * k;
        matrixEl.setAttribute('kernelMatrix', `0 ${-k} 0 ${-k} ${c} ${-k} 0 ${-k} 0`);
      }

      if (sharpness > 0) {
        previewImg.style.filter = `url(#adjuster-sharpen-filter) brightness(${brightness}%)`;
      } else {
        previewImg.style.filter = `brightness(${brightness}%)`;
      }

      if (labelZoomVal) labelZoomVal.textContent = `${Math.round(scale * 100)}%`;
      if (labelPanXVal) labelPanXVal.textContent = `${panX}%`;
      if (labelPanYVal) labelPanYVal.textContent = `${panY}%`;
      if (labelBrightVal) labelBrightVal.textContent = `${brightness}%`;
      if (labelSharpVal) labelSharpVal.textContent = sharpness === 0 ? 'Normal' : `+${sharpness}%`;
    };

    const tempImg = new Image();
    const onImgLoaded = () => {
      natW = tempImg.naturalWidth || 300;
      natH = tempImg.naturalHeight || 300;
      updateViewportSize();
      updateTransform();
    };

    tempImg.src = initialImageBase64;
    if (tempImg.complete && tempImg.naturalWidth > 0) {
      onImgLoaded();
    } else {
      tempImg.onload = onImgLoaded;
    }

    // Aspect ratio chips (Crop mode)
    modal.querySelectorAll('#adjuster-aspect-chips .adjuster-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        const aspect = (e.currentTarget as HTMLElement).dataset.aspect as any;
        if (aspect) {
          aspectRatio = aspect;
          modal!.querySelectorAll('#adjuster-aspect-chips .adjuster-chip').forEach((c) => c.classList.remove('active'));
          (e.currentTarget as HTMLElement).classList.add('active');
          updateViewportSize();
          updateTransform();
        }
      });
    });

    // Zoom slider
    sliderZoom?.addEventListener('input', () => {
      scale = Number(sliderZoom.value) / 100;
      updateTransform();
    });
    btnZoomReset?.addEventListener('click', () => {
      scale = 1.0;
      if (sliderZoom) sliderZoom.value = '100';
      updateTransform();
    });

    // Pan sliders
    sliderPanX?.addEventListener('input', () => {
      panX = Number(sliderPanX.value);
      updateTransform();
    });
    sliderPanY?.addEventListener('input', () => {
      panY = Number(sliderPanY.value);
      updateTransform();
    });
    btnPanCenter?.addEventListener('click', () => {
      panX = 0;
      panY = 0;
      if (sliderPanX) sliderPanX.value = '0';
      if (sliderPanY) sliderPanY.value = '0';
      updateTransform();
    });

    // Drag to pan inside preview viewport
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startPanX = 0;
    let startPanY = 0;

    const onPointerDown = (clientX: number, clientY: number) => {
      isDragging = true;
      startX = clientX;
      startY = clientY;
      startPanX = panX;
      startPanY = panY;
    };

    const onPointerMove = (clientX: number, clientY: number) => {
      if (!isDragging) return;
      const dx = clientX - startX;
      const dy = clientY - startY;
      if (baseW > 0 && baseH > 0) {
        const deltaPanX = (dx / baseW) * 100;
        const deltaPanY = (dy / baseH) * 100;
        panX = Math.max(-50, Math.min(50, Math.round(startPanX + deltaPanX)));
        panY = Math.max(-50, Math.min(50, Math.round(startPanY + deltaPanY)));
        if (sliderPanX) sliderPanX.value = String(panX);
        if (sliderPanY) sliderPanY.value = String(panY);
        updateTransform();
      }
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    const handleMouseMove = (e: MouseEvent) => onPointerMove(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    viewport?.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onPointerDown(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', onPointerUp);

    viewport?.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);

    // Brightness slider
    sliderBrightness?.addEventListener('input', () => {
      brightness = Number(sliderBrightness.value);
      updateTransform();
    });

    // Sharpness slider
    sliderSharpness?.addEventListener('input', () => {
      sharpness = Number(sliderSharpness.value);
      updateTransform();
    });

    // Reset button
    btnReset?.addEventListener('click', () => {
      scale = 1.0;
      panX = 0;
      panY = 0;
      brightness = 100;
      sharpness = 0;
      aspectRatio = 'original';
      if (sliderZoom) sliderZoom.value = '100';
      if (sliderPanX) sliderPanX.value = '0';
      if (sliderPanY) sliderPanY.value = '0';
      if (sliderBrightness) sliderBrightness.value = '100';
      if (sliderSharpness) sliderSharpness.value = '0';
      modal!.querySelectorAll('#adjuster-aspect-chips .adjuster-chip').forEach((c) => {
        c.classList.toggle('active', (c as HTMLElement).dataset.aspect === 'original');
      });
      updateViewportSize();
      updateTransform();
    });

    // Close / Cancel
    const closeModal = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', onPointerUp);
      modal?.classList.remove('open');
    };
    btnCancel?.addEventListener('click', closeModal);
    btnClose?.addEventListener('click', closeModal);
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };

    // Canvas image sharpen filter helper
    const applyCanvasSharpen = (
      context: CanvasRenderingContext2D,
      width: number,
      height: number,
      amount: number
    ) => {
      if (amount <= 0) return;
      const k = amount * 0.85;
      const imgData = context.getImageData(0, 0, width, height);
      const src = imgData.data;
      const output = context.createImageData(width, height);
      const dst = output.data;
      const w = width;
      const h = height;
      const center = 1 + 4 * k;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
            dst[idx] = src[idx];
            dst[idx + 1] = src[idx + 1];
            dst[idx + 2] = src[idx + 2];
            dst[idx + 3] = src[idx + 3];
            continue;
          }

          const top = ((y - 1) * w + x) * 4;
          const btm = ((y + 1) * w + x) * 4;
          const lft = (y * w + (x - 1)) * 4;
          const rgt = (y * w + (x + 1)) * 4;

          const r = src[idx] * center - (src[top] + src[btm] + src[lft] + src[rgt]) * k;
          const g = src[idx + 1] * center - (src[top + 1] + src[btm + 1] + src[lft + 1] + src[rgt + 1]) * k;
          const b = src[idx + 2] * center - (src[top + 2] + src[btm + 2] + src[lft + 2] + src[rgt + 2]) * k;

          dst[idx] = r < 0 ? 0 : r > 255 ? 255 : r;
          dst[idx + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
          dst[idx + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
          dst[idx + 3] = src[idx + 3];
        }
      }
      context.putImageData(output, 0, 0);
    };

    // Apply adjustments via HTML5 Canvas
    btnApply?.addEventListener('click', () => {
      try {
        const canvas = document.createElement('canvas');
        const dpr = Math.min(4, Math.max(2, Math.round(800 / Math.max(vpW, vpH))));
        const targetW = Math.round(vpW * dpr);
        const targetH = Math.round(vpH * dpr);
        canvas.width = targetW;
        canvas.height = targetH;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          closeModal();
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Apply brightness filter to canvas
        ctx.filter = `brightness(${brightness}%)`;

        ctx.save();
        ctx.translate(targetW / 2, targetH / 2);

        // Calculate exact canvas base dimensions matching preview
        const canvasBaseW = baseW * dpr;
        const canvasBaseH = baseH * dpr;

        // Apply pan offset
        const pixelPanX = (panX / 100) * canvasBaseW;
        const pixelPanY = (panY / 100) * canvasBaseH;
        ctx.translate(pixelPanX, pixelPanY);

        // Apply zoom scale
        const drawW = canvasBaseW * scale;
        const drawH = canvasBaseH * scale;

        ctx.drawImage(tempImg, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();

        // Apply sharpen convolution if requested
        if (sharpness > 0) {
          applyCanvasSharpen(ctx, targetW, targetH, sharpness / 100);
        }

        const adjustedBase64 = canvas.toDataURL('image/jpeg', 0.84);
        onApply(adjustedBase64);
        closeModal();
        this.showToast('Photo adjusted and applied successfully!', 'success');
      } catch {
        this.showToast('Could not process photo adjustment', 'danger');
        closeModal();
      }
    });

    modal.classList.add('open');
  }

  // =========================================================================
  // PRINTABLE PDF FINANCIAL STATEMENT
  // =========================================================================
  private openPrintStatementModal(sales: Sale[]): void {
    if (!this.currentUser) return;
    const currency = this.currentUser.currency || '₦';
    const expenses = StorageService.getExpenses(this.currentUser.id);
    const finSummary = StorageService.calculateFinancialSummary(sales, expenses);
    const storeName = this.currentUser.storeName || this.currentUser.name;
    const dateStamp = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let modal = document.getElementById('modal-print-statement');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-print-statement';
      modal.className = 'modal-overlay';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-card" style="max-width:850px; width:95%; max-height:92vh;">
        <div class="modal-header">
          <h2 class="modal-title">📄 Official Financial Statement (Print / PDF)</h2>
          <button class="modal-close-btn" id="btn-close-statement-modal">&times;</button>
        </div>
        <div class="modal-body" style="padding:16px;">
          <div id="printable-statement-target" class="statement-paper">
            <div class="statement-header">
              <div>
                <h1 class="statement-title">${storeName}</h1>
                <div class="statement-sub">Niche: <strong>${this.currentUser.niche || 'General Merchandise'}</strong> • ${this.currentUser.city || 'Nigeria'}</div>
                <div class="statement-sub">Contact WhatsApp: <strong>${this.currentUser.phone || 'N/A'}</strong></div>
              </div>
              <div style="text-align:right;">
                <div style="font-weight:800; font-size:16px; color:#0f172a; text-transform:uppercase;">Official Business Statement</div>
                <div class="statement-sub">Date: ${dateStamp}</div>
                <div class="statement-sub">Generated via ShopKepa Offline Records</div>
              </div>
            </div>

            <!-- Financial Metrics Summary (Revenue, Overheads, Net Profit, Debt) -->
            <div class="statement-summary-boxes">
              <div class="statement-box">
                <div class="statement-box-label">Total Sales Cash</div>
                <div class="statement-box-val" style="color:#059669;">${formatCurrency(finSummary.totalRevenue, currency)}</div>
              </div>
              <div class="statement-box">
                <div class="statement-box-label">Total Shop Bills</div>
                <div class="statement-box-val" style="color:#ea580c;">${formatCurrency(finSummary.totalExpenses, currency)}</div>
              </div>
              <div class="statement-box">
                <div class="statement-box-label">Take-Home Profit</div>
                <div class="statement-box-val" style="color:${finSummary.netProfit >= 0 ? '#059669' : '#e11d48'};">
                  ${finSummary.netProfit >= 0 ? '+' : ''}${formatCurrency(finSummary.netProfit, currency)}
                </div>
              </div>
              <div class="statement-box">
                <div class="statement-box-label">Customer Debts</div>
                <div class="statement-box-val" style="color:#e11d48;">${formatCurrency(finSummary.totalDebt, currency)}</div>
              </div>
            </div>

            <div style="margin-bottom:12px; font-size:12px; font-weight:700; text-transform:uppercase; color:#475569;">
              1. Sales & Customer Debts (${sales.length} records)
            </div>

            <!-- Itemized Sales Table -->
            <div class="statement-table-scroll" style="margin-bottom:20px;">
              <table class="statement-table" style="margin-bottom:0;">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Items Ordered</th>
                    <th>Payment Method</th>
                    <th>Status</th>
                    <th style="text-align:right;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${sales
                    .map(
                      (s) => `
                      <tr>
                        <td style="white-space:nowrap; color:#64748b; font-size:11px;">${formatDate(s.createdAt)}</td>
                        <td><strong>${s.customerName}</strong> ${s.customerPhone ? `<br/><span style="color:#94a3b8; font-size:10px;">${s.customerPhone}</span>` : ''}</td>
                        <td style="font-size:11px;">${s.items.map((i) => `${i.productName} (x${i.quantity})`).join(', ')}</td>
                        <td>${s.paymentMethod}</td>
                        <td>
                          <span style="font-weight:700; color:${s.status === 'completed' ? '#059669' : '#e11d48'};">
                            ${s.status === 'completed' ? '✓ PAID' : '⏳ UNPAID DEBT'}
                          </span>
                        </td>
                        <td style="text-align:right; font-family:monospace; font-weight:700;">${formatCurrency(s.totalAmount, currency)}</td>
                      </tr>
                    `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>

            ${
              expenses.length > 0
                ? `
                <div style="margin-bottom:12px; font-size:12px; font-weight:700; text-transform:uppercase; color:#475569;">
                  2. Shop Expenses & Bills (${expenses.length} records)
                </div>
                <div class="statement-table-scroll" style="margin-bottom:20px;">
                  <table class="statement-table" style="margin-bottom:0;">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Expense / Bill</th>
                        <th>Category</th>
                        <th>Vendor / Payee</th>
                        <th>Payment Method</th>
                        <th style="text-align:right;">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${expenses
                        .slice(0, 10)
                        .map(
                          (e) => `
                          <tr>
                            <td style="white-space:nowrap; color:#64748b; font-size:11px;">${new Date(e.date || e.createdAt).toLocaleDateString()}</td>
                            <td><strong>${e.title}</strong></td>
                            <td>${e.category}</td>
                            <td>${e.vendor || '—'}</td>
                            <td>${e.paymentMethod || 'Cash'}</td>
                            <td style="text-align:right; font-family:monospace; font-weight:700; color:#ea580c;">${formatCurrency(e.amount, currency)}</td>
                          </tr>
                        `
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>
              `
                : ''
            }

            <div class="statement-footer">
              <span>Verified offline sales & expense statement. ShopKepa shop manager.</span>
              <span>Profit Margin: <strong>${finSummary.netMarginPct}%</strong> | Spending Ratio: <strong>${finSummary.expenseRatioPct}%</strong></span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="btn-cancel-statement-modal">Close</button>
          <button type="button" class="btn btn-primary" id="btn-trigger-browser-print">
            🖨️ Print / Save as PDF
          </button>
        </div>
      </div>
    `;

    modal.classList.add('open');

    const closeModal = () => modal?.classList.remove('open');
    document.getElementById('btn-close-statement-modal')?.addEventListener('click', closeModal);
    document.getElementById('btn-cancel-statement-modal')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    document.getElementById('btn-trigger-browser-print')?.addEventListener('click', () => {
      window.print();
    });
  }

  // =========================================================================
  // PAGE: AUTH & ONBOARDING (INTRODUCTORY MESSAGE + LOGIN & SIGN UP FORMS)
  // =========================================================================
  private renderAuthPage(container: HTMLElement): void {
    this.unmountMountedCharts();
    container.innerHTML = `
      <div class="auth-container">
        <!-- Return to active session if user clicked Switch -->
        ${
          this.currentUser
            ? `
          <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:10px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <span style="font-size:var(--text-xs); color:var(--text-primary); font-weight:600;">
              ${this.currentUser.role === 'merchant' ? '🏪' : '🛒'} ${this.currentUser.storeName || this.currentUser.name}
            </span>
            <a href="${this.currentUser.role === 'merchant' ? '#/sales' : '#/explore'}" class="btn btn-success btn-sm">
              ← Return to Store
            </a>
          </div>
        `
            : ''
        }

        <!-- Concise Introductory Header -->
        <div class="intro-hero">
          <div class="intro-brand-row">
            <div class="brand-logo-mark" style="width:40px; height:40px; font-size:20px;">₦</div>
            <h1 class="intro-hero-title">ShopKepa</h1>
          </div>
          <p class="intro-hero-desc">
            Welcome to ShopKepa — your offline-first companion to track daily sales, product profits, inventory, and customer debts.
          </p>
        </div>

        <!-- Clean Mode Switcher: Log In vs Sign Up -->
        <div class="auth-tabs-wrapper">
          <div class="auth-toggle-row" role="tablist">
            <button
              type="button"
              class="auth-toggle-btn ${this.authTab === 'login' ? 'active' : ''}"
              id="tab-auth-login"
              role="tab"
              aria-selected="${this.authTab === 'login'}"
            >
              Log In
            </button>
            <button
              type="button"
              class="auth-toggle-btn ${this.authTab === 'signup' ? 'active' : ''}"
              id="tab-auth-signup"
              role="tab"
              aria-selected="${this.authTab === 'signup'}"
            >
              Sign Up
            </button>
          </div>

          <!-- TAB 1: CLEAN LOGIN FORM -->
          ${
            this.authTab === 'login'
              ? `
            <div id="auth-panel-login" style="display:flex; flex-direction:column; gap:14px;">
              <form id="form-auth-login" style="display:flex; flex-direction:column; gap:14px;">
                <div class="form-group">
                  <label class="form-label" for="login-identifier">Phone Number, Store Name, or Email</label>
                  <input
                    type="text"
                    id="login-identifier"
                    class="form-input"
                    placeholder="e.g. 08023456789 or My Store"
                    autocomplete="username"
                    required
                    autofocus
                  />
                </div>

                <div class="form-group">
                  <label class="form-label" for="login-password">Password</label>
                  <div class="password-input-wrapper">
                    <input
                      type="password"
                      id="login-password"
                      class="form-input"
                      placeholder="Enter your password"
                      autocomplete="current-password"
                      required
                    />
                    <button type="button" class="btn-toggle-password" data-target="login-password" aria-label="Toggle password visibility">Show</button>
                  </div>
                </div>

                <div id="login-error-msg" class="auth-error-msg" role="alert"></div>

                <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">
                  Log In
                </button>
              </form>
            </div>
          `
              : `
            <!-- TAB 2: CLEAN SIGN UP FORM -->
            <div id="auth-panel-signup" style="display:flex; flex-direction:column; gap:14px;">
              <form id="form-auth-setup" style="display:flex; flex-direction:column; gap:14px;">
                <!-- Role Selector: Merchant vs Buyer -->
                <div class="form-group">
                  <label class="form-label">Account Type</label>
                  <div class="role-selector-row">
                    <div class="role-card-option active" data-role-select="merchant">
                      <div class="role-card-header">
                        <span>🏪 Merchant</span>
                        <span class="role-radio-check">✓</span>
                      </div>
                      <span class="role-card-desc">Manage stock, sales & storefront</span>
                    </div>

                    <div class="role-card-option" data-role-select="buyer">
                      <div class="role-card-header">
                        <span>🛒 Buyer</span>
                        <span class="role-radio-check" style="opacity:0;">✓</span>
                      </div>
                      <span class="role-card-desc">Browse stores & order via WhatsApp</span>
                    </div>
                  </div>
                  <input type="hidden" id="auth-role" value="merchant" />
                </div>

                <div class="form-group">
                  <label class="form-label" for="auth-name">Full Name</label>
                  <input type="text" id="auth-name" class="form-input" placeholder="e.g. Amaka Okafor" required />
                </div>

                <!-- Merchant-Specific Fields -->
                <div id="auth-merchant-fields" style="display:flex; flex-direction:column; gap:12px;">
                  <div class="form-grid-2col">
                    <div class="form-group">
                      <label class="form-label" for="auth-store-name">Store Name</label>
                      <input type="text" id="auth-store-name" class="form-input" placeholder="e.g. Amaka Wears" />
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="auth-niche">Business Niche</label>
                      <select id="auth-niche" class="form-select">
                        <option value="Fashion">Fashion & Apparel</option>
                        <option value="Beauty">Beauty & Cosmetics</option>
                        <option value="Tech Gadgets">Tech Gadgets</option>
                        <option value="Foodstuff & Provisions">Foodstuff & Provisions</option>
                        <option value="Health & Wellness">Health & Wellness</option>
                        <option value="Home & Living">Home & Living</option>
                        <option value="Electronics">Electronics</option>
                        <option value="General Merchandise">General Merchandise</option>
                      </select>
                    </div>
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="auth-city">City / Location</label>
                    <input type="text" id="auth-city" class="form-input" placeholder="e.g. Lagos or Abuja" />
                  </div>
                </div>

                <div class="form-grid-2col">
                  <div class="form-group">
                    <label class="form-label" for="auth-phone">WhatsApp Phone</label>
                    <input type="tel" id="auth-phone" class="form-input" placeholder="e.g. 08023456789" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="auth-currency">Currency</label>
                    <select id="auth-currency" class="form-select">
                      <option value="₦">₦ - NGN</option>
                      <option value="$">$ - USD</option>
                      <option value="₵">₵ - GHS</option>
                      <option value="KSh">KSh - KES</option>
                      <option value="£">£ - GBP</option>
                      <option value="€">€ - EUR</option>
                      <option value="R">R - ZAR</option>
                    </select>
                  </div>
                </div>

                <div class="form-grid-2col">
                  <div class="form-group">
                    <label class="form-label" for="auth-password">Password</label>
                    <div class="password-input-wrapper">
                      <input
                        type="password"
                        id="auth-password"
                        class="form-input"
                        placeholder="Min. 4 characters"
                        minlength="4"
                        autocomplete="new-password"
                        required
                      />
                      <button type="button" class="btn-toggle-password" data-target="auth-password" aria-label="Toggle password visibility">Show</button>
                    </div>
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="auth-confirm-password">Confirm Password</label>
                    <div class="password-input-wrapper">
                      <input
                        type="password"
                        id="auth-confirm-password"
                        class="form-input"
                        placeholder="Re-enter password"
                        minlength="4"
                        autocomplete="new-password"
                        required
                      />
                      <button type="button" class="btn-toggle-password" data-target="auth-confirm-password" aria-label="Toggle password visibility">Show</button>
                    </div>
                  </div>
                </div>

                <div id="signup-error-msg" class="auth-error-msg" role="alert"></div>

                <button type="submit" class="btn btn-primary btn-lg" style="width:100%;">
                  Create Account
                </button>
              </form>
            </div>
          `
          }
        </div>

        <div style="border-top:1px solid var(--border-subtle); padding-top:12px; text-align:center;">
          <a href="#/explore" style="font-size:var(--text-xs); color:var(--text-secondary); text-decoration:none;">
            Continue as Guest to Browse Marketplace →
          </a>
        </div>
      </div>
    `;

    this.bindPasswordToggles(container);

    // Tab Switcher Click Listeners
    document.getElementById('tab-auth-login')?.addEventListener('click', () => {
      this.authTab = 'login';
      this.renderAuthPage(container);
    });

    document.getElementById('tab-auth-signup')?.addEventListener('click', () => {
      this.authTab = 'signup';
      this.renderAuthPage(container);
    });

    // Login Form Submit Event
    document.getElementById('form-auth-login')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifierInput = document.getElementById('login-identifier') as HTMLInputElement;
      const passwordInput = document.getElementById('login-password') as HTMLInputElement;
      const errorBox = document.getElementById('login-error-msg');

      const showError = (msg: string) => {
        if (errorBox) {
          errorBox.textContent = msg;
          errorBox.classList.add('visible');
        }
      };

      if (errorBox) {
        errorBox.textContent = '';
        errorBox.classList.remove('visible');
      }

      const identifier = identifierInput?.value.trim();
      const password = passwordInput?.value || '';
      if (!identifier) {
        showError('Please enter your phone number, store name, or email.');
        return;
      }
      if (!password) {
        showError('Please enter your password.');
        return;
      }

      const submitBtn = (e.currentTarget as HTMLFormElement).querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (submitBtn) submitBtn.disabled = true;

      try {
        const result = await StorageService.verifyLogin(identifier, password);
        if (result.status === 'success' && result.user) {
          this.currentUser = result.user;
          if (result.setFirstPassword) {
            this.showToast(`Password set for your store! Welcome back, ${result.user.storeName || result.user.name}!`, 'success');
          } else {
            this.showToast(`Welcome back, ${result.user.storeName || result.user.name}!`, 'success');
          }
          this.navigate(result.user.role === 'merchant' ? '#/sales' : '#/explore');
          return;
        }

        if (result.status === 'password_too_short') {
          showError('Please enter a password of at least 4 characters to secure your account.');
        } else if (result.status === 'wrong_password') {
          showError('Incorrect password. Please try again.');
          passwordInput?.select();
        } else {
          showError(`No account found matching "${identifier}". Try Sign Up to create one.`);
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    // Sign Up Role Selector Click Events
    const roleCards = document.querySelectorAll('.role-card-option');
    const roleInput = document.getElementById('auth-role') as HTMLInputElement;
    const merchantFields = document.getElementById('auth-merchant-fields');

    roleCards.forEach((card) => {
      card.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const selectedRole = target.dataset.roleSelect as UserRole;
        if (roleInput) roleInput.value = selectedRole;

        roleCards.forEach((c) => {
          c.classList.remove('active');
          const check = c.querySelector('.role-radio-check') as HTMLElement;
          if (check) check.style.opacity = '0';
        });

        target.classList.add('active');
        const check = target.querySelector('.role-radio-check') as HTMLElement;
        if (check) check.style.opacity = '1';

        if (selectedRole === 'merchant') {
          if (merchantFields) merchantFields.style.display = 'flex';
        } else {
          if (merchantFields) merchantFields.style.display = 'none';
        }
      });
    });

    // Sign Up Form Submit Event
    document.getElementById('form-auth-setup')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const role = (document.getElementById('auth-role') as HTMLInputElement)?.value as UserRole || 'merchant';
      const name = (document.getElementById('auth-name') as HTMLInputElement)?.value.trim() || 'Merchant';
      const niche = (document.getElementById('auth-niche') as HTMLSelectElement)?.value || 'Fashion';
      const storeName = (document.getElementById('auth-store-name') as HTMLInputElement)?.value;
      const city = (document.getElementById('auth-city') as HTMLInputElement)?.value;
      const phone = (document.getElementById('auth-phone') as HTMLInputElement)?.value || '';
      const currency = (document.getElementById('auth-currency') as HTMLSelectElement)?.value || '₦';
      const password = (document.getElementById('auth-password') as HTMLInputElement)?.value || '';
      const confirmPassword = (document.getElementById('auth-confirm-password') as HTMLInputElement)?.value || '';
      const errorBox = document.getElementById('signup-error-msg');

      const showError = (msg: string) => {
        if (errorBox) {
          errorBox.textContent = msg;
          errorBox.classList.add('visible');
        }
      };

      if (errorBox) {
        errorBox.textContent = '';
        errorBox.classList.remove('visible');
      }

      if (password.length < 4) {
        showError('Password must be at least 4 characters long.');
        (document.getElementById('auth-password') as HTMLInputElement)?.focus();
        return;
      }

      if (password !== confirmPassword) {
        showError('Passwords do not match. Please re-enter.');
        (document.getElementById('auth-confirm-password') as HTMLInputElement)?.focus();
        return;
      }

      const submitBtn = (e.currentTarget as HTMLFormElement).querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (submitBtn) submitBtn.disabled = true;

      try {
        const salt = generatePasswordSalt();
        const hash = await hashPassword(password, salt);

        const newUser = StorageService.signup({
          name,
          email: `${name.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}@shopkepa.local`,
          role,
          niche: role === 'merchant' ? niche : undefined,
          storeName: role === 'merchant' ? (storeName?.trim() || `${name}'s Store`) : undefined,
          city,
          phone,
          currency,
          passwordHash: hash,
          passwordSalt: salt,
        });

        this.currentUser = newUser;
        this.showToast(
          role === 'merchant'
            ? `Welcome ${name}! Your store in ${niche} is ready and starts 100% empty.`
            : `Welcome ${name}! Start exploring merchants in the marketplace.`,
          'success'
        );

        this.navigate(role === 'merchant' ? '#/sales' : '#/explore');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  private bindProductProfitCalculator(currency: string): void {
    const inputCost = document.getElementById('product-cost-price') as HTMLInputElement | null;
    const inputSell = document.getElementById('product-price') as HTMLInputElement | null;
    const inputStock = document.getElementById('product-stock') as HTMLInputElement | null;

    const previewBox = document.getElementById('product-profit-preview');
    const marginBadge = document.getElementById('profit-margin-badge');
    const perUnitVal = document.getElementById('profit-per-unit-val');
    const totalStockVal = document.getElementById('profit-total-stock-val');
    const stockUnitsSpan = document.getElementById('profit-stock-units');

    const updateProfitPreview = () => {
      if (!previewBox || !marginBadge || !perUnitVal || !totalStockVal || !stockUnitsSpan) return;

      const rawCost = inputCost?.value.trim() || '';
      const rawSell = inputSell?.value.trim() || '';
      const stockQty = Math.max(0, parseInt(inputStock?.value || '0', 10) || 0);
      stockUnitsSpan.textContent = String(stockQty);

      if (rawSell === '' && rawCost === '') {
        previewBox.className = 'profit-preview-box is-neutral';
        marginBadge.className = 'badge badge-paid';
        marginBadge.textContent = 'Enter prices';
        perUnitVal.textContent = formatCurrency(0, currency);
        perUnitVal.className = 'profit-preview-value';
        totalStockVal.textContent = formatCurrency(0, currency);
        totalStockVal.className = 'profit-preview-value';
        return;
      }

      const cost = rawCost !== '' ? parseSanitizedNumber(rawCost) : 0;
      const sell = rawSell !== '' ? parseSanitizedNumber(rawSell) : 0;
      const unitProfit = sell - cost;
      const totalProfit = unitProfit * stockQty;
      const marginPct = sell > 0 ? ((unitProfit / sell) * 100).toFixed(1) : '0.0';

      if (rawCost === '') {
        previewBox.className = 'profit-preview-box is-neutral';
        marginBadge.className = 'badge badge-paid';
        marginBadge.textContent = 'Add cost price';
        perUnitVal.textContent = formatCurrency(unitProfit, currency);
        perUnitVal.className = 'profit-preview-value';
        totalStockVal.textContent = formatCurrency(totalProfit, currency);
        totalStockVal.className = 'profit-preview-value';
        return;
      }

      if (unitProfit > 0) {
        previewBox.className = 'profit-preview-box';
        marginBadge.className = 'badge badge-in-stock';
        marginBadge.textContent = `+${marginPct}% margin`;
        perUnitVal.textContent = `+${formatCurrency(unitProfit, currency)}`;
        perUnitVal.className = 'profit-preview-value text-emerald';
        totalStockVal.textContent = `+${formatCurrency(totalProfit, currency)}`;
        totalStockVal.className = 'profit-preview-value text-emerald';
      } else if (unitProfit < 0) {
        previewBox.className = 'profit-preview-box is-loss';
        marginBadge.className = 'badge badge-owing';
        marginBadge.textContent = `Loss (${marginPct}%)`;
        perUnitVal.textContent = `-${formatCurrency(Math.abs(unitProfit), currency)}`;
        perUnitVal.className = 'profit-preview-value text-rose';
        totalStockVal.textContent = `-${formatCurrency(Math.abs(totalProfit), currency)}`;
        totalStockVal.className = 'profit-preview-value text-rose';
      } else {
        previewBox.className = 'profit-preview-box is-neutral';
        marginBadge.className = 'badge badge-paid';
        marginBadge.textContent = 'Break-even (0%)';
        perUnitVal.textContent = formatCurrency(0, currency);
        perUnitVal.className = 'profit-preview-value';
        totalStockVal.textContent = formatCurrency(0, currency);
        totalStockVal.className = 'profit-preview-value';
      }
    };

    if (inputCost) {
      attachNumberSanitizer(inputCost, () => updateProfitPreview());
    }
    if (inputSell) {
      attachNumberSanitizer(inputSell, () => updateProfitPreview());
    }
    inputStock?.addEventListener('input', () => updateProfitPreview());

    updateProfitPreview();
  }

  // --- Dynamic Event Listeners for Current Page ---
  private bindCurrentPageEvents(sales: Sale[], products: Product[]): void {
    const currency = this.currentUser?.currency || '₦';
    const [path] = (this.currentRoute || (this.currentUser?.role === 'buyer' ? '#/explore' : '#/dashboard')).split('?');

    // Global Collapsible Navigation Toggle
    const btnToggleNav = document.getElementById('btn-toggle-nav-collapse');
    const navWrapper = document.getElementById('nav-collapsible-wrapper');
    btnToggleNav?.addEventListener('click', () => {
      this.isNavCollapsed = !this.isNavCollapsed;
      if (navWrapper && btnToggleNav) {
        if (this.isNavCollapsed) {
          navWrapper.classList.add('collapsed');
          btnToggleNav.innerHTML = '<span>☰ Show Pages</span><span class="collapse-icon">▼</span>';
          btnToggleNav.setAttribute('aria-expanded', 'false');
          btnToggleNav.setAttribute('title', 'Open navigation menu');
        } else {
          navWrapper.classList.remove('collapsed');
          btnToggleNav.innerHTML = '<span>Collapse</span><span class="collapse-icon">▲</span>';
          btnToggleNav.setAttribute('aria-expanded', 'true');
          btnToggleNav.setAttribute('title', 'Collapse navigation menu');
        }
      }
    });

    document.querySelectorAll('.nav-page-link-vertical').forEach((link) => {
      link.addEventListener('click', () => {
        this.isNavCollapsed = true;
      });
    });

    document.getElementById('btn-header-logout')?.addEventListener('click', () => {
      this.openConfirmActionModal({
        title: 'Log Out of Store',
        message: 'Are you sure you want to log out of your current account?',
        detailHtml: `Active Account: <strong style="color:var(--text-primary);">${this.currentUser?.storeName || this.currentUser?.name || ''}</strong>`,
        warning: 'Your saved inventory, sales, and customer records stay safe on this device.',
        confirmLabel: 'Log Out',
        danger: false,
        onConfirm: () => {
          StorageService.logout();
          this.currentUser = null;
          this.authTab = 'login';
          this.showToast('You have logged out of your store.', 'info');
          this.navigate('#/auth');
        },
      });
    });

    // Global banner reactivate button (available from any page when store is deactivated)
    document.getElementById('btn-banner-reactivate')?.addEventListener('click', () => {
      if (!this.currentUser) return;
      const reactivated = StorageService.reactivateAccount(this.currentUser.id);
      if (reactivated) {
        this.currentUser = reactivated;
        this.showToast('Store reactivated! Your storefront is now visible again in Explore.', 'success');
        this.render();
      }
    });

    // 0. Recharts Performance Dashboard Mounting
    if (path === '#/dashboard') {
      const mountEl = document.getElementById('recharts-dashboard-container');
      if (mountEl && this.currentUser) {
        const expenses = StorageService.getExpenses(this.currentUser.id);
        const storeName = this.currentUser.storeName || this.currentUser.name;
        const currentCurrency = this.currentUser.currency || '₦';

        if (!this.rechartsRoot) {
          this.rechartsRoot = createRoot(mountEl);
        }
        this.rechartsRoot.render(
          React.createElement(RechartsDashboard, {
            sales,
            expenses,
            products: StorageService.getProducts(this.currentUser.id),
            currency: currentCurrency,
            storeName,
            lowStockThreshold: this.currentUser.lowStockThreshold ?? 5,
            onNavigate: (route: string) => this.navigate(route),
            onOpenDebtReminder: () => this.openWhatsAppDebtTemplateModal(),
            onQuickRestock: (productId: string) => {
              this.openAddStockModal(productId);
            },
          })
        );
      }
    } else {
      // Unmount recharts if navigating to other pages to prevent memory leaks
      if (this.rechartsRoot) {
        this.rechartsRoot.unmount();
        this.rechartsRoot = null;
      }
    }

    // 1. Explore Page Events
    if (path === '#/explore') {
      const bindExploreReset = () => {
        document.getElementById('btn-reset-explore-filters')?.addEventListener('click', () => {
          this.exploreNicheFilter = 'All';
          this.exploreSearchQuery = '';
          const main = document.getElementById('page-viewport');
          if (main) {
            main.innerHTML = this.renderExplorePageHTML();
            this.bindCurrentPageEvents(sales, products);
          }
        });
      };

      const searchInput = document.getElementById('explore-search-input') as HTMLInputElement;
      searchInput?.addEventListener('input', (e) => {
        this.exploreSearchQuery = (e.target as HTMLInputElement).value;
        const grid = document.getElementById('explore-merchant-grid');
        if (grid) {
          grid.innerHTML = this.renderExploreGridInnerHTML();
          bindExploreReset();
        }
      });

      // Collapsible Niche Toggle
      document.getElementById('btn-toggle-niche-collapse')?.addEventListener('click', () => {
        this.isNicheCollapsed = !this.isNicheCollapsed;
        const wrapper = document.getElementById('niche-collapsible-wrapper');
        const btn = document.getElementById('btn-toggle-niche-collapse');
        if (wrapper && btn) {
          if (this.isNicheCollapsed) {
            wrapper.classList.add('collapsed');
            btn.innerHTML = '<span>Show Niches</span><span class="collapse-icon">▼</span>';
            btn.setAttribute('aria-expanded', 'false');
            btn.setAttribute('title', 'Expand niches');
          } else {
            wrapper.classList.remove('collapsed');
            btn.innerHTML = '<span>Collapse</span><span class="collapse-icon">▲</span>';
            btn.setAttribute('aria-expanded', 'true');
            btn.setAttribute('title', 'Collapse niches');
          }
        }
      });

      document.querySelectorAll('.niche-filter-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const niche = (e.currentTarget as HTMLElement).dataset.niche || 'All';
          this.exploreNicheFilter = niche;
          const main = document.getElementById('page-viewport');
          if (main) {
            main.innerHTML = this.renderExplorePageHTML();
            this.bindCurrentPageEvents(sales, products);
          }
        });
      });

      bindExploreReset();

      document.querySelectorAll('.btn-unwatch-product').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const prodId = (e.currentTarget as HTMLElement).dataset.productId;
          if (!prodId) return;
          const prod = StorageService.getProduct(prodId);
          if (prod) {
            const watcherKey = this.currentUser?.id || 'guest';
            StorageService.toggleWatchProduct(watcherKey, prod);
            this.showToast(`Removed "${prod.name}" from stock tracking.`, 'info');
            const main = document.getElementById('page-viewport');
            if (main) {
              main.innerHTML = this.renderExplorePageHTML();
              this.bindCurrentPageEvents(sales, products);
            }
          }
        });
      });
    }

    // 2. Sales Page Events
    if (path === '#/sales') {
      // Collapsible Sales Filter Toggle
      document.getElementById('btn-toggle-sales-filter-collapse')?.addEventListener('click', () => {
        this.isSalesFilterCollapsed = !this.isSalesFilterCollapsed;
        const wrapper = document.getElementById('sales-filter-collapsible-wrapper');
        const btn = document.getElementById('btn-toggle-sales-filter-collapse');
        if (wrapper && btn) {
          if (this.isSalesFilterCollapsed) {
            wrapper.classList.add('collapsed');
            btn.innerHTML = '<span>Show Filters</span><span class="collapse-icon">▼</span>';
            btn.setAttribute('aria-expanded', 'false');
            btn.setAttribute('title', 'Expand filters');
          } else {
            wrapper.classList.remove('collapsed');
            btn.innerHTML = '<span>Collapse</span><span class="collapse-icon">▲</span>';
            btn.setAttribute('aria-expanded', 'true');
            btn.setAttribute('title', 'Collapse filters');
          }
        }
      });

      const bindSalesTableRowActions = () => {
        const tbody = document.getElementById('sales-table-body');
        if (!tbody) return;

        tbody.querySelectorAll('.btn-toggle-status').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const saleId = (e.currentTarget as HTMLElement).dataset.saleId;
            const freshSalesList = this.currentUser ? StorageService.getSales(this.currentUser.id) : sales;
            const targetSale = saleId ? freshSalesList.find((s) => s.id === saleId) : undefined;
            if (!saleId || !targetSale) return;

            const willMarkPaid = targetSale.status === 'pending';
            this.openConfirmActionModal({
              title: willMarkPaid ? 'Confirm Debt Payment' : 'Revert Sale to Unpaid Debt',
              message: willMarkPaid
                ? `Mark ${targetSale.customerName}'s balance as fully paid?`
                : `Revert ${targetSale.customerName}'s completed sale back to unpaid debt?`,
              detailHtml: `
                <div><strong>Customer:</strong> ${targetSale.customerName}</div>
                <div><strong>Items:</strong> ${targetSale.items.map((i) => `${i.productName} (x${i.quantity})`).join(', ')}</div>
                <div><strong>Amount:</strong> <strong style="color:${willMarkPaid ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">${formatCurrency(targetSale.totalAmount, currency)}</strong></div>
              `,
              warning: willMarkPaid
                ? 'This will add the amount to your Money Collected total.'
                : 'This will deduct the amount from Money Collected and move it to Money Customers Owe.',
              confirmLabel: willMarkPaid ? '✓ Confirm Paid' : 'Revert to Debt',
              danger: !willMarkPaid,
              onConfirm: () => {
                const updated = StorageService.toggleSaleStatus(saleId);
                if (updated) {
                  this.showToast(
                    updated.status === 'completed'
                      ? 'Marked as Paid! Total sales cash updated.'
                      : 'Changed back to Unpaid Customer Debt.',
                    updated.status === 'completed' ? 'success' : 'info'
                  );
                  this.render();
                }
              },
            });
          });
        });

        tbody.querySelectorAll('.btn-delete-sale').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const saleBtn = e.currentTarget as HTMLElement;
            const saleId = saleBtn.dataset.saleId;
            const freshSalesList = this.currentUser ? StorageService.getSales(this.currentUser.id) : sales;
            const targetSale = saleId ? freshSalesList.find((s) => s.id === saleId) : undefined;
            if (!saleId || !targetSale) return;

            this.openConfirmActionModal({
              title: 'Confirm Transaction Deletion',
              message: 'Are you sure you want to permanently delete this sale/debt record?',
              detailHtml: `
                <div><strong>Customer:</strong> ${targetSale.customerName}</div>
                <div><strong>Items:</strong> ${targetSale.items.map((i) => `${i.productName} (x${i.quantity})`).join(', ')}</div>
                <div><strong>Amount:</strong> <strong style="color:var(--accent-rose);">${formatCurrency(targetSale.totalAmount, currency)}</strong> (${targetSale.status === 'completed' ? 'Paid' : 'Unpaid Debt'})</div>
              `,
              warning: '⚠️ This action cannot be undone and will immediately update your financial totals.',
              confirmLabel: '🗑️ Delete Record',
              danger: true,
              onConfirm: () => {
                StorageService.deleteSale(saleId);
                this.showToast('Transaction record deleted.', 'info');
                this.render();
              },
            });
          });
        });

        tbody.querySelectorAll('.btn-send-debt-wa').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const saleId = (e.currentTarget as HTMLElement).dataset.saleId;
            this.openWhatsAppDebtTemplateModal(saleId);
          });
        });
      };

      const searchInput = document.getElementById('sales-search-input') as HTMLInputElement;
      searchInput?.addEventListener('input', (e) => {
        this.salesSearchQuery = (e.target as HTMLInputElement).value;
        const tbody = document.getElementById('sales-table-body');
        if (tbody && this.currentUser) {
          const freshSales = StorageService.getSales(this.currentUser.id);
          tbody.innerHTML = this.renderSalesTableBodyHTML(freshSales);
          bindSalesTableRowActions();
        }
      });

      document.querySelectorAll('[data-sales-filter]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          this.salesStatusFilter = (e.currentTarget as HTMLElement).dataset.salesFilter as any;
          const main = document.getElementById('page-viewport');
          if (main && this.currentUser) {
            main.innerHTML = this.renderSalesPageHTML(
              StorageService.getSales(this.currentUser.id),
              StorageService.calculateMetrics(StorageService.getSales(this.currentUser.id))
            );
            this.bindCurrentPageEvents(StorageService.getSales(this.currentUser.id), products);
          }
        });
      });

      document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
        if (!this.currentUser) return;
        const allSales = StorageService.getSales(this.currentUser.id);
        if (allSales.length === 0) {
          this.showToast('No sales records to generate PDF statement.', 'danger');
          return;
        }
        this.openPrintStatementModal(allSales);
      });

      document.getElementById('btn-export-csv')?.addEventListener('click', () => {
        if (!this.currentUser) return;
        const allSales = StorageService.getSales(this.currentUser.id);
        if (allSales.length === 0) {
          this.showToast('No sales records to export.', 'danger');
          return;
        }
        exportSalesToCSV(allSales, currency, this.currentUser.storeName || 'ShopKepaStore');
        this.showToast('Sales records downloaded as CSV!', 'success');
      });

      bindSalesTableRowActions();

      // Overdue alert banner WhatsApp buttons (outside #sales-table-body)
      document.querySelectorAll('.alert-debtor-grid .btn-send-debt-wa').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const saleId = (e.currentTarget as HTMLElement).dataset.saleId;
          this.openWhatsAppDebtTemplateModal(saleId);
        });
      });

      // Automated WhatsApp Debt Reminder Template Generator
      document.getElementById('btn-open-wa-debt-hub')?.addEventListener('click', () => {
        this.openWhatsAppDebtTemplateModal();
      });

      document.querySelectorAll('.btn-open-wa-modal-general').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.openWhatsAppDebtTemplateModal();
        });
      });
    }

    // 3. New Sale Page Events
    if (path === '#/new-sale') {
      const formSale = document.getElementById('form-record-sale-page') as HTMLFormElement;
      const selectProd = document.getElementById('sale-product-select') as HTMLSelectElement;
      const inputCustomName = document.getElementById('sale-custom-item-name') as HTMLInputElement;
      const inputQty = document.getElementById('sale-quantity') as HTMLInputElement;
      const inputUnitPrice = document.getElementById('sale-unit-price') as HTMLInputElement;
      const computedTotal = document.getElementById('sale-computed-total') as HTMLElement;
      const stockWarning = document.getElementById('sale-stock-warning') as HTMLElement;
      const inputDueDate = document.getElementById('sale-due-date') as HTMLInputElement;

      const updateTotal = () => {
        const qty = parseInt(inputQty?.value || '1', 10);
        const price = parseSanitizedNumber(inputUnitPrice?.value || '0');
        if (computedTotal && this.currentUser) {
          computedTotal.textContent = formatCurrency(qty * price, this.currentUser.currency);
        }
      };

      if (inputUnitPrice) {
        attachNumberSanitizer(inputUnitPrice, () => updateTotal());
      }

      inputQty?.addEventListener('input', () => {
        updateTotal();
        const selectedOption = selectProd?.selectedOptions[0];
        if (selectedOption && selectedOption.value) {
          const availableStock = parseInt(selectedOption.dataset.stock || '0', 10);
          const reqQty = parseInt(inputQty.value, 10) || 0;
          if (stockWarning) {
            if (reqQty > availableStock) {
              stockWarning.textContent = `⚠️ Quantity (${reqQty}) exceeds available inventory (${availableStock})!`;
            } else {
              stockWarning.textContent = '';
            }
          }
        }
      });

      selectProd?.addEventListener('change', () => {
        const selectedOption = selectProd.selectedOptions[0];
        if (selectedOption && selectedOption.value) {
          inputCustomName.value = selectedOption.dataset.name || '';
          const price = parseFloat(selectedOption.dataset.price || '0');
          inputUnitPrice.value = price.toFixed(2);
          updateTotal();

          const availableStock = parseInt(selectedOption.dataset.stock || '0', 10);
          const reqQty = parseInt(inputQty.value, 10) || 0;
          if (stockWarning) {
            if (reqQty > availableStock) {
              stockWarning.textContent = `⚠️ Quantity exceeds available inventory (${availableStock})!`;
            } else {
              stockWarning.textContent = '';
            }
          }
        }
      });

      formSale?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!this.currentUser) return;

        const customerName = (document.getElementById('sale-customer-name') as HTMLInputElement).value;
        const customerPhone = (document.getElementById('sale-customer-phone') as HTMLInputElement).value;
        const itemName = inputCustomName.value;
        const qty = parseInt(inputQty.value, 10) || 1;
        const unitPrice = parseSanitizedNumber(inputUnitPrice.value);
        const totalAmount = qty * unitPrice;
        const status = (document.getElementById('sale-status') as HTMLSelectElement).value as any;
        const paymentMethod = (document.getElementById('sale-payment-method') as HTMLSelectElement).value;
        const notes = (document.getElementById('sale-notes') as HTMLTextAreaElement).value;
        const dueDate = inputDueDate ? inputDueDate.value : undefined;
        const productId = selectProd.value || undefined;

        if (productId) {
          const prod = StorageService.getProduct(productId);
          if (prod && prod.stock < qty) {
            this.showToast(`Notice: Sale quantity (${qty}) exceeds in-stock quantity (${prod.stock}). Recording transaction.`, 'info');
          }
        }

        const { sale, affectedProducts } = StorageService.saveSale({
          userId: this.currentUser.id,
          customerName,
          customerPhone,
          items: [
            {
              productId,
              productName: itemName,
              quantity: qty,
              unitPrice,
              subtotal: totalAmount,
            },
          ],
          totalAmount,
          status,
          paymentMethod,
          dueDate,
          notes,
        });

        // Check if any product dropped to or below user-defined threshold
        const threshold = this.currentUser.lowStockThreshold ?? 5;
        affectedProducts.forEach((ap) => {
          if (ap.stockLeft <= threshold) {
            if (ap.stockLeft <= 0) {
              this.showToast(`🚨 OUT OF STOCK: ${ap.product.name} has 0 units remaining!`, 'danger');
            } else {
              this.showToast(`⚠️ Low Stock Alert: ${ap.product.name} is down to ${ap.stockLeft} units!`, 'danger');
            }
            triggerLowStockBrowserNotification(ap.product.name, ap.stockLeft, threshold);
          }
        });

        this.showToast(
          status === 'completed'
            ? 'Sale recorded & stock deducted!'
            : 'Customer debt recorded with WhatsApp reminder tracking!',
          'success'
        );
        this.navigate('#/sales');
      });
    }

    // 4. Inventory Page Events
    if (path === '#/inventory') {
      // In-App Product Delete Confirmation Modal Handlers (100% reliable in iFrames)
      let pendingDeleteProductId: string | null = null;
      const modalDeleteProduct = document.getElementById('modal-delete-product');
      const delNameEl = document.getElementById('del-modal-prod-name');
      const delCatEl = document.getElementById('del-modal-prod-category');
      const delPriceEl = document.getElementById('del-modal-prod-price');
      const delStockEl = document.getElementById('del-modal-prod-stock');

      const openDeleteProdModal = (prodId: string) => {
        const prod = StorageService.getProduct(prodId);
        if (!prod) return;
        pendingDeleteProductId = prodId;
        if (delNameEl) delNameEl.textContent = prod.name;
        if (delCatEl) delCatEl.textContent = prod.category;
        if (delPriceEl && this.currentUser) {
          delPriceEl.textContent = formatCurrency(prod.price, this.currentUser.currency);
        }
        if (delStockEl) delStockEl.textContent = `${prod.stock} units available`;
        if (modalDeleteProduct) {
          modalDeleteProduct.classList.add('open');
        }
      };

      const closeDeleteProdModal = () => {
        pendingDeleteProductId = null;
        if (modalDeleteProduct) {
          modalDeleteProduct.classList.remove('open');
        }
      };

      document.getElementById('btn-close-delete-prod-modal')?.addEventListener('click', closeDeleteProdModal);
      document.getElementById('btn-cancel-delete-prod')?.addEventListener('click', closeDeleteProdModal);
      modalDeleteProduct?.addEventListener('click', (e) => {
        if (e.target === modalDeleteProduct) closeDeleteProdModal();
      });

      document.getElementById('btn-confirm-delete-prod')?.addEventListener('click', () => {
        if (!pendingDeleteProductId) return;
        const targetId = pendingDeleteProductId;
        const prod = StorageService.getProduct(targetId);
        const name = prod ? prod.name : 'Product';

        StorageService.deleteProduct(targetId);
        closeDeleteProdModal();
        this.showToast(`Product "${name}" deleted from inventory.`, 'info');
        this.render();
      });

      const bindInventoryGridCardActions = () => {
        const grid = document.getElementById('inventory-product-grid');
        if (!grid) return;

        grid.querySelectorAll('.btn-add-stock').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const prodId = (e.currentTarget as HTMLElement).dataset.productId;
            if (prodId) {
              this.openAddStockModal(prodId);
            }
          });
        });

        grid.querySelectorAll('.btn-delete-product').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const target = ((e.currentTarget as HTMLElement).closest('.btn-delete-product') as HTMLElement) || (e.currentTarget as HTMLElement);
            const prodId = target.dataset.productId;
            if (prodId) {
              openDeleteProdModal(prodId);
            }
          });
        });

        grid.querySelector('#btn-reset-inventory-filters')?.addEventListener('click', () => {
          this.inventoryCategoryFilter = 'all';
          this.inventorySearchQuery = '';
          const searchEl = document.getElementById('inventory-search-input') as HTMLInputElement | null;
          const catEl = document.getElementById('inventory-category-select') as HTMLSelectElement | null;
          if (searchEl) searchEl.value = '';
          if (catEl) catEl.value = 'all';
          if (this.currentUser) {
            grid.innerHTML = this.renderInventoryGridInnerHTML(StorageService.getProducts(this.currentUser.id));
            bindInventoryGridCardActions();
          }
        });
      };

      bindInventoryGridCardActions();

      const searchInput = document.getElementById('inventory-search-input') as HTMLInputElement;
      searchInput?.addEventListener('input', (e) => {
        this.inventorySearchQuery = (e.target as HTMLInputElement).value;
        const grid = document.getElementById('inventory-product-grid');
        if (grid && this.currentUser) {
          const freshProds = StorageService.getProducts(this.currentUser.id);
          grid.innerHTML = this.renderInventoryGridInnerHTML(freshProds);
          bindInventoryGridCardActions();
        }
      });

      const categorySelect = document.getElementById('inventory-category-select') as HTMLSelectElement;
      categorySelect?.addEventListener('change', (e) => {
        this.inventoryCategoryFilter = (e.target as HTMLSelectElement).value;
        const grid = document.getElementById('inventory-product-grid');
        if (grid && this.currentUser) {
          grid.innerHTML = this.renderInventoryGridInnerHTML(StorageService.getProducts(this.currentUser.id));
          bindInventoryGridCardActions();
        }
      });
    }

    // 5. New Product Page Events
    if (path === '#/new-product') {
      const formProduct = document.getElementById('form-new-product-page') as HTMLFormElement;
      const inputCostPrice = document.getElementById('product-cost-price') as HTMLInputElement;
      const inputProductPrice = document.getElementById('product-price') as HTMLInputElement;
      const fileTrigger = document.getElementById('file-upload-trigger');
      const fileInput = document.getElementById('product-image-file') as HTMLInputElement;
      const previewContainer = document.getElementById('product-image-preview-container');
      const previewImg = document.getElementById('product-image-preview') as HTMLImageElement;
      const btnRemoveImg = document.getElementById('btn-remove-image');

      this.bindProductProfitCalculator(currency);

      fileTrigger?.addEventListener('click', () => fileInput?.click());

      fileInput?.addEventListener('change', async () => {
        if (fileInput.files && fileInput.files[0]) {
          try {
            const base64 = await fileToBase64(fileInput.files[0]);
            this.rawUploadedImageBase64 = base64;
            this.uploadedProductImageBase64 = base64;
            if (previewImg && previewContainer) {
              previewImg.src = base64;
              previewContainer.style.display = 'block';
            }
          } catch {
            this.showToast('Error reading image', 'danger');
          }
        }
      });

      btnRemoveImg?.addEventListener('click', () => {
        this.rawUploadedImageBase64 = '';
        this.uploadedProductImageBase64 = '';
        if (previewImg && previewContainer) {
          previewImg.src = '';
          previewContainer.style.display = 'none';
        }
        if (fileInput) fileInput.value = '';
      });

      const btnTriggerAdjuster = document.getElementById('btn-trigger-adjuster');
      btnTriggerAdjuster?.addEventListener('click', () => {
        const sourceImg = this.rawUploadedImageBase64 || this.uploadedProductImageBase64 || previewImg?.src || '';
        if (!sourceImg) {
          this.showToast('Please upload an image first.', 'info');
          return;
        }
        this.openPhotoAdjusterModal(sourceImg, (adjustedBase64) => {
          this.uploadedProductImageBase64 = adjustedBase64;
          if (previewImg) previewImg.src = adjustedBase64;
          if (previewContainer) previewContainer.style.display = 'block';
        });
      });

      formProduct?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!this.currentUser) return;

        const name = (document.getElementById('product-name') as HTMLInputElement).value;
        const rawCostStr = inputCostPrice ? inputCostPrice.value.trim() : '';
        const costPrice = rawCostStr !== '' ? parseSanitizedNumber(rawCostStr) : undefined;
        const price = parseSanitizedNumber(inputProductPrice.value);
        const stock = parseInt((document.getElementById('product-stock') as HTMLInputElement).value, 10) || 0;
        const category = (document.getElementById('product-category') as HTMLInputElement).value;

        StorageService.saveProduct({
          userId: this.currentUser.id,
          name,
          costPrice,
          price,
          stock,
          category,
          image: this.uploadedProductImageBase64,
        });

        this.uploadedProductImageBase64 = '';
        this.rawUploadedImageBase64 = '';
        this.inventoryCategoryFilter = 'all';
        this.inventorySearchQuery = '';

        this.showToast('Product added to inventory!', 'success');
        this.navigate('#/inventory');
      });
    }

    // 6. Edit Product Page Events
    if (path.startsWith('#/edit-product/')) {
      const formEdit = document.getElementById('form-edit-product-page') as HTMLFormElement;
      const inputCostPrice = document.getElementById('product-cost-price') as HTMLInputElement;
      const inputProductPrice = document.getElementById('product-price') as HTMLInputElement;
      const fileTrigger = document.getElementById('file-upload-trigger');
      const fileInput = document.getElementById('product-image-file') as HTMLInputElement;
      const previewContainer = document.getElementById('product-image-preview-container');
      const previewImg = document.getElementById('product-image-preview') as HTMLImageElement;
      const btnRemoveImg = document.getElementById('btn-remove-image');

      this.bindProductProfitCalculator(currency);

      fileTrigger?.addEventListener('click', () => fileInput?.click());

      fileInput?.addEventListener('change', async () => {
        if (fileInput.files && fileInput.files[0]) {
          try {
            const base64 = await fileToBase64(fileInput.files[0]);
            this.rawUploadedImageBase64 = base64;
            this.uploadedProductImageBase64 = base64;
            if (previewImg && previewContainer) {
              previewImg.src = base64;
              previewContainer.style.display = 'block';
            }
          } catch {
            this.showToast('Error reading image', 'danger');
          }
        }
      });

      btnRemoveImg?.addEventListener('click', () => {
        this.rawUploadedImageBase64 = '';
        this.uploadedProductImageBase64 = '';
        if (previewImg && previewContainer) {
          previewImg.src = '';
          previewContainer.style.display = 'none';
        }
        if (fileInput) fileInput.value = '';
      });

      const btnTriggerAdjuster = document.getElementById('btn-trigger-adjuster');
      btnTriggerAdjuster?.addEventListener('click', () => {
        const sourceImg = this.rawUploadedImageBase64 || this.uploadedProductImageBase64 || previewImg?.src || '';
        if (!sourceImg) {
          this.showToast('Please upload an image first.', 'info');
          return;
        }
        this.openPhotoAdjusterModal(sourceImg, (adjustedBase64) => {
          this.uploadedProductImageBase64 = adjustedBase64;
          if (previewImg) previewImg.src = adjustedBase64;
          if (previewContainer) previewContainer.style.display = 'block';
        });
      });

      formEdit?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!this.currentUser) return;

        const id = (document.getElementById('product-id') as HTMLInputElement).value;
        const name = (document.getElementById('product-name') as HTMLInputElement).value;
        const rawCostStr = inputCostPrice ? inputCostPrice.value.trim() : '';
        const costPrice = rawCostStr !== '' ? parseSanitizedNumber(rawCostStr) : undefined;
        const price = parseSanitizedNumber(inputProductPrice.value);
        const stock = parseInt((document.getElementById('product-stock') as HTMLInputElement).value, 10) || 0;
        const category = (document.getElementById('product-category') as HTMLInputElement).value;

        StorageService.saveProduct({
          id,
          userId: this.currentUser.id,
          name,
          costPrice,
          price,
          stock,
          category,
          image: this.uploadedProductImageBase64,
        });

        this.uploadedProductImageBase64 = '';
        this.rawUploadedImageBase64 = '';
        this.inventoryCategoryFilter = 'all';
        this.inventorySearchQuery = '';

        this.showToast('Product updated successfully!', 'success');
        this.navigate('#/inventory');
      });

      document.getElementById('btn-delete-product-from-edit')?.addEventListener('click', (e) => {
        const prodId = (e.currentTarget as HTMLElement).dataset.productId;
        if (!prodId) return;
        const prod = StorageService.getProduct(prodId);
        const name = prod ? prod.name : 'Product';
        this.openConfirmActionModal({
          title: 'Confirm Product Deletion',
          message: `Are you sure you want to permanently delete "${name}" from your inventory?`,
          detailHtml: prod
            ? `
              <div><strong>Product:</strong> ${prod.name}</div>
              <div><strong>Category:</strong> ${prod.category}</div>
              <div><strong>Price:</strong> <strong style="color:var(--accent-emerald);">${formatCurrency(prod.price, currency)}</strong></div>
              <div><strong>Current Stock:</strong> ${prod.stock} units</div>
            `
            : undefined,
          warning: '⚠️ This removes the product from your inventory and storefront catalog immediately.',
          confirmLabel: '🗑️ Delete Product',
          danger: true,
          onConfirm: () => {
            StorageService.deleteProduct(prodId);
            this.inventoryCategoryFilter = 'all';
            this.inventorySearchQuery = '';
            this.showToast(`Product "${name}" deleted from inventory.`, 'info');
            this.navigate('#/inventory');
          },
        });
      });
    }

    // 7. Storefront Page Events
    if (path === '#/storefront') {
      document.querySelectorAll('.storefront-stock-filter-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const filter = ((e.currentTarget as HTMLElement).dataset.stockFilter as 'all' | 'in_stock' | 'out_of_stock') || 'all';
          this.storefrontStockFilter = filter;
          const main = document.getElementById('page-viewport');
          if (main) {
            main.innerHTML = this.renderStorefrontPageHTML(products);
            this.bindCurrentPageEvents(sales, products);
          }
        });
      });

      document.querySelectorAll('.btn-toggle-watch-product').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const prodId = (e.currentTarget as HTMLElement).dataset.productId;
          if (!prodId) return;
          const prod = StorageService.getProduct(prodId);
          if (!prod) return;

          const watcherKey = this.currentUser?.id || 'guest';
          const isNowWatched = StorageService.toggleWatchProduct(watcherKey, prod);
          this.showToast(
            isNowWatched
              ? `Now tracking stock for "${prod.name}". Check Explore anytime for live restock alerts!`
              : `Stopped tracking stock for "${prod.name}".`,
            isNowWatched ? 'success' : 'info'
          );

          const main = document.getElementById('page-viewport');
          if (main) {
            main.innerHTML = this.renderStorefrontPageHTML(products);
            this.bindCurrentPageEvents(sales, products);
          }
        });
      });

      document.getElementById('btn-copy-catalog-summary')?.addEventListener('click', async () => {
        const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
        const targetId = urlParams.get('merchant') || this.currentUser?.id;
        const targetMerchant = targetId ? StorageService.getUserById(targetId) : this.currentUser;
        if (!targetMerchant) return;

        const targetProds = StorageService.getProducts(targetMerchant.id);
        const lines = [
          `*${targetMerchant.storeName || targetMerchant.name} - Digital Catalog*`,
          `Niche: ${targetMerchant.niche || 'General'}`,
          `WhatsApp: ${targetMerchant.phone}`,
          ``,
          ...targetProds.map(
            (p) => `• ${p.name} - ${formatCurrency(p.price, targetMerchant.currency || currency)}`
          ),
          ``,
          `Tap to reply and order directly on WhatsApp!`,
        ];
        const copied = await copyTextToClipboard(lines.join('\n'));
        this.showToast(
          copied
            ? 'Full catalog copied for WhatsApp status / broadcast!'
            : 'Could not copy catalog automatically.',
          copied ? 'success' : 'warning'
        );
      });
    }

    // 8. Expenses & Overheads Page Events
    if (path === '#/expenses') {
      // Collapsible Expenses Filter Toggle
      document.getElementById('btn-toggle-expenses-filter-collapse')?.addEventListener('click', () => {
        this.isExpensesFilterCollapsed = !this.isExpensesFilterCollapsed;
        const wrapper = document.getElementById('expenses-filter-collapsible-wrapper');
        const btn = document.getElementById('btn-toggle-expenses-filter-collapse');
        if (wrapper && btn) {
          if (this.isExpensesFilterCollapsed) {
            wrapper.classList.add('collapsed');
            btn.innerHTML = '<span>Show Categories</span><span class="collapse-icon">▼</span>';
            btn.setAttribute('aria-expanded', 'false');
            btn.setAttribute('title', 'Expand categories');
          } else {
            wrapper.classList.remove('collapsed');
            btn.innerHTML = '<span>Collapse</span><span class="collapse-icon">▲</span>';
            btn.setAttribute('aria-expanded', 'true');
            btn.setAttribute('title', 'Collapse categories');
          }
        }
      });

      const bindExpenseTableRowActions = () => {
        const tbody = document.getElementById('expenses-table-body');
        if (!tbody) return;
        tbody.querySelectorAll('.btn-delete-expense').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const expBtn = e.currentTarget as HTMLElement;
            const expId = expBtn.dataset.expenseId;
            if (!expId || !this.currentUser) return;
            const exp = StorageService.getExpenses(this.currentUser.id).find((item) => item.id === expId);
            this.openConfirmActionModal({
              title: 'Confirm Expense Deletion',
              message: 'Are you sure you want to delete this expense record?',
              detailHtml: exp
                ? `
                  <div><strong>Expense:</strong> ${exp.title}</div>
                  <div><strong>Category:</strong> ${exp.category}</div>
                  <div><strong>Amount:</strong> <strong style="color:#fb923c;">${formatCurrency(exp.amount, currency)}</strong></div>
                `
                : undefined,
              warning: '⚠️ This cannot be undone and will recalculate your take-home profit.',
              confirmLabel: '🗑️ Delete Expense',
              danger: true,
              onConfirm: () => {
                StorageService.deleteExpense(expId);
                this.showToast('Expense record deleted.', 'info');
                this.render();
              },
            });
          });
        });
      };

      bindExpenseTableRowActions();

      const searchInput = document.getElementById('expenses-search-input') as HTMLInputElement;
      searchInput?.addEventListener('input', (e) => {
        this.expensesSearchQuery = (e.target as HTMLInputElement).value;
        const tbody = document.getElementById('expenses-table-body');
        if (tbody) {
          tbody.innerHTML = this.renderExpensesTableBodyHTML();
          bindExpenseTableRowActions();
        }
      });

      document.querySelectorAll('[data-expense-cat]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const cat = (e.currentTarget as HTMLElement).dataset.expenseCat || 'all';
          this.expensesCategoryFilter = cat;
          const main = document.getElementById('page-viewport');
          if (main) {
            main.innerHTML = this.renderExpensesPageHTML();
            this.bindCurrentPageEvents(sales, products);
          }
        });
      });

      document.getElementById('btn-export-expenses-csv')?.addEventListener('click', () => {
        if (!this.currentUser) return;
        const allExpenses = StorageService.getExpenses(this.currentUser.id);
        if (allExpenses.length === 0) {
          this.showToast('No expenses to export.', 'danger');
          return;
        }
        exportExpensesToCSV(allExpenses, currency, this.currentUser.storeName || this.currentUser.name);
        this.showToast('Business expenses exported as CSV!', 'success');
      });
    }

    // 9. New Expense Page Events
    if (path === '#/new-expense') {
      const formExpense = document.getElementById('form-new-expense-page') as HTMLFormElement;
      const inputAmount = document.getElementById('expense-amount') as HTMLInputElement;

      if (inputAmount) {
        attachNumberSanitizer(inputAmount);
      }

      formExpense?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!this.currentUser) return;

        const title = (document.getElementById('expense-title') as HTMLInputElement).value;
        const amount = parseSanitizedNumber(inputAmount.value);
        const date = (document.getElementById('expense-date') as HTMLInputElement).value;
        const category = (document.getElementById('expense-category') as HTMLSelectElement).value;
        const paymentMethod = (document.getElementById('expense-payment-method') as HTMLSelectElement).value;
        const vendor = (document.getElementById('expense-vendor') as HTMLInputElement)?.value;
        const notes = (document.getElementById('expense-notes') as HTMLTextAreaElement)?.value;

        if (amount <= 0) {
          this.showToast('Please enter an expense amount greater than 0', 'danger');
          return;
        }

        StorageService.saveExpense({
          userId: this.currentUser.id,
          title,
          amount,
          date,
          category,
          paymentMethod,
          vendor,
          notes,
        });

        this.showToast('Overhead expense logged successfully!', 'success');
        this.navigate('#/expenses');
      });
    }

    // 10. Edit Expense Page Events
    if (path.startsWith('#/edit-expense/')) {
      const formEdit = document.getElementById('form-edit-expense-page') as HTMLFormElement;
      const inputAmount = document.getElementById('edit-expense-amount') as HTMLInputElement;

      if (inputAmount) {
        attachNumberSanitizer(inputAmount);
      }

      formEdit?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!this.currentUser) return;

        const id = (document.getElementById('edit-expense-id') as HTMLInputElement).value;
        const title = (document.getElementById('edit-expense-title') as HTMLInputElement).value;
        const amount = parseSanitizedNumber(inputAmount.value);
        const date = (document.getElementById('edit-expense-date') as HTMLInputElement).value;
        const category = (document.getElementById('edit-expense-category') as HTMLSelectElement).value;
        const paymentMethod = (document.getElementById('edit-expense-payment-method') as HTMLSelectElement).value;
        const vendor = (document.getElementById('edit-expense-vendor') as HTMLInputElement)?.value;
        const notes = (document.getElementById('edit-expense-notes') as HTMLTextAreaElement)?.value;

        StorageService.saveExpense({
          id,
          userId: this.currentUser.id,
          title,
          amount,
          date,
          category,
          paymentMethod,
          vendor,
          notes,
        });

        this.showToast('Expense updated successfully!', 'success');
        this.navigate('#/expenses');
      });
    }

    // 11. Analytics Page Events
    if (path === '#/analytics') {
      const curSales = this.currentUser ? StorageService.getSales(this.currentUser.id) : [];
      const curExpenses = this.currentUser ? StorageService.getExpenses(this.currentUser.id) : [];
      const chartMount = document.getElementById('d3-trend-chart-mount');

      const updateChartAndSummary = () => {
        const buckets = computeTrendBuckets(curSales, this.analyticsTimeframe, curExpenses);
        const totalPeriodRevenue = buckets.reduce((s, b) => s + b.revenue, 0);
        const totalPeriodExpenses = buckets.reduce((s, b) => s + b.expenses, 0);
        const totalPeriodNetProfit = totalPeriodRevenue - totalPeriodExpenses;
        const totalPeriodDebt = buckets.reduce((s, b) => s + b.debt, 0);

        const revEl = document.getElementById('summary-period-revenue');
        const expEl = document.getElementById('summary-period-expenses');
        const profitEl = document.getElementById('summary-period-profit');
        const debtEl = document.getElementById('summary-period-debt');

        if (revEl) revEl.textContent = formatCurrency(totalPeriodRevenue, currency);
        if (expEl) expEl.textContent = formatCurrency(totalPeriodExpenses, currency);
        if (profitEl) {
          profitEl.textContent = `${totalPeriodNetProfit >= 0 ? '+' : ''}${formatCurrency(totalPeriodNetProfit, currency)}`;
          profitEl.className = `chart-summary-val ${totalPeriodNetProfit >= 0 ? 'text-emerald' : 'text-rose'}`;
        }
        if (debtEl) debtEl.textContent = formatCurrency(totalPeriodDebt, currency);

        // Update strip labels with current timeframe
        const tf = this.analyticsTimeframe.toUpperCase();
        const labels = document.querySelectorAll('.chart-summary-label');
        if (labels.length >= 4) {
          labels[0].textContent = `${tf} REALIZED REVENUE`;
          labels[1].textContent = `${tf} OVERHEAD COSTS`;
          labels[2].textContent = `${tf} NET CASH MARGIN`;
          labels[3].textContent = `${tf} PENDING DEBT`;
        }

        // Render or update D3 chart
        if (this.trendChart) {
          this.trendChart.render(curSales, this.analyticsTimeframe, currency, curExpenses, this.chartMetricView);
        }
      };

      if (chartMount && (curSales.length > 0 || curExpenses.length > 0)) {
        if (this.trendChart) {
          this.trendChart.destroy();
        }
        this.trendChart = new D3TrendChartComponent(chartMount);
        this.trendChart.render(curSales, this.analyticsTimeframe, currency, curExpenses, this.chartMetricView);
      }

      document.getElementById('btn-analytics-pdf')?.addEventListener('click', () => {
        if (!this.currentUser) return;
        const allSales = StorageService.getSales(this.currentUser.id);
        this.openPrintStatementModal(allSales);
      });

      // Collapsible Analytics Controls Toggle
      document.getElementById('btn-toggle-analytics-controls-collapse')?.addEventListener('click', () => {
        this.isAnalyticsControlsCollapsed = !this.isAnalyticsControlsCollapsed;
        const wrapper = document.getElementById('analytics-controls-collapsible-wrapper');
        const btn = document.getElementById('btn-toggle-analytics-controls-collapse');
        if (wrapper && btn) {
          if (this.isAnalyticsControlsCollapsed) {
            wrapper.classList.add('collapsed');
            btn.innerHTML = '<span>Show Controls</span><span class="collapse-icon">▼</span>';
            btn.setAttribute('aria-expanded', 'false');
            btn.setAttribute('title', 'Expand controls');
          } else {
            wrapper.classList.remove('collapsed');
            btn.innerHTML = '<span>Collapse</span><span class="collapse-icon">▲</span>';
            btn.setAttribute('aria-expanded', 'true');
            btn.setAttribute('title', 'Collapse controls');
          }
        }
      });

      // Timeframe selector (Weekly, Monthly, Yearly)
      document.querySelectorAll('.chart-time-tab').forEach((tab) => {
        tab.addEventListener('click', (e) => {
          const tf = (e.currentTarget as HTMLElement).dataset.timeframe as 'weekly' | 'monthly' | 'yearly';
          if (tf && tf !== this.analyticsTimeframe) {
            this.analyticsTimeframe = tf;

            document.querySelectorAll('.chart-time-tab').forEach((t) => {
              const isActive = (t as HTMLElement).dataset.timeframe === tf;
              t.classList.toggle('active', isActive);
              t.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });

            updateChartAndSummary();
          }
        });
      });

      // Metric View Filter buttons (All, Revenue vs Overheads, Revenue vs Debt)
      document.querySelectorAll('.chart-metric-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const mv = (e.currentTarget as HTMLElement).dataset.metricView as ChartMetricView;
          if (mv && mv !== this.chartMetricView) {
            this.chartMetricView = mv;

            document.querySelectorAll('.chart-metric-btn').forEach((b) => {
              b.classList.toggle('active', (b as HTMLElement).dataset.metricView === mv);
            });

            updateChartAndSummary();
          }
        });
      });
    }

    // 9. Buyer Purchases & Debts Ledger Events
    if (path === '#/buyer-ledger') {
      // Collapsible Buyer Filter Toggle
      document.getElementById('btn-toggle-buyer-filter-collapse')?.addEventListener('click', () => {
        this.isBuyerFilterCollapsed = !this.isBuyerFilterCollapsed;
        const wrapper = document.getElementById('buyer-filter-collapsible-wrapper');
        const btn = document.getElementById('btn-toggle-buyer-filter-collapse');
        if (wrapper && btn) {
          if (this.isBuyerFilterCollapsed) {
            wrapper.classList.add('collapsed');
            btn.innerHTML = '<span>Show Filters</span><span class="collapse-icon">▼</span>';
            btn.setAttribute('aria-expanded', 'false');
            btn.setAttribute('title', 'Expand filters');
          } else {
            wrapper.classList.remove('collapsed');
            btn.innerHTML = '<span>Collapse</span><span class="collapse-icon">▲</span>';
            btn.setAttribute('aria-expanded', 'true');
            btn.setAttribute('title', 'Collapse filters');
          }
        }
      });

      const bindBuyerTableRowActions = () => {
        const tbody = document.getElementById('buyer-table-body');
        if (!tbody) return;

        tbody.querySelectorAll('.btn-toggle-buyer-status').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const pId = (e.currentTarget as HTMLElement).dataset.purchaseId;
            if (!pId || !this.currentUser) return;
            const purchase = StorageService.getBuyerPurchases(this.currentUser).find((item) => item.id === pId);
            if (!purchase) return;
            const willMarkPaid = purchase.status === 'pending';

            this.openConfirmActionModal({
              title: willMarkPaid ? 'Confirm Debt Settlement' : 'Revert to Outstanding Debt',
              message: willMarkPaid
                ? 'Mark this purchase debt as settled / paid?'
                : 'Revert this settled purchase back to outstanding debt?',
              detailHtml: `
                <div><strong>Seller:</strong> ${purchase.merchantStoreName || 'Marketplace Merchant'}</div>
                <div><strong>Items:</strong> ${purchase.items.map((i) => `${i.productName} (x${i.quantity})`).join(', ')}</div>
                <div><strong>Amount:</strong> <strong>${formatCurrency(purchase.totalAmount, currency)}</strong></div>
              `,
              confirmLabel: willMarkPaid ? '✓ Mark Paid' : 'Revert to Debt',
              danger: !willMarkPaid,
              onConfirm: () => {
                const updated = StorageService.toggleSaleStatus(pId);
                if (updated) {
                  this.showToast(
                    updated.status === 'completed'
                      ? 'Debt marked as Settled / Paid!'
                      : 'Reverted to Outstanding Debt.',
                    updated.status === 'completed' ? 'success' : 'info'
                  );
                  this.render();
                }
              },
            });
          });
        });

        tbody.querySelectorAll('.btn-delete-buyer-record').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const buyBtn = e.currentTarget as HTMLElement;
            const pId = buyBtn.dataset.purchaseId;
            if (!pId || !this.currentUser) return;
            const purchase = StorageService.getBuyerPurchases(this.currentUser).find((item) => item.id === pId);
            this.openConfirmActionModal({
              title: 'Confirm Record Deletion',
              message: 'Are you sure you want to delete this purchase/debt record?',
              detailHtml: purchase
                ? `
                  <div><strong>Seller:</strong> ${purchase.merchantStoreName || 'Marketplace Merchant'}</div>
                  <div><strong>Items:</strong> ${purchase.items.map((i) => `${i.productName} (x${i.quantity})`).join(', ')}</div>
                  <div><strong>Amount:</strong> <strong style="color:var(--accent-rose);">${formatCurrency(purchase.totalAmount, currency)}</strong></div>
                `
                : undefined,
              warning: '⚠️ This record will be permanently removed from your purchase ledger.',
              confirmLabel: '🗑️ Delete Record',
              danger: true,
              onConfirm: () => {
                StorageService.deleteSale(pId);
                this.showToast('Record removed.', 'info');
                this.render();
              },
            });
          });
        });
      };

      const searchInput = document.getElementById('buyer-search-input') as HTMLInputElement;
      searchInput?.addEventListener('input', (e) => {
        this.buyerSearchQuery = (e.target as HTMLInputElement).value;
        const tbody = document.getElementById('buyer-table-body');
        if (tbody) {
          tbody.innerHTML = this.renderBuyerTableBodyHTML();
          bindBuyerTableRowActions();
        }
      });

      document.querySelectorAll('[data-buyer-filter]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const filter = (e.currentTarget as HTMLElement).dataset.buyerFilter as 'all' | 'completed' | 'pending';
          if (filter) {
            this.buyerStatusFilter = filter;
            const main = document.getElementById('page-viewport');
            if (main) {
              main.innerHTML = this.renderBuyerLedgerPageHTML();
              this.bindCurrentPageEvents(sales, products);
            }
          }
        });
      });

      document.getElementById('btn-filter-only-debts')?.addEventListener('click', () => {
        this.buyerStatusFilter = 'pending';
        const main = document.getElementById('page-viewport');
        if (main) {
          main.innerHTML = this.renderBuyerLedgerPageHTML();
          this.bindCurrentPageEvents(sales, products);
        }
      });

      document.getElementById('btn-export-buyer-csv')?.addEventListener('click', () => {
        if (!this.currentUser) return;
        const allPurchases = StorageService.getBuyerPurchases(this.currentUser);
        if (allPurchases.length === 0) {
          this.showToast('No purchases to export.', 'danger');
          return;
        }
        exportBuyerLedgerToCSV(allPurchases, currency, this.currentUser.name);
        this.showToast('My purchase and debt records downloaded as CSV!', 'success');
      });

      // Modal handling for logging buyer purchase or debt
      const modal = document.getElementById('modal-log-buyer-purchase');
      const form = document.getElementById('form-log-buyer-purchase') as HTMLFormElement;
      const inputAmount = document.getElementById('buyer-amount') as HTMLInputElement;

      if (inputAmount) {
        attachNumberSanitizer(inputAmount);
      }

      const openModal = () => {
        if (modal) {
          modal.classList.add('open');
          form?.reset();
        }
      };

      const closeModal = () => {
        if (modal) modal.classList.remove('open');
      };

      document.getElementById('btn-open-log-purchase-modal')?.addEventListener('click', openModal);
      document.getElementById('btn-open-log-purchase-modal-empty')?.addEventListener('click', openModal);
      document.getElementById('btn-close-buyer-modal')?.addEventListener('click', closeModal);
      document.getElementById('btn-cancel-buyer-modal')?.addEventListener('click', closeModal);
      modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      form?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!this.currentUser) return;

        const merchantStoreName = (document.getElementById('buyer-merchant-name') as HTMLInputElement).value;
        const merchantPhone = (document.getElementById('buyer-merchant-phone') as HTMLInputElement)?.value;
        const productName = (document.getElementById('buyer-item-name') as HTMLInputElement).value;
        const quantity = parseInt((document.getElementById('buyer-quantity') as HTMLInputElement).value, 10) || 1;
        const amount = parseSanitizedNumber(inputAmount.value);
        const statusRadio = form.querySelector('input[name="buyer-status"]:checked') as HTMLInputElement;
        const status = (statusRadio?.value || 'completed') as 'completed' | 'pending';
        const notes = (document.getElementById('buyer-notes') as HTMLInputElement)?.value;

        StorageService.saveBuyerPurchase(this.currentUser, {
          merchantStoreName,
          merchantPhone,
          productName,
          quantity,
          amount,
          status,
          notes,
        });

        closeModal();
        this.showToast(
          status === 'completed'
            ? 'Purchase recorded in your ledger!'
            : 'Pending debt owing recorded!',
          'success'
        );
        this.render();
      });

      bindBuyerTableRowActions();
    }

    // 10. Settings Page Events
    if (path === '#/settings') {
      const formSettings = document.getElementById('form-settings-page') as HTMLFormElement;
      const roleSelect = document.getElementById('settings-role') as HTMLSelectElement;
      const merchantFields = document.getElementById('settings-merchant-fields');

      roleSelect?.addEventListener('change', () => {
        if (merchantFields) {
          merchantFields.style.display = roleSelect.value === 'merchant' ? 'flex' : 'none';
        }
      });

      this.bindPasswordToggles(formSettings || document);

      formSettings?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!this.currentUser) return;

        const newPassword = (document.getElementById('settings-new-password') as HTMLInputElement)?.value || '';
        if (newPassword && newPassword.length < 4) {
          this.showToast('New password must be at least 4 characters long.', 'danger');
          return;
        }

        const name = (document.getElementById('settings-name') as HTMLInputElement).value;
        const role = roleSelect.value as UserRole;
        const storeName = (document.getElementById('settings-store-name') as HTMLInputElement)?.value;
        const niche = (document.getElementById('settings-niche') as HTMLSelectElement)?.value;
        const city = (document.getElementById('settings-city') as HTMLInputElement)?.value;
        const bio = (document.getElementById('settings-bio') as HTMLTextAreaElement)?.value;
        const phone = (document.getElementById('settings-phone') as HTMLInputElement).value;
        const currencyVal = (document.getElementById('settings-currency') as HTMLSelectElement)?.value || '₦';
        const inputThreshold = document.getElementById('settings-stock-threshold') as HTMLInputElement;
        const lowStockThreshold = inputThreshold ? parseInt(inputThreshold.value, 10) || 5 : 5;
        const bankPaymentDetails = (document.getElementById('settings-bank-details') as HTMLTextAreaElement)?.value || '';

        let updated = StorageService.updateUserProfile(this.currentUser.id, {
          name,
          role,
          storeName: role === 'merchant' ? (storeName || `${name}'s Store`) : undefined,
          niche: role === 'merchant' ? niche : undefined,
          city,
          bio,
          phone,
          currency: currencyVal,
          lowStockThreshold,
          bankPaymentDetails,
        });

        if (updated && newPassword) {
          const pwUpdated = await StorageService.updatePassword(this.currentUser.id, newPassword);
          if (pwUpdated) updated = pwUpdated;
        }

        if (updated) {
          this.currentUser = updated;
          this.showToast(
            newPassword ? 'Profile & password settings saved!' : 'Profile, stock threshold & bank settings saved!',
            'success'
          );
          this.render();
        }
      });

      // Browser Notification Permission Request & Test
      document.getElementById('btn-request-notification-perm')?.addEventListener('click', async () => {
        const perm = await requestBrowserNotificationPermission();
        const badge = document.getElementById('perm-indicator-badge');
        const btn = document.getElementById('btn-request-notification-perm');
        if (perm === 'granted') {
          if (badge) {
            badge.className = 'badge badge-paid';
            badge.textContent = '✓ Browser Popups Active';
          }
          if (btn) btn.textContent = '✓ Allowed';
          this.showToast('Browser notifications enabled for low stock alerts!', 'success');
        } else {
          this.showToast(`Notification status: ${perm}. You can allow popups in site settings.`, 'info');
        }
      });

      document.getElementById('btn-test-notification')?.addEventListener('click', async () => {
        if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
          await requestBrowserNotificationPermission();
        }
        const threshold = this.currentUser?.lowStockThreshold ?? 5;
        triggerLowStockBrowserNotification('Sample Item (e.g. Silk Ankara)', 2, threshold);
        this.showToast(`Test low-stock alert triggered (2 units left, threshold: ${threshold})!`, 'info');
      });

      // Switch user button
      document.querySelectorAll('.btn-switch-user').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const uId = (e.currentTarget as HTMLElement).dataset.userId;
          if (!uId) return;
          const targetUser = StorageService.getUserById(uId);
          if (!targetUser) return;

          if (targetUser.passwordHash) {
            this.openSwitchAccountPasswordModal(targetUser);
          } else {
            const switched = StorageService.switchUser(uId);
            if (switched) {
              this.currentUser = switched;
              this.showToast(`Switched account to: ${switched.storeName || switched.name} (${switched.role})`, 'info');
              this.navigate(switched.role === 'merchant' ? '#/sales' : '#/explore');
            }
          }
        });
      });

      // Top banner reactivate button
      document.getElementById('btn-banner-reactivate')?.addEventListener('click', () => {
        if (!this.currentUser) return;
        const reactivated = StorageService.reactivateAccount(this.currentUser.id);
        if (reactivated) {
          this.currentUser = reactivated;
          this.showToast('Store reactivated! Your storefront is now visible again in Explore.', 'success');
          this.render();
        }
      });

      // Toggle deactivation in settings
      document.getElementById('btn-toggle-deactivation')?.addEventListener('click', () => {
        if (!this.currentUser) return;

        if (!this.currentUser.isDeactivated) {
          this.openConfirmActionModal({
            title: 'Deactivate Storefront',
            message: 'Are you sure you want to temporarily deactivate your storefront?',
            detailHtml: `Store: <strong style="color:var(--text-primary);">${this.currentUser.storeName || this.currentUser.name}</strong>`,
            warning: 'Your store will be hidden from Marketplace buyers until you reactivate it. Your inventory and sales records remain safe.',
            confirmLabel: '⏸️ Deactivate Store',
            danger: true,
            onConfirm: () => {
              if (!this.currentUser) return;
              const deactivated = StorageService.deactivateAccount(this.currentUser.id);
              if (deactivated) {
                this.currentUser = deactivated;
                this.showToast('Store temporarily deactivated and unlisted from Explore.', 'info');
                this.render();
              }
            },
          });
        } else {
          const reactivated = StorageService.reactivateAccount(this.currentUser.id);
          if (reactivated) {
            this.currentUser = reactivated;
            this.showToast('Store reactivated! Your storefront is now live in Explore.', 'success');
            this.render();
          }
        }
      });

      // Settings Log Out button
      document.getElementById('btn-settings-logout')?.addEventListener('click', () => {
        this.openConfirmActionModal({
          title: 'Log Out of Store',
          message: 'Are you sure you want to log out of this store?',
          detailHtml: `Active Account: <strong style="color:var(--text-primary);">${this.currentUser?.storeName || this.currentUser?.name || ''}</strong>`,
          warning: 'Your saved data stays safely stored in this browser.',
          confirmLabel: 'Log Out',
          danger: false,
          onConfirm: () => {
            StorageService.logout();
            this.currentUser = null;
            this.authTab = 'login';
            this.showToast('You have logged out of your store.', 'info');
            this.navigate('#/auth');
          },
        });
      });

      // Permanent Delete Account Modal Logic
      const deleteModal = document.getElementById('modal-delete-account');
      const inputConfirmDelete = document.getElementById('input-confirm-delete') as HTMLInputElement;
      const btnExecuteDelete = document.getElementById('btn-execute-permanent-delete') as HTMLButtonElement;

      document.getElementById('btn-open-delete-modal')?.addEventListener('click', () => {
        if (deleteModal) {
          deleteModal.classList.add('open');
          if (inputConfirmDelete) {
            inputConfirmDelete.value = '';
            setTimeout(() => inputConfirmDelete.focus(), 60);
          }
          if (btnExecuteDelete) {
            btnExecuteDelete.disabled = true;
            btnExecuteDelete.style.opacity = '0.4';
            btnExecuteDelete.style.cursor = 'not-allowed';
          }
        }
      });

      const closeDeleteModal = () => {
        if (deleteModal) deleteModal.classList.remove('open');
      };

      document.getElementById('btn-close-delete-modal')?.addEventListener('click', closeDeleteModal);
      document.getElementById('btn-cancel-delete-modal')?.addEventListener('click', closeDeleteModal);

      deleteModal?.addEventListener('click', (e) => {
        if (e.target === deleteModal) closeDeleteModal();
      });

      inputConfirmDelete?.addEventListener('input', () => {
        const val = inputConfirmDelete.value.trim();
        const isMatch = val === 'DELETE';
        if (btnExecuteDelete) {
          btnExecuteDelete.disabled = !isMatch;
          btnExecuteDelete.style.opacity = isMatch ? '1' : '0.4';
          btnExecuteDelete.style.cursor = isMatch ? 'pointer' : 'not-allowed';
        }
      });

      btnExecuteDelete?.addEventListener('click', () => {
        if (!this.currentUser) return;
        if (inputConfirmDelete.value.trim() !== 'DELETE') return;

        const deletedId = this.currentUser.id;
        const deletedName = this.currentUser.storeName || this.currentUser.name;
        StorageService.deleteAccountPermanently(deletedId);

        closeDeleteModal();
        this.currentUser = null;
        this.showToast(`Account "${deletedName}" and all associated data permanently erased.`, 'danger');
        this.navigate('#/auth');
      });

      document.getElementById('btn-wipe-data')?.addEventListener('click', () => {
        if (!this.currentUser) return;
        this.openConfirmActionModal({
          title: 'Clear All Store Sales & Products',
          message: 'Are you sure you want to erase all products, sales, expenses, and customer debts for this store?',
          detailHtml: `Store Profile Kept: <strong style="color:var(--text-primary);">${this.currentUser.storeName || this.currentUser.name}</strong>`,
          warning: '⚠️ This permanently deletes all inventory items, sales transactions, expenses, and customer debt history.',
          confirmLabel: '🗑️ Clear All Store Data',
          danger: true,
          onConfirm: () => {
            if (!this.currentUser) return;
            StorageService.clearUserData(this.currentUser.id);
            this.showToast('All sales and inventory cleared. Store is completely empty!', 'info');
            this.navigate('#/sales');
          },
        });
      });
    }
  }
}

// Mount application once
let appInitialized = false;
async function initApp() {
  if (appInitialized) return;
  appInitialized = true;
  await StorageService.init();
  new MultiPageApp();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void initApp();
  });
} else {
  void initApp();
}
