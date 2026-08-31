// Geofencing and Location Helper for Restaurant QR Protection & Extra Settings

export interface RestaurantGeofence {
  geofence_enabled?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius_meters?: number;
  service_fee_percentage?: number;
  is_prepaid?: boolean;
  payment_model?: 'prepaid' | 'postpaid';
}

// Calculate distance in meters between two GPS coordinates using Haversine formula
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// Get user's current GPS position with high accuracy
export function getCurrentPosition(): Promise<{ latitude: number; longitude: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('متصفحك لا يدعم خاصية تحديد الموقع الجغرافي (Geolocation)'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy || 0,
        });
      },
      (error) => {
        let msg = 'تعذر الوصول إلى الموقع الجغرافي.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'تم رفض الإذن بالوصول للموقع الجغرافي. يرجى تفعيل إذن الموقع للمتابعة.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'معلومات الموقع غير متوفرة حالياً.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'انتهت مهلة طلب تحديد الموقع.';
        }
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  });
}

// Local storage key for cached restaurant geofences
const GEOFENCE_STORAGE_KEY = 'qreta_restaurant_geofences';

export function getLocalRestaurantGeofence(restaurantId: string): RestaurantGeofence | null {
  try {
    const raw = localStorage.getItem(GEOFENCE_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data[restaurantId] || null;
  } catch (e) {
    return null;
  }
}

export function saveLocalRestaurantGeofence(restaurantId: string, geofence: RestaurantGeofence) {
  try {
    const raw = localStorage.getItem(GEOFENCE_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    data[restaurantId] = geofence;
    localStorage.setItem(GEOFENCE_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save local geofence:', e);
  }
}

export async function syncRestaurantGeofence(restaurantId: string, geofence: RestaurantGeofence, slug?: string): Promise<boolean> {
  saveLocalRestaurantGeofence(restaurantId, geofence);
  if (slug) {
    saveLocalRestaurantGeofence(slug, geofence);
  }
  try {
    const res = await fetch('/api/restaurants/geofence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurantId, geofence, slug }),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function fetchAllServerGeofences(): Promise<Record<string, RestaurantGeofence>> {
  try {
    const res = await fetch('/api/restaurants/geofence');
    if (res.ok) {
      const data = await res.json();
      if (data && data.geofences) {
        // Cache locally
        try {
          localStorage.setItem(GEOFENCE_STORAGE_KEY, JSON.stringify(data.geofences));
        } catch (e) {}
        return data.geofences;
      }
    }
  } catch (e) {
    console.warn('Could not fetch server geofences:', e);
  }
  
  // Fallback to local storage
  try {
    const raw = localStorage.getItem(GEOFENCE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
