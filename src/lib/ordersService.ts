// Real-time Orders & Daily Sequence Service
// Synchronizes Cashier POS, Customer App, and Admin Dashboard

export interface LiveOrder {
  id: string | number;
  daily_order_number: number;
  restaurant_id: string;
  source: 'pos' | 'customer_app';
  order_type: 'dine_in' | 'takeaway' | 'delivery';
  table_id?: string | null;
  table_number?: string | number | null;
  customer_name?: string;
  customer_phone?: string;
  delivery_address?: string;
  delivery_notes?: string;
  notes?: string;
  total_price: number;
  status: 'new' | 'preparing' | 'completed' | 'cancelled';
  payment_status: 'paid' | 'unpaid';
  payment_method?: string;
  items: Array<{
    id?: string;
    name: string;
    quantity: number;
    price: number;
    notes?: string;
    options?: any;
    sugar_level?: string;
  }>;
  created_at: string;
  updated_at?: string;
  is_offline?: boolean;
}

// 1. Get next unified sequential daily order number from server
export async function getNextDailyOrderNumber(restaurantId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const localKey = `qrieta_pos_seq_${restaurantId}_${today}`;
  let localNext = 1;

  try {
    const currentLocal = parseInt(localStorage.getItem(localKey) || '0', 10);
    localNext = currentLocal + 1;
  } catch (e) {
    localNext = 1;
  }

  try {
    const res = await fetch('/api/orders/daily-sequence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_id: restaurantId,
        action: 'next',
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.daily_order_number) {
        const serverNum = Number(data.daily_order_number);
        // Save to local cache
        try {
          localStorage.setItem(localKey, String(serverNum));
        } catch (e) {}
        return serverNum;
      }
    }
  } catch (err) {
    console.warn('Daily sequence server request failed, using local sequence counter:', err);
  }

  // Fallback to local sequence counter
  try {
    localStorage.setItem(localKey, String(localNext));
  } catch (e) {}
  return localNext;
}

// 2. Sync server sequence if Cashier generated a number locally or manually
export async function syncDailyOrderSequence(restaurantId: string, currentNumber: number): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const localKey = `qrieta_pos_seq_${restaurantId}_${today}`;
    localStorage.setItem(localKey, String(currentNumber));

    await fetch('/api/orders/daily-sequence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_id: restaurantId,
        action: 'sync',
        current_number: currentNumber,
      }),
    }).catch(() => {});
  } catch (e) {
    console.warn('Sync sequence warning:', e);
  }
}

// 3. Register live order to server & local storage
export async function registerLiveOrder(order: LiveOrder): Promise<void> {
  // 1. Save to local storage cache first
  try {
    const key = `qrieta_live_orders_${order.restaurant_id}`;
    const raw = localStorage.getItem(key);
    const list: LiveOrder[] = raw ? JSON.parse(raw) : [];
    const existingIndex = list.findIndex(o => String(o.id) === String(order.id));
    if (existingIndex >= 0) {
      list[existingIndex] = order;
    } else {
      list.unshift(order);
    }
    localStorage.setItem(key, JSON.stringify(list.slice(0, 100)));
  } catch (e) {}

  // 2. Push to server API
  try {
    await fetch('/api/orders/live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    });
  } catch (err) {
    console.warn('Could not register live order to server:', err);
  }
}

// 4. Fetch live orders for restaurant
export async function fetchLiveOrders(restaurantId: string): Promise<LiveOrder[]> {
  let serverOrders: LiveOrder[] = [];

  try {
    const res = await fetch(`/api/orders/live?restaurant_id=${encodeURIComponent(restaurantId)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.orders)) {
        serverOrders = data.orders;
      }
    }
  } catch (err) {
    console.warn('Fetch live orders server error, checking local storage:', err);
  }

  // Merge with local storage in case of offline/recent orders
  try {
    const key = `qrieta_live_orders_${restaurantId}`;
    const raw = localStorage.getItem(key);
    const localList: LiveOrder[] = raw ? JSON.parse(raw) : [];

    if (serverOrders.length === 0) {
      return localList;
    }

    const mergedMap = new Map<string, LiveOrder>();
    serverOrders.forEach(o => mergedMap.set(String(o.id), o));
    localList.forEach(o => {
      if (!mergedMap.has(String(o.id))) {
        mergedMap.set(String(o.id), o);
      }
    });

    return Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  } catch (e) {
    return serverOrders;
  }
}

// 5. Update order status
export async function updateLiveOrderStatus(
  orderId: string | number,
  restaurantId: string,
  status: 'new' | 'preparing' | 'completed' | 'cancelled',
  paymentStatus?: 'paid' | 'unpaid'
): Promise<void> {
  // Update local
  try {
    const key = `qrieta_live_orders_${restaurantId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const list: LiveOrder[] = JSON.parse(raw);
      const target = list.find(o => String(o.id) === String(orderId));
      if (target) {
        target.status = status;
        if (paymentStatus) target.payment_status = paymentStatus;
        localStorage.setItem(key, JSON.stringify(list));
      }
    }
  } catch (e) {}

  // Update server
  try {
    await fetch(`/api/orders/live/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_id: restaurantId,
        status,
        payment_status: paymentStatus,
      }),
    });
  } catch (e) {
    console.warn('Update live order status error:', e);
  }
}

// 6. Audible Chime Generator (Web Audio API - no external file needed)
export function playNewOrderAlertSound(): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Chime Note 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Chime Note 2 (Higher, cheerful tone)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880, now + 0.15); // A5
    gain2.gain.setValueAtTime(0.4, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.65);

    // Chime Note 3 (Accent)
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(1174.66, now + 0.3); // D6
    gain3.gain.setValueAtTime(0.35, now + 0.3);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.3);
    osc3.stop(now + 0.9);
  } catch (e) {
    console.warn('Audio chime playback blocked or not supported:', e);
  }
}
