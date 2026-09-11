import React, { useState } from 'react';
import { 
  X, 
  DollarSign, 
  CreditCard, 
  Smartphone, 
  Printer, 
  ShoppingCart, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Receipt,
  User,
  Coffee
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency } from '../../lib/utils';

interface TableSettleModalProps {
  isOpen: boolean;
  onClose: () => void;
  table: any | null;
  onSettle: (table: any, method: 'cash' | 'card' | 'wallet') => void;
  onClearWithoutPayment: (table: any) => void;
  onLoadToCart: (table: any) => void;
  onPrintBill?: (table: any) => void;
}

export const TableSettleModal: React.FC<TableSettleModalProps> = ({
  isOpen,
  onClose,
  table,
  onSettle,
  onClearWithoutPayment,
  onLoadToCart,
  onPrintBill
}) => {
  const [selectedMethod, setSelectedMethod] = useState<'cash' | 'card' | 'wallet'>('cash');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  if (!isOpen || !table) return null;

  const activeOrders = Array.isArray(table.activeOrders) ? table.activeOrders : [];
  const activeOrderIds = new Set(activeOrders.map((o: any) => String(o.id)));
  const heldBills = Array.isArray(table.heldBills) 
    ? table.heldBills.filter((h: any) => !activeOrderIds.has(String(h.id))) 
    : [];

  const totalDue = Number(table.totalDue || 0);
  const totalOrdersCount = activeOrders.length + heldBills.length;

  const cashAmount = parseFloat(cashTendered) || 0;
  const changeDue = Math.max(0, cashAmount - totalDue);

  const handleConfirmSettle = async (method: 'cash' | 'card' | 'wallet') => {
    setIsProcessing(true);
    try {
      await onSettle(table, method);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      <div 
        id="table-settle-modal-overlay"
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm"
        dir="rtl"
      >
        <motion.div
          id="table-settle-modal-card"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20 font-black text-lg">
                #{table.table_number}
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                  <span>سداد وتحصيل حساب طاولة #{table.table_number}</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  تحصيل الفاتورة، إخلاء الطاولة وتصفير المستحقات
                </p>
              </div>
            </div>

            <button
              id="close-table-settle-modal-btn"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
            {/* Total Due Highlight Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-500 via-rose-600 to-red-600 text-white shadow-lg shadow-rose-500/20 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-rose-100 block mb-1">
                  المبلغ المطلوب تحصيله الآن:
                </span>
                <span className="text-3xl sm:text-4xl font-mono font-black tracking-tight">
                  {totalDue.toFixed(2)} <span className="text-sm font-sans font-bold">ج.م</span>
                </span>
              </div>
              <div className="text-left bg-black/20 px-3.5 py-2 rounded-xl border border-white/10">
                <span className="text-[11px] text-rose-100 block">عدد الطلبات:</span>
                <span className="text-sm font-mono font-bold">
                  {totalOrdersCount} {totalOrdersCount === 1 ? 'طلب نشط' : 'طلبات نشطة'}
                </span>
              </div>
            </div>

            {/* Unpaid Items Breakdown */}
            <div className="border border-slate-200 rounded-2xl p-3.5 bg-slate-50/60 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Receipt size={14} className="text-amber-600" />
                  <span>تفاصيل أصناف الطاولة المعلقة:</span>
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  {totalOrdersCount} طلب
                </span>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {activeOrders.length === 0 && heldBills.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-400">
                    لا توجد طلبات مسجلة على هذه الطاولة حالياً
                  </div>
                ) : null}

                {/* Active Orders List */}
                {activeOrders.map((ord: any, idx: number) => {
                  const items = ord.order_items || ord.items || [];
                  return (
                    <div key={ord.id || idx} className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          <span>طلب #{ord.daily_order_number || ord.id?.toString().slice(-4) || idx + 1}</span>
                          {ord.source === 'customer_app' && (
                            <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                              زبون
                            </span>
                          )}
                        </span>
                        <span className="font-mono font-black text-rose-600">
                          {Number(ord.total_price || ord.total_amount || 0).toFixed(2)} ج.م
                        </span>
                      </div>

                      {items.length > 0 && (
                        <div className="text-[11px] text-slate-600 space-y-0.5 pr-3">
                          {items.map((it: any, iIdx: number) => (
                            <div key={iIdx} className="flex items-center justify-between">
                              <span>
                                {it.quantity}x {it.name || it.product_name || (it.products && it.products.name_ar) || 'صنف'}
                              </span>
                              <span className="font-mono text-slate-400">
                                {Number((it.price_at_order || it.price || 0) * (it.quantity || 1)).toFixed(2)} ج.م
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Held Bills List */}
                {heldBills.map((held: any, idx: number) => (
                  <div key={held.id || idx} className="bg-white p-2.5 rounded-xl border border-amber-200 shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-amber-900 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span>فاتورة معلقة (كاشير)</span>
                      </span>
                      <span className="font-mono font-black text-amber-700">
                        {Number(held.total || 0).toFixed(2)} ج.م
                      </span>
                    </div>

                    {Array.isArray(held.cart) && held.cart.length > 0 && (
                      <div className="text-[11px] text-slate-600 space-y-0.5 pr-3">
                        {held.cart.map((it: any, iIdx: number) => (
                          <div key={iIdx} className="flex items-center justify-between">
                            <span>{it.quantity}x {it.name}</span>
                            <span className="font-mono text-slate-400">
                              {(Number(it.price || 0) * Number(it.quantity || 1)).toFixed(2)} ج.م
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                اختر طريقة التحصيل والسداد:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedMethod('cash')}
                  className={`py-3 px-2 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                    selectedMethod === 'cash'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20 ring-2 ring-emerald-300'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <DollarSign size={18} />
                  <span className="font-bold text-xs">كاش (نقدي)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedMethod('card')}
                  className={`py-3 px-2 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                    selectedMethod === 'card'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20 ring-2 ring-blue-300'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <CreditCard size={18} />
                  <span className="font-bold text-xs">فيزا (بطاقة)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedMethod('wallet')}
                  className={`py-3 px-2 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                    selectedMethod === 'wallet'
                      ? 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-600/20 ring-2 ring-purple-300'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <Smartphone size={18} />
                  <span className="font-bold text-xs">إنستاباي</span>
                </button>
              </div>

              {/* Cash Quick Tender helper */}
              {selectedMethod === 'cash' && (
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2 mt-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-600 font-medium">
                    <span>المبلغ المستلم من الزبون:</span>
                    <div className="flex items-center gap-1">
                      {[50, 100, 200, 500].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setCashTendered(val.toString())}
                          className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-700 font-mono text-[10px] hover:bg-slate-100 cursor-pointer"
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="المبلغ المدفوع..."
                      value={cashTendered}
                      onChange={e => setCashTendered(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-800 outline-none focus:border-emerald-500"
                    />
                    <div className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 flex items-center justify-between text-xs">
                      <span className="text-slate-500 text-[10px]">الباقي:</span>
                      <span className="font-mono font-bold text-emerald-600">
                        {changeDue.toFixed(2)} ج.م
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer & Action Buttons */}
          <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 space-y-2.5">
            {/* Main Complete Payment Button */}
            <button
              id="confirm-table-settle-btn"
              type="button"
              disabled={isProcessing}
              onClick={() => handleConfirmSettle(selectedMethod)}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-98 transition-all cursor-pointer"
            >
              <CheckCircle2 size={20} />
              <span>
                {isProcessing 
                  ? 'جاري التحصيل وتصفير الحساب...' 
                  : `تأكيد تحصيل (${totalDue.toFixed(2)} ج.م) وإخلاء الطاولة`}
              </span>
            </button>

            {/* Secondary Action Buttons */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {onPrintBill && (
                <button
                  type="button"
                  onClick={() => onPrintBill(table)}
                  className="py-2 px-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                  title="طباعة إيصال الفاتورة للزبون"
                >
                  <Printer size={14} className="text-slate-500" />
                  <span>طباعة بون</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onLoadToCart(table)}
                className="py-2 px-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                title="نقل الأصناف لسلة الكاشير لتعديلها أو إضافة خصم"
              >
                <ShoppingCart size={14} className="text-indigo-500" />
                <span>فتح بالسلة</span>
              </button>

              <button
                type="button"
                onClick={() => onClearWithoutPayment(table)}
                className="py-2 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                title="إخلاء الطاولة ومسح الحساب بدون تحصيل (إلغاء)"
              >
                <Trash2 size={14} className="text-rose-600" />
                <span>تصفير وإلغاء</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
