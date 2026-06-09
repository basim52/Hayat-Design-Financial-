/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Category = 'materials' | 'marketing' | 'maintenance' | 'wages' | 'other';
export type ProductType = 'acrylic' | 'wood' | 'svg' | 'other';

export interface BudgetTarget {
  id: string;
  userId: string;
  category: Category;
  amount: number;
  month: string; // YYYY-MM
  createdAt: any;
}

export interface Expense {
  id: string;
  userId: string;
  category: Category;
  amount: number;
  date: string; // ISO string
  description: string;
  createdAt: any;
  paymentMethod?: string;
  taxAmount?: number;
}

export interface Revenue {
  id: string;
  userId: string;
  amount: number;
  productType: ProductType;
  orderNumber: string;
  description: string;
  date: string; // ISO string
  createdAt: any;
  paymentMethod?: string;
  taxAmount?: number;
}

export interface WasteItem {
  id: string;
  userId: string;
  material: string;
  estimatedCost: number;
  reason: string;
  date: string; // ISO string
  createdAt: any;
}

export interface InvoiceItem {
  id: string;
  name: string;      // الصنف / المنتج
  quantity: number;  // الكمية
  price: number;     // المبلغ / السعر الفردي
  total: number;     // الإجمالي
}

export interface Invoice {
  id: string;
  userId: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone?: string;
  date: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  items: InvoiceItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  grandTotal: number;
  notes?: string;
  logoPreset?: string; // e.g. "default", "luxury", "coffee", "creative", "none"
  customLogoBase64?: string; // Base64 uploaded logo for high fidelity image/PDF print
  createdAt: any;
}
