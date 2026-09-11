import React from 'react';
import { Printer, X, ChefHat, CheckCircle2, Clock, Table as TableIcon, User, AlertTriangle } from 'lucide-react';
import { POSCartItem } from '../../lib/posStore';
import { printKitchenTicket } from '../../lib/printHelper';

interface KOTModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantName: string;
  dailyOrderNumber?: string | number;
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  tableNumber?: string | number;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  cashierName?: string;
  cart: POSCartItem[];
  orderNotes?: string;
  onConfirmSend: () => void;
}

export const KOTModal: React.FC<KOTModalProps> = ({
  isOpen,
  onClose,
  restaurantName,
  dailyOrderNumber,
  orderType,
  tableNumber,
  customerName,
  customerPhone,
  deliveryAddress,
  cashierName,
  cart,
  orderNotes,
  onConfirmSend,
}) => {
  if (!isOpen) return null;

  const handlePrintKOT = () => {
    printKitchenTicket({
      restaurantName,
      orderNumber: dailyOrderNumber || '1',
      orderType,
      tableNumber,
      customerName,
      customerPhone,
      deliveryAddress,
      cashierName: cashierName || 'الرئيسي',
      items: cart.map(it => ({
        name: it.name,
        quantity: it.quantity,
        notes: it.notes,
        options: it.options
      })),
      orderNotes
    });
  };

  const now = new Date();
  const timeFormatted = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const dateFormatted = now.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });

  const getOrderTypeLabel = () => {
    if (orderType === 'dine_in') return `🍽️ صالة - طاولة #${tableNumber || '؟'}`;
    if (orderType === 'takeaway') return '🥡 سفري (تيك أواي)';
    return '🛵 توصيل (دليفري)';
  };

  const totalItemsCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-md shadow-amber-500/20">
              <ChefHat size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">بون تشغيل المطبخ (KOT)</h3>
                <span className="text-[11px] font-mono font-bold bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full">
                  #{dailyOrderNumber || '1'}
                </span>
              </div>
              <p className="text-xs text-slate-300">بون موحد للمطبخ والشيف</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content: Single Unified Ticket Preview */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 bg-slate-100/70">
          <div className="bg-white border-2 border-slate-300 rounded-2xl p-5 space-y-4 shadow-md max-w-md mx-auto text-slate-900 font-sans">
            {/* Ticket Header */}
            <div className="text-center border-b-2 border-dashed border-slate-300 pb-3">
              <h4 className="font-black text-slate-900 text-base">{restaurantName}</h4>
              <div className="inline-block bg-slate-900 text-white font-black text-xs px-3 py-1 rounded-md mt-1">
                🍳 بون تشغيل المطبخ (KOT)
              </div>
            </div>

            {/* Order Header */}
            <div className="flex items-center justify-between border-b-2 border-slate-800 pb-3">
              <div>
                <span className="text-xs font-bold text-slate-500 block">نوع الطلب:</span>
                <span className="font-black text-base text-slate-950 block">
                  {getOrderTypeLabel()}
                </span>
                {customerName && (
                  <span className="text-xs font-bold text-slate-700 block mt-0.5">
                    العميل: {customerName}
                  </span>
                )}
                {customerPhone && (
                  <span className="text-xs font-mono text-slate-600 block">
                    هاتف: {customerPhone}
                  </span>
                )}
                {deliveryAddress && (
                  <span className="text-xs text-slate-600 block">
                    عنوان: {deliveryAddress}
                  </span>
                )}
              </div>
              <div className="text-left bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                <span className="text-[10px] font-bold text-slate-500 block text-left">رقم الطلب</span>
                <span className="font-mono font-black text-2xl text-slate-950 block text-left">
                  #{dailyOrderNumber || '1'}
                </span>
              </div>
            </div>

            {/* Metadata (Time, Date, Cashier) */}
            <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-600 border-b border-dashed border-slate-300 pb-2">
              <span>⏰ {timeFormatted}</span>
              <span>📅 {dateFormatted}</span>
              <span>👤 {cashierName || 'الرئيسي'}</span>
            </div>

            {/* Items List (NO STATIONS - Single Unified Table) */}
            <div className="divide-y divide-dashed divide-slate-200 py-1">
              {cart.map((item, idx) => (
                <div key={idx} className="py-2.5 flex items-start gap-3">
                  <span className="font-mono font-black text-base text-slate-950 border-2 border-slate-900 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-50">
                    {item.quantity}x
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="font-black text-sm text-slate-900 block leading-snug">
                      {item.name}
                    </span>
                    {item.options && item.options.length > 0 && (
                      <span className="text-xs font-bold text-slate-600 block mt-0.5">
                        ⚙️ {item.options.map(o => o.name).join(' • ')}
                      </span>
                    )}
                    {item.notes && (
                      <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md inline-block mt-1">
                        ⚠️ ملاحظة: {item.notes}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="border-t-2 border-slate-800 pt-3 flex items-center justify-between font-black text-xs">
              <span className="text-slate-700">إجمالي عدد الأصناف:</span>
              <span className="font-mono text-sm bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-md">
                {totalItemsCount} قطعة
              </span>
            </div>

            {/* General Order Notes */}
            {orderNotes && (
              <div className="bg-amber-50 border-2 border-dashed border-amber-300 p-2.5 rounded-xl text-xs text-amber-950 font-bold space-y-0.5">
                <span className="block text-amber-800">📝 ملاحظات خاصة للشيف:</span>
                <p>{orderNotes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handlePrintKOT}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl flex items-center gap-2 shadow-md transition-all cursor-pointer"
          >
            <Printer size={16} className="text-amber-400" />
            <span>طباعة البون الآن</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              إغلاق
            </button>
            <button
              type="button"
              onClick={() => {
                handlePrintKOT();
                onConfirmSend();
                onClose();
              }}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 text-xs font-black rounded-xl flex items-center gap-2 shadow-md shadow-amber-500/25 transition-all cursor-pointer"
            >
              <CheckCircle2 size={16} />
              <span>إرسال وطباعة</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
