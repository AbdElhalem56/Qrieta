import { ShiftRecord } from './posStore';

export interface CashierShiftConfig {
  id: string;
  restaurantId: string;
  shiftName: string; // e.g. "وردية الصباح", "وردية المساء", "وردية السهرة"
  cashierName: string; // e.g. "أحمد حسن", "محمود عبد الله"
  pin: string; // رمز الدخول السريع
  startTime?: string; // e.g. "08:00"
  endTime?: string; // e.g. "16:00"
  startingCash: number; // رصيد بداية الدرج الافتراضي
  isActive: boolean;
  createdAt: string;
}

export interface StoredShiftReport {
  id: string;
  restaurantId: string;
  reportType: 'X' | 'Z';
  timestamp: string;
  cashierName: string;
  shiftName?: string;
  shift: ShiftRecord;
}

const SHIFTS_KEY_PREFIX = 'qrieta_cashier_shifts_';
const ACTIVE_SHIFT_KEY_PREFIX = 'qrieta_active_shift_';
const REPORTS_KEY_PREFIX = 'qrieta_shift_reports_';

// Default initial shifts if none configured yet
export function getDefaultCashierShifts(restaurantId: string): CashierShiftConfig[] {
  return [
    {
      id: 'shift-cfg-1',
      restaurantId,
      shiftName: 'وردية الصباح',
      cashierName: 'أحمد حسن (كاشير أول)',
      pin: '1234',
      startTime: '08:00',
      endTime: '16:00',
      startingCash: 500,
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'shift-cfg-2',
      restaurantId,
      shiftName: 'وردية المساء',
      cashierName: 'محمود علي (كاشير ثاني)',
      pin: '5678',
      startTime: '16:00',
      endTime: '00:00',
      startingCash: 500,
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'shift-cfg-3',
      restaurantId,
      shiftName: 'وردية السهرة',
      cashierName: 'إبراهيم سامي',
      pin: '9090',
      startTime: '00:00',
      endTime: '08:00',
      startingCash: 300,
      isActive: true,
      createdAt: new Date().toISOString(),
    },
  ];
}

export function getCashierShiftConfigs(restaurantId: string): CashierShiftConfig[] {
  try {
    const raw = localStorage.getItem(`${SHIFTS_KEY_PREFIX}${restaurantId}`);
    if (!raw) {
      const defaults = getDefaultCashierShifts(restaurantId);
      saveCashierShiftConfigs(restaurantId, defaults);
      return defaults;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : getDefaultCashierShifts(restaurantId);
  } catch (e) {
    return getDefaultCashierShifts(restaurantId);
  }
}

export function saveCashierShiftConfigs(restaurantId: string, shifts: CashierShiftConfig[]): void {
  try {
    localStorage.setItem(`${SHIFTS_KEY_PREFIX}${restaurantId}`, JSON.stringify(shifts));
  } catch (e) {
    console.error('Failed to save cashier shifts:', e);
  }
}

export function addCashierShiftConfig(
  restaurantId: string, 
  shift: Omit<CashierShiftConfig, 'id' | 'createdAt'>
): CashierShiftConfig {
  const current = getCashierShiftConfigs(restaurantId);
  const newShift: CashierShiftConfig = {
    ...shift,
    id: `shift-cfg-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  const updated = [...current, newShift];
  saveCashierShiftConfigs(restaurantId, updated);
  return newShift;
}

export function updateCashierShiftConfig(restaurantId: string, shift: CashierShiftConfig): void {
  const current = getCashierShiftConfigs(restaurantId);
  const updated = current.map(s => s.id === shift.id ? shift : s);
  saveCashierShiftConfigs(restaurantId, updated);
}

export function deleteCashierShiftConfig(restaurantId: string, shiftId: string): void {
  const current = getCashierShiftConfigs(restaurantId);
  const updated = current.filter(s => s.id !== shiftId);
  saveCashierShiftConfigs(restaurantId, updated);
}

// Active Shift Synchronization
export function getStoredActiveShift(restaurantId: string): ShiftRecord | null {
  try {
    const raw = localStorage.getItem(`${ACTIVE_SHIFT_KEY_PREFIX}${restaurantId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function saveStoredActiveShift(restaurantId: string, shift: ShiftRecord): void {
  try {
    localStorage.setItem(`${ACTIVE_SHIFT_KEY_PREFIX}${restaurantId}`, JSON.stringify(shift));
  } catch (e) {
    console.error('Failed to save active shift:', e);
  }
}

// X & Z Reports History (For Admin Inspection)
export function getStoredShiftReports(restaurantId: string): StoredShiftReport[] {
  try {
    const raw = localStorage.getItem(`${REPORTS_KEY_PREFIX}${restaurantId}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

export function saveStoredShiftReport(
  restaurantId: string, 
  reportType: 'X' | 'Z', 
  shift: ShiftRecord,
  shiftName?: string
): StoredShiftReport {
  const reports = getStoredShiftReports(restaurantId);
  const newReport: StoredShiftReport = {
    id: `rep-${reportType.toLowerCase()}-${Date.now()}`,
    restaurantId,
    reportType,
    timestamp: new Date().toISOString(),
    cashierName: shift.cashierName || 'كاشير الفرع',
    shiftName: shiftName || (reportType === 'Z' ? 'إغلاق وردية نهائي' : 'تقرير لحظي منتصف اليوم'),
    shift: { ...shift }
  };
  const updated = [newReport, ...reports];
  try {
    localStorage.setItem(`${REPORTS_KEY_PREFIX}${restaurantId}`, JSON.stringify(updated.slice(0, 100)));
  } catch (e) {
    console.error('Failed to save shift report:', e);
  }
  return newReport;
}
