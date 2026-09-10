import React, { useState, useRef } from 'react';
import { Printer, X, DollarSign, TrendingUp, CreditCard, Smartphone, AlertCircle, FileText, CheckCircle2, Lock, Eye, Receipt } from 'lucide-react';
import { ShiftRecord } from '../../lib/posStore';
import { printThermalElement } from '../../lib/printHelper';

interface ShiftReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportType: 'X' | 'Z'; // X = Mid-day snapshot, Z = End of Shift Closing
  shift: ShiftRecord;
  restaurantName: string;
  onCloseShiftConfirm?: (actualCash: number, notes: string) => void;
  orders?: any[];
}

export const ShiftReportModal: React.FC<ShiftReportModalProps> = ({
  isOpen,
  onClose,
  reportType,
  shift,
  restaurantName,
  onCloseShiftConfirm,
  orders,
}) => {
  const thermalReportRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'preview'>('details');

  const shiftOrders: any[] = (orders && orders.length > 0) ? orders : (shift.orders || []);

  // Compute effective payment counts and totals if shift has 0 or orders provide richer data
  let effectiveCashSales = shift.cashSales;
  let effectiveCardSales = shift.cardSales;
  let effectiveWalletSales = shift.walletSales;
  let effectiveOrdersCount = shift.ordersCount || shiftOrders.length;
  let effectiveCashCount = shift.cashOrdersCount ?? 0;
  let effectiveCardCount = shift.cardOrdersCount ?? 0;
  let effectiveWalletCount = shift.walletOrdersCount ?? 0;

  if (shiftOrders.length > 0 && (effectiveCashSales === 0 && effectiveCardSales === 0 && effectiveWalletSales === 0)) {
    effectiveCashSales = 0;
    effectiveCardSales = 0;
    effectiveWalletSales = 0;
    effectiveCashCount = 0;
    effectiveCardCount = 0;
    effectiveWalletCount = 0;

    shiftOrders.forEach(ord => {
      const amt = Number(ord.total_price || ord.total_amount || 0);
      const m = ord.payment_method || 'cash';
      if (m === 'card') {
        effectiveCardSales += amt;
        effectiveCardCount += 1;
      } else if (m === 'wallet' || m === 'instapay') {
        effectiveWalletSales += amt;
        effectiveWalletCount += 1;
      } else {
        effectiveCashSales += amt;
        effectiveCashCount += 1;
      }
    });
    effectiveOrdersCount = shiftOrders.length;
  } else if (shiftOrders.length > 0 && effectiveCashCount === 0 && effectiveCardCount === 0 && effectiveWalletCount === 0) {
    shiftOrders.forEach(ord => {
      const m = ord.payment_method || 'cash';
      if (m === 'card') effectiveCardCount += 1;
      else if (m === 'wallet' || m === 'instapay') effectiveWalletCount += 1;
      else effectiveCashCount += 1;
    });
  }

  const [actualCashInput, setActualCashInput] = useState<string>(
    (shift.startingCash + effectiveCashSales + shift.transactions.reduce((acc, t) => t.type === 'cash_in' ? acc + t.amount : acc - t.amount, 0)).toFixed(0)
  );
  const [closingNotes, setClosingNotes] = useState<string>('');

  if (!isOpen) return null;

  const totalCashIn = shift.transactions.filter(t => t.type === 'cash_in').reduce((s, t) => s + t.amount, 0);
  const totalCashOut = shift.transactions.filter(t => t.type === 'cash_out').reduce((s, t) => s + t.amount, 0);
  const expectedCashInDrawer = shift.startingCash + effectiveCashSales + totalCashIn - totalCashOut;
  const actualCashNum = parseFloat(actualCashInput) || 0;
  const cashDifference = actualCashNum - expectedCashInDrawer;
  const totalGrossSales = effectiveCashSales + effectiveCardSales + effectiveWalletSales;
  const netSales = Math.max(0, totalGrossSales - (shift.totalDiscounts || 0));

  const handlePrint = () => {
    const el = document.getElementById('thermal-shift-report') || thermalReportRef.current;
    if (el) {
      printThermalElement(el, reportType === 'Z' ? 'تقرير-إغلاق-الوردية-Z' : 'تقرير-الوردية-اللحظي-X');
    } else {
      window.print();
    }
  };

  const handleCloseShift = () => {
    if (onCloseShiftConfirm) {
      onCloseShiftConfirm(actualCashNum, closingNotes);
      onClose();
    }
  };

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('ar-EG', { day: 'numeric', month: 'numeric', year: 'numeric' });
  const timeFormatted = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const openedDateFormatted = new Date(shift.openedAt).toLocaleDateString('ar-EG', { day: 'numeric', month: 'numeric', year: 'numeric' });
  const openedTimeFormatted = new Date(shift.openedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" dir="rtl">
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

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex bg-slate-200/80 p-0.5 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'details' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                تفاصيل التقرير
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                  activeTab === 'preview' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Receipt size={13} />
                <span>إيصال الطابعة</span>
              </button>
            </div>

            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 bg-slate-50">
          {activeTab === 'details' ? (
            <>
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
                    {openedTimeFormatted}
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
                    {totalGrossSales.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400 mr-1">ج.م</span>
                </div>

                <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-500">مبيعات كاش 💵</span>
                    <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-md">
                      {effectiveCashCount} طلب
                    </span>
                  </div>
                  <span className="text-lg font-bold font-mono text-slate-800">
                    {effectiveCashSales.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400 mr-1">ج.م</span>
                </div>

                <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-500">مبيعات فيزا 💳</span>
                    <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md">
                      {effectiveCardCount} طلب
                    </span>
                  </div>
                  <span className="text-lg font-bold font-mono text-blue-600">
                    {effectiveCardSales.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400 mr-1">ج.م</span>
                </div>

                <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-500">محافظ / إنستاباي 📱</span>
                    <span className="text-[10px] font-bold bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-md">
                      {effectiveWalletCount} طلب
                    </span>
                  </div>
                  <span className="text-lg font-bold font-mono text-purple-600">
                    {effectiveWalletSales.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400 mr-1">ج.م</span>
                </div>
              </div>

              {/* Detailed Financial Summary Table */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5 shadow-sm text-xs">
                <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-2">بيان تفصيلي للحركات المالية</h4>

                <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                  <span>عدد الفواتير المنفذة (Orders Count):</span>
                  <span className="font-mono font-bold text-slate-800">{effectiveOrdersCount} طلب</span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                  <span>العهدة الافتتاحية (Starting Cash):</span>
                  <span className="font-mono font-bold text-slate-800">{shift.startingCash.toFixed(2)} ج.م</span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                  <span>إجمالي المقبوضات النقدية (Cash Sales):</span>
                  <span className="font-mono font-bold text-emerald-600">+{effectiveCashSales.toFixed(2)} ج.م</span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                  <span>إيداعات إضافية بالدرج (Cash In):</span>
                  <span className="font-mono font-bold text-emerald-600">+{totalCashIn.toFixed(2)} ج.م</span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                  <span>مصروفات وسحوبات الدرج (Cash Out):</span>
                  <span className="font-mono font-bold text-rose-600">-{totalCashOut.toFixed(2)} ج.م</span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                  <span>ضريبة القيمة المضافة (Tax / VAT 14%):</span>
                  <span className="font-mono font-bold text-slate-700">{shift.totalTax.toFixed(2)} ج.م</span>
                </div>

                {shift.totalServiceFee > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                    <span>خدمة الصالة (Service Fee):</span>
                    <span className="font-mono font-bold text-slate-700">{shift.totalServiceFee.toFixed(2)} ج.م</span>
                  </div>
                )}

                {shift.totalDiscounts > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                    <span>إجمالي الخصومات (Discounts):</span>
                    <span className="font-mono font-bold text-amber-600">-{shift.totalDiscounts.toFixed(2)} ج.م</span>
                  </div>
                )}

                {shift.totalRefunds > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                    <span>إجمالي المرتجعات (Refunds):</span>
                    <span className="font-mono font-bold text-rose-600">-{shift.totalRefunds.toFixed(2)} ج.م</span>
                  </div>
                )}

                <div className="flex justify-between py-1.5 border-t border-slate-200 font-bold text-sm text-slate-900 bg-slate-50 px-2 rounded-xl">
                  <span>المبلغ المتوقع بالدرج (Expected Cash):</span>
                  <span className="font-mono text-emerald-600">{expectedCashInDrawer.toFixed(2)} ج.م</span>
                </div>
              </div>

              {/* 🧾 Orders List of the Shift */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm text-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Receipt size={16} className="text-amber-500" />
                    <h4 className="font-bold text-slate-800 text-sm">سجل فواتير وأوردرات الوردية</h4>
                    <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                      {shiftOrders.length} فاتورة
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-bold flex gap-2">
                    <span className="text-emerald-700">كاش: {effectiveCashCount}</span>
                    <span>•</span>
                    <span className="text-blue-700">فيزا: {effectiveCardCount}</span>
                    <span>•</span>
                    <span className="text-purple-700">إنستاباي: {effectiveWalletCount}</span>
                  </div>
                </div>

                {shiftOrders.length === 0 ? (
                  <div className="text-center py-6 text-slate-400">
                    <Receipt size={32} className="mx-auto text-slate-300 mb-1" />
                    <p className="font-bold text-xs text-slate-600">لم يتم تسجيل فواتير مدفوعة خلال هذه الوردية بعد</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">ستظهر هنا كافة الفواتير بمجرد إتمام تحصيلها</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="py-2 px-2.5">الفاتورة والوقت</th>
                          <th className="py-2 px-2.5">النوع / الطاولة</th>
                          <th className="py-2 px-2.5">الكاشير</th>
                          <th className="py-2 px-2.5">طريقة الدفع</th>
                          <th className="py-2 px-2.5">الأصناف</th>
                          <th className="py-2 px-2.5 text-left">القيمة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {shiftOrders.map((ord: any, idx: number) => {
                          const ordNum = ord.daily_order_number || ord.id;
                          const time = new Date(ord.created_at || Date.now()).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                          const total = Number(ord.total_price || ord.total_amount || 0);
                          const pay = ord.payment_method || 'cash';
                          const payLabel = pay === 'card' ? '💳 فيزا' : pay === 'wallet' || pay === 'instapay' ? '📱 إنستاباي' : '💵 كاش';
                          const cashier = ord.cashier_name || shift.cashierName || 'كاشير الفرع';

                          return (
                            <tr key={idx} className="hover:bg-slate-50/80">
                              <td className="py-2 px-2.5 font-bold font-mono text-slate-800">
                                <div className="flex items-center gap-1.5">
                                  <span className="bg-amber-50 border border-amber-200 text-amber-800 px-1.5 py-0.5 rounded text-[11px]">#{ordNum}</span>
                                  <span className="text-[10px] text-slate-400 font-normal">{time}</span>
                                </div>
                              </td>
                              <td className="py-2 px-2.5 text-slate-600 font-medium">
                                {ord.order_type === 'dine_in' ? `🍽️ طاولة ${ord.table_number || ord.tables?.table_number || 'صالة'}` : ord.order_type === 'delivery' ? '🛵 دليفري' : '🛍️ سفري'}
                              </td>
                              <td className="py-2 px-2.5 text-slate-700 font-bold text-[11px]">
                                {cashier}
                              </td>
                              <td className="py-2 px-2.5">
                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                  pay === 'card' ? 'bg-blue-50 text-blue-700 border border-blue-200' : pay === 'wallet' || pay === 'instapay' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}>
                                  {payLabel}
                                </span>
                              </td>
                              <td className="py-2 px-2.5 text-slate-500 text-[11px] truncate max-w-[180px]">
                                {Array.isArray(ord.items) 
                                  ? ord.items.map((it: any) => `${it.quantity || 1}x ${it.name}`).join(', ')
                                  : Array.isArray(ord.order_items)
                                  ? ord.order_items.map((it: any) => `${it.quantity || 1}x ${it.products?.name_ar || it.products?.name_en || 'صنف'}`).join(', ')
                                  : '-'}
                              </td>
                              <td className="py-2 px-2.5 text-left font-mono font-bold text-slate-900">
                                {total.toFixed(2)} ج.م
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
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
                        className="w-full bg-white border border-rose-300 focus:border-rose-500 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 outline-none shadow-sm"
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
            </>
          ) : (
            /* Visual Thermal Paper Preview */
            <div className="flex justify-center p-2">
              <div className="w-full max-w-[320px] bg-white border border-slate-300 shadow-md rounded-xl p-4 text-[11px] font-mono text-slate-900 leading-relaxed space-y-2 select-text">
                <div className="text-center font-bold pb-2 border-b-2 border-dashed border-slate-400">
                  <div className="text-base font-black">{restaurantName}</div>
                  <div className="text-xs font-bold mt-1 text-slate-700">
                    {reportType === 'Z' ? '*** تقرير إغلاق الوردية (Z-REPORT) ***' : '*** تقرير مبيعات الوردية (X-REPORT) ***'}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {reportType === 'Z' ? 'تصفير المبيعات وتقفيل مالي' : 'قراءة لحظية بدون تصفير'}
                  </div>
                </div>

                <div className="py-1 border-b border-dashed border-slate-300 text-[10px] space-y-0.5">
                  <div className="flex justify-between"><span>رقم الشيفت:</span><span className="font-bold">#{shift.id}</span></div>
                  <div className="flex justify-between"><span>الكاشير:</span><span className="font-bold">{shift.cashierName}</span></div>
                  <div className="flex justify-between"><span>تاريخ الفتح:</span><span>{openedDateFormatted} {openedTimeFormatted}</span></div>
                  <div className="flex justify-between"><span>تاريخ التقرير:</span><span>{dateFormatted} {timeFormatted}</span></div>
                </div>

                <div className="py-1 border-b border-dashed border-slate-300 space-y-1 text-[11px]">
                  <div className="font-bold text-center underline text-slate-800">ملخص المبيعات (SALES)</div>
                  <div className="flex justify-between"><span>عدد الفواتير:</span><span className="font-bold">{effectiveOrdersCount} طلب</span></div>
                  <div className="flex justify-between"><span>إجمالي المبيعات:</span><span className="font-bold">{totalGrossSales.toFixed(2)} ج.م</span></div>
                  {shift.totalDiscounts > 0 && (
                    <div className="flex justify-between text-amber-700"><span>إجمالي الخصومات:</span><span>-{shift.totalDiscounts.toFixed(2)} ج.م</span></div>
                  )}
                  <div className="flex justify-between font-bold border-t border-dotted border-slate-300 pt-0.5">
                    <span>صافي المبيعات:</span><span>{netSales.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between text-[10px]"><span>- مبيعات كاش ({effectiveCashCount}):</span><span>{effectiveCashSales.toFixed(2)} ج.م</span></div>
                  <div className="flex justify-between text-[10px]"><span>- مبيعات فيزا ({effectiveCardCount}):</span><span>{effectiveCardSales.toFixed(2)} ج.م</span></div>
                  <div className="flex justify-between text-[10px]"><span>- محافظ / إنستاباي ({effectiveWalletCount}):</span><span>{effectiveWalletSales.toFixed(2)} ج.م</span></div>
                  <div className="flex justify-between text-[10px]"><span>- ضريبة ق.م 14%:</span><span>{shift.totalTax.toFixed(2)} ج.م</span></div>
                </div>

                {/* Orders breakdown in thermal preview */}
                {shiftOrders.length > 0 && (
                  <div className="py-1.5 border-b border-dashed border-slate-300 space-y-1 text-[10px]">
                    <div className="font-bold text-center underline text-slate-800 pb-0.5">فواتير الكاشير بالوردية ({shiftOrders.length})</div>
                    <div className="space-y-0.5 max-h-48 overflow-y-auto">
                      {shiftOrders.map((ord: any, idx: number) => {
                        const ordNum = ord.daily_order_number || ord.id;
                        const pay = ord.payment_method === 'card' ? 'فيزا' : ord.payment_method === 'wallet' || ord.payment_method === 'instapay' ? 'إنستاباي' : 'كاش';
                        const total = Number(ord.total_price || ord.total_amount || 0);
                        return (
                          <div key={idx} className="flex justify-between border-b border-dotted border-slate-200 pb-0.5">
                            <span>#{ordNum} [{pay}] {ord.cashier_name ? `(${ord.cashier_name})` : ''}</span>
                            <span className="font-bold font-mono">{total.toFixed(2)} ج.م</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="py-1 border-b border-dashed border-slate-300 space-y-1 text-[11px]">
                  <div className="font-bold text-center underline text-slate-800">حركة نقدية الدرج (CASH DRAWER)</div>
                  <div className="flex justify-between"><span>العهدة الافتتاحية (+):</span><span>{shift.startingCash.toFixed(2)} ج.م</span></div>
                  <div className="flex justify-between"><span>المقبوضات النقدية (+):</span><span>{effectiveCashSales.toFixed(2)} ج.م</span></div>
                  <div className="flex justify-between"><span>إيداعات بالدرج (+):</span><span>{totalCashIn.toFixed(2)} ج.م</span></div>
                  <div className="flex justify-between"><span>مصروفات ومسحوبات (-):</span><span>{totalCashOut.toFixed(2)} ج.م</span></div>
                  <div className="flex justify-between font-bold border-t border-slate-300 pt-0.5">
                    <span>المتوقع بالدرج (=):</span><span>{expectedCashInDrawer.toFixed(2)} ج.م</span>
                  </div>
                  {reportType === 'Z' && (
                    <>
                      <div className="flex justify-between font-bold text-blue-800">
                        <span>الفعلي بالدرج:</span><span>{actualCashNum.toFixed(2)} ج.م</span>
                      </div>
                      <div className={`flex justify-between font-black ${cashDifference < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        <span>الفارق:</span>
                        <span>{cashDifference === 0 ? '0.00 (مطابق)' : cashDifference > 0 ? `+${cashDifference.toFixed(2)} (زيادة)` : `${cashDifference.toFixed(2)} (عجز)`}</span>
                      </div>
                      {closingNotes && (
                        <div className="text-[10px] text-slate-600 pt-1">
                          <span className="font-bold">ملاحظات: </span>{closingNotes}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="pt-3 pb-1 text-[10px] space-y-3">
                  <div>توقيع الكاشير المسلم: ............................</div>
                  <div>توقيع المدير / المستلم: ............................</div>
                </div>

                <div className="text-center pt-2 text-[9px] text-slate-400 border-t border-dashed border-slate-300">
                  نظام كاشير كريتا السحابي - POS
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 🖨️ STANDALONE THERMAL REPORT PRINT ELEMENT (Targeted by printThermalElement) */}
        <div className="hidden print:block printable-thermal" id="thermal-shift-report-wrapper">
          <div ref={thermalReportRef} id="thermal-shift-report" className="printable-thermal">
            <div className="text-center pb-2 border-b-2 border-dashed border-gray-800">
              <h2 className="text-base font-black tracking-tight">{restaurantName}</h2>
              <p className="text-xs font-bold mt-0.5">
                {reportType === 'Z' ? '*** تقرير إغلاق الوردية النهائي (Z-REPORT) ***' : '*** تقرير مبيعات الشيفت اللحظي (X-REPORT) ***'}
              </p>
              <p className="text-[10px] text-gray-700 mt-0.5">
                {reportType === 'Z' ? 'تقفيل مالي وتصفير المبيعات' : 'قراءة نقدية بدون تصفير'}
              </p>
            </div>

            <div className="py-2 border-b border-dashed border-gray-400 text-[10px] space-y-1">
              <div className="flex justify-between">
                <span>رقم الوردية:</span>
                <span className="font-mono font-bold">#{shift.id}</span>
              </div>
              <div className="flex justify-between">
                <span>الكاشير المسؤول:</span>
                <span className="font-bold">{shift.cashierName}</span>
              </div>
              <div className="flex justify-between">
                <span>تاريخ ووقت الفتح:</span>
                <span className="font-mono">{openedDateFormatted} {openedTimeFormatted}</span>
              </div>
              <div className="flex justify-between">
                <span>تاريخ ووقت التقرير:</span>
                <span className="font-mono font-bold">{dateFormatted} {timeFormatted}</span>
              </div>
            </div>

            <div className="py-2 border-b border-dashed border-gray-400 text-[11px] space-y-1">
              <div className="font-bold text-center text-xs pb-0.5 border-b border-gray-200">ملخص المبيعات (SALES SUMMARY)</div>
              <div className="flex justify-between">
                <span>عدد الفواتير المنفذة:</span>
                <span className="font-mono font-bold">{effectiveOrdersCount} طلب</span>
              </div>
              <div className="flex justify-between">
                <span>المبيعات الإجمالية (Gross):</span>
                <span className="font-mono font-bold">{totalGrossSales.toFixed(2)} ج.م</span>
              </div>
              {shift.totalDiscounts > 0 && (
                <div className="flex justify-between">
                  <span>إجمالي الخصومات (Discounts):</span>
                  <span className="font-mono">-{shift.totalDiscounts.toFixed(2)} ج.م</span>
                </div>
              )}
              <div className="flex justify-between font-black border-t border-dashed border-gray-300 pt-0.5">
                <span>صافي المبيعات (Net Sales):</span>
                <span className="font-mono">{netSales.toFixed(2)} ج.م</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span>- مبيعات نقدية ({effectiveCashCount}):</span>
                <span className="font-mono">{effectiveCashSales.toFixed(2)} ج.م</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span>- مبيعات بطاقات / فيزا ({effectiveCardCount}):</span>
                <span className="font-mono">{effectiveCardSales.toFixed(2)} ج.م</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span>- محافظ / إنستاباي ({effectiveWalletCount}):</span>
                <span className="font-mono">{effectiveWalletSales.toFixed(2)} ج.م</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span>- ضريبة القيمة المضافة 14%:</span>
                <span className="font-mono">{shift.totalTax.toFixed(2)} ج.م</span>
              </div>
              {shift.totalServiceFee > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span>- خدمة الصالة:</span>
                  <span className="font-mono">{shift.totalServiceFee.toFixed(2)} ج.م</span>
                </div>
              )}
              {shift.totalRefunds > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span>- المرتجعات:</span>
                  <span className="font-mono">-{shift.totalRefunds.toFixed(2)} ج.م</span>
                </div>
              )}
            </div>

            {/* List of Orders in Thermal Print */}
            {shiftOrders.length > 0 && (
              <div className="py-2 border-b border-dashed border-gray-400 text-[10px] space-y-1">
                <div className="font-bold text-center underline pb-0.5">سجل فواتير وأوردرات الوردية ({shiftOrders.length})</div>
                <div className="space-y-0.5">
                  {shiftOrders.map((ord: any, idx: number) => {
                    const ordNum = ord.daily_order_number || ord.id;
                    const pay = ord.payment_method === 'card' ? 'فيزا' : ord.payment_method === 'wallet' || ord.payment_method === 'instapay' ? 'إنستاباي' : 'كاش';
                    const total = Number(ord.total_price || ord.total_amount || 0);
                    return (
                      <div key={idx} className="flex justify-between border-b border-dotted border-gray-200 pb-0.5">
                        <span>#{ordNum} [{pay}] {ord.cashier_name ? `(${ord.cashier_name})` : ''}</span>
                        <span className="font-bold font-mono">{total.toFixed(2)} ج.م</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="py-2 border-b-2 border-dashed border-gray-800 text-[11px] space-y-1">
              <div className="font-bold text-center text-xs pb-0.5 border-b border-gray-200">حركة نقدية الدرج (CASH DRAWER)</div>
              <div className="flex justify-between">
                <span>العهدة الافتتاحية (+):</span>
                <span className="font-mono">+{shift.startingCash.toFixed(2)} ج.م</span>
              </div>
              <div className="flex justify-between">
                <span>المقبوضات النقدية (+):</span>
                <span className="font-mono">+{effectiveCashSales.toFixed(2)} ج.م</span>
              </div>
              <div className="flex justify-between">
                <span>إيداعات إضافية بالدرج (+):</span>
                <span className="font-mono">+{totalCashIn.toFixed(2)} ج.م</span>
              </div>
              <div className="flex justify-between">
                <span>مصروفات ومسحوبات (-):</span>
                <span className="font-mono">-{totalCashOut.toFixed(2)} ج.م</span>
              </div>
              <div className="flex justify-between font-black border-t border-dashed border-gray-300 pt-0.5">
                <span>المبلغ المتوقع بالدرج (=):</span>
                <span className="font-mono">{expectedCashInDrawer.toFixed(2)} ج.م</span>
              </div>

              {reportType === 'Z' && (
                <>
                  <div className="flex justify-between font-bold">
                    <span>المبلغ الفعلي المستلم:</span>
                    <span className="font-mono">{actualCashNum.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between font-black">
                    <span>الفارق (عجز / زيادة):</span>
                    <span className="font-mono">
                      {cashDifference === 0 
                        ? '0.00 (مطابق)' 
                        : cashDifference > 0 
                        ? `+${cashDifference.toFixed(2)} (زيادة)` 
                        : `${cashDifference.toFixed(2)} (عجز)`}
                    </span>
                  </div>
                  {closingNotes && (
                    <div className="text-[10px] pt-1">
                      <span className="font-bold">ملاحظات التقفيل: </span>{closingNotes}
                    </div>
                  )}
                </>
              )}
            </div>

            {shift.transactions.length > 0 && (
              <div className="py-2 border-b border-dashed border-gray-400 text-[10px] space-y-1">
                <div className="font-bold">سجل حركات الدرج:</div>
                {shift.transactions.map((t, idx) => (
                  <div key={idx} className="flex justify-between text-gray-700">
                    <span>{t.type === 'cash_in' ? '+ إيداع' : '- سحب'}: {t.reason}</span>
                    <span className="font-mono font-bold">{t.amount.toFixed(2)} ج.م</span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-4 pb-2 text-[10px] space-y-4">
              <div className="flex justify-between">
                <span>توقيع مسؤول الوردية (الكاشير):</span>
                <span>............................</span>
              </div>
              <div className="flex justify-between">
                <span>توقيع المدير / المستلم:</span>
                <span>............................</span>
              </div>
            </div>

            <div className="text-center pt-3 text-[9px] text-gray-500 border-t border-dashed border-gray-400">
              نظام كاشير كريتا السحابي - POS
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handlePrint}
            className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-md transition-all cursor-pointer active:scale-95"
          >
            <Printer size={16} />
            <span>طباعة التقرير (طابعة حرارية)</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              إغلاق
            </button>

            {reportType === 'Z' && (
              <button
                type="button"
                onClick={handleCloseShift}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-md shadow-rose-600/20 transition-all cursor-pointer active:scale-95"
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
