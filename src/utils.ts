import { Expense, Sale } from './types.ts';

/**
 * Format a number into currency display with the merchant's symbol.
 */
export function formatCurrency(amount: number, symbol: string = '₦'): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return `${symbol}0.00`;
  }
  return `${symbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format integer or clean decimal number.
 */
export function formatNumber(val: number): string {
  if (isNaN(val) || val === null || val === undefined) return '0';
  return val.toLocaleString('en-US');
}

/**
 * Extract clean numeric float from a string containing numbers and commas.
 */
export function parseSanitizedNumber(val: string): number {
  if (!val) return 0;
  // Remove commas, spaces, currency symbols
  const clean = val.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Attach real-time input sanitization that restricts inputs using regex
 * to numbers and formatting commas/decimal only.
 */
export function attachNumberSanitizer(
  inputEl: HTMLInputElement,
  onCleanVal?: (num: number) => void
): () => void {
  const handler = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const original = target.value;

    // Filter out any disallowed character (only allow digits, period, comma)
    let sanitized = original.replace(/[^0-9.,]/g, '');

    // Ensure at most one decimal point
    const parts = sanitized.split('.');
    if (parts.length > 2) {
      sanitized = parts[0] + '.' + parts.slice(1).join('').replace(/\./g, '');
    }

    if (original !== sanitized) {
      target.value = sanitized;
    }

    if (onCleanVal) {
      onCleanVal(parseSanitizedNumber(sanitized));
    }
  };

  inputEl.addEventListener('input', handler);
  return () => inputEl.removeEventListener('input', handler);
}

/**
 * Format phone number into clean WhatsApp wa.me recipient digits.
 * Handles common African/international formats (e.g. 0803... -> 234803...).
 */
export function sanitizeWhatsAppPhone(phone: string): string {
  if (!phone) return '';
  // Strip all non-digit characters
  let digits = phone.replace(/\D/g, '');

  // If starts with 0 and 11 digits (Nigerian standard local format e.g. 08012345678)
  if (digits.startsWith('0') && digits.length === 11) {
    digits = '234' + digits.substring(1);
  } else if (digits.startsWith('0') && digits.length === 10) {
    // Ghanaian local format e.g. 0241234567
    digits = '233' + digits.substring(1);
  }

  return digits;
}

/**
 * Generate a dynamic WhatsApp Click-to-Chat Link.
 * Pre-formats direct message with product name, price, and current stock status.
 */
export function generateWhatsAppOrderLink(params: {
  phone: string;
  storeName: string;
  productName: string;
  price: number;
  currency: string;
  stock: number;
}): string {
  const cleanPhone = sanitizeWhatsAppPhone(params.phone);
  const stockStatus =
    params.stock === 0
      ? 'Out of Stock (Pre-order Inquiry)'
      : params.stock < 5
      ? `Low Stock (${params.stock} left)`
      : `In Stock (${params.stock} available)`;

  const message = [
    `Hello ${params.storeName}! 🛍️`,
    `I would like to place an order from your ShopKepa storefront:`,
    ``,
    `📦 Product: *${params.productName}*`,
    `💰 Price: *${formatCurrency(params.price, params.currency)}*`,
    `📊 Stock Status: *${stockStatus}*`,
    ``,
    `Please confirm order availability and payment details. Thank you!`,
  ].join('\n');

  const encoded = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encoded}`;
}

/**
 * Convert and compress an image file selection to a Base64 string.
 * Resizes large images (e.g. phone camera captures) to fit within maxDimension
 * using an HTML5 Canvas, dramatically reducing file size while keeping crisp quality.
 */
