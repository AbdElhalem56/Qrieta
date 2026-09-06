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
  orders?: any[];
  onCloseShiftConfirm?: (actualCash: number, notes: string) => void;
}

export const ShiftReportModal: React.FC<ShiftReportModalProps> = ({
  isOpen,
  onClose,
  reportType,
  shift,
  restaurantName,
  orders,
  onCloseShiftConfirm,
}) => {
  const thermalReportRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'preview'>('details');

  const shiftOrders = orders || shift.orders || [];
  const cashOrdersCount = shiftOrders.filter((o: any) => o.payment_method === 'cash').length;
  const cardOrdersCount = shiftOrders.filter((o: any) => o.payment_method === 'card').length;
  const walletOrdersCount = shiftOrders.filter((o: any) => o.payment_method === 'wallet').length;

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
  const totalGrossSales = shift.cashSales + shift.cardSales + shift.walletSales;
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

              {/* 📋 Cashier Shift Orders Table (سجل فواتير وطلبات الوردية) */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center font-bold">
                      <Receipt size={18} />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-800 text-xs sm:text-sm flex items-center gap-1.5">
                        <span>سجل فواتير وطلبات الوردية</span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold">
                          {shiftOrders.length} طلب
                        </span>
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        كافة العمليات التي تم تنفيذها بواسطة الكاشير خلال هذه الوردية
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap text-xs font-bold">
                    <span className="bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-200 text-[10px] flex items-center gap-1">
                      <span>💵 كاش:</span>
                      <span className="font-mono font-black">{cashOrdersCount}</span>
                    </span>
                    <span className="bg-blue-50 text-blue-800 px-2.5 py-1 rounded-lg border border-blue-200 text-[10px] flex items-center gap-1">
                      <span>💳 فيزا:</span>
                      <span className="font-mono font-black">{cardOrdersCount}</span>
                    </span>
                    <span className="bg-purple-50 text-purple-800 px-2.5 py-1 rounded-lg border border-purple-200 text-[10px] flex items-center gap-1">
                      <span>📱 إنستاباي:</span>
                      <span className="font-mono font-black">{walletOrdersCount}</span>
                    </span>
                  </div>
                </div>

                {shiftOrders.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    لا توجد فواتير مسجلة في هذه الوردية حتى الآن.
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-100 rounded-xl">
                    <table className="w-full text-right text-xs border-collapse">
                      <thead className="sticky top-0 bg-slate-100 text-slate-700 font-black border-b border-slate-200 text-[11px]">
                        <tr>
                          <th className="p-2.5">رقم الطلب</th>
                          <th className="p-2.5">الوقت</th>
                          <th className="p-2.5">نوع الطلب</th>
                          <th className="p-2.5">الكاشير المسؤول</th>
                          <th className="p-2.5">طريقة الدفع</th>
                          <th className="p-2.5 text-left">قيمة الفاتورة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {shiftOrders.map((ord: any, idx: number) => {
                          const orderNum = ord.daily_order_number || ord.id || (idx + 1);
                          const dateObj = new Date(ord.created_at || Date.now());
                          const timeStr = dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                          const isCash = ord.payment_method === 'cash';
                          const isCard = ord.payment_method === 'card';
                          const isWallet = ord.payment_method === 'wallet';
                          const totalVal = Number(ord.total_price || ord.total || ord.total_amount || 0);

                          return (
                            <tr key={ord.id || idx} className="hover:bg-slate-50/80 transition-colors">
                              <td className="p-2.5 font-mono font-bold text-slate-800">
                                #{orderNum}
                              </td>
                              <td className="p-2.5 font-mono text-slate-500 text-[11px]">
                                {timeStr}
                              </td>
                              <td className="p-2.5">
                                <span className="font-bold text-slate-700">
                                  {ord.order_type === 'dine_in' 
                                    ? `صالة ${ord.table_number ? `(طاولة ${ord.table_number})` : ''}` 
                                    : ord.order_type === 'delivery' 
                                    ? 'دليفري (توصيل)' 
                                    : 'سفري (تيك أواي)'}
                                </span>
                              </td>
                              <td className="p-2.5 text-slate-700 font-bold text-[11px]">
                                👤 {ord.cashier_name || shift.cashierName || 'كاشير الفرع'}
                              </td>
                              <td className="p-2.5">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isCard 
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                                    : isWallet 
                                    ? 'bg-purple-50 text-purple-700 border border-purple-200' 
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}>
                                  {isCard ? '💳 فيزا' : isWallet ? '📱 إنستاباي' : '💵 كاش'}
                                </span>
                              </td>
                              <td className="p-2.5 font-mono font-bold text-emerald-600 text-left">
                                {totalVal.toFixed(2)} ج.م
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
                  <div className="flex justify-between"><span>عدد الفواتير:</span><span className="font-bold">{shift.ordersCount} طلب</span></div>
                  <div className="flex justify-between"><span>إجمالي المبيعات:</span><span className="font-bold">{totalGrossSales.toFixed(2)} ج.م</span></div>
                  {shift.totalDiscounts > 0 && (
                    <div className="flex justify-between text-amber-700"><span>إجمالي الخصومات:</span><span>-{shift.totalDiscounts.toFixed(2)} ج.م</span></div>
                  )}
                  <div className="flex justify-between font-bold border-t border-dotted border-slate-300 pt-0.5">
                    <span>صافي المبيعات:</span><span>{netSales.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between text-[10px]"><span>- مبيعات كاش ({cashOrdersCount} طلب):</span><span>{shift.cashSales.toFixed(2)} ج.م</span></div>
                  <div className="flex justify-between text-[10px]"><span>- مبيعات فيزا ({cardOrdersCount} طلب):</span><span>{shift.cardSales.toFixed(2)} ج.م</span></div>
                  <div className="flex justify-between text-[10px]"><span>- محافظ / إنستاباي ({walletOrdersCount} طلب):</span><span>{shift.walletSales.toFixed(2)} ج.م</span></div>
                  <div className="flex justify-between text-[10px]"><span>- ضريبة ق.م 14%:</span><span>{shift.totalTax.toFixed(2)} ج.م</span></div>
                </div>

                {/* Orders List in Preview Receipt */}
                {shiftOrders.length > 0 && (
                  <div className="py-1 border-b border-dashed border-slate-300 space-y-0.5 text-[10px]">
                    <div className="font-bold text-center underline text-slate-800">بيان فواتير الكاشير ({shiftOrders.length})</div>
                    {shiftOrders.slice(0, 25).map((o: any, idx: number) => {
                      const num = o.daily_order_number || o.id || (idx + 1);
                      const pay = o.payment_method === 'card' ? 'فيزا' : o.payment_method === 'wallet' ? 'إنستاباي' : 'كاش';
                      const val = Number(o.total_price || o.total || o.total_amount || 0);
                      return (
                        <div key={idx} className="flex justify-between font-mono">
                          <span>#{num} ({pay})</span>
                          <span>{val.toFixed(2)} ج.م</span>
                        </div>
                      );
                    })}
                    {shiftOrders.length > 25 && (
                      <div className="text-center text-[9px] text-slate-400">
                        + {shiftOrders.length - 25} فواتير أخرى
                      </div>
                    )}
                  </div>
                )}

                <div className="py-1 border-b border-dashed border-slate-300 space-y-1 text-[11px]">
                  <div className="font-bold text-center underline text-slate-800">حركة نقدية الدرج (CASH DRAWER)</div>
                  <div className="flex justify-between"><span>العهدة الافتتاحية (+):</span><span>{shift.startingCash.toFixed(2)} ج.م</span></div>
                  <div className="flex justify-between"><span>المقبوضات النقدية (+):</span><span>{shift.cashSales.toFixed(2)} ج.م</span></div>
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
                <span className="font-mono font-bold">{shift.ordersCount} طلب</span>
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
                <span>- مبيعات نقدية ({cashOrdersCount} طلب):</span>
                <span className="font-mono">{shift.cashSales.toFixed(2)} ج.م</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span>- مبيعات بطاقات / فيزا ({cardOrdersCount} طلب):</span>
                <span className="font-mono">{shift.cardSales.toFixed(2)} ج.م</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span>- محافظ / إنستاباي ({walletOrdersCount} طلب):</span>
                <span className="font-mono">{shift.walletSales.toFixed(2)} ج.م</span>
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

            {/* Shift Orders List in Standalone Thermal Print */}
            {shiftOrders.length > 0 && (
              <div className="py-2 border-b border-dashed border-gray-400 text-[10px] space-y-1">
                <div className="font-bold text-center text-xs pb-0.5 border-b border-gray-200">
                  فواتير الوردية ({shiftOrders.length} فاتورة)
                </div>
                {shiftOrders.slice(0, 30).map((o: any, idx: number) => {
                  const num = o.daily_order_number || o.id || (idx + 1);
                  const pay = o.payment_method === 'card' ? 'فيزا' : o.payment_method === 'wallet' ? 'إنستاباي' : 'كاش';
                  const val = Number(o.total_price || o.total || o.total_amount || 0);
                  return (
                    <div key={idx} className="flex justify-between font-mono text-[9px]">
                      <span>#{num} ({pay})</span>
                      <span className="font-bold">{val.toFixed(2)} ج.م</span>
                    </div>
                  );
                })}
                {shiftOrders.length > 30 && (
                  <div className="text-center text-[9px] text-gray-500">
                    + {shiftOrders.length - 30} فواتير إضافية
                  </div>
                )}
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
                <span className="font-mono">+{shift.cashSales.toFixed(2)} ج.م</span>
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
