export interface DeliveryZone {
  id: string;
  name: string; // e.g. "بورسعيد", "بورفؤاد", "الفيروز", "الحي الاماراتي"
  fee: number; // e.g. 30, 40, 50
  estimated_time?: string; // e.g. "30-45 دقيقة"
  is_active?: boolean;
}

export const DEFAULT_DELIVERY_ZONES: DeliveryZone[] = [
  { id: 'dz_ps', name: 'بورسعيد', fee: 30, estimated_time: '30-45 دقيقة', is_active: true },
  { id: 'dz_pf', name: 'بورفؤاد', fee: 40, estimated_time: '40-50 دقيقة', is_active: true },
  { id: 'dz_fy', name: 'الفيروز', fee: 50, estimated_time: '45-60 دقيقة', is_active: true },
  { id: 'dz_em', name: 'الحي الاماراتي', fee: 50, estimated_time: '45-60 دقيقة', is_active: true },
];

const DELIVERY_ZONES_STORAGE_KEY = 'qreta_restaurant_delivery_zones';

export function getLocalDeliveryZones(restaurantId: string): DeliveryZone[] {
  try {
    const raw = localStorage.getItem(DELIVERY_ZONES_STORAGE_KEY);
    if (!raw) return DEFAULT_DELIVERY_ZONES;
    const data = JSON.parse(raw);
    const zones = data[restaurantId];
    if (Array.isArray(zones) && zones.length > 0) {
      return zones;
    }
    return DEFAULT_DELIVERY_ZONES;
  } catch (e) {
    return DEFAULT_DELIVERY_ZONES;
  }
}

export function saveLocalDeliveryZones(restaurantId: string, zones: DeliveryZone[]) {
  try {
    const raw = localStorage.getItem(DELIVERY_ZONES_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    data[restaurantId] = zones;
    localStorage.setItem(DELIVERY_ZONES_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save local delivery zones:', e);
  }
}

export async function syncDeliveryZones(restaurantId: string, zones: DeliveryZone[]): Promise<boolean> {
  saveLocalDeliveryZones(restaurantId, zones);
  try {
    const res = await fetch('/api/restaurants/save-delivery-zones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurantId, delivery_zones: zones }),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function fetchAllServerDeliveryZones(): Promise<Record<string, DeliveryZone[]>> {
  try {
    const res = await fetch('/api/restaurants/delivery-zones');
    if (res.ok) {
      const data = await res.json();
      if (data && data.delivery_zones && Object.keys(data.delivery_zones).length > 0) {
        // Cache locally
        try {
          localStorage.setItem(DELIVERY_ZONES_STORAGE_KEY, JSON.stringify(data.delivery_zones));
        } catch (e) {}
        return data.delivery_zones;
      }
    }
  } catch (e) {
    console.warn('Could not fetch server delivery zones:', e);
  }

  // Fallback to local storage
  try {
    const raw = localStorage.getItem(DELIVERY_ZONES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
