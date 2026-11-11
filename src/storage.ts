import { Expense, FinancialSummary, Metrics, Product, Sale, User, UserRole } from './types.ts';

const STORAGE_KEYS = {
  CURRENT_USER_ID: 'shopkepa_current_user_id',
  USERS: 'shopkepa_users',
  PRODUCTS: 'shopkepa_products',
  SALES: 'shopkepa_sales',
  EXPENSES: 'shopkepa_expenses',
};

// Curated community showcase merchants across various niches
const COMMUNITY_MERCHANTS: User[] = [
  {
    id: 'usr_community_fashion',
    name: 'Zainab Bello',
    email: 'zainab@fabrics.local',
    role: 'merchant',
    storeName: 'Zainab Luxury Fabrics',
    niche: 'Fashion',
    phone: '08031112233',
    city: 'Lagos Island, Lagos',
    bio: 'Authentic Swiss lace, Senegalese Kaftans, and bespoke Ankara prints delivered nationwide.',
    currency: '₦',
    createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
  },
  {
    id: 'usr_community_beauty',
    name: 'Amanda Osei',
    email: 'amanda@glowbotanics.local',
    role: 'merchant',
    storeName: 'Glow Botanicals',
    niche: 'Beauty',
    phone: '08124445566',
    city: 'Wuse 2, Abuja',
    bio: 'Handcrafted organic skincare, raw whipped shea butter, body glow oils, and herbal facial scrubs.',
    currency: '₦',
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
  },
  {
    id: 'usr_community_tech',
    name: 'Kelechi Okafor',
    email: 'kelechi@gadgethive.local',
    role: 'merchant',
    storeName: 'GadgetHive Tech & Audio',
    niche: 'Tech Gadgets',
    phone: '08097778899',
    city: 'Computer Village, Ikeja',
    bio: 'High-spec wireless noise-cancelling earbuds, smart fitness watches, and GaN fast charging hubs.',
    currency: '₦',
    createdAt: new Date(Date.now() - 86400000 * 8).toISOString(),
  },
  {
    id: 'usr_community_food',
    name: 'Mama Nkechi',
    email: 'nkechi@foodstuff.local',
    role: 'merchant',
    storeName: 'Nkechi Agro Provisions',
    niche: 'Foodstuff & Provisions',
    phone: '08023334455',
    city: 'Bodija Market, Ibadan',
    bio: 'Stone-free export grade Ofada rice, pure cold-pressed palm oil, and authentic dried catfish.',
    currency: '₦',
    createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
  },
];