export function fileToBase64(
  file: File,
  maxDimension: number = 800,
  quality: number = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    // If not an image, fallback to raw FileReader
    if (!file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const rawDataUrl = e.target?.result as string;
      if (!rawDataUrl) {
        resolve('');
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;

          // If image is already smaller than maxDimension and under 250KB, preserve it
          if (width <= maxDimension && height <= maxDimension && file.size < 250000) {
            resolve(rawDataUrl);
            return;
          }

          // Scale proportionally to fit within maxDimension
          if (width > height) {
            if (width > maxDimension) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }

          // Smooth interpolation
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Compress to JPEG (or PNG if original was transparent PNG)
          const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const compressedDataUrl = canvas.toDataURL(outputType, quality);
          resolve(compressedDataUrl);
        } catch {
          // If canvas operations fail, return original raw DataURL
          resolve(rawDataUrl);
        }
      };
      img.onerror = () => {
        resolve(rawDataUrl);
      };
      img.src = rawDataUrl;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}


/**
 * Download sales records as an offline CSV file.
 */
export function exportSalesToCSV(
  sales: Sale[],
  currency: string,
  storeName: string = 'ShopKepa'
): void {
  const headers = [
    'Sale ID',
    'Date & Time',
    'Customer Name',
    'Customer Phone',
    'Products Ordered',
    'Total Units',
    `Total Amount (${currency})`,
    'Status',
    'Payment Method',
    'Notes / Remarks',
  ];

  const escapeCSV = (str: string | number | undefined | null) => {
    if (str === undefined || str === null) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = sales.map((sale) => {
    const productsStr = sale.items
      .map((item) => `${item.productName} (x${item.quantity} @ ${item.unitPrice})`)
      .join('; ');
    const totalUnits = sale.items.reduce((sum, item) => sum + (item.quantity || 1), 0);

    return [
      escapeCSV(sale.id),
      escapeCSV(new Date(sale.createdAt).toLocaleString()),
      escapeCSV(sale.customerName),
      escapeCSV(sale.customerPhone || 'N/A'),
      escapeCSV(productsStr),
      escapeCSV(totalUnits),
      escapeCSV(sale.totalAmount.toFixed(2)),
      escapeCSV(sale.status.toUpperCase()),
      escapeCSV(sale.paymentMethod),
      escapeCSV(sale.notes || ''),
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const cleanStore = storeName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const dateStamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${cleanStore}_sales_records_${dateStamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export buyer purchases and debts ledger to CSV.
 */
export function exportBuyerLedgerToCSV(
  purchases: Sale[],
  currency: string,
  buyerName: string = 'Buyer'
): void {
  const headers = [
    'Record ID',
    'Date & Time',
    'Merchant / Store',
    'Merchant Phone',
    'Products Ordered',
    'Total Units',
    `Total Amount (${currency})`,
    'Status',
    'Payment Notes',
  ];

  const escapeCSV = (str: string | number | undefined | null) => {
    if (str === undefined || str === null) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = purchases.map((p) => {
    const productsStr = p.items
      .map((item) => `${item.productName} (x${item.quantity})`)
      .join('; ');
    const totalUnits = p.items.reduce((sum, item) => sum + (item.quantity || 1), 0);

    return [
      escapeCSV(p.id),
      escapeCSV(new Date(p.createdAt).toLocaleString()),
      escapeCSV(p.merchantStoreName || 'Marketplace Merchant'),
      escapeCSV(p.merchantPhone || 'N/A'),
      escapeCSV(productsStr),
      escapeCSV(totalUnits),
      escapeCSV(p.totalAmount.toFixed(2)),
      escapeCSV(p.status === 'completed' ? 'PAID' : 'PENDING DEBT (OWING)'),
      escapeCSV(p.notes || ''),
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const cleanName = buyerName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const dateStamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${cleanName}_orders_and_debts_${dateStamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format relative or localized date.
 */
export function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

export type DebtDueStatus = 'overdue' | 'due_today' | 'upcoming' | 'none';

/**
 * Determine whether a debt record is overdue, due today, or upcoming.
 */
export function getDebtDueStatus(dueDateStr?: string): {
  status: DebtDueStatus;
  label: string;
  daysDiff: number;
} {
  if (!dueDateStr) {
    return { status: 'none', label: 'No due date', daysDiff: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDateStr);
  due.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - today.getTime();
  const daysDiff = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (daysDiff < 0) {
    const lateDays = Math.abs(daysDiff);
    return {
      status: 'overdue',
      label: `Overdue by ${lateDays} day${lateDays === 1 ? '' : 's'}`,
      daysDiff,
    };
  } else if (daysDiff === 0) {
    return {
      status: 'due_today',
      label: 'Due Today',
      daysDiff: 0,
    };
  } else {
    return {
      status: 'upcoming',
      label: `Due in ${daysDiff} day${daysDiff === 1 ? '' : 's'}`,
      daysDiff,
    };
  }
}

export interface DebtReminderParams {
  buyerPhone: string;
  buyerName: string;
  merchantStoreName: string;
  merchantPhone?: string;
  sale: Sale;
  currency: string;
  bankPaymentDetails?: string;
  tone?: 'friendly' | 'formal' | 'urgent';
  customNotes?: string;
}

/**
 * Builds the pre-filled text template for a WhatsApp debt notice
 * with multiple tone options: 'friendly', 'formal', or 'urgent'.
 */
export function buildDebtReminderText(params: DebtReminderParams): string {
  const tone = params.tone || 'formal';
  const dueInfo = getDebtDueStatus(params.sale.dueDate);
  const currency = params.currency || '₦';

  // Format individual item breakdown
  const itemsText = params.sale.items
    .map((item, index) => {
      const lineTotal = item.subtotal || item.quantity * item.unitPrice;
      return `${index + 1}. *${item.productName}*\n   Qty: ${item.quantity} × ${formatCurrency(item.unitPrice, currency)} = *${formatCurrency(lineTotal, currency)}*`;
    })
    .join('\n');

  const txDate = new Date(params.sale.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const dueDateText = params.sale.dueDate
    ? new Date(params.sale.dueDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Immediate / Pending Settlement';

  const buyerName = params.buyerName?.trim() || 'Valued Customer';
  const storeName = params.merchantStoreName?.trim() || 'Our Store';
  const totalAmount = formatCurrency(params.sale.totalAmount, currency);

  const messageParts: string[] = [];

  if (tone === 'friendly') {
    messageParts.push(
      `🤝 *FRIENDLY PAYMENT REMINDER*`,
      `Hello *${buyerName}*, hope your day is going well! 😊`,
      ``,
      `This is a gentle check-in from *${storeName}* regarding your purchase made on *${txDate}*.`,
      ``,
      `📦 *Items Purchased on Credit:*`,
      itemsText,
      ``,
      `💰 *Outstanding Balance:* *${totalAmount}*`,
      `📅 *Payment Due Date:* ${dueDateText} ${dueInfo.status === 'overdue' ? '⚠️ (Past Due)' : ''}`
    );
  } else if (tone === 'urgent') {
    messageParts.push(
      `⚠️ *URGENT: OVERDUE DEBT SETTLEMENT NOTICE*`,
      `ATTENTION: *${buyerName}*,`,
      ``,
      `Records at *${storeName}* show that payment for the goods provided to you on credit is now *PAST DUE*.`,
      ``,
      `📦 *Goods Awaiting Immediate Settlement:*`,
      itemsText,
      ``,
      `🚨 *TOTAL OUTSTANDING BALANCE:* *${totalAmount}*`,
      `📅 *Transaction Date:* ${txDate}`,
      `⏰ *Agreed Due Date:* *${dueDateText}* ⚠️ (${dueInfo.label.toUpperCase()})`
    );
  } else {
    // Formal / standard business invoice
    let statusHeader = '📋 *PAYMENT INVOICE & DUE STATEMENT*';
    if (dueInfo.status === 'overdue') {
      statusHeader = `⚠️ *URGENT: PAYMENT OVERDUE REMINDER (${dueInfo.label.toUpperCase()})*`;
    } else if (dueInfo.status === 'due_today') {
      statusHeader = '⏳ *PAYMENT REMINDER: DUE TODAY*';
    }

    messageParts.push(
      statusHeader,
      `Hello *${buyerName}*,`,
      ``,
      `This is an official payment notice from *${storeName}* regarding the goods purchased on credit.`,
      ``,
      `📦 *DETAILS OF GOODS OWING:*`,
      itemsText,
      ``,
      `💰 *TOTAL BALANCE OUTSTANDING:* *${totalAmount}*`,
      `📅 *Transaction Date:* ${txDate}`,
      `⏰ *Payment Due Date:* *${dueDateText}* ${dueInfo.status === 'overdue' ? '⚠️ (OVERDUE)' : ''}`
    );
  }

  if (params.sale.notes && params.sale.notes.trim()) {
    messageParts.push(`📝 *Reference Notes:* ${params.sale.notes.trim()}`);
  }

  if (params.customNotes && params.customNotes.trim()) {
    messageParts.push(`📌 *Merchant Note:* ${params.customNotes.trim()}`);
  }

  if (params.bankPaymentDetails && params.bankPaymentDetails.trim()) {
    messageParts.push(
      ``,
      `🏦 *BANK TRANSFER DETAILS:*`,
      params.bankPaymentDetails.trim()
    );
  }

  if (tone === 'friendly') {
    messageParts.push(
      ``,
      `Whenever you have a moment, kindly arrange payment or reply with the transfer receipt. Thank you so much for your business and partnership! 🙏`,
      ``,
      `Warm regards,`,
      `— *${storeName}*`
    );
  } else if (tone === 'urgent') {
    messageParts.push(
      ``,
      `Please arrange immediate settlement of this balance into the bank account above to keep your account in good standing. Send proof of payment once processed.`,
      ``,
      `Thank you for your prompt cooperation.`,
      `— *${storeName}*`
    );
  } else {
    messageParts.push(
      ``,
      `Please arrange to settle this balance as soon as possible. Kindly reply to this WhatsApp chat or forward the payment receipt once processed.`,
      ``,
      `Thank you for your prompt cooperation! 🙏`,
      `— *${storeName}*`
    );
  }

  return messageParts.join('\n');
}

/**
 * Generate a pre-formatted, detailed WhatsApp message click-to-chat link from merchant to buyer
 * detailing the goods they are owing when payment time is due.
 */
export function generateWhatsAppDebtReminderLink(params: DebtReminderParams): string {
  const cleanPhone = sanitizeWhatsAppPhone(params.buyerPhone);
  const text = buildDebtReminderText(params);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

/**
 * Triggers a browser native notification when stock drops to or below threshold.
 */
export function triggerLowStockBrowserNotification(
  productName: string,
  stockLeft: number,
  threshold: number
): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    const isOut = stockLeft <= 0;
    const title = isOut ? `🚨 Out of Stock: ${productName}` : `⚠️ Low Stock Warning: ${productName}`;
    const body = isOut
      ? `${productName} is completely OUT OF STOCK! Restock immediately to avoid missed sales.`
      : `${productName} has only ${stockLeft} unit${stockLeft === 1 ? '' : 's'} left (below threshold of ${threshold}).`;

    try {
      new Notification(title, {
        body,
        icon: '📦',
        tag: `stock-${productName}-${Date.now()}`,
      });
    } catch {
      // Notification failed in iframe/unsupported context
    }
  }
}

/**
 * Request browser notification permission.
 */
export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Export merchant expenses to CSV file.
 */
export function exportExpensesToCSV(
  expenses: Expense[],
  currency: string,
  storeName: string = 'ShopKepa'
): void {
  const headers = [
    'Expense ID',
    'Date',
    'Category',
    'Title / Description',
    `Amount (${currency})`,
    'Payment Channel',
    'Vendor / Payee',
    'Notes / Details',
  ];

  const escapeCSV = (str: string | number | undefined | null) => {
    if (str === undefined || str === null) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = expenses.map((exp) => [
    escapeCSV(exp.id),
    escapeCSV(new Date(exp.date || exp.createdAt).toLocaleDateString()),
    escapeCSV(exp.category),
    escapeCSV(exp.title),
    escapeCSV(exp.amount.toFixed(2)),
    escapeCSV(exp.paymentMethod || 'Cash'),
    escapeCSV(exp.vendor || 'N/A'),
    escapeCSV(exp.notes || ''),
  ].join(','));

  const csvContent = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const cleanStore = storeName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const dateStamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${cleanStore}_expenses_overhead_${dateStamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
