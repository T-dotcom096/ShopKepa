export type UserRole = 'merchant' | 'buyer';

export const POPULAR_NICHES = [
  'Fashion',
  'Beauty',
  'Tech Gadgets',
  'Foodstuff & Provisions',
  'Health & Wellness',
  'Home & Living',
  'Electronics',
  'General Merchandise',
] as const;

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  storeName?: string;
  niche?: string;
  phone: string;
  city?: string;
  bio?: string;
  currency: string;
  lowStockThreshold?: number; // User-defined stock threshold (default 5)
  enableStockNotifications?: boolean; // Browser push notifications for low stock
  bankPaymentDetails?: string; // Bank account details for automated WhatsApp payment invoices
  isDeactivated?: boolean;
  deactivatedAt?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  userId: string;
  name: string;
  price: number;
  stock: number;
  category: string;
  image: string; // Base64 data URL or empty
  createdAt: string;
  updatedAt: string;
}

export interface SaleItem {
  productId?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Sale {
  id: string;
  userId: string;
  merchantStoreName?: string;
  merchantPhone?: string;
  buyerId?: string;
  customerName: string;
  customerPhone?: string;
  items: SaleItem[];
  totalAmount: number;
  status: 'completed' | 'pending';
  paymentMethod: string; // 'Cash' | 'Transfer' | 'POS' | 'Debt' | 'Other'
  dueDate?: string; // Due date for pending debts (YYYY-MM-DD)
  notes?: string;
  createdAt: string;
  paidAt?: string;
}

export interface Metrics {
  totalRevenue: number;
  totalOrders: number;
  aov: number;
  totalDebt: number;
}

export const EXPENSE_CATEGORIES = [
  'Generator Fuel & Power',
  'Shop Rent',
  'Delivery & Logistics',
  'Staff Wages & Salaries',
  'Inventory Procurement',
  'Packaging & Bags',
  'Market Levies & Taxes',
  'Maintenance & Repairs',
  'Marketing & Ads',
  'General Overheads',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number] | string;

export interface Expense {
  id: string;
  userId: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  date: string; // ISO date string or YYYY-MM-DD
  paymentMethod: string; // 'Cash' | 'Bank Transfer' | 'POS' | 'Card' | 'Personal Pocket'
  vendor?: string; // e.g. 'Oando Fuel Station', 'Market Authority', 'Courier Service'
  notes?: string;
  createdAt: string;
}

export interface FinancialSummary {
  totalRevenue: number; // Completed paid sales
  totalDebt: number; // Pending receivables
  totalExpenses: number; // Total business overheads
  netProfit: number; // totalRevenue - totalExpenses
  netMarginPct: number; // (netProfit / totalRevenue) * 100
  expenseRatioPct: number; // (totalExpenses / totalRevenue) * 100
  operatingCashFlow: number; // totalRevenue - totalExpenses
}
