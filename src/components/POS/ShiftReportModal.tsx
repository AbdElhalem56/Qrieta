import React, { useState } from 'react';
import { Printer, X, DollarSign, TrendingUp, CreditCard, Smartphone, AlertCircle, FileText, CheckCircle2, Lock } from 'lucide-react';
import { ShiftRecord } from '../../lib/posStore';

interface ShiftReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportType: 'X' | 'Z'; // X = Mid-day snapshot, Z = End of Shift Closing
  shift: ShiftRecord;
  restaurantName: string;
  onCloseShiftConfirm?: (actualCash: number, notes: string) => void;
}

export const ShiftReportModal: React.FC<ShiftReportModalProps> = ({
  isOpen,
  onClose,
  reportType,
  shift,
  restaurantName,
  onCloseShiftConfirm,
}) => {
  const [actualCashInput, setActualCashInput] = useState<string>(
    (shift.startingCash + shift.cashSales + shift.transactions.reduce((acc, t) => t.type === 'cash_in' ? acc + t.amount : acc - t.amount, 0)).toFixed(0)
  );
  const [closingNotes, setClosingNotes] = useState<string>('');

  if (!isOpen) return null;

  const totalCashIn = shift.transactions.filter(t => t.type === 'cash_in').reduce((s, t) => s + t.amount, 0);
  const totalCashOut = shift.transactions.filter(t => t.type === 'cash_out').reduce((s, t) => s + t.amount, 0);
  const expectedCashInDrawer = shift.startingCash + shift.cashSales + totalCashIn - totalCashOut;
  const actualCashNum = parseFloat(actualCashInput) || 0;
  const cashDifference = actualCashNum - expectedCashInDrawer;

  const handlePrint = () => {
    window.print();
  };

  const handleCloseShift = () => {
    if (onCloseShiftConfirm) {
      onCloseShiftConfirm(actualCashNum, closingNotes);
      onClose();
    }
  };

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeFormatted = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold shadow-md ${
              reportType === 'Z' ? 'bg-rose-500 text-white shadow-rose-500/20' : 'bg-blue-600 text-white shadow-blue-500/20'
            }`}>
              <FileText size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 text-base">
                  {reportType === 'Z' ? 'تقرير تقفيل الوردية النهائي (Z-Report)' : 'تقرير مبيعات الشيفت اللحظي (X-Report)'}
                </h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  reportType === 'Z' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                  {reportType === 'Z' ? 'إغلاق وردية' : 'معاينة مباشرة'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {reportType === 'Z' ? 'مطابقة النقدية بالدرج وتصفير مبيعات الشيفت' : 'متابعة الأداء المالي اللحظي بدون إغلاق الدرج'}
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200">
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 bg-slate-50">
          {/* Top Info Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-3.5 rounded-2xl border border-slate-200 text-xs shadow-sm">
            <div>
              <span className="text-slate-400 block text-[10px]">المطعم</span>
              <span className="font-bold text-slate-800">{restaurantName}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">الكاشير المسؤول</span>
              <span className="font-bold text-blue-600">{shift.cashierName}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">تاريخ ووقت الفتح</span>
              <span className="font-mono text-slate-600">
                {new Date(shift.openedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">وقت التقرير</span>
              <span className="font-mono text-emerald-600 font-bold">{timeFormatted}</span>
            </div>
          </div>

          {/* Sales Breakdown Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-sm">
              <span className="text-xs text-slate-500 block mb-1">إجمالي المبيعات</span>
              <span className="text-lg font-bold font-mono text-emerald-600">
                {(shift.cashSales + shift.cardSales + shift.walletSales).toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400 mr-1">ج.م</span>
            </div>

            <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-sm">
              <span className="text-xs text-slate-500 block mb-1">مبيعات كاش 💵</span>
              <span className="text-lg font-bold font-mono text-slate-800">
                {shift.cashSales.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400 mr-1">ج.م</span>
            </div>

            <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-sm">
              <span className="text-xs text-slate-500 block mb-1">مبيعات فيزا 💳</span>
              <span className="text-lg font-bold font-mono text-blue-600">
                {shift.cardSales.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400 mr-1">ج.م</span>
            </div>

            <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-sm">
              <span className="text-xs text-slate-500 block mb-1">محافظ / إنستاباي 📱</span>
              <span className="text-lg font-bold font-mono text-purple-600">
                {shift.walletSales.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400 mr-1">ج.م</span>
            </div>
          </div>

          {/* Detailed Financial Summary Table */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5 shadow-sm text-xs">
            <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-2">بيان تفصيلي للحركات المالية</h4>

            <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
              <span>عدد الفواتير المنفذة (Orders Count):</span>
              <span className="font-mono font-bold text-slate-800">{shift.ordersCount} طلب</span>
            </div>

            <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
              <span>العهدة الافتتاحية (Starting Cash):</span>
              <span className="font-mono font-bold text-slate-800">{shift.startingCash.toFixed(2)} ج.م</span>
            </div>

            <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
              <span>إجمالي المقبوضات النقدية (Cash Sales):</span>
              <span className="font-mono font-bold text-emerald-600">+{shift.cashSales.toFixed(2)} ج.م</span>
            </div>

            <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
              <span>إيداعات إضافية بالدرج (Cash In):</span>
              <span className="font-mono font-bold text-emerald-600">+{totalCashIn.toFixed(2)} ج.م</span>
            </div>

            <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
              <span>مصروفات وسحوبات الدرج (Cash Out):</span>
              <span className="font-mono font-bold text-rose-600">-{totalCashOut.toFixed(2)} ج.م</span>
            </div>

            <div className="flex justify-between py-1.5 border-t border-slate-200 font-bold text-sm text-slate-900 bg-slate-50 px-2 rounded-xl">
              <span>المبلغ المتوقع بالدرج (Expected Cash):</span>
              <span className="font-mono text-emerald-600">{expectedCashInDrawer.toFixed(2)} ج.م</span>
            </div>
          </div>

          {/* Closing Z-Report Cash Verification Box */}
          {reportType === 'Z' && (
            <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 space-y-3">
              <h4 className="font-bold text-rose-900 text-xs flex items-center gap-1.5">
                <AlertCircle size={15} />
                <span>مطابقة النقدية الفعلية بالدرج (End-of-Shift Cash Count)</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">المبلغ الفعلي بالدرج (ج.م):</label>
                  <input
                    type="number"
                    step="1"
                    value={actualCashInput}
                    onChange={e => setActualCashInput(e.target.value)}
                    className="w-full bg-white border border-rose-300 focus:border-rose-500 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 outline-none"
                    placeholder="أدخل المبلغ بعد عدّ النقدية..."
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">الفارق (عجز / زيادة):</label>
                  <div className={`h-10 px-3 rounded-xl border flex items-center font-mono font-bold text-sm ${
                    cashDifference === 0 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                      : cashDifference > 0 
                      ? 'bg-blue-50 border-blue-200 text-blue-700' 
                      : 'bg-rose-100 border-rose-300 text-rose-700'
                  }`}>
                    {cashDifference === 0 
                      ? 'مطابق تماماً (0.00 ج.م)' 
                      : cashDifference > 0 
                      ? `زيادة +${cashDifference.toFixed(2)} ج.م` 
                      : `عجز ${cashDifference.toFixed(2)} ج.م`}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">ملاحظات تقفيل الشيفت:</label>
                <input
                  type="text"
                  value={closingNotes}
                  onChange={e => setClosingNotes(e.target.value)}
                  placeholder="ملاحظات تسليم الوردية..."
                  className="w-full bg-white border border-rose-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={handlePrint}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-2 border border-slate-300 transition-all cursor-pointer"
          >
            <Printer size={16} />
            <span>طباعة التقرير</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              إغلاق
            </button>

            {reportType === 'Z' && (
              <button
                onClick={handleCloseShift}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-md shadow-rose-600/20 transition-all cursor-pointer"
              >
                <Lock size={16} />
                <span>إغلاق الوردية وترحيل الحسابات</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
