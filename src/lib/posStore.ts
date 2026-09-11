// POS Store & Types for Restaurant Operating System (9 Pillars)
import { Product, Table, Order, Restaurant } from './supabase';

export interface CartItemOption {
  name: string;
  price: number;
}

export interface POSCartItem {
  id: string; // unique item id in cart
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  options?: CartItemOption[];
  station?: 'kitchen' | 'bar' | 'bakery' | 'grill';
  discountAmount?: number; // item specific discount
  originalPrice?: number;
  barcode?: string;
  stockQty?: number;
  sugar_level?: string;
  selectedOptions?: Record<string, string>;
}

export interface HeldBill {
  id: string;
  heldAt: string;
  title: string; // e.g. "طاولة 4" or "عميل: محمد"
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  tableId?: string;
  tableNumber?: string | number;
  cart: POSCartItem[];
  discountType: 'fixed' | 'percentage';
  discountValue: number;
  notes?: string;
  total: number;
}

export interface CashTransaction {
  id: string;
  type: 'cash_in' | 'cash_out';
  amount: number;
  reason: string;
  performedBy: string;
  timestamp: string;
}

export interface ShiftRecord {
  id: string;
  restaurantId: string;
  cashierName: string;
  cashierPin: string;
  role: 'cashier' | 'manager' | 'admin';
  openedAt: string;
  closedAt?: string;
  isOpen: boolean;
  startingCash: number;
  closingCashActual?: number;
  closingCashExpected?: number;
  difference?: number;
  cashSales: number;
  cardSales: number;
  walletSales: number;
  cashOrdersCount?: number;
  cardOrdersCount?: number;
  walletOrdersCount?: number;
  totalSales: number;
  totalTax: number;
  totalServiceFee: number;
  totalDiscounts: number;
  totalTips: number;
  totalVoids: number;
  totalRefunds: number;
  ordersCount: number;
  orders?: any[];
  transactions: CashTransaction[];
  notes?: string;
}

export interface WasteRecord {
  id: string;
  restaurantId: string;
  productId: string;
  productName: string;
  quantity: number;
  costEstimate: number;
  reason: 'expired' | 'damaged' | 'burned' | 'preparation_error' | 'other';
  reasonText?: string;
  recordedBy: string;
  recordedAt: string;
}

export interface POSAuditLog {
  id: string;
  action: 'void_item' | 'create_order' | 'apply_large_discount' | 'refund_order' | 'cash_out' | 'open_shift' | 'close_shift' | 'override_stock';
  description: string;
  performedBy: string;
  authorizedBy?: string;
  timestamp: string;
  details?: any;
}

export interface StockInventoryItem {
  id: string;
  productId: string;
  productName: string;
  currentStock: number;
  minStockAlert: number;
  unit: string;
  isAvailable: boolean;
  costPrice: number;
}

// Default Manager PINs for rapid authentication
export const DEFAULT_MANAGER_PIN = '1234';
export const DEFAULT_CASHIER_PIN = '0000';

export function getStationForCategory(categoryName?: string): 'kitchen' | 'bar' | 'bakery' | 'grill' {
  if (!categoryName) return 'kitchen';
  const name = categoryName.toLowerCase();
  if (name.includes('مشروب') || name.includes('عصير') || name.includes('قهوة') || name.includes('drink') || name.includes('beverage') || name.includes('بار')) {
    return 'bar';
  }
  if (name.includes('حلو') || name.includes('كيك') || name.includes('dessert') || name.includes('sweet') || name.includes('حلويات') || name.includes('مخبوز')) {
    return 'bakery';
  }
  if (name.includes('مشوي') || name.includes('شاورما') || name.includes('grill') || name.includes('برجر') || name.includes('burger')) {
    return 'grill';
  }
  return 'kitchen';
}

export function formatStationLabel(station: 'kitchen' | 'bar' | 'bakery' | 'grill'): { label: string; icon: string; color: string } {
  switch (station) {
    case 'bar':
      return { label: 'بار المشروبات', icon: '☕', color: 'bg-amber-600' };
    case 'bakery':
      return { label: 'قسم الحلواني والمخبوزات', icon: '🍰', color: 'bg-pink-600' };
    case 'grill':
      return { label: 'محطة الشواية والبرجر', icon: '🥩', color: 'bg-red-600' };
    case 'kitchen':
    default:
      return { label: 'المطبخ الرئيسي', icon: '🍳', color: 'bg-blue-600' };
  }
}
