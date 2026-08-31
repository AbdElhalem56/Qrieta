export interface DeliveryZone {
  id: string;
  name: string; // e.g. "بورسعيد", "بورفؤاد", "الزهور", "المعادي"
  fee: number; // e.g. 30, 40
  estimated_time?: string; // e.g. "30-45 دقيقة"
  is_active?: boolean;
}

const DELIVERY_ZONES_STORAGE_KEY = 'qreta_restaurant_delivery_zones';

export function getLocalDeliveryZones(restaurantId: string): DeliveryZone[] {
  try {
    const raw = localStorage.getItem(DELIVERY_ZONES_STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return data[restaurantId] || [];
  } catch (e) {
    return [];
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
      if (data && data.delivery_zones) {
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
