// Inventory & Cashier Audit Service
// Manages stock levels, movements, physical counts, and cashier drawer audits

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  type: 'stock_in' | 'waste' | 'sale' | 'audit' | 'adjustment';
  quantity: number;
  prevStock: number;
  newStock: number;
  reason?: string;
  performedBy: string;
  timestamp: string;
}

export interface InventoryAuditRecord {
  id: string;
  date: string;
  performedBy: string;
  itemsCount: number;
  discrepanciesCount: number;
  notes?: string;
}

export interface InventoryState {
  stock: Record<string, number>;
  minAlerts: Record<string, number>;
  movements: InventoryMovement[];
  shiftLogs: any[];
  audits: InventoryAuditRecord[];
}

export async function fetchRestaurantInventory(restaurantId: string): Promise<InventoryState> {
  const localKey = `qrieta_inv_${restaurantId}`;
  let localData: InventoryState = {
    stock: {},
    minAlerts: {},
    movements: [],
    shiftLogs: [],
    audits: []
  };

  try {
    const raw = localStorage.getItem(localKey);
    if (raw) localData = JSON.parse(raw);
  } catch (e) {}

  try {
    const res = await fetch(`/api/inventory?restaurant_id=${encodeURIComponent(restaurantId)}`);
    if (res.ok) {
      const serverData = await res.json();
      const merged: InventoryState = {
        stock: { ...localData.stock, ...(serverData.stock || {}) },
        minAlerts: { ...localData.minAlerts, ...(serverData.minAlerts || {}) },
        movements: serverData.movements && serverData.movements.length > 0 ? serverData.movements : localData.movements,
        shiftLogs: serverData.shiftLogs && serverData.shiftLogs.length > 0 ? serverData.shiftLogs : localData.shiftLogs,
        audits: serverData.audits && serverData.audits.length > 0 ? serverData.audits : localData.audits,
      };

      try {
        localStorage.setItem(localKey, JSON.stringify(merged));
      } catch (e) {}

      return merged;
    }
  } catch (err) {
    console.warn('Fetch inventory server failed, using local:', err);
  }

  return localData;
}

export async function updateProductStock(
  restaurantId: string,
  params: {
    productId: string;
    productName: string;
    newStock?: number;
    delta?: number;
    type?: 'stock_in' | 'waste' | 'sale' | 'audit' | 'adjustment';
    reason?: string;
    performedBy?: string;
    minAlert?: number;
  }
): Promise<void> {
  // 1. Update local storage
  const localKey = `qrieta_inv_${restaurantId}`;
  try {
    const raw = localStorage.getItem(localKey);
    const data: InventoryState = raw ? JSON.parse(raw) : { stock: {}, minAlerts: {}, movements: [], shiftLogs: [], audits: [] };
    const prev = data.stock[params.productId] ?? 20;
    let nextStock = prev;

    if (typeof params.newStock === 'number') {
      nextStock = params.newStock;
    } else if (typeof params.delta === 'number') {
      nextStock = Math.max(0, prev + params.delta);
    }

    data.stock[params.productId] = nextStock;
    if (params.minAlert !== undefined) {
      data.minAlerts[params.productId] = params.minAlert;
    }

    if (params.type || params.reason) {
      const mov: InventoryMovement = {
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: params.productId,
        productName: params.productName,
        type: params.type || 'adjustment',
        quantity: params.delta !== undefined ? Math.abs(params.delta) : Math.abs(nextStock - prev),
        prevStock: prev,
        newStock: nextStock,
        reason: params.reason || '',
        performedBy: params.performedBy || 'المسؤول',
        timestamp: new Date().toISOString()
      };
      data.movements.unshift(mov);
    }

    localStorage.setItem(localKey, JSON.stringify(data));
  } catch (e) {}

  // 2. Push to server API
  try {
    await fetch('/api/inventory/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_id: restaurantId,
        ...params
      })
    });
  } catch (err) {
    console.warn('Update stock server warning:', err);
  }
}

export async function logShiftAuditRecord(restaurantId: string, shiftRecord: any): Promise<void> {
  const localKey = `qrieta_inv_${restaurantId}`;
  try {
    const raw = localStorage.getItem(localKey);
    const data: InventoryState = raw ? JSON.parse(raw) : { stock: {}, minAlerts: {}, movements: [], shiftLogs: [], audits: [] };
    const idx = data.shiftLogs.findIndex((s: any) => s.id === shiftRecord.id);
    if (idx >= 0) {
      data.shiftLogs[idx] = shiftRecord;
    } else {
      data.shiftLogs.unshift(shiftRecord);
    }
    localStorage.setItem(localKey, JSON.stringify(data));
  } catch (e) {}

  try {
    await fetch('/api/inventory/shift-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_id: restaurantId,
        shiftRecord
      })
    });
  } catch (err) {}
}
