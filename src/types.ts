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
