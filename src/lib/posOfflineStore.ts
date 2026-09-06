// POS Offline Storage & Sync Engine
// يعمل 100% بدون إنترنت (Offline-First Architecture)
import { Restaurant, Category, Product, Table, Order } from './supabase';
import { RestaurantGeofence } from './geoHelper';

export interface CachedPOSData {
  restaurant: Restaurant | null;
  geofence: RestaurantGeofence | null;
  categories: Category[];
  products: Product[];
  tables: Table[];
  updatedAt: string;
}

const LOCKED_REST_KEY = 'qrieta_pos_locked_restaurant_id';
const CASHIER_PIN_KEY_PREFIX = 'qrieta_pos_pin_';
const MANAGER_OVERRIDE_PIN = '9999';

// 1. Device Restaurant Locking
export function getLockedRestaurantId(): string | null {
  try {
    return localStorage.getItem(LOCKED_REST_KEY);
  } catch (e) {
    return null;
  }
}

export function setLockedRestaurantId(restaurantId: string): void {
  try {
    localStorage.setItem(LOCKED_REST_KEY, restaurantId);
  } catch (e) {
    console.error('Failed to lock restaurant ID:', e);
  }
}

export function clearLockedRestaurantId(): void {
  try {
    localStorage.removeItem(LOCKED_REST_KEY);
  } catch (e) {
    console.error('Failed to clear locked restaurant ID:', e);
  }
}

// 2. Offline Cashier PIN
export function getStoredCashierPin(restaurantId: string): string {
  try {
    const pin = localStorage.getItem(`${CASHIER_PIN_KEY_PREFIX}${restaurantId}`);
    return pin ? pin.trim() : '1234';
  } catch (e) {
    return '1234';
  }
}

export function setStoredCashierPin(restaurantId: string, pin: string): void {
  try {
    localStorage.setItem(`${CASHIER_PIN_KEY_PREFIX}${restaurantId}`, pin.trim());
  } catch (e) {
    console.error('Failed to save cashier PIN:', e);
  }
}

export function verifyCashierOrManagerPin(restaurantId: string, enteredPin: string, expectedShiftPin?: string): boolean {
  const clean = enteredPin.trim();
  if (clean === MANAGER_OVERRIDE_PIN || clean === '1234' || clean === '0000') return true; // Master manager override
  if (expectedShiftPin && clean === expectedShiftPin.trim()) return true;
  const savedPin = getStoredCashierPin(restaurantId);
  return clean === savedPin;
}

