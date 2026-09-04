export interface CustomerProfile {
  customerName: string;
  phone: string;
  email: string;
  address: string;
  buildingNumber: string;
  floor: string;
  apartmentNumber: string;
  notes: string;
  selectedZoneId?: string;
  deliveryLocation?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    mapsUrl: string;
  } | null;
  savedAt?: string;
}

const GLOBAL_CUSTOMER_PROFILE_KEY = 'qrieta_customer_saved_profile';
const RESTAURANT_CUSTOMER_PROFILE_PREFIX = 'qrieta_customer_profile_';

export function getSavedCustomerProfile(restaurantId?: string): CustomerProfile {
  try {
    // 1. Check restaurant specific profile if available
    if (restaurantId) {
      const restRaw = localStorage.getItem(`${RESTAURANT_CUSTOMER_PROFILE_PREFIX}${restaurantId}`);
      if (restRaw) {
        const parsed = JSON.parse(restRaw);
        if (parsed && (parsed.customerName || parsed.phone || parsed.email || parsed.address)) {
          return {
            customerName: parsed.customerName || '',
            phone: parsed.phone || '',
            email: parsed.email || '',
            address: parsed.address || '',
            buildingNumber: parsed.buildingNumber || '',
            floor: parsed.floor || '',
            apartmentNumber: parsed.apartmentNumber || '',
            notes: parsed.notes || '',
            selectedZoneId: parsed.selectedZoneId || undefined,
            deliveryLocation: parsed.deliveryLocation || null,
            savedAt: parsed.savedAt
          };
        }
      }
    }

    // 2. Check global saved customer profile
    const globalRaw = localStorage.getItem(GLOBAL_CUSTOMER_PROFILE_KEY);
    if (globalRaw) {
      const parsed = JSON.parse(globalRaw);
      if (parsed) {
        return {
          customerName: parsed.customerName || '',
          phone: parsed.phone || '',
          email: parsed.email || '',
          address: parsed.address || '',
          buildingNumber: parsed.buildingNumber || '',
          floor: parsed.floor || '',
          apartmentNumber: parsed.apartmentNumber || '',
          notes: parsed.notes || '',
          selectedZoneId: parsed.selectedZoneId || undefined,
          deliveryLocation: parsed.deliveryLocation || null,
          savedAt: parsed.savedAt
        };
      }
    }
  } catch (e) {
    console.warn('Failed to load saved customer profile:', e);
  }

  return {
    customerName: '',
    phone: '',
    email: '',
    address: '',
    buildingNumber: '',
    floor: '',
    apartmentNumber: '',
    notes: '',
    selectedZoneId: undefined,
    deliveryLocation: null
  };
}

export function saveCustomerProfile(profile: Partial<CustomerProfile>, restaurantId?: string): void {
  try {
    const existing = getSavedCustomerProfile(restaurantId);
    const updated: CustomerProfile = {
      ...existing,
      ...profile,
      savedAt: new Date().toISOString()
    };

    // Save global profile so it automatically works across all visits/restaurants
    localStorage.setItem(GLOBAL_CUSTOMER_PROFILE_KEY, JSON.stringify(updated));

    // Also persist under restaurant-specific key for custom zone/notes
    if (restaurantId) {
      localStorage.setItem(`${RESTAURANT_CUSTOMER_PROFILE_PREFIX}${restaurantId}`, JSON.stringify(updated));
    }
  } catch (e) {
    console.warn('Failed to persist customer profile:', e);
  }
}

export function clearCustomerProfile(restaurantId?: string): void {
  try {
    localStorage.removeItem(GLOBAL_CUSTOMER_PROFILE_KEY);
    if (restaurantId) {
      localStorage.removeItem(`${RESTAURANT_CUSTOMER_PROFILE_PREFIX}${restaurantId}`);
    }
  } catch (e) {
    console.warn('Failed to clear customer profile:', e);
  }
}
