import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Users, 
  Plus, 
  Trash2, 
  Edit, 
  Save, 
  X, 
  Key, 
  DollarSign, 
  TrendingUp, 
  FileText, 
  Printer, 
  Eye, 
  CheckCircle2, 
  AlertCircle,
  Smartphone,
  CreditCard,
  Lock,
  Calendar,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { formatCurrency, cn } from '../../lib/utils';
import { 
  CashierShiftConfig, 
  StoredShiftReport, 
  getCashierShiftConfigs, 
  saveCashierShiftConfigs, 
  addCashierShiftConfig, 
  deleteCashierShiftConfig, 
  updateCashierShiftConfig,
  getStoredActiveShift,
  getStoredShiftReports,
  saveStoredShiftReport
} from '../../lib/shiftsStore';
import { ShiftRecord } from '../../lib/posStore';
import { ShiftReportModal } from '../POS/ShiftReportModal';
import { printThermalElement } from '../../lib/printHelper';

interface ShiftsReportsTabProps {
  restaurantId: string;
  restaurantName: string;
}

export const ShiftsReportsTab: React.FC<ShiftsReportsTabProps> = ({
  restaurantId,
  restaurantName
}) => {
  const [shiftConfigs, setShiftConfigs] = useState<CashierShiftConfig[]>([]);
  const [activeShift, setActiveShift] = useState<ShiftRecord | null>(null);
  const [storedReports, setStoredReports] = useState<StoredShiftReport[]>([]);

  // Form State for Adding New Shift
  const [isAddingShift, setIsAddingShift] = useState(false);
  const [newShiftName, setNewShiftName] = useState('');
  const [newCashierName, setNewCashierName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newStartTime, setNewStartTime] = useState('08:00');
  const [newEndTime, setNewEndTime] = useState('16:00');
  const [newStartingCash, setNewStartingCash] = useState<number>(500);

  // Edit Shift State
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [editShiftName, setEditShiftName] = useState('');
  const [editCashierName, setEditCashierName] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editStartingCash, setEditStartingCash] = useState<number>(500);

  // Modal State for viewing X/Z report
  const [inspectingReport, setInspectingReport] = useState<{
    isOpen: boolean;
    reportType: 'X' | 'Z';
    shift: ShiftRecord;
  } | null>(null);

  // Success / Notice message
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load data
  useEffect(() => {
    if (!restaurantId) return;
    const configs = getCashierShiftConfigs(restaurantId);
    setShiftConfigs(configs);

    const active = getStoredActiveShift(restaurantId);
    if (active) {
      setActiveShift(active);
    } else {
      // Create fallback active shift representation if none is open
      const fallbackShift: ShiftRecord = {
        id: `shift-live-${Date.now()}`,
        restaurantId,
        cashierName: configs[0]?.cashierName || 'كاشير الفرع الرئيسي',
        cashierPin: configs[0]?.pin || '1234',
        role: 'cashier',
        openedAt: new Date().toISOString(),
        isOpen: true,
        startingCash: 500,
        cashSales: 0,
        cardSales: 0,
        walletSales: 0,
        totalSales: 0,
        totalTax: 0,
        totalServiceFee: 0,
        totalDiscounts: 0,
        totalTips: 0,
        totalVoids: 0,
        totalRefunds: 0,
        ordersCount: 0,
        transactions: [],
      };
      setActiveShift(fallbackShift);
    }

    const reports = getStoredShiftReports(restaurantId);
    setStoredReports(reports);
  }, [restaurantId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleAddShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShiftName.trim() || !newCashierName.trim()) {
      alert('يرجى كتابة اسم الوردية واسم موظف الكاشير');
      return;
    }

    const created = addCashierShiftConfig(restaurantId, {
      restaurantId,
      shiftName: newShiftName.trim(),
      cashierName: newCashierName.trim(),
      pin: newPin.trim() || '1234',
      startTime: newStartTime,
      endTime: newEndTime,
      startingCash: Number(newStartingCash) || 500,
      isActive: true,
    });

    setShiftConfigs(prev => [...prev, created]);
    setIsAddingShift(false);
    setNewShiftName('');
    setNewCashierName('');
    setNewPin('');
    showToast(`تمت إضافة ${created.shiftName} باسم ${created.cashierName} بنجاح!`);
  };

  const startEditShift = (shift: CashierShiftConfig) => {
    setEditingShiftId(shift.id);
    setEditShiftName(shift.shiftName);
    setEditCashierName(shift.cashierName);
    setEditPin(shift.pin);
    setEditStartTime(shift.startTime || '08:00');
    setEditEndTime(shift.endTime || '16:00');
    setEditStartingCash(shift.startingCash || 500);
  };

  const handleSaveEditShift = (id: string) => {
    const existing = shiftConfigs.find(s => s.id === id);
    if (!existing) return;

    const updated: CashierShiftConfig = {
      ...existing,
      shiftName: editShiftName.trim() || existing.shiftName,
      cashierName: editCashierName.trim() || existing.cashierName,
      pin: editPin.trim() || existing.pin,
      startTime: editStartTime,
      endTime: editEndTime,
      startingCash: Number(editStartingCash) || 500,
    };

    updateCashierShiftConfig(restaurantId, updated);
    setShiftConfigs(prev => prev.map(s => s.id === id ? updated : s));
    setEditingShiftId(null);
    showToast(`تم تحديث وردية ${updated.shiftName} بنجاح!`);
  };

  const handleDeleteShift = (id: string, name: string) => {
    if (confirm(`هل أنت متأكد من حذف ${name}؟`)) {
      deleteCashierShiftConfig(restaurantId, id);
      setShiftConfigs(prev => prev.filter(s => s.id !== id));
      showToast(`تم حذف الوردية بنجاح.`);
    }
  };

  const toggleShiftActive = (shift: CashierShiftConfig) => {
    const updated = { ...shift, isActive: !shift.isActive };
    updateCashierShiftConfig(restaurantId, updated);
    setShiftConfigs(prev => prev.map(s => s.id === shift.id ? updated : s));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300" dir="rtl">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-4 bg-emerald-600 text-white rounded-2xl shadow-lg flex items-center gap-3 font-bold text-sm">
          <CheckCircle2 size={20} className="shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-l from-slate-900 via-slate-800 to-indigo-950 text-white p-6 md:p-8 rounded-3xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border border-slate-700">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold">
            <ShieldCheck size={14} />
            <span>خاص بالإدارة والمالية فقط (محمي من شاشة الكاشير)</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">
            إدارة ورديات الكاشير وتقارير الـ X-Report والـ Z-Report
          </h2>
          <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
            تم نقل تقارير الإغلاق وحسابات الورديات هنا لحمايتها من وصول موظفي الكاشير، مع إمكانية إضافة وتعيين الورديات بأسماء الموظفين ليقوم كل كاشير باختيار اسمه مباشرة عند استلام الشيفت.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={() => setIsAddingShift(true)}
            className="px-5 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-2xl font-black text-xs md:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
          >
            <Plus size={18} />
            <span>إضافة وردية جديدة</span>
          </button>

          <a
            href={`/pos?restaurant_id=${restaurantId}`}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold text-xs md:text-sm flex items-center gap-2 transition-all"
          >
            <ExternalLink size={16} />
            <span>معاينة شاشة الكاشير</span>
          </a>
        </div>
      </div>

      {/* 🟢 SECTION 1: إدارة الورديات وأسماء مسؤولي الكاشير */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Users className="text-amber-500" size={22} />
              <span>ورديات الكاشير ومسؤولو الفترات ({shiftConfigs.length})</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              تظهر هذه الورديات في شاشة قفل الكاشير ليختار كل موظف اسمه ويبدأ عمله برصيده المحدد
            </p>
          </div>

          {!isAddingShift && (
            <button
              onClick={() => setIsAddingShift(true)}
              className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus size={15} />
              <span>إضافة وردية بكاشير محدد</span>
            </button>
          )}
        </div>

        {/* Add New Shift Form */}
        {isAddingShift && (
          <form onSubmit={handleAddShift} className="bg-amber-50/50 border border-amber-200/80 p-5 rounded-2xl space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
              <span className="font-black text-sm text-slate-800 flex items-center gap-2">
                <Plus size={16} className="text-amber-600" />
                <span>إضافة وردية جديدة بموظف كاشير مخصص</span>
              </span>
              <button
                type="button"
                onClick={() => setIsAddingShift(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الوردية والفترة *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: وردية الصباح، وردية المساء..."
                  value={newShiftName}
                  onChange={e => setNewShiftName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-amber-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم موظف الكاشير المسند إليه *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: أحمد حسن، محمود علي..."
                  value={newCashierName}
                  onChange={e => setNewCashierName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-amber-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رمز PIN السريع للكاشير (4 أرقام)</label>
                <input
                  type="text"
                  maxLength={4}
                  placeholder="افتراضي: 1234"
                  value={newPin}
                  onChange={e => setNewPin(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-slate-800 outline-none focus:border-amber-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">وقت بدء الوردية</label>
                <input
                  type="time"
                  value={newStartTime}
                  onChange={e => setNewStartTime(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-amber-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">وقت انتهاء الوردية</label>
                <input
                  type="time"
                  value={newEndTime}
                  onChange={e => setNewEndTime(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-amber-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رصيد عهدة بداية الدرج (ج.م)</label>
                <input
                  type="number"
                  value={newStartingCash}
                  onChange={e => setNewStartingCash(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-amber-500 shadow-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddingShift(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer"
              >
                <CheckCircle2 size={16} />
                <span>حفظ الوردية وتفعيلها فوراً</span>
              </button>
            </div>
          </form>
        )}

        {/* Shifts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shiftConfigs.map(shift => {
            const isEditing = editingShiftId === shift.id;

            return (
              <div
                key={shift.id}
                className={cn(
                  "p-5 rounded-2xl border transition-all space-y-3",
                  isEditing 
                    ? "bg-amber-50/50 border-amber-300 shadow-md" 
                    : shift.isActive 
                    ? "bg-white border-slate-200 hover:border-slate-300 shadow-sm" 
                    : "bg-slate-50 border-slate-200 opacity-60"
                )}
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-amber-900 block">تعديل بيانات الوردية:</span>
                    <input
                      type="text"
                      placeholder="اسم الوردية"
                      value={editShiftName}
                      onChange={e => setEditShiftName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold"
                    />
                    <input
                      type="text"
                      placeholder="اسم موظف الكاشير"
                      value={editCashierName}
                      onChange={e => setEditCashierName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        maxLength={4}
                        placeholder="PIN"
                        value={editPin}
                        onChange={e => setEditPin(e.target.value)}
                        className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                      />
                      <input
                        type="number"
                        placeholder="رصيد البداية"
                        value={editStartingCash}
                        onChange={e => setEditStartingCash(Number(e.target.value))}
                        className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="time"
                        value={editStartTime}
                        onChange={e => setEditStartTime(e.target.value)}
                        className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold"
                      />
                      <input
                        type="time"
                        value={editEndTime}
                        onChange={e => setEditEndTime(e.target.value)}
                        className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleSaveEditShift(shift.id)}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Save size={14} />
                        <span>حفظ</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingShiftId(null)}
                        className="px-3 py-2 bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-sm">
                          <Users size={20} />
                        </div>
                        <div>
                          <h4 className="font-black text-slate-900 text-sm">{shift.shiftName}</h4>
                          <p className="text-xs font-bold text-amber-700 flex items-center gap-1 mt-0.5">
                            <span>👤 {shift.cashierName}</span>
                          </p>
                        </div>
                      </div>

                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                        shift.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"
                      )}>
                        {shift.isActive ? 'مفعلة' : 'معطلة'}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      {shift.startTime && shift.endTime && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 flex items-center gap-1">
                            <Clock size={12} />
                            <span>المواعيد:</span>
                          </span>
                          <span className="font-bold text-slate-800 font-mono">
                            {shift.startTime} - {shift.endTime}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Key size={12} />
                          <span>رمز الـ PIN:</span>
                        </span>
                        <span className="font-bold text-slate-800 font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                          {shift.pin}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1">
                          <DollarSign size={12} />
                          <span>رصيد بداية الدرج:</span>
                        </span>
                        <span className="font-bold text-emerald-600 font-mono">
                          {formatCurrency(shift.startingCash)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => toggleShiftActive(shift)}
                        className="text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        {shift.isActive ? 'تعطيل مؤقت' : 'إعادة تفعيل'}
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEditShift(shift)}
                          className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                          title="تعديل الوردية"
                        >
                          <Edit size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteShift(shift.id, shift.shiftName)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="حذف الوردية"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 🔴 SECTION 2: تقرير مبيعات الشيفت اللحظي (X-Report Live) */}
      <div className="bg-white rounded-3xl border border-blue-200 p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-lg shadow-blue-500/20">
              <TrendingUp size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-slate-900">تقرير مبيعات الشيفت اللحظي (X-Report)</h3>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-black">
                  مباشر لا يغلق الدرج
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                متابعة أداء ومبيعات الوردية الحالية المفتوحة لحظة بلحظة مع إمكانية طباعة تقرير حراري فوري
              </p>
            </div>
          </div>

          {activeShift && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setInspectingReport({
                  isOpen: true,
                  reportType: 'X',
                  shift: activeShift
                })}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
              >
                <Eye size={15} />
                <span>معاينة وطباعة الـ X-Report</span>
              </button>
            </div>
          )}
        </div>

        {/* Live Metrics Grid */}
        {activeShift ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-1">
              <span className="text-[11px] font-bold text-slate-500">الكاشير المناوب</span>
              <p className="text-sm font-black text-slate-900 truncate">
                {activeShift.cashierName || 'كاشير الفرع'}
              </p>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl space-y-1">
              <span className="text-[11px] font-bold text-emerald-700">مبيعات الكاش</span>
              <p className="text-base font-black text-emerald-800 font-mono">
                {formatCurrency(activeShift.cashSales)}
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl space-y-1">
              <span className="text-[11px] font-bold text-blue-700">مبيعات فيزا (Card)</span>
              <p className="text-base font-black text-blue-800 font-mono">
                {formatCurrency(activeShift.cardSales)}
              </p>
            </div>

            <div className="bg-purple-50 border border-purple-200 p-4 rounded-2xl space-y-1">
              <span className="text-[11px] font-bold text-purple-700">مبيعات إنستاباي</span>
              <p className="text-base font-black text-purple-800 font-mono">
                {formatCurrency(activeShift.walletSales)}
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl space-y-1">
              <span className="text-[11px] font-bold text-amber-700">إجمالي المبيعات</span>
              <p className="text-base font-black text-amber-900 font-mono">
                {formatCurrency(activeShift.cashSales + activeShift.cardSales + activeShift.walletSales)}
              </p>
            </div>

            <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-1 shadow-md">
              <span className="text-[11px] font-bold text-slate-300">الطلبات المنجزة</span>
              <p className="text-base font-black text-amber-400 font-mono">
                {activeShift.ordersCount} طلب
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400 font-bold text-sm">
            لا توجد وردية نشطة حالياً. بمجرد فتح الكاشير لنقطة البيع ستظهر أرقامها هنا تلقائياً.
          </div>
        )}
      </div>

      {/* 🔴 SECTION 3: تقارير تقفيل الورديات النهائي (Z-Report History) */}
      <div className="bg-white rounded-3xl border border-rose-200 p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center font-bold shadow-lg shadow-rose-500/20">
              <FileText size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-slate-900">سجل تقارير تقفيل الورديات والأدراج (Z-Reports)</h3>
                <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-xs font-black">
                  إغلاق وتصفير الدرج
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                تصفح ومراجعة كشوفات تقفيل الورديات السابقة مع مطابقة النقدية الفعلية وملاحظات العجز والزيادة
              </p>
            </div>
          </div>
        </div>

        {/* Reports History Table */}
        {storedReports.length === 0 ? (
          <div className="bg-slate-50 rounded-2xl p-10 text-center space-y-2 border border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-white text-rose-500 mx-auto flex items-center justify-center shadow-xs">
              <FileText size={24} />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">لم يتم تسجيل أي تقرير إغلاق Z-Report بعد</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              عند قيام الإدارة أو الكاشير المعتمد بإغلاق الوردية وحساب العهدة، سيتم حفظ تقرير الـ Z-Report المفصل هنا بشكل دائم.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 text-slate-600 font-black border-b border-slate-200">
                  <th className="p-3.5 rounded-r-xl">تاريخ ووقت الإغلاق</th>
                  <th className="p-3.5">اسم الكاشير</th>
                  <th className="p-3.5">النوع</th>
                  <th className="p-3.5">إجمالي المبيعات</th>
                  <th className="p-3.5">كاش الدرج</th>
                  <th className="p-3.5">الفيزا وإنستاباي</th>
                  <th className="p-3.5">الفارق (عجز/زيادة)</th>
                  <th className="p-3.5 text-center rounded-l-xl">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {storedReports.map(rep => {
                  const dateFormatted = new Date(rep.timestamp).toLocaleString('ar-EG', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  const diff = rep.shift.difference ?? 0;
                  const totalSales = (rep.shift.cashSales || 0) + (rep.shift.cardSales || 0) + (rep.shift.walletSales || 0);

                  return (
                    <tr key={rep.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 font-bold font-mono text-slate-800">
                        {dateFormatted}
                      </td>
                      <td className="p-3.5 font-black text-slate-900">
                        {rep.cashierName}
                      </td>
                      <td className="p-3.5">
                        <span className={cn(
                          "px-2 py-0.5 rounded-lg text-[10px] font-black",
                          rep.reportType === 'Z' ? "bg-rose-100 text-rose-800" : "bg-blue-100 text-blue-800"
                        )}>
                          {rep.reportType === 'Z' ? 'Z-Report (إغلاق)' : 'X-Report (لحظي)'}
                        </span>
                      </td>
                      <td className="p-3.5 font-black text-slate-900 font-mono">
                        {formatCurrency(totalSales)}
                      </td>
                      <td className="p-3.5 font-mono text-emerald-700 font-bold">
                        {formatCurrency(rep.shift.cashSales)}
                      </td>
                      <td className="p-3.5 font-mono text-blue-700">
                        {formatCurrency((rep.shift.cardSales || 0) + (rep.shift.walletSales || 0))}
                      </td>
                      <td className="p-3.5 font-mono font-bold">
                        {diff === 0 ? (
                          <span className="text-emerald-600 font-bold">مطابق تماماً ✓</span>
                        ) : diff < 0 ? (
                          <span className="text-rose-600 font-bold">عجز {formatCurrency(Math.abs(diff))}</span>
                        ) : (
                          <span className="text-blue-600 font-bold">زيادة +{formatCurrency(diff)}</span>
                        )}
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => setInspectingReport({
                            isOpen: true,
                            reportType: rep.reportType,
                            shift: rep.shift
                          })}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-all shadow-xs"
                        >
                          <Printer size={13} />
                          <span>معاينة وطباعة</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspecting Report Modal */}
      {inspectingReport && (
        <ShiftReportModal
          isOpen={inspectingReport.isOpen}
          onClose={() => setInspectingReport(null)}
          reportType={inspectingReport.reportType}
          shift={inspectingReport.shift}
          restaurantName={restaurantName}
        />
      )}
    </div>
  );
};
