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
};

export type Table = {
  id: string;
  restaurant_id: string;
  table_number: string;
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
  id: number;
  restaurant_id: string;
  table_id: string | null;
  status: 'new' | 'preparing' | 'delivered' | 'cancelled';
  total_price: number;
  created_at: string;
  table?: { table_number: string };
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
