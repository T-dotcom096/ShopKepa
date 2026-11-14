import { Expense, FinancialSummary, Metrics, Product, Sale, User, UserRole } from './types.ts';
import { generatePasswordSalt, hashPassword } from './utils.ts';

const STORAGE_KEYS = {
  CURRENT_USER_ID: 'shopkepa_current_user_id',
  USERS: 'shopkepa_users',
  PRODUCTS: 'shopkepa_products',
  SALES: 'shopkepa_sales',
  EXPENSES: 'shopkepa_expenses',
  STOCK_WATCHLIST: 'shopkepa_stock_watchlist',
};

export interface StockWatchItem {
  watcherKey: string;
  productId: string;
  merchantId: string;
  stockWhenWatched: number;
  watchedAt: string;
}

// Default starter stock for new merchant store setup

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

const IDB_NAME = 'shopkepa_db';
const IDB_VERSION = 1;
const IDB_STORE_KV = 'kv';
const IDB_STORE_IMAGES = 'images';

export class StorageService {
  private static db: IDBDatabase | null = null;
  private static initPromise: Promise<void> | null = null;
  private static kvCache: Map<string, unknown> = new Map();
  private static imageCache: Map<string, string> = new Map();

  public static async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.performInit();
    return this.initPromise;
  }

  private static async performInit(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      return;
    }

    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE_KV)) {
            db.createObjectStore(IDB_STORE_KV);
          }
          if (!db.objectStoreNames.contains(IDB_STORE_IMAGES)) {
            db.createObjectStore(IDB_STORE_IMAGES);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      // 1. Hydrate all saved product images into memory cache
      const storedImages = await this.readAllFromStore<string>(IDB_STORE_IMAGES);
      storedImages.forEach(([key, val]) => {
        if (typeof val === 'string' && val) {
          this.imageCache.set(String(key), val);
        }
      });

      // 2. Hydrate all primary collections into memory cache
      const storedKv = await this.readAllFromStore<unknown>(IDB_STORE_KV);
      storedKv.forEach(([key, val]) => {
        this.kvCache.set(String(key), val);
      });

      // 3. Migrate existing localStorage collections & extract inline Base64 images to IndexedDB
      const collectionKeys = [
        STORAGE_KEYS.USERS,
        STORAGE_KEYS.PRODUCTS,
        STORAGE_KEYS.SALES,
        STORAGE_KEYS.EXPENSES,
        STORAGE_KEYS.STOCK_WATCHLIST,
      ];

      for (const key of collectionKeys) {
        if (!this.kvCache.has(key)) {
          const fromLs = this.readRawLocalStorage<unknown>(key);
          if (fromLs !== null) {
            this.kvCache.set(key, fromLs);
            await this.writeToStore(IDB_STORE_KV, key, fromLs);
          }
        }
      }

      // 4. Automatically offload any inline Base64 images currently inside PRODUCTS into IndexedDB
      const existingProds = this.kvCache.get(STORAGE_KEYS.PRODUCTS) as Product[] | undefined;
      if (Array.isArray(existingProds) && existingProds.length > 0) {
        let migratedAnyImage = false;
        const offloadedProds: Product[] = [];

        for (const p of existingProds) {
          if (p.image && !p.image.startsWith('idb://')) {
            this.imageCache.set(p.id, p.image);
            await this.writeToStore(IDB_STORE_IMAGES, p.id, p.image);
            offloadedProds.push({ ...p, image: `idb://${p.id}` });
            migratedAnyImage = true;
          } else {
            offloadedProds.push(p);
          }
        }

        if (migratedAnyImage) {
          this.kvCache.set(STORAGE_KEYS.PRODUCTS, offloadedProds);
          await this.writeToStore(IDB_STORE_KV, STORAGE_KEYS.PRODUCTS, offloadedProds);
          try {
            localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(offloadedProds));
          } catch {
            // Best-effort localStorage sync
          }
        }
      }
    } catch (err) {
      console.error('IndexedDB initialization fallback to memory/localStorage:', err);
      this.db = null;
    }
  }

  private static readAllFromStore<T>(storeName: string): Promise<Array<[IDBValidKey, T]>> {
    if (!this.db) return Promise.resolve([]);
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const results: Array<[IDBValidKey, T]> = [];
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            results.push([cursor.key, cursor.value as T]);
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  private static writeToStore(storeName: string, key: string, value: unknown): Promise<void> {
    if (!this.db) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private static deleteFromStore(storeName: string, key: string): Promise<void> {
    if (!this.db) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private static readRawLocalStorage<T>(key: string): T | null {
    try {
      let item = localStorage.getItem(key);
      if (!item && key.startsWith('shopkepa_')) {
        const legacyKey = key.replace('shopkepa_', 'kobotrace_');
        item = localStorage.getItem(legacyKey);
        if (item) {
          try {
            localStorage.setItem(key, item);
          } catch {
            // Ignore quota on legacy copy
          }
        }
      }
      return item ? (JSON.parse(item) as T) : null;
    } catch {
      return null;
    }
  }

  private static offloadProductImage(productId: string, imageData: string): string {
    if (!imageData) {
      this.deleteProductImage(productId);
      return '';
    }
    if (imageData.startsWith('idb://')) {
      return imageData;
    }
    if (this.db) {
      this.imageCache.set(productId, imageData);
      void this.writeToStore(IDB_STORE_IMAGES, productId, imageData);
      return `idb://${productId}`;
    }
    return imageData;
  }

  private static deleteProductImage(productId: string): void {
    this.imageCache.delete(productId);
    void this.deleteFromStore(IDB_STORE_IMAGES, productId);
  }

  private static hydrateProduct(product: Product): Product {
    if (product.image && product.image.startsWith('idb://')) {
      const refId = product.image.slice(6);
      const cached = this.imageCache.get(refId);
      return { ...product, image: cached ?? '' };
    }
    return product;
  }

  private static getItem<T>(key: string, defaultValue: T): T {
    try {
      if (this.kvCache.has(key)) {
        const cached = this.kvCache.get(key) as T;
        if (Array.isArray(cached)) {
          return cached.map((entry) =>
            entry && typeof entry === 'object' ? { ...(entry as Record<string, unknown>) } : entry
          ) as unknown as T;
        }
        return cached;
      }

      const raw = this.readRawLocalStorage<T>(key);
      if (raw !== null) {
        this.kvCache.set(key, raw);
        return raw;
      }
      return defaultValue;
    } catch (e) {
      console.error(`Error reading ${key} from storage:`, e);
      return defaultValue;
    }
  }

  private static setItem<T>(key: string, value: T): void {
    this.kvCache.set(key, value);
    void this.writeToStore(IDB_STORE_KV, key, value);
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // If browser localStorage reaches its ~5MB cap, IndexedDB and memory cache still hold all data safely
    }
  }

  // --- Purge Demo Showcase Stores & Seeded Demo Products ---
  public static purgeDemoStores(): void {
    // 1. Purge all demo/community merchants from USERS
    const existingUsers = this.getItem<User[]>(STORAGE_KEYS.USERS, []);
    const realUsers = existingUsers.filter((u) => !u.id.startsWith('usr_community_'));
    if (realUsers.length !== existingUsers.length) {
      this.setItem(STORAGE_KEYS.USERS, realUsers);
    }

    // 2. Purge all demo community products from PRODUCTS
    const existingProds = this.getItem<Product[]>(STORAGE_KEYS.PRODUCTS, []);
    const realProds = existingProds.filter((p) => {
      const isDemo = p.id.startsWith('cprod_') || p.userId.startsWith('usr_community_');
      if (isDemo) {
        this.deleteProductImage(p.id);
        return false;
      }
      return true;
    });
    if (realProds.length !== existingProds.length) {
      this.setItem(STORAGE_KEYS.PRODUCTS, realProds);
    }

    // 3. Purge from legacy localStorage keys as well
    try {
      const legacyUsers = localStorage.getItem('kobotrace_users');
      if (legacyUsers) {
        const parsed = JSON.parse(legacyUsers) as User[];
        const filtered = parsed.filter((u) => !u.id.startsWith('usr_community_'));
        localStorage.setItem('kobotrace_users', JSON.stringify(filtered));
      }
      const legacyProds = localStorage.getItem('kobotrace_products');
      if (legacyProds) {
        const parsed = JSON.parse(legacyProds) as Product[];
        const filtered = parsed.filter(
          (p) => !p.id.startsWith('cprod_') && !p.userId.startsWith('usr_community_')
        );
        localStorage.setItem('kobotrace_products', JSON.stringify(filtered));
      }
    } catch {
      // Ignore legacy parsing errors
    }
  }

  // Alias for backward compatibility
  public static ensureCommunityDirectory(): void {
    this.purgeDemoStores();
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
    return this.getAllUsers().filter((u) => {
      if (u.role !== 'merchant' || u.isDeactivated) return false;
      // Never expose demo/community merchants
      if (u.id.startsWith('usr_community_')) return false;
      // If it's the unconfigured default placeholder account, don't display in public marketplace
      if (u.id === 'usr_my_merchant' && !u.phone?.trim() && u.storeName === 'My Store') {
        return false;
      }
      return true;
    });
  }

  public static getUserById(userId: string): User | undefined {
    return this.getAllUsers().find((u) => u.id === userId);
  }

  private static findUsersByIdentifier(identifier: string): User[] {
    const users = this.getAllUsers();
    const clean = identifier.trim().toLowerCase();
    const cleanDigits = identifier.replace(/[^0-9]/g, '');
    if (!clean && cleanDigits.length < 7) return [];

    return users.filter((u) => {
      if (u.email && u.email.toLowerCase() === clean) return true;
      if (u.name && u.name.toLowerCase() === clean) return true;
      if (u.storeName && u.storeName.toLowerCase() === clean) return true;
      if (cleanDigits.length >= 7 && u.phone) {
        const uDigits = u.phone.replace(/[^0-9]/g, '');
        if (uDigits) {
          if (uDigits === cleanDigits) return true;
          if (uDigits.endsWith(cleanDigits) || cleanDigits.endsWith(uDigits)) return true;
          const minLen = Math.min(uDigits.length, cleanDigits.length);
          const compareLen = Math.min(minLen, 9);
          if (compareLen >= 7 && uDigits.slice(-compareLen) === cleanDigits.slice(-compareLen)) {
            return true;
          }
        }
      }
      return false;
    });
  }

  public static login(identifier: string): User | null {
    const matches = this.findUsersByIdentifier(identifier);
    const user = matches[0];
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, user.id);
      return user;
    }
    return null;
  }

  public static async verifyLogin(
    identifier: string,
    password: string
  ): Promise<{
    status: 'success' | 'not_found' | 'wrong_password' | 'password_too_short';
    user?: User;
    setFirstPassword?: boolean;
  }> {
    const matches = this.findUsersByIdentifier(identifier);
    if (matches.length === 0) {
      return { status: 'not_found' };
    }

    // 1. Check password against matching accounts that already have password protection
    for (const candidate of matches) {
      if (candidate.passwordHash) {
        const computed = await hashPassword(password, candidate.passwordSalt || '');
        if (computed === candidate.passwordHash) {
          localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, candidate.id);
          return { status: 'success', user: candidate };
        }
      }
    }

    // 2. Legacy accounts created before passwords were required can set their password on first login
    const legacyAccount = matches.find((u) => !u.passwordHash);
    if (legacyAccount) {
      if (!password || password.length < 4) {
        return { status: 'password_too_short' };
      }
      const salt = generatePasswordSalt();
      const hash = await hashPassword(password, salt);
      const updated = this.updateUserProfile(legacyAccount.id, {
        passwordSalt: salt,
        passwordHash: hash,
      });
      if (updated) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, updated.id);
        return { status: 'success', user: updated, setFirstPassword: true };
      }
    }

    return { status: 'wrong_password' };
  }

  public static async verifyUserPassword(userId: string, password: string): Promise<boolean> {
    const user = this.getUserById(userId);
    if (!user) return false;
    if (!user.passwordHash) return true;
    const computed = await hashPassword(password, user.passwordSalt || '');
    return computed === user.passwordHash;
  }

  public static async updatePassword(userId: string, newPassword: string): Promise<User | null> {
    if (!newPassword || newPassword.length < 4) return null;
    const salt = generatePasswordSalt();
    const hash = await hashPassword(newPassword, salt);
    return this.updateUserProfile(userId, {
      passwordSalt: salt,
      passwordHash: hash,
    });
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
    passwordHash?: string;
    passwordSalt?: string;
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
      passwordHash: data.passwordHash,
      passwordSalt: data.passwordSalt,
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
    const remainingProducts = allProducts.filter((p) => {
      if (p.userId === userId) {
        this.deleteProductImage(p.id);
        return false;
      }
      return true;
    });
    this.setItem(STORAGE_KEYS.PRODUCTS, remainingProducts);

    const allSales = this.getItem<Sale[]>(STORAGE_KEYS.SALES, []);
    const remainingSales = allSales.filter((s) => s.userId !== userId);
    this.setItem(STORAGE_KEYS.SALES, remainingSales);

    const allExpenses = this.getItem<Expense[]>(STORAGE_KEYS.EXPENSES, []);
    const remainingExpenses = allExpenses.filter((e) => e.userId !== userId);
    this.setItem(STORAGE_KEYS.EXPENSES, remainingExpenses);

    const watchlist = this.getItem<StockWatchItem[]>(STORAGE_KEYS.STOCK_WATCHLIST, []);
    const remainingWatchlist = watchlist.filter((w) => w.merchantId !== userId);
    this.setItem(STORAGE_KEYS.STOCK_WATCHLIST, remainingWatchlist);
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
    // 1. Wipe all products & their stored images
    const allProducts = this.getItem<Product[]>(STORAGE_KEYS.PRODUCTS, []).filter((p) => {
      if (p.userId === userId) {
        this.deleteProductImage(p.id);
        return false;
      }
      return true;
    });
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

    // 4. Clean up stock watchlist references
    const watchlist = this.getItem<StockWatchItem[]>(STORAGE_KEYS.STOCK_WATCHLIST, []).filter(
      (w) => w.merchantId !== userId && w.watcherKey !== userId
    );
    this.setItem(STORAGE_KEYS.STOCK_WATCHLIST, watchlist);

    // 5. Remove user record
    const allUsers = this.getAllUsers().filter((u) => u.id !== userId);
    this.setItem(STORAGE_KEYS.USERS, allUsers);

    // 6. Clear active session if deleting current user
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
    return all.filter((p) => p.userId === userId).map((p) => this.hydrateProduct(p));
  }

  public static getProduct(productId: string): Product | undefined {
    const all = this.getItem<Product[]>(STORAGE_KEYS.PRODUCTS, []);
    const found = all.find((p) => p.id === productId);
    return found ? this.hydrateProduct(found) : undefined;
  }

  public static saveProduct(
    productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Product {
    const all = this.getItem<Product[]>(STORAGE_KEYS.PRODUCTS, []);
    const now = new Date().toISOString();

    if (productData.id) {
      const index = all.findIndex((p) => p.id === productData.id);
      if (index !== -1) {
        const storedImageRef = this.offloadProductImage(
          productData.id,
          productData.image !== undefined ? productData.image : all[index].image
        );
        all[index] = {
          ...all[index],
          ...productData,
          image: storedImageRef,
          costPrice:
            productData.costPrice !== undefined
              ? Math.max(0, Number(productData.costPrice) || 0)
              : all[index].costPrice,
          price: Number(productData.price) || 0,
          stock: Math.max(0, parseInt(String(productData.stock), 10) || 0),
          updatedAt: now,
        } as Product;
        this.setItem(STORAGE_KEYS.PRODUCTS, all);
        return this.hydrateProduct(all[index]);
      }
    }

    const newId = 'prod_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const storedImageRef = this.offloadProductImage(newId, productData.image || '');

    const newProduct: Product = {
      id: newId,
      userId: productData.userId,
      name: productData.name.trim(),
      costPrice:
        productData.costPrice !== undefined ? Math.max(0, Number(productData.costPrice) || 0) : undefined,
      price: Number(productData.price) || 0,
      stock: Math.max(0, parseInt(String(productData.stock), 10) || 0),
      category: productData.category.trim() || 'General',
      image: storedImageRef,
      createdAt: now,
      updatedAt: now,
    };

    all.unshift(newProduct);
    this.setItem(STORAGE_KEYS.PRODUCTS, all);
    return this.hydrateProduct(newProduct);
  }

  public static deleteProduct(productId: string): void {
    this.deleteProductImage(productId);
    const all = this.getItem<Product[]>(STORAGE_KEYS.PRODUCTS, []);
    const filtered = all.filter((p) => p.id !== productId);
    this.setItem(STORAGE_KEYS.PRODUCTS, filtered);

    const watchlist = this.getItem<StockWatchItem[]>(STORAGE_KEYS.STOCK_WATCHLIST, []);
    const filteredWatchlist = watchlist.filter((w) => w.productId !== productId);
    if (filteredWatchlist.length !== watchlist.length) {
      this.setItem(STORAGE_KEYS.STOCK_WATCHLIST, filteredWatchlist);
    }
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
    return { success: true, newStock, product: this.hydrateProduct(all[index]) };
  }

  // --- Buyer Stock Watchlist & Restock Tracking ---

  public static getStockWatchlist(watcherKey: string): Array<{
    watch: StockWatchItem;
    product: Product;
    merchant?: User;
    isBackInStock: boolean;
  }> {
    const items = this.getItem<StockWatchItem[]>(STORAGE_KEYS.STOCK_WATCHLIST, []).filter(
      (w) => w.watcherKey === watcherKey
    );
    const allProducts = this.getItem<Product[]>(STORAGE_KEYS.PRODUCTS, []);
    const allUsers = this.getAllUsers();

    const results: Array<{
      watch: StockWatchItem;
      product: Product;
      merchant?: User;
      isBackInStock: boolean;
    }> = [];

    for (const watch of items) {
      const rawProduct = allProducts.find((p) => p.id === watch.productId);
      if (!rawProduct) continue;
      const product = this.hydrateProduct(rawProduct);
      const merchant = allUsers.find((u) => u.id === product.userId);
      if (merchant?.isDeactivated) continue;
      const isBackInStock = watch.stockWhenWatched <= 0 && product.stock > 0;
      results.push({ watch, product, merchant, isBackInStock });
    }

    return results;
  }

  public static isProductWatched(watcherKey: string, productId: string): boolean {
    const items = this.getItem<StockWatchItem[]>(STORAGE_KEYS.STOCK_WATCHLIST, []);
    return items.some((w) => w.watcherKey === watcherKey && w.productId === productId);
  }

  public static toggleWatchProduct(watcherKey: string, product: Product): boolean {
    const items = this.getItem<StockWatchItem[]>(STORAGE_KEYS.STOCK_WATCHLIST, []);
    const existingIdx = items.findIndex(
      (w) => w.watcherKey === watcherKey && w.productId === product.id
    );

    if (existingIdx !== -1) {
      items.splice(existingIdx, 1);
      this.setItem(STORAGE_KEYS.STOCK_WATCHLIST, items);
      return false;
    }

    items.unshift({
      watcherKey,
      productId: product.id,
      merchantId: product.userId,
      stockWhenWatched: product.stock,
      watchedAt: new Date().toISOString(),
    });
    this.setItem(STORAGE_KEYS.STOCK_WATCHLIST, items);
    return true;
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
    if (userId !== 'usr_my_merchant') return;
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