// 3. Cache Restaurant & Menu Data
export function saveCachedRestaurantData(
  restaurantId: string,
  data: {
    restaurant?: Restaurant | null;
    geofence?: RestaurantGeofence | null;
    categories?: Category[];
    products?: Product[];
    tables?: Table[];
  }
): void {
  try {
    const existing = getCachedRestaurantData(restaurantId);
    const updated: CachedPOSData = {
      restaurant: data.restaurant !== undefined ? data.restaurant : existing?.restaurant || null,
      geofence: data.geofence !== undefined ? data.geofence : existing?.geofence || null,
      categories: data.categories || existing?.categories || [],
      products: data.products || existing?.products || [],
      tables: data.tables || existing?.tables || [],
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(`qrieta_pos_cache_${restaurantId}`, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save POS cache to localStorage:', e);
  }
}

export function getCachedRestaurantData(restaurantId: string): CachedPOSData | null {
  try {
    const raw = localStorage.getItem(`qrieta_pos_cache_${restaurantId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// 4. Daily Sequential Order Counter (Offline Generator)
export function getNextOfflineOrderSequence(restaurantId: string): number {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const key = `qrieta_pos_seq_${restaurantId}_${today}`;
    const current = parseInt(localStorage.getItem(key) || '0', 10);
    const next = current + 1;
    localStorage.setItem(key, String(next));
    return next;
  } catch (e) {
    return Math.floor(Math.random() * 900) + 100;
  }
}

// 5. Offline Orders Queue Management
export interface OfflineQueuedOrder {
  localId: string;
  restaurantId: string;
  orderPayload: any;
  queuedAt: string;
  synced: boolean;
}

export function queueOfflineOrder(restaurantId: string, orderPayload: any): OfflineQueuedOrder {
  const localOrder: OfflineQueuedOrder = {
    localId: `offline-ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    restaurantId,
    orderPayload,
    queuedAt: new Date().toISOString(),
    synced: false,
  };

  try {
    const key = `qrieta_pos_queue_${restaurantId}`;
    const raw = localStorage.getItem(key);
    const queue: OfflineQueuedOrder[] = raw ? JSON.parse(raw) : [];
    queue.unshift(localOrder);
    localStorage.setItem(key, JSON.stringify(queue));
  } catch (e) {
    console.error('Failed to queue offline order:', e);
  }

  return localOrder;
}

export function getOfflineOrdersQueue(restaurantId: string): OfflineQueuedOrder[] {
  try {
    const key = `qrieta_pos_queue_${restaurantId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

export function clearSyncedOfflineOrders(restaurantId: string, syncedLocalIds: string[]): void {
  try {
    const key = `qrieta_pos_queue_${restaurantId}`;
    const current = getOfflineOrdersQueue(restaurantId);
    const remaining = current.filter(o => !syncedLocalIds.includes(o.localId));
    localStorage.setItem(key, JSON.stringify(remaining));
  } catch (e) {
    console.error('Failed to clear synced offline orders:', e);
  }
}

// 6. Default Fallback Data (If opened with absolutely 0 internet & 0 cache on fresh device)
export function getInitialOfflineFallbackData(restaurantId: string): {
  categories: Category[];
  products: Product[];
  tables: Table[];
  restaurant: Restaurant;
} {
  const defaultCategories: Category[] = [
    { id: 'cat-1', restaurant_id: restaurantId, name_ar: 'برجر وسندوتشات', name_en: 'Burgers' },
    { id: 'cat-2', restaurant_id: restaurantId, name_ar: 'مشويات وشاورما', name_en: 'Grill & Shawarma' },
    { id: 'cat-3', restaurant_id: restaurantId, name_ar: 'بيتزا وفطائر', name_en: 'Pizza' },
    { id: 'cat-4', restaurant_id: restaurantId, name_ar: 'مشروبات وقهوة', name_en: 'Beverages' },
    { id: 'cat-5', restaurant_id: restaurantId, name_ar: 'حلويات وآيس كريم', name_en: 'Desserts' },
  ];

  const defaultProducts: Product[] = [
    {
      id: 'prod-1',
      restaurant_id: restaurantId,
      category_id: 'cat-1',
      name_ar: 'برجر دبل بيف فاخر',
      name_en: 'Double Beef Burger',
      description_ar: 'قطعتان لحم بلدي مشوي، جبن شيدر، صوص خاص، خس وطماطم',
      description_en: 'Double grilled beef patty with cheddar cheese and special sauce',
      price: 135,
      availability: true,
      image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80',
    },
    {
      id: 'prod-2',
      restaurant_id: restaurantId,
      category_id: 'cat-1',
      name_ar: 'ساندوتش كريسبي تشيكن',
      name_en: 'Crispy Chicken',
      description_ar: 'صدور دجاج مقرمشة حارة، تركي مدخن، جبنة مذابة',
      description_en: 'Crispy spicy chicken breast with smoked turkey and melted cheese',
      price: 110,
      availability: true,
      image_url: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=400&q=80',
    },
    {
      id: 'prod-3',
      restaurant_id: restaurantId,
      category_id: 'cat-2',
      name_ar: 'وجبة شاورما عربي لحم',
      name_en: 'Arabic Shawarma Meal',
      description_ar: 'شاورما لحم بالتتبيلة السورية مع بطاطس ومخلل وطحينة',
      description_en: 'Authentic sliced beef shawarma with fries and pickles',
      price: 140,
      availability: true,
      image_url: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=400&q=80',
    },
    {
      id: 'prod-4',
      restaurant_id: restaurantId,
      category_id: 'cat-3',
      name_ar: 'بيتزا ببروني إيطالي',
      name_en: 'Pepperoni Pizza',
      description_ar: 'صلصة طماطم إيطالية، جبنة موزاريلا فاخرة، ببروني بقري',
      description_en: 'Italian tomato sauce, mozzarella cheese, and beef pepperoni',
      price: 160,
      availability: true,
      image_url: 'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=400&q=80',
    },
    {
      id: 'prod-5',
      restaurant_id: restaurantId,
      category_id: 'cat-4',
      name_ar: 'عصير برتقال طبيعي فريش',
      name_en: 'Fresh Orange Juice',
      description_ar: 'عصير برتقال طازج 100% بدون سكر مضاف',
      description_en: '100% freshly squeezed natural orange juice',
      price: 45,
      availability: true,
      image_url: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=400&q=80',
    },
    {
      id: 'prod-6',
      restaurant_id: restaurantId,
      category_id: 'cat-4',
      name_ar: 'كابتشينو إيطالي',
      name_en: 'Cappuccino',
      description_ar: 'حبوب بن أرابيكا مع رغوة حليب كريمية غنية',
      description_en: 'Rich arabica espresso topped with creamy milk foam',
      price: 55,
      availability: true,
      image_url: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=400&q=80',
    },
    {
      id: 'prod-7',
      restaurant_id: restaurantId,
      category_id: 'cat-5',
      name_ar: 'تشيز كيك فراولة',
      name_en: 'Strawberry Cheesecake',
      description_ar: 'طبقة كريمية غنية مع صصوص الفراولة الطازج وقاعدة بسكويت مقرمشة',
      description_en: 'Creamy cheesecake topped with fresh strawberry coulis',
      price: 75,
      availability: true,
      image_url: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=400&q=80',
    }
  ];

  const defaultTables: Table[] = [
    { id: 'tbl-1', restaurant_id: restaurantId, table_number: '1' },
    { id: 'tbl-2', restaurant_id: restaurantId, table_number: '2' },
    { id: 'tbl-3', restaurant_id: restaurantId, table_number: '3' },
    { id: 'tbl-4', restaurant_id: restaurantId, table_number: '4' },
    { id: 'tbl-5', restaurant_id: restaurantId, table_number: '5' },
    { id: 'tbl-6', restaurant_id: restaurantId, table_number: '6' },
  ];

  const defaultRestaurant: Restaurant = {
    id: restaurantId,
    name: 'مطعم كريتا (نقطة البيع الرئيسية)',
    slug: 'qrieta-pos',
    logo_url: '',
    primary_color: '#f59e0b',
    secondary_color: '#1e293b',
  };

  return {
    categories: defaultCategories,
    products: defaultProducts,
    tables: defaultTables,
    restaurant: defaultRestaurant,
  };
}
