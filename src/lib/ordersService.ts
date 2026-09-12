import { supabase } from './supabase';

// Real-time Orders & Daily Sequence Service
// Synchronizes Cashier POS, Customer App, and Admin Dashboard

export interface LiveOrder {
  id: string | number;
  daily_order_number: number;
  restaurant_id: string;
  source: 'pos' | 'customer_app' | 'cashier_pos';
  order_type: 'dine_in' | 'takeaway' | 'delivery';
  table_id?: string | null;
  table_number?: string | number | null;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  delivery_address?: string;
  delivery_notes?: string;
  notes?: string;
  total_price: number;
  status: 'new' | 'preparing' | 'ready' | 'delivered' | 'completed' | 'cancelled';
  payment_status: 'paid' | 'unpaid' | 'refunded';
  payment_method?: string;
  cashier_name?: string;
  cashier_id?: string;
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

// 1. Get next unified sequential daily order number from central server
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

  // 1. Prioritize central server API as authoritative sequential counter
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
        const finalNum = Math.max(serverNum, localNext);
        try {
          localStorage.setItem(localKey, String(finalNum));
        } catch (e) {}
        if (finalNum > serverNum) {
          syncDailyOrderSequence(restaurantId, finalNum).catch(() => {});
        }
        return finalNum;
      }
    }
  } catch (err) {
    console.warn('Daily sequence server request failed, falling back to database/local:', err);
  }

  // 2. Offline Fallback: check live orders and Supabase
  let dbHighestSeq = 0;
  try {
    const cachedLive = await fetchLiveOrders(restaurantId).catch(() => []);
    if (Array.isArray(cachedLive)) {
      cachedLive.forEach(o => {
        const num = Number(o.daily_order_number || 0);
        if (num > dbHighestSeq) dbHighestSeq = num;
      });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data: todayOrders } = await supabase
      .from('orders')
      .select('id, created_at, order_items(notes)')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', startOfDay.toISOString());

    if (Array.isArray(todayOrders)) {
      if (todayOrders.length > dbHighestSeq) {
        dbHighestSeq = todayOrders.length;
      }
      todayOrders.forEach(ord => {
        if (Array.isArray(ord.order_items)) {
          ord.order_items.forEach((it: any) => {
            const note = it?.notes || '';
            const match = String(note).match(/#(\d+)/);
            if (match && match[1]) {
              const parsed = parseInt(match[1], 10);
              if (!isNaN(parsed) && parsed > dbHighestSeq) {
                dbHighestSeq = parsed;
              }
            }
          });
        }
      });
    }
  } catch (dbErr) {
    console.warn('DB sequence check:', dbErr);
  }

  // Fallback to highest known sequence + 1
  const finalSeq = Math.max(localNext, dbHighestSeq + 1);
  try {
    localStorage.setItem(localKey, String(finalSeq));
  } catch (e) {}
  syncDailyOrderSequence(restaurantId, finalSeq).catch(() => {});
  return finalSeq;
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

// 4. Fetch live orders for restaurant (Server + Supabase + LocalStorage)
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
    console.warn('Fetch live orders server error, checking Supabase & local storage:', err);
  }

  // If server returned no orders or failed, query Supabase directly as robust fallback
  if (serverOrders.length === 0) {
    try {
      const { data: dbOrders, error } = await supabase
        .from('orders')
        .select('*, order_items(*, products(*)), tables(table_number)')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(60);

      if (!error && Array.isArray(dbOrders)) {
        serverOrders = dbOrders.map((dbo: any) => {
          const firstNote = dbo.order_items?.[0]?.notes || '';
          const isCustomer = firstNote.includes('[طلب زبون') || (!dbo.waiter_id && (dbo.status === 'new' || dbo.status === 'preparing'));
          const numMatch = firstNote.match(/#(\d+)/);
          const dailyNum = numMatch ? parseInt(numMatch[1], 10) : dbo.id;

          let orderType: 'dine_in' | 'delivery' | 'takeaway' = 'dine_in';
          if (firstNote.includes('دليفري')) orderType = 'delivery';
          else if (firstNote.includes('سفري')) orderType = 'takeaway';

          const tableNumMatch = firstNote.match(/طاولة\s*([^|\]]+)/);
          const tableNum = dbo.tables?.table_number || (tableNumMatch ? tableNumMatch[1].trim() : null);

          const nameMatch = firstNote.match(/الاسم:\s*([^|\]]+)/);
          const phoneMatch = firstNote.match(/هاتف:\s*([^|\]]+)/);
          const addrMatch = firstNote.match(/العنوان:\s*([^|\]]+)/);

          const cashierMatch = firstNote.match(/كاشير:\s*([^|\]]+)/);
          const cashierName = dbo.cashier_name || (cashierMatch ? cashierMatch[1].trim() : (isCustomer ? 'طلب أونلاين' : 'كاشير الفرع'));

          let payMethod = dbo.payment_method || 'cash';
          if (firstNote.includes('دفع: card') || firstNote.includes('دفع: visa') || firstNote.includes('فيزا') || firstNote.includes('بطاقة')) {
            payMethod = 'card';
          } else if (firstNote.includes('دفع: wallet') || firstNote.includes('دفع: instapay') || firstNote.includes('انستاباي') || firstNote.includes('محفظة')) {
            payMethod = 'wallet';
          } else if (firstNote.includes('دفع: split') || firstNote.includes('مقسم') || firstNote.includes('مجزأ')) {
            payMethod = 'split';
          }

          return {
            id: dbo.id,
            daily_order_number: dailyNum,
            restaurant_id: dbo.restaurant_id,
            source: isCustomer ? 'customer_app' : 'pos',
            cashier_name: cashierName,
            payment_method: payMethod,
            order_type: orderType,
            table_id: dbo.table_id,
            table_number: tableNum,
            customer_name: nameMatch ? nameMatch[1].trim() : undefined,
            customer_phone: phoneMatch ? phoneMatch[1].trim() : undefined,
            delivery_address: addrMatch ? addrMatch[1].trim() : undefined,
            notes: firstNote,
            total_price: Number(dbo.total_price || 0),
            status: dbo.status === 'delivered' ? 'completed' : (dbo.status || 'new'),
            payment_status: dbo.payment_status || 'unpaid',
            items: (dbo.order_items || []).map((it: any) => ({
              id: it.product_id,
              name: it.products?.name_ar || it.products?.name_en || 'صنف',
              quantity: it.quantity,
              price: Number(it.price_at_order || 0),
              notes: it.notes,
              sugar_level: it.sugar_level
            })),
            created_at: dbo.created_at
          };
        });
      }
    } catch (e) {
      console.warn('Direct Supabase fetch live orders fallback error:', e);
    }
  }

  // Merge with local storage in case of offline/recent orders
  try {
    const key = `qrieta_live_orders_${restaurantId}`;
    const raw = localStorage.getItem(key);
    const localList: LiveOrder[] = raw ? JSON.parse(raw) : [];

    if (serverOrders.length === 0) {
      return localList;
    }

    const STATUS_RANK: Record<string, number> = {
      new: 1,
      preparing: 2,
      ready: 3,
      delivered: 4,
      completed: 4,
      cancelled: 5
    };

    const mergedMap = new Map<string, LiveOrder>();
    serverOrders.forEach(o => mergedMap.set(String(o.id), o));
    localList.forEach(lo => {
      const existing = mergedMap.get(String(lo.id)) || 
                       Array.from(mergedMap.values()).find(so => 
                         so.daily_order_number && lo.daily_order_number && Number(so.daily_order_number) === Number(lo.daily_order_number)
                       );

      if (!existing) {
        mergedMap.set(String(lo.id), lo);
      } else {
        const loRank = STATUS_RANK[lo.status] || 1;
        const exRank = STATUS_RANK[existing.status] || 1;
        if (loRank > exRank) {
          existing.status = lo.status;
        }
        if (lo.payment_status === 'paid') existing.payment_status = 'paid';
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
  status: 'new' | 'preparing' | 'ready' | 'delivered' | 'completed' | 'cancelled',
  paymentStatus?: 'paid' | 'unpaid' | 'refunded',
  cashierName?: string
): Promise<void> {
  // 1. Update local live orders cache
  try {
    const key = `qrieta_live_orders_${restaurantId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const list: LiveOrder[] = JSON.parse(raw);
      const target = list.find(o => 
        String(o.id) === String(orderId) || 
        (o.daily_order_number && String(o.daily_order_number) === String(orderId))
      );
      if (target) {
        target.status = status;
        if (paymentStatus) target.payment_status = paymentStatus as any;
        if (cashierName) (target as any).cashier_name = cashierName;
        localStorage.setItem(key, JSON.stringify(list));
      }
    }
  } catch (e) {}

  // 1b. Also update customer device orders directly in localStorage
  try {
    const custKey = `qrieta_customer_orders_${restaurantId}`;
    const custRaw = localStorage.getItem(custKey);
    if (custRaw) {
      const custOrders: CustomerSavedOrder[] = JSON.parse(custRaw);
      let changed = false;
      custOrders.forEach(co => {
        if (
          String(co.id) === String(orderId) || 
          (co.daily_order_number && String(co.daily_order_number) === String(orderId))
        ) {
          co.status = status;
          if (paymentStatus) co.payment_status = paymentStatus;
          changed = true;
        }
      });
      if (changed) {
        localStorage.setItem(custKey, JSON.stringify(custOrders));
        window.dispatchEvent(new Event('qrieta_orders_updated'));
      }
    }
  } catch (e) {}

  // 2. Update Supabase directly (safe payload without non-existent columns)
  try {
    const dbStatus = (status === 'completed' || status === 'delivered') 
      ? 'delivered' 
      : (status === 'ready' ? 'preparing' : status);
    
    const updatePayload: any = { status: dbStatus };
    if (status === 'preparing') updatePayload.preparing_at = new Date().toISOString();
    if (status === 'completed' || status === 'delivered') updatePayload.delivered_at = new Date().toISOString();

    const numId = parseInt(String(orderId), 10);
    if (!isNaN(numId) && String(numId) === String(orderId).trim()) {
      await supabase.from('orders').update(updatePayload).eq('id', numId);
    } else {
      await supabase.from('orders').update(updatePayload).eq('id', orderId);
    }
  } catch (e) {
    console.warn('Supabase status update error:', e);
  }

  // 3. Update server API
  try {
    await fetch(`/api/orders/live/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_id: restaurantId,
        status,
        payment_status: paymentStatus,
        cashier_name: cashierName,
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

// 7. Unified Order Number Extractor
// Ensures identical sequence number displays everywhere (Customer, Admin, Cashier, Waiter)
export function getDisplayOrderNumber(order: any): number | string {
  if (!order) return 1;

  // 1. Direct daily_order_number field
  if (order.daily_order_number !== undefined && order.daily_order_number !== null) {
    const n = Number(order.daily_order_number);
    if (!isNaN(n) && n > 0) return n;
  }

  // 2. Parse from notes (e.g. "[طلب زبون #5 | ...]" or "[طلب كاشير POS #12 | ...]")
  const sourcesToCheck = [
    order.notes,
    order.delivery_notes,
    order.order_items?.[0]?.notes,
    order.items?.[0]?.notes
  ];

  for (const text of sourcesToCheck) {
    if (typeof text === 'string') {
      const match = text.match(/#(\d+)/);
      if (match && match[1]) {
        const parsed = parseInt(match[1], 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    }
  }

  // 3. Clean string ID or numeric fallback
  if (order.id !== undefined && order.id !== null) {
    const idStr = String(order.id);
    if (idStr.includes('-')) {
      const firstPart = idStr.split('-')[0];
      const parsedPart = parseInt(firstPart, 10);
      return !isNaN(parsedPart) ? parsedPart : firstPart;
    }
    const parsedId = parseInt(idStr, 10);
    return !isNaN(parsedId) ? parsedId : idStr;
  }

  return 1;
}

// 8. Customer Device Orders Persistence & Tracking
// Allows customers to view, track, and re-order their placed orders even after closing the tab
export interface CustomerSavedOrder {
  id: string | number;
  daily_order_number: number;
  restaurant_id: string;
  restaurant_name?: string;
  order_type: 'dine_in' | 'delivery' | 'takeaway';
  table_number?: string | number | null;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  delivery_address?: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    notes?: string;
    options?: any;
  }>;
  total_price: number;
  status: 'new' | 'preparing' | 'ready' | 'delivered' | 'completed' | 'cancelled' | 'refunded';
  payment_status: 'paid' | 'unpaid' | 'refunded';
  is_prepaid?: boolean;
  created_at: string;
}

export function saveCustomerDeviceOrder(restaurantId: string, order: CustomerSavedOrder): void {
  try {
    const key = `qrieta_customer_orders_${restaurantId}`;
    const raw = localStorage.getItem(key);
    const existing: CustomerSavedOrder[] = raw ? JSON.parse(raw) : [];
    const idx = existing.findIndex(o => String(o.id) === String(order.id));
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...order };
    } else {
      existing.unshift(order);
    }
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 50)));
  } catch (e) {
    console.warn('Failed to persist customer device order:', e);
  }
}

export function getCustomerDeviceOrders(restaurantId: string): CustomerSavedOrder[] {
  try {
    const key = `qrieta_customer_orders_${restaurantId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const orders: CustomerSavedOrder[] = JSON.parse(raw);
    return Array.isArray(orders) ? orders : [];
  } catch (e) {
    return [];
  }
}

export function updateCustomerDeviceOrderStatus(
  restaurantId: string,
  orderId: string | number,
  status: 'new' | 'preparing' | 'completed' | 'cancelled'
): void {
  try {
    const key = `qrieta_customer_orders_${restaurantId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const orders: CustomerSavedOrder[] = JSON.parse(raw);
    const target = orders.find(o => String(o.id) === String(orderId));
    if (target) {
      target.status = status;
      localStorage.setItem(key, JSON.stringify(orders));
    }
  } catch (e) {}
}

export function syncCustomerDeviceOrdersWithLive(
  restaurantId: string,
  liveOrders: LiveOrder[],
  currentTableNumber?: string | number | null,
  currentTableId?: string | null,
  customerPhone?: string | null,
  customerEmail?: string | null
): CustomerSavedOrder[] {
  const localOrders = getCustomerDeviceOrders(restaurantId);
  const localMap = new Map<string, CustomerSavedOrder>();
  localOrders.forEach(o => localMap.set(String(o.id), o));

  const trimmedPhone = (customerPhone || '').trim();
  const trimmedEmail = (customerEmail || '').trim().toLowerCase();

  const STATUS_RANK: Record<string, number> = {
    new: 1,
    preparing: 2,
    ready: 3,
    delivered: 4,
    completed: 4,
    cancelled: 5
  };

  if (Array.isArray(liveOrders)) {
    liveOrders.forEach(live => {
      // 1. Look for match in existing customer device orders first
      const existing = localMap.get(String(live.id)) || 
                       Array.from(localMap.values()).find(lo => 
                         (lo.daily_order_number && live.daily_order_number && Number(lo.daily_order_number) === Number(live.daily_order_number)) ||
                         (String(lo.id) === String(live.id))
                       );

      if (existing) {
        const existingRank = STATUS_RANK[existing.status] || 1;
        const liveRank = STATUS_RANK[live.status] || 1;

        // Never downgrade unless cancelled
        if (live.status === 'cancelled' || liveRank >= existingRank) {
          existing.status = live.status;
        }
        existing.payment_status = live.payment_status || existing.payment_status;
        if (live.daily_order_number) existing.daily_order_number = live.daily_order_number;
        if (live.customer_name && !existing.customer_name) existing.customer_name = live.customer_name;
        if (live.customer_phone && !existing.customer_phone) existing.customer_phone = live.customer_phone;
        if (live.customer_email && !existing.customer_email) existing.customer_email = live.customer_email;
        return;
      }

      // 2. If not already in localMap, adopt if it matches customer table, phone, or email
      const matchesTable = (currentTableNumber && live.table_number && String(live.table_number).trim() === String(currentTableNumber).trim()) ||
                            (currentTableId && live.table_id && String(live.table_id) === String(currentTableId));
      const matchesPhone = trimmedPhone && live.customer_phone && String(live.customer_phone).trim() === trimmedPhone;
      const matchesEmail = trimmedEmail && live.customer_email && String(live.customer_email).trim().toLowerCase() === trimmedEmail;

      if ((matchesTable || matchesPhone || matchesEmail) && (live.source === 'customer_app' || !live.source)) {
        const newSavedOrder: CustomerSavedOrder = {
          id: live.id,
          daily_order_number: Number(live.daily_order_number) || 1,
          restaurant_id: live.restaurant_id,
          order_type: live.order_type,
          table_number: live.table_number,
          customer_name: live.customer_name,
          customer_phone: live.customer_phone,
          customer_email: live.customer_email,
          delivery_address: live.delivery_address,
          total_price: live.total_price,
          status: live.status,
          payment_status: live.payment_status,
          created_at: live.created_at,
          items: (live.items || []).map(it => ({
            name: it.name,
            quantity: it.quantity,
            price: it.price,
            notes: it.notes,
            options: it.options
          }))
        };
        localMap.set(String(live.id), newSavedOrder);
      }
    });
  }

  const result = Array.from(localMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  try {
    localStorage.setItem(`qrieta_customer_orders_${restaurantId}`, JSON.stringify(result.slice(0, 50)));
  } catch (e) {}

  return result;
}

// 9. Fetch previous orders from server across sessions by Customer Email or Phone
export async function fetchCustomerOrdersByEmailOrPhone(
  restaurantId: string,
  email?: string,
  phone?: string
): Promise<CustomerSavedOrder[]> {
  const trimmedEmail = (email || '').trim().toLowerCase();
  const trimmedPhone = (phone || '').trim();

  if (!trimmedEmail && !trimmedPhone) {
    return getCustomerDeviceOrders(restaurantId);
  }

  try {
    const params = new URLSearchParams();
    if (restaurantId) params.set('restaurant_id', restaurantId);
    if (trimmedEmail) params.set('email', trimmedEmail);
    if (trimmedPhone) params.set('phone', trimmedPhone);

    const res = await fetch(`/api/customer/orders?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.orders)) {
        const local = getCustomerDeviceOrders(restaurantId);
        const map = new Map<string, CustomerSavedOrder>();

        data.orders.forEach((o: any) => {
          map.set(String(o.id), {
            id: o.id,
            daily_order_number: Number(o.daily_order_number) || 1,
            restaurant_id: o.restaurant_id || restaurantId,
            restaurant_name: o.restaurant_name,
            order_type: o.order_type || 'delivery',
            table_number: o.table_number,
            customer_name: o.customer_name,
            customer_phone: o.customer_phone,
            customer_email: o.customer_email || trimmedEmail,
            delivery_address: o.delivery_address,
            total_price: Number(o.total_price) || 0,
            status: o.status || 'new',
            payment_status: o.payment_status || 'unpaid',
            is_prepaid: o.is_prepaid,
            created_at: o.created_at,
            items: (o.items || []).map((it: any) => ({
              name: it.name,
              quantity: it.quantity,
              price: it.price,
              notes: it.notes,
              options: it.options
            }))
          });
        });

        // Retain any locally saved orders not returned by server
        local.forEach(lo => {
          if (!map.has(String(lo.id))) {
            map.set(String(lo.id), lo);
          }
        });

        const merged = Array.from(map.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        localStorage.setItem(`qrieta_customer_orders_${restaurantId}`, JSON.stringify(merged.slice(0, 50)));
        return merged;
      }
    }
  } catch (e) {
    console.warn('fetchCustomerOrdersByEmailOrPhone error:', e);
  }

  return getCustomerDeviceOrders(restaurantId);
}

