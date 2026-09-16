import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith('http') && 
  !supabaseUrl.includes('placeholder')
);

if (!isSupabaseConfigured) {
  console.warn('Supabase URL or Anon Key is missing or using placeholder. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment for full database access.');
}

// Fallback to placeholder to ensure the app doesn't crash at module initialization
const clientUrl = isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co';
const clientKey = isSupabaseConfigured ? supabaseAnonKey : 'placeholder-anon-key';

export const supabase = createClient(clientUrl, clientKey, {
  auth: {
    persistSession: typeof window !== 'undefined',
    autoRefreshToken: typeof window !== 'undefined',
  }
});

export type RestaurantServicePreset = 
  | 'full_system' 
  | 'cloud_kitchen' 
  | 'fast_counter' 
  | 'pos_only' 
  | 'delivery_only' 
  | 'custom';

export interface RestaurantServicePresetDef {
  id: RestaurantServicePreset;
  titleAr: string;
  descAr: string;
  icon: string;
  badgeColor: string;
  services: {
    pos_enabled: boolean;
    kitchen_enabled: boolean;
    tables_enabled: boolean;
    customer_app_enabled: boolean;
    delivery_enabled: boolean;
    waiter_enabled: boolean;
  };
}

export const RESTAURANT_SERVICE_PRESETS: RestaurantServicePresetDef[] = [
  {
    id: 'full_system',
    titleAr: 'مطعم وكافيه متكامل الشامل (كل الخدمات)',
    descAr: 'كاشير + مطبخ + طاولات صالة + تطبيق زبائن الصالة + تطبيق دليفري + تطبيق الويتر',
    icon: 'Sparkles',
    badgeColor: 'bg-purple-100 text-purple-900 border-purple-200',
    services: {
      pos_enabled: true,
      kitchen_enabled: true,
      tables_enabled: true,
      customer_app_enabled: true,
      delivery_enabled: true,
      waiter_enabled: true,
    }
  },
  {
    id: 'cloud_kitchen',
    titleAr: 'مطعم سحابي / تيك أواي ومطبخ ودليفري',
    descAr: 'كاشير + مطبخ + دليفري (بدون طاولات صالة وبدون تطبيق صالة للزبائن)',
    icon: 'ChefHat',
    badgeColor: 'bg-blue-100 text-blue-900 border-blue-200',
    services: {
      pos_enabled: true,
      kitchen_enabled: true,
      tables_enabled: false,
      customer_app_enabled: false,
      delivery_enabled: true,
      waiter_enabled: false,
    }
  },
  {
    id: 'fast_counter',
    titleAr: 'كافيه سريع / كاونتر فاست فود ودليفري',
    descAr: 'كاشير + دليفري (بدون مطبخ وبدون طاولات وبدون تطبيق صالة - تسليم فوري مباشر)',
    icon: 'Zap',
    badgeColor: 'bg-amber-100 text-amber-900 border-amber-200',
    services: {
      pos_enabled: true,
      kitchen_enabled: false,
      tables_enabled: false,
      customer_app_enabled: false,
      delivery_enabled: true,
      waiter_enabled: false,
    }
  },
  {
    id: 'pos_only',
    titleAr: 'نظام كاشير ونقاط بيع فقط (POS Only)',
    descAr: 'كاشير مبيعات سريعة وفواتير ضريبية فقط (بدون مطبخ ولا طاولات ولا دليفري)',
    icon: 'MonitorCheck',
    badgeColor: 'bg-indigo-100 text-indigo-900 border-indigo-200',
    services: {
      pos_enabled: true,
      kitchen_enabled: false,
      tables_enabled: false,
      customer_app_enabled: false,
      delivery_enabled: false,
      waiter_enabled: false,
    }
  },
  {
    id: 'delivery_only',
    titleAr: 'منيو وتطبيق دليفري أونلاين فقط',
    descAr: 'قائمة طعام رقمية واستقبال طلبات دليفري وتوصيل أونلاين بدون كاشير محلي',
    icon: 'Bike',
    badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-200',
    services: {
      pos_enabled: false,
      kitchen_enabled: true,
      tables_enabled: false,
      customer_app_enabled: true,
      delivery_enabled: true,
      waiter_enabled: false,
    }
  },
  {
    id: 'custom',
    titleAr: 'تخصيص يدوي مخصص (Custom Services)',
    descAr: 'اختيار وتحديد الخدمات المناسبة للمطعم بحرية تامة',
    icon: 'Sliders',
    badgeColor: 'bg-gray-100 text-gray-900 border-gray-200',
    services: {
      pos_enabled: true,
      kitchen_enabled: true,
      tables_enabled: true,
      customer_app_enabled: true,
      delivery_enabled: true,
      waiter_enabled: true,
    }
  }
];

export const RESTAURANT_SERVICE_PRESETS_MAP: Record<RestaurantServicePreset, RestaurantServicePresetDef> = RESTAURANT_SERVICE_PRESETS.reduce((acc, curr) => {
  acc[curr.id] = curr;
  return acc;
}, {} as Record<RestaurantServicePreset, RestaurantServicePresetDef>);