const COMMUNITY_PRODUCTS: Product[] = [
  {
    id: 'cprod_fashion_1',
    userId: 'usr_community_fashion',
    name: 'Vintage Silk Ankara (6 Yards)',
    price: 18500,
    stock: 12,
    category: 'Fashion',
    image: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cprod_fashion_2',
    userId: 'usr_community_fashion',
    name: 'Embroidered Kaftan Dress',
    price: 32000,
    stock: 5,
    category: 'Fashion',
    image: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cprod_beauty_1',
    userId: 'usr_community_beauty',
    name: 'Whipped Shea Butter Body Soufflé (250g)',
    price: 6500,
    stock: 20,
    category: 'Beauty',
    image: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cprod_beauty_2',
    userId: 'usr_community_beauty',
    name: 'Organic Rosehip Glow Serum (30ml)',
    price: 12000,
    stock: 8,
    category: 'Beauty',
    image: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cprod_tech_1',
    userId: 'usr_community_tech',
    name: 'Pro ANC Wireless Earbuds with Mic',
    price: 24500,
    stock: 15,
    category: 'Tech Gadgets',
    image: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cprod_tech_2',
    userId: 'usr_community_tech',
    name: '65W GaN Fast Charger (3-Port)',
    price: 16500,
    stock: 9,
    category: 'Tech Gadgets',
    image: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cprod_food_1',
    userId: 'usr_community_food',
    name: 'Premium Stone-Free Ofada Rice (5kg)',
    price: 11500,
    stock: 18,
    category: 'Foodstuff & Provisions',
    image: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const DEFAULT_MERCHANT_PRODUCTS: Product[] = [
  {
    id: 'prod_starter_1',
    userId: 'usr_my_merchant',
    name: 'Luxury Ankara Silk Fabric (6 Yards)',
    price: 18500,
    stock: 14,
    category: 'Fabrics & Textiles',
    image: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod_starter_2',
    userId: 'usr_my_merchant',
    name: 'Embroidered Senator Kaftan (Navy)',
    price: 42000,
    stock: 6,
    category: 'Men Fashion',
    image: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod_starter_3',
    userId: 'usr_my_merchant',
    name: 'Handcrafted Beaded Evening Clutch',
    price: 15000,
    stock: 2,
    category: 'Accessories',
    image: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod_starter_4',
    userId: 'usr_my_merchant',
    name: 'Floral Tiered Bohemian Maxi Dress',
    price: 24000,
    stock: 9,
    category: 'Women Fashion',
    image: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export class StorageService {
  private static getItem<T>(key: string, defaultValue: T): T {
    try {
      let item = localStorage.getItem(key);
      if (!item && key.startsWith('shopkepa_')) {
        const legacyKey = key.replace('shopkepa_', 'kobotrace_');
        item = localStorage.getItem(legacyKey);
        if (item) {
          localStorage.setItem(key, item);
        }
      }
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.error(`Error reading ${key} from localStorage:`, e);
      return defaultValue;
    }
  }

  private static setItem<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error(`Error writing ${key} to localStorage:`, e);
    }
  }

  // --- Initialize Community Directory Merchants ---
  public static ensureCommunityDirectory(): void {
    const existingUsers = this.getItem<User[]>(STORAGE_KEYS.USERS, []);
    const existingIds = new Set(existingUsers.map((u) => u.id));

    let usersModified = false;
    for (const cm of COMMUNITY_MERCHANTS) {
      if (!existingIds.has(cm.id)) {
        existingUsers.push(cm);
        usersModified = true;
      }
    }
    if (usersModified) {
      this.setItem(STORAGE_KEYS.USERS, existingUsers);
    }

    const existingProds = this.getItem<Product[]>(STORAGE_KEYS.PRODUCTS, []);
    const existingProdIds = new Set(existingProds.map((p) => p.id));
    let prodsModified = false;
    for (const cp of COMMUNITY_PRODUCTS) {
      if (!existingProdIds.has(cp.id)) {
        existingProds.push(cp);
        existingProdIds.add(cp.id);
        prodsModified = true;
      }
    }

    // Seed default starter stock for usr_my_merchant if it has 0 products
    const myProducts = existingProds.filter((p) => p.userId === 'usr_my_merchant');
    if (myProducts.length === 0) {
      for (const dp of DEFAULT_MERCHANT_PRODUCTS) {
        if (!existingProdIds.has(dp.id)) {
          existingProds.push(dp);
          existingProdIds.add(dp.id);
          prodsModified = true;
        }
      }
    }

    if (prodsModified) {
      this.setItem(STORAGE_KEYS.PRODUCTS, existingProds);
    }
  }

  // --- Auth / User Management ---

  public static getCurrentUser(): User | null {
    let userId = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
    if (!userId) {
      userId = localStorage.getItem('kobotrace_current_user_id');
      if (userId) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, userId);
      }
    }
    if (!userId) return null;
    const users = this.getAllUsers();
    return users.find((u) => u.id === userId) || null;
  }

  public static getAllUsers(): User[] {
    return this.getItem<User[]>(STORAGE_KEYS.USERS, []);
  }

  public static getAllMerchants(): User[] {
    return this.getAllUsers().filter((u) => u.role === 'merchant' && !u.isDeactivated);
  }

  public static getUserById(userId: string): User | undefined {
    return this.getAllUsers().find((u) => u.id === userId);
  }

  public static login(email: string): User | null {
    const users = this.getAllUsers();
    const cleanEmail = email.trim().toLowerCase();
    const user = users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, user.id);
      return user;
    }
    return null;
  }

  public static signup(data: {
    name: string;
    email: string;
    role: UserRole;
    storeName?: string;
    niche?: string;
    phone: string;
    city?: string;
    bio?: string;
    currency?: string;
  }): User {
    const users = this.getAllUsers();
    const cleanEmail = data.email.trim().toLowerCase();

    const existing = users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (existing) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, existing.id);
      return existing;
    }

    const newUser: User = {
      id: 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      name: data.name.trim(),
      email: cleanEmail,
      role: data.role,
      storeName: data.role === 'merchant' ? (data.storeName?.trim() || `${data.name}'s Store`) : undefined,
      niche: data.role === 'merchant' ? (data.niche || 'Fashion') : undefined,
      phone: data.phone.trim(),
      city: data.city?.trim() || '',
      bio: data.bio?.trim() || '',
      currency: data.currency || '₦',
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    this.setItem(STORAGE_KEYS.USERS, users);
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, newUser.id);

    // Ensure the new user's own store starts 100% empty
    this.clearUserData(newUser.id);

    return newUser;
  }

  public static switchUser(userId: string): User | null {
    const user = this.getUserById(userId);
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, user.id);
      return user;
    }
    return null;
  }

  public static logout(): void {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
  }

  public static updateUserProfile(userId: string, updates: Partial<User>): User | null {
    const users = this.getAllUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return null;

    users[idx] = {
      ...users[idx],
      ...updates,
    };
    this.setItem(STORAGE_KEYS.USERS, users);
    return users[idx];
  }

  public static clearUserData(userId: string): void {
    const allProducts = this.getItem<Product[]>(STORAGE_KEYS.PRODUCTS, []);
    const remainingProducts = allProducts.filter((p) => p.userId !== userId);
    this.setItem(STORAGE_KEYS.PRODUCTS, remainingProducts);

    const allSales = this.getItem<Sale[]>(STORAGE_KEYS.SALES, []);
    const remainingSales = allSales.filter((s) => s.userId !== userId);
    this.setItem(STORAGE_KEYS.SALES, remainingSales);
  }

  public static deactivateAccount(userId: string): User | null {
    const users = this.getAllUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return null;

    users[idx] = {
      ...users[idx],
      isDeactivated: true,
      deactivatedAt: new Date().toISOString(),
    };
    this.setItem(STORAGE_KEYS.USERS, users);
    return users[idx];
  }

  public static reactivateAccount(userId: string): User | null {
    const users = this.getAllUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return null;

    users[idx] = {
      ...users[idx],
      isDeactivated: false,
      deactivatedAt: undefined,
    };
    this.setItem(STORAGE_KEYS.USERS, users);
    return users[idx];
  }

  public static deleteAccountPermanently(userId: string): boolean {
    // 1. Wipe all products
    const allProducts = this.getItem<Product[]>(STORAGE_KEYS.PRODUCTS, []).filter(
      (p) => p.userId !== userId
    );
    this.setItem(STORAGE_KEYS.PRODUCTS, allProducts);

    // 2. Wipe all sales & debts
    const allSales = this.getItem<Sale[]>(STORAGE_KEYS.SALES, []).filter(
      (s) => s.userId !== userId
    );
    this.setItem(STORAGE_KEYS.SALES, allSales);

    // 3. Wipe all expenses
    const allExpenses = this.getItem<Expense[]>(STORAGE_KEYS.EXPENSES, []).filter(
      (e) => e.userId !== userId
    );
    this.setItem(STORAGE_KEYS.EXPENSES, allExpenses);

    // 4. Remove user record
    const allUsers = this.getAllUsers().filter((u) => u.id !== userId);
    this.setItem(STORAGE_KEYS.USERS, allUsers);

    // 5. Clear active session if deleting current user
    const currentId = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
    if (currentId === userId) {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
    }

    return true;
  }

  public static createDefaultEmptyMerchant(): User {
    const defaultMerchant: User = {
      id: 'usr_my_merchant',
      name: 'Business Owner',
      email: 'owner@shopkepa.local',
      role: 'merchant',
      storeName: 'My Store',
      niche: 'Fashion',
      phone: '',
      city: 'Lagos, Nigeria',
      bio: 'Welcome to our storefront. Contact us via WhatsApp for instant inquiries!',
      currency: '₦',
      lowStockThreshold: 5,
      enableStockNotifications: true,
      bankPaymentDetails: '',
      createdAt: new Date().toISOString(),
    };

    const users = this.getAllUsers();
    const existing = users.find((u) => u.id === defaultMerchant.id);
    if (!existing) {
      users.push(defaultMerchant);
      this.setItem(STORAGE_KEYS.USERS, users);
    }
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, defaultMerchant.id);

    // Ensure initial stock items are present for default merchant
    const existingProds = this.getProducts(defaultMerchant.id);
    if (existingProds.length === 0) {
      const allProds = this.getItem<Product[]>(STORAGE_KEYS.PRODUCTS, []);
      for (const dp of DEFAULT_MERCHANT_PRODUCTS) {
        if (!allProds.some((p) => p.id === dp.id)) {
          allProds.push(dp);
        }
      }
      this.setItem(STORAGE_KEYS.PRODUCTS, allProds);
    }

    return defaultMerchant;
  }

  // --- Inventory Management ---

  public static getProducts(userId: string): Product[] {
    const all = this.getItem<Product[]>(STORAGE_KEYS.PRODUCTS, []);
    return all.filter((p) => p.userId === userId);
  }

  public static getProduct(productId: string): Product | undefined {
    const all = this.getItem<Product[]>(STORAGE_KEYS.PRODUCTS, []);
    return all.find((p) => p.id === productId);
  }

  public static saveProduct(
    productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Product {
    const all = this.getItem<Product[]>(STORAGE_KEYS.PRODUCTS, []);
    const now = new Date().toISOString();

    if (productData.id) {
      const index = all.findIndex((p) => p.id === productData.id);
      if (index !== -1) {
        all[index] = {
          ...all[index],
          ...productData,
          price: Number(productData.price) || 0,
          stock: Math.max(0, parseInt(String(productData.stock), 10) || 0),
          updatedAt: now,
        } as Product;
        this.setItem(STORAGE_KEYS.PRODUCTS, all);
        return all[index];
      }
    }

    const newProduct: Product = {
      id: 'prod_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      userId: productData.userId,
      name: productData.name.trim(),
      price: Number(productData.price) || 0,
      stock: Math.max(0, parseInt(String(productData.stock), 10) || 0),
      category: productData.category.trim() || 'General',
      image: productData.image || '',
      createdAt: now,
      updatedAt: now,
    };

    all.unshift(newProduct);
    this.setItem(STORAGE_KEYS.PRODUCTS, all);
    return newProduct;
  }

  public static deleteProduct(productId: string): void {
    const all = this.getItem<Product[]>(STORAGE_KEYS.PRODUCTS, []);
    const filtered = all.filter((p) => p.id !== productId);
    this.setItem(STORAGE_KEYS.PRODUCTS, filtered);
  }

  public static deductStock(productId: string, quantity: number): { success: boolean; newStock: number; product?: Product } {
    const all = this.getItem<Product[]>(STORAGE_KEYS.PRODUCTS, []);
    const index = all.findIndex((p) => p.id === productId);
    if (index === -1) return { success: false, newStock: 0 };

    const currentStock = all[index].stock;
    const newStock = Math.max(0, currentStock - quantity);
    all[index].stock = newStock;
    all[index].updatedAt = new Date().toISOString();
    this.setItem(STORAGE_KEYS.PRODUCTS, all);
    return { success: true, newStock, product: all[index] };
  }

  // --- Sales & Debt Management ---

  public static getSales(userId: string): Sale[] {
    const all = this.getItem<Sale[]>(STORAGE_KEYS.SALES, []);
    return all
      .filter((s) => s.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static saveSale(
    saleData: Omit<Sale, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
  ): { sale: Sale; affectedProducts: { product: Product; stockLeft: number }[] } {
    const all = this.getItem<Sale[]>(STORAGE_KEYS.SALES, []);
    const now = new Date().toISOString();

    // Look up merchant info
    const merchant = this.getUserById(saleData.userId);

    // Look up matching buyer if customer phone or name matches an existing user
    let buyerId = saleData.buyerId;
    if (!buyerId && saleData.customerPhone) {
      const allUsers = this.getAllUsers();
      const cleanCustomerPhone = saleData.customerPhone.replace(/[^0-9]/g, '');
      const match = allUsers.find((u) => {
        const uPhone = u.phone.replace(/[^0-9]/g, '');
        return uPhone && (uPhone === cleanCustomerPhone || (cleanCustomerPhone.length >= 8 && uPhone.includes(cleanCustomerPhone)));
      });
      if (match) {
        buyerId = match.id;
      }
    }

    const sale: Sale = {
      id: saleData.id || 'sale_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      userId: saleData.userId,
      merchantStoreName: saleData.merchantStoreName || merchant?.storeName || merchant?.name || 'Merchant Store',
      merchantPhone: saleData.merchantPhone || merchant?.phone || '',
      buyerId,
      customerName: saleData.customerName.trim() || 'Walk-in Customer',
      customerPhone: saleData.customerPhone?.trim() || '',
      items: saleData.items,
      totalAmount: Number(saleData.totalAmount) || 0,
      status: saleData.status,
      paymentMethod: saleData.paymentMethod || 'Cash',
      dueDate: saleData.dueDate ? saleData.dueDate : undefined,
      notes: saleData.notes?.trim() || '',
      createdAt: saleData.createdAt || now,
      paidAt: saleData.status === 'completed' ? now : undefined,
    };

    const affectedProducts: { product: Product; stockLeft: number }[] = [];
    sale.items.forEach((item) => {
      if (item.productId) {
        const res = this.deductStock(item.productId, item.quantity);
        if (res.product) {
          affectedProducts.push({ product: res.product, stockLeft: res.newStock });
        }
      }
    });

    all.unshift(sale);
    this.setItem(STORAGE_KEYS.SALES, all);
    return { sale, affectedProducts };
  }

  // --- Buyer Specific Orders & Debts ---
  public static getBuyerPurchases(buyer: User): Sale[] {
    const all = this.getItem<Sale[]>(STORAGE_KEYS.SALES, []);
    const cleanPhone = (buyer.phone || '').replace(/[^0-9]/g, '');
    const cleanName = (buyer.name || '').trim().toLowerCase();

    return all
      .filter((s) => {
        if (s.buyerId === buyer.id) return true;
        if (cleanPhone && s.customerPhone) {
          const sPhone = s.customerPhone.replace(/[^0-9]/g, '');
          if (sPhone && (sPhone === cleanPhone || (cleanPhone.length >= 8 && sPhone.includes(cleanPhone)))) {
            return true;
          }
        }
        if (cleanName && s.customerName && s.customerName.trim().toLowerCase() === cleanName) {
          return true;
        }
        return false;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static saveBuyerPurchase(buyer: User, data: {
    merchantStoreName: string;
    merchantPhone?: string;
    productName: string;
    quantity: number;
    amount: number;
    status: 'completed' | 'pending';
    notes?: string;
  }): Sale {
    const all = this.getItem<Sale[]>(STORAGE_KEYS.SALES, []);
    const now = new Date().toISOString();

    const sale: Sale = {
      id: 'buyer_rec_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      userId: 'merchant_external',
      merchantStoreName: data.merchantStoreName.trim() || 'Local Merchant',
      merchantPhone: data.merchantPhone?.trim() || '',
      buyerId: buyer.id,
      customerName: buyer.name,
      customerPhone: buyer.phone,
      items: [
        {
          productName: data.productName.trim() || 'Purchased Item',
          quantity: Math.max(1, data.quantity || 1),
          unitPrice: Number(data.amount) / Math.max(1, data.quantity || 1),
          subtotal: Number(data.amount) || 0,
        },
      ],
      totalAmount: Number(data.amount) || 0,
      status: data.status,
      paymentMethod: data.status === 'completed' ? 'Cash/Transfer' : 'Debt',
      notes: data.notes?.trim() || 'Logged by buyer',
      createdAt: now,
      paidAt: data.status === 'completed' ? now : undefined,
    };

    all.unshift(sale);
    this.setItem(STORAGE_KEYS.SALES, all);
    return sale;
  }

  public static calculateBuyerMetrics(purchases: Sale[]): {
    totalPaid: number;
    totalDebt: number;
    totalOrders: number;
    totalItems: number;
  } {
    const completed = purchases.filter((p) => p.status === 'completed');
    const pending = purchases.filter((p) => p.status === 'pending');

    const totalPaid = completed.reduce((sum, p) => sum + p.totalAmount, 0);
    const totalDebt = pending.reduce((sum, p) => sum + p.totalAmount, 0);
    const totalOrders = completed.length;
    const totalItems = purchases.reduce((sum, p) => sum + p.items.reduce((isum, item) => isum + item.quantity, 0), 0);

    return {
      totalPaid,
      totalDebt,
      totalOrders,
      totalItems,
    };
  }

  public static toggleSaleStatus(saleId: string): Sale | null {
    const all = this.getItem<Sale[]>(STORAGE_KEYS.SALES, []);
    const index = all.findIndex((s) => s.id === saleId);
    if (index === -1) return null;

    const current = all[index];
    const newStatus = current.status === 'pending' ? 'completed' : 'pending';
    all[index] = {
      ...current,
      status: newStatus,
      paidAt: newStatus === 'completed' ? new Date().toISOString() : undefined,
    };

    this.setItem(STORAGE_KEYS.SALES, all);
    return all[index];
  }

  public static updateCustomerPhone(saleId: string, phone: string): Sale | null {
    const all = this.getItem<Sale[]>(STORAGE_KEYS.SALES, []);
    const index = all.findIndex((s) => s.id === saleId);
    if (index === -1) return null;

    all[index] = {
      ...all[index],
      customerPhone: phone.trim(),
    };
    this.setItem(STORAGE_KEYS.SALES, all);
    return all[index];
  }

  public static deleteSale(saleId: string): void {
    const all = this.getItem<Sale[]>(STORAGE_KEYS.SALES, []);
    const filtered = all.filter((s) => s.id !== saleId);
    this.setItem(STORAGE_KEYS.SALES, filtered);
  }

  // --- Strict AOV & Metrics Calculation ---
  public static calculateMetrics(sales: Sale[]): Metrics {
    const completedSales = sales.filter((s) => s.status === 'completed');
    const pendingSales = sales.filter((s) => s.status === 'pending');

    const totalRevenue = completedSales.reduce((acc, s) => acc + s.totalAmount, 0);
    const totalOrders = completedSales.length;
    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const totalDebt = pendingSales.reduce((acc, s) => acc + s.totalAmount, 0);

    return {
      totalRevenue,
      totalOrders,
      aov,
      totalDebt,
    };
  }

  // --- Business Overheads & Expense Tracking ---

  public static getExpenses(userId: string): Expense[] {
    this.ensureSeedExpenses(userId);
    const all = this.getItem<Expense[]>(STORAGE_KEYS.EXPENSES, []);
    return all
      .filter((e) => e.userId === userId)
      .sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
  }

  public static getExpense(expenseId: string): Expense | undefined {
    const all = this.getItem<Expense[]>(STORAGE_KEYS.EXPENSES, []);
    return all.find((e) => e.id === expenseId);
  }

  public static saveExpense(
    expenseData: Omit<Expense, 'id' | 'createdAt'> & { id?: string }
  ): Expense {
    const all = this.getItem<Expense[]>(STORAGE_KEYS.EXPENSES, []);
    const now = new Date().toISOString();

    if (expenseData.id) {
      const index = all.findIndex((e) => e.id === expenseData.id);
      if (index !== -1) {
        all[index] = {
          ...all[index],
          title: expenseData.title.trim(),
          amount: Number(expenseData.amount) || 0,
          category: expenseData.category,
          date: expenseData.date || now,
          paymentMethod: expenseData.paymentMethod || 'Cash',
          vendor: expenseData.vendor?.trim() || undefined,
          notes: expenseData.notes?.trim() || undefined,
        };
        this.setItem(STORAGE_KEYS.EXPENSES, all);
        return all[index];
      }
    }

    const newExpense: Expense = {
      id: 'exp_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      userId: expenseData.userId,
      title: expenseData.title.trim(),
      amount: Number(expenseData.amount) || 0,
      category: expenseData.category,
      date: expenseData.date || now,
      paymentMethod: expenseData.paymentMethod || 'Cash',
      vendor: expenseData.vendor?.trim() || undefined,
      notes: expenseData.notes?.trim() || undefined,
      createdAt: now,
    };

    all.unshift(newExpense);
    this.setItem(STORAGE_KEYS.EXPENSES, all);
    return newExpense;
  }

  public static deleteExpense(expenseId: string): void {
    const all = this.getItem<Expense[]>(STORAGE_KEYS.EXPENSES, []);
    const filtered = all.filter((e) => e.id !== expenseId);
    this.setItem(STORAGE_KEYS.EXPENSES, filtered);
  }

  public static calculateFinancialSummary(sales: Sale[], expenses: Expense[]): FinancialSummary {
    const metrics = this.calculateMetrics(sales);
    const totalRevenue = metrics.totalRevenue;
    const totalDebt = metrics.totalDebt;
    const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const netProfit = totalRevenue - totalExpenses;
    const netMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const expenseRatioPct = totalRevenue > 0 ? (totalExpenses / totalRevenue) * 100 : 0;
    const operatingCashFlow = netProfit;

    return {
      totalRevenue,
      totalDebt,
      totalExpenses,
      netProfit,
      netMarginPct: Math.round(netMarginPct * 10) / 10,
      expenseRatioPct: Math.round(expenseRatioPct * 10) / 10,
      operatingCashFlow,
    };
  }

  public static ensureSeedExpenses(userId: string): void {
    const all = this.getItem<Expense[]>(STORAGE_KEYS.EXPENSES, []);
    const userExpenses = all.filter((e) => e.userId === userId);
    if (userExpenses.length > 0) return;

    // Seed realistic operational overheads for demo merchant
    const now = Date.now();
    const seeds: Expense[] = [
      {
        id: 'exp_seed_1',
        userId,
        title: 'Generator Petrol (25 Litres)',
        amount: 24500,
        category: 'Generator Fuel & Power',
        date: new Date(now - 86400000 * 1).toISOString(),
        paymentMethod: 'Bank Transfer',
        vendor: 'TotalEnergies Station',
        notes: 'Backup generator fueling during national grid outage',
        createdAt: new Date(now - 86400000 * 1).toISOString(),
      },
      {
        id: 'exp_seed_2',
        userId,
        title: 'Custom Branded Carrier Nylon Bags (500 pcs)',
        amount: 16000,
        category: 'Packaging & Bags',
        date: new Date(now - 86400000 * 3).toISOString(),
        paymentMethod: 'Cash',
        vendor: 'Oshodi Packaging Hub',
        notes: 'Medium and large retail shopping bags with logo stamp',
        createdAt: new Date(now - 86400000 * 3).toISOString(),
      },
      {
        id: 'exp_seed_3',
        userId,
        title: 'Express Interstate Dispatch to Abuja',
        amount: 8500,
        category: 'Delivery & Logistics',
        date: new Date(now - 86400000 * 4).toISOString(),
        paymentMethod: 'Bank Transfer',
        vendor: 'SpeedLogistics Dispatch',
        notes: 'Doorstep parcel delivery for online orders',
        createdAt: new Date(now - 86400000 * 4).toISOString(),
      },
      {
        id: 'exp_seed_4',
        userId,
        title: 'Plaza Sanitation & Market Security Levy',
        amount: 10000,
        category: 'Market Levies & Taxes',
        date: new Date(now - 86400000 * 8).toISOString(),
        paymentMethod: 'Cash',
        vendor: 'Plaza Management Committee',
        notes: 'Monthly security guard and refuse disposal dues',
        createdAt: new Date(now - 86400000 * 8).toISOString(),
      },
      {
        id: 'exp_seed_5',
        userId,
        title: 'Monthly Storefront Stall Rent Contribution',
        amount: 35000,
        category: 'Shop Rent',
        date: new Date(now - 86400000 * 18).toISOString(),
        paymentMethod: 'Bank Transfer',
        vendor: 'Commercial Property Landlord',
        notes: 'Shop lease installment payment',
        createdAt: new Date(now - 86400000 * 18).toISOString(),
      },
    ];

    all.push(...seeds);
    this.setItem(STORAGE_KEYS.EXPENSES, all);
  }
}
