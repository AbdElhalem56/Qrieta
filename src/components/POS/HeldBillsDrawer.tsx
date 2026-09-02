import React from 'react';
import { X, PauseCircle, PlayCircle, Trash2, Clock, Utensils, User, DollarSign } from 'lucide-react';
import { HeldBill } from '../../lib/posStore';

interface HeldBillsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  heldBills: HeldBill[];
  onRecallBill: (bill: HeldBill) => void;
  onDeleteHeldBill: (billId: string) => void;
}

export const HeldBillsDrawer: React.FC<HeldBillsDrawerProps> = ({
  isOpen,
  onClose,
  heldBills,
  onRecallBill,
  onDeleteHeldBill,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/50 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div className="bg-white border-r border-slate-200 w-full max-w-md h-full flex flex-col shadow-2xl animate-slide-left">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-md shadow-amber-500/20">
              <PauseCircle size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">الفواتير المعلقة (Held Bills)</h3>
              <p className="text-[11px] text-slate-500">({heldBills.length}) فاتورة محفوظة مؤقتاً</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 bg-slate-50">
          {heldBills.length === 0 ? (
            <div className="text-center py-16 text-slate-400 space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-white border border-slate-200 flex items-center justify-center mx-auto text-slate-400 shadow-sm">
                <PauseCircle size={32} />
              </div>
              <p className="text-xs font-bold text-slate-600">لا توجد فواتير معلقة حالياً</p>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                يمكنك الضغط على زر "تعليق الفاتورة (Hold)" لحفظ طلب العميل مؤقتاً وخدمة عميل آخر فوراً.
              </p>
            </div>
          ) : (
            heldBills.map(bill => (
              <div
                key={bill.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 hover:border-amber-400 transition-all shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-sm">{bill.title}</span>
                    <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md">
                      {bill.orderType === 'dine_in' ? 'صالة' : bill.orderType === 'takeaway' ? 'سفري' : 'دليفري'}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-emerald-600 text-sm">
                    {bill.total.toFixed(2)} ج.م
                  </span>
                </div>

                {/* Items preview snippet */}
                <div className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1">
                  {bill.cart.map(it => (
                    <div key={it.id} className="flex justify-between">
                      <span>{it.quantity}x {it.name}</span>
                      <span className="font-mono font-bold text-slate-500">{(it.price * it.quantity).toFixed(2)} ج.م</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-400 font-mono">
                    <Clock size={12} />
                    <span>{new Date(bill.heldAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onDeleteHeldBill(bill.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                      title="حذف الفاتورة المعلقة"
                    >
                      <Trash2 size={16} />
                    </button>

                    <button
                      onClick={() => {
                        onRecallBill(bill);
                        onClose();
                      }}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <PlayCircle size={15} />
                      <span>استرجاع ومتابعة</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