export function getRestaurantPresetDef(presetId?: string | null): RestaurantServicePresetDef {
  if (presetId && RESTAURANT_SERVICE_PRESETS_MAP[presetId as RestaurantServicePreset]) {
    return RESTAURANT_SERVICE_PRESETS_MAP[presetId as RestaurantServicePreset];
  }
  return RESTAURANT_SERVICE_PRESETS[0]; // full_system
}

export interface ResolvedRestaurantServices {
  pos_enabled: boolean;
  kitchen_enabled: boolean;
  tables_enabled: boolean;
  customer_app_enabled: boolean;
  delivery_enabled: boolean;
  waiter_enabled: boolean;
  business_type_preset: RestaurantServicePreset;
}

export function resolveRestaurantServices(
  restaurant?: Partial<Restaurant> | null,
  geofence?: any
): ResolvedRestaurantServices {
  const preset: RestaurantServicePreset = 
    (geofence?.business_type_preset || restaurant?.business_type_preset || 'full_system') as RestaurantServicePreset;

  const presetDef = RESTAURANT_SERVICE_PRESETS.find(p => p.id === preset) || RESTAURANT_SERVICE_PRESETS[0];

  const getProp = (key: string): boolean | undefined => {
    if (geofence && typeof geofence[key] === 'boolean') return geofence[key];
    if (restaurant && typeof (restaurant as any)[key] === 'boolean') return (restaurant as any)[key];
    return undefined;
  };

  const pos_enabled = getProp('pos_enabled') ?? presetDef.services.pos_enabled;
  const kitchen_enabled = getProp('kitchen_enabled') ?? presetDef.services.kitchen_enabled;
  const tables_enabled = getProp('tables_enabled') ?? presetDef.services.tables_enabled;
  const customer_app_enabled = getProp('customer_app_enabled') ?? presetDef.services.customer_app_enabled;
  const delivery_enabled = getProp('delivery_enabled') ?? presetDef.services.delivery_enabled;
  const waiter_enabled = getProp('waiter_enabled') ?? presetDef.services.waiter_enabled;

  return {
    pos_enabled,
    kitchen_enabled,
    tables_enabled,
    customer_app_enabled,
    delivery_enabled,
    waiter_enabled,
    business_type_preset: preset,
  };
}

export type Restaurant = {
  id: string;
  name: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  slug: string;
  is_active?: boolean;
  service_fee_percentage?: number;
  geofence_enabled?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius_meters?: number;
  fb_pixel_id?: string;
  custom_domain?: string;
  tiktok_pixel_id?: string;
  is_prepaid?: boolean;
  payment_model?: 'prepaid' | 'postpaid';
  // Modular System Services
  pos_enabled?: boolean;
  kitchen_enabled?: boolean;
  tables_enabled?: boolean;
  customer_app_enabled?: boolean;
  delivery_enabled?: boolean;
  waiter_enabled?: boolean;
  business_type_preset?: RestaurantServicePreset;
  // POS & Tax Data
  tax_number?: string;
  commercial_registration?: string;
  tax_rate?: number;
  invoice_prefix?: string;
  address?: string;
  phone?: string;
};

export type Table = {
  id: string;
  restaurant_id: string;
  table_number: string;
  name?: string;
  is_occupied?: boolean;
  capacity?: number;
};

export type CategoryOptionChoice = {
  id: string;
  name_ar: string;
  name_en?: string;
  price?: number;
  price_delta?: number;
};

export type CategoryOption = {
  id: string;
  name_ar: string;
  name_en?: string;
  choices: CategoryOptionChoice[];
};

export type Category = {
  id: string;
  restaurant_id: string;
  name_en: string;
  name_ar: string;
  options?: CategoryOption[];
};

export type Product = {
  id: string;
  restaurant_id: string;
  category_id: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  image_url: string;
  price: number;
  availability: boolean;
  options?: CategoryOption[];
};

export type Profile = {
  id: string;
  restaurant_id: string | null;
  restaurant_name?: string | null;
  role: 'waiter' | 'admin' | 'super_admin';
  full_name: string;
  email: string;
  shift_start: string | null;
  shift_end: string | null;
  created_at: string;
  restaurants?: Restaurant;
};

export type Order = {
  id: number | string;
  restaurant_id: string;
  table_id: string | null;
  status: 'new' | 'preparing' | 'ready' | 'delivered' | 'completed' | 'cancelled';
  total_price: number;
  total_amount?: number;
  daily_order_number?: number;
  order_type?: 'dine_in' | 'takeaway' | 'delivery';
  table_number?: string | number | null;
  customer_name?: string | { name?: string };
  customer_phone?: string;
  delivery_address?: string | { address?: string };
  payment_status?: 'paid' | 'unpaid' | 'refunded' | string;
  payment_method?: 'cash' | 'card' | 'wallet' | 'split' | 'unpaid' | string;
  created_at: string;
  table?: { table_number: string };
  order_items?: any[];
  items?: any[];
  notes?: string;
  source?: string;
};

export type OrderItem = {
  id: string;
  order_id: number;
  product_id: string;
  quantity: number;
  notes: string;
  sugar_level: 'none' | 'low' | 'medium' | 'high';
  product?: Product;
};
