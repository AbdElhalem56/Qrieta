import React, { useState } from 'react';
import { X, Users, Check, Percent, Split, Plus, Minus, ArrowRight, DollarSign } from 'lucide-react';
import { POSCartItem } from '../../lib/posStore';

interface SplitBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: POSCartItem[];
  subtotal: number;
  taxAmount: number;
  finalTotal: number;
  onConfirmSplit: (splitTickets: Array<{ items: POSCartItem[]; total: number }>) => void;
}

export const SplitBillModal: React.FC<SplitBillModalProps> = ({
  isOpen,
  onClose,
  cart,
  subtotal,
  taxAmount,
  finalTotal,
  onConfirmSplit,
}) => {
  const [splitMode, setSplitMode] = useState<'equal' | 'by_item'>('equal');
  const [numPersons, setNumPersons] = useState<number>(2);

  if (!isOpen) return null;

  const equalShare = finalTotal / (numPersons || 1);

  const handleEqualSplitSubmit = () => {
    const tickets = Array.from({ length: numPersons }).map((_, i) => ({
      items: cart.map(item => ({
        ...item,
        quantity: item.quantity / numPersons,
      })),
      total: equalShare,
    }));
    onConfirmSplit(tickets);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-600/20">
              <Split size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">تقسيم الفاتورة (Split Bill)</h3>
              <p className="text-xs text-slate-500">تقسيم قيمة الحساب بالتساوي أو بحسب اختيار الأصناف</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 bg-slate-50">
          {/* Total Overview Box */}
          <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <div>
              <span className="text-xs text-slate-500 block">إجمالي الفاتورة المطلوب سدادها:</span>
              <span className="text-xl font-bold font-mono text-emerald-600">{finalTotal.toFixed(2)} ج.م</span>
            </div>
            <div className="text-left text-xs text-slate-500">
              <span>عدد الأصناف: {cart.length}</span>
            </div>
          </div>

          {/* Equal Split Section */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="text-center space-y-1">
              <span className="text-xs font-bold text-slate-700 block">حدد عدد الأفراد للتقسيم بالتساوي:</span>
              <p className="text-xs text-slate-500">سيتم استخراج إيصال منفصل لكل فرد بحصته المتساوية</p>
            </div>

            {/* Stepper */}
            <div className="flex items-center justify-center gap-4 py-2">
              <button
                type="button"
                onClick={() => setNumPersons(prev => Math.max(2, prev - 1))}
                className="w-10 h-10 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 rounded-xl flex items-center justify-center font-bold text-lg cursor-pointer"
              >
                -
              </button>

              <div className="text-center px-4">
                <span className="text-3xl font-bold font-mono text-indigo-600 block">{numPersons}</span>
                <span className="text-[11px] text-slate-500 font-bold">أفراد</span>
              </div>

              <button
                type="button"
                onClick={() => setNumPersons(prev => Math.min(20, prev + 1))}
                className="w-10 h-10 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 rounded-xl flex items-center justify-center font-bold text-lg cursor-pointer"
              >
                +
              </button>
            </div>

            {/* Share Result Badge */}
            <div className="bg-indigo-50 border border-indigo-200 p-3.5 rounded-2xl text-center space-y-1">
              <span className="text-xs text-indigo-900 font-bold block">نصيب كل فرد مطلوب دفعه:</span>
              <span className="text-2xl font-bold font-mono text-indigo-700 block">
                {equalShare.toFixed(2)} <span className="text-xs font-sans">ج.م / فرد</span>
              </span>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            إلغاء
          </button>
          <button
            onClick={handleEqualSplitSubmit}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <Check size={16} />
            <span>تأكيد تقسيم الحساب واستخراج الإيصالات</span>
          </button>
        </div>
      </div>
    </div>
  );
};
