import React, { useState } from 'react';
import { X, DollarSign, CreditCard, Smartphone, CheckCircle2, AlertCircle, Heart, User } from 'lucide-react';

interface SplitPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalAmount: number;
  onConfirmSplitPayment: (paymentBreakdown: {
    cash: number;
    card: number;
    wallet: number;
    tipAmount: number;
    waiterName?: string;
  }) => void;
}

export const SplitPaymentModal: React.FC<SplitPaymentModalProps> = ({
  isOpen,
  onClose,
  totalAmount,
  onConfirmSplitPayment,
}) => {
  const [cashAmount, setCashAmount] = useState<string>('');
  const [cardAmount, setCardAmount] = useState<string>('');
  const [walletAmount, setWalletAmount] = useState<string>('');
  const [tipAmount, setTipAmount] = useState<string>('');
  const [waiterName, setWaiterName] = useState<string>('');

  if (!isOpen) return null;

  const cash = parseFloat(cashAmount) || 0;
  const card = parseFloat(cardAmount) || 0;
  const wallet = parseFloat(walletAmount) || 0;
  const tip = parseFloat(tipAmount) || 0;

  const totalPaid = cash + card + wallet;
  const remaining = totalAmount - totalPaid;
  const isFullyCovered = Math.abs(remaining) < 0.01 || totalPaid >= totalAmount;

  const handleFillRemaining = (type: 'cash' | 'card' | 'wallet') => {
    if (remaining <= 0) return;
    if (type === 'cash') setCashAmount((cash + remaining).toFixed(2));
    if (type === 'card') setCardAmount((card + remaining).toFixed(2));
    if (type === 'wallet') setWalletAmount((wallet + remaining).toFixed(2));
  };

  const handleSubmit = () => {
    if (!isFullyCovered) {
      alert(`المبلغ المدفوع (${totalPaid.toFixed(2)} ج.م) لا يغطي إجمالي الفاتورة (${totalAmount.toFixed(2)} ج.م). متبقي: ${remaining.toFixed(2)} ج.م`);
      return;
    }
    onConfirmSplitPayment({
      cash,
      card,
      wallet,
      tipAmount: tip,
      waiterName: waiterName.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-600/20">
              <DollarSign size={22} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">الدفع المقسم والتيبس (Split Payment & Tips)</h3>
              <p className="text-xs text-slate-500">سداد جزء كاش وجزء بطاقة وجزء محفظة إلكترونية</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 bg-slate-50">
          {/* Total Due and Remaining Balance Header */}
          <div className="bg-white border border-slate-200 p-4 rounded-2xl grid grid-cols-2 gap-3 shadow-sm">
            <div>
              <span className="text-xs text-slate-500 block">إجمالي الفاتورة:</span>
              <span className="text-lg font-bold font-mono text-slate-800">{totalAmount.toFixed(2)} ج.م</span>
            </div>

            <div>
              <span className="text-xs text-slate-500 block">المتبقي المطلوب تغطيته:</span>
              <span className={`text-lg font-bold font-mono ${
                isFullyCovered ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {remaining > 0 ? `${remaining.toFixed(2)} ج.م` : 'مكتمل بالكامل ✓'}
              </span>
            </div>
          </div>

          {/* Payment breakdown fields */}
          <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            {/* 1. Cash Input */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <DollarSign size={14} className="text-emerald-600" />
                  <span>دفع نقدي (كاش):</span>
                </span>
                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => handleFillRemaining('cash')}
                    className="text-[11px] text-emerald-700 hover:text-emerald-800 font-bold"
                  >
                    + استكمال المتبقي ({remaining.toFixed(2)})
                  </button>
                )}
              </div>
              <input
                type="number"
                step="0.5"
                placeholder="0.00"
                value={cashAmount}
                onChange={e => setCashAmount(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 focus:border-emerald-500 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 outline-none"
              />
            </div>

            {/* 2. Card Input */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <CreditCard size={14} className="text-blue-600" />
                  <span>دفع بالبطاقة / فيزا (Card):</span>
                </span>
                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => handleFillRemaining('card')}
                    className="text-[11px] text-blue-700 hover:text-blue-800 font-bold"
                  >
                    + استكمال المتبقي ({remaining.toFixed(2)})
                  </button>
                )}
              </div>
              <input
                type="number"
                step="0.5"
                placeholder="0.00"
                value={cardAmount}
                onChange={e => setCardAmount(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 focus:border-blue-500 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 outline-none"
              />
            </div>

            {/* 3. Wallet Input */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Smartphone size={14} className="text-purple-600" />
                  <span>محفظة إلكترونية / إنستاباي (InstaPay):</span>
                </span>
                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => handleFillRemaining('wallet')}
                    className="text-[11px] text-purple-700 hover:text-purple-800 font-bold"
                  >
                    + استكمال المتبقي ({remaining.toFixed(2)})
                  </button>
                )}
              </div>
              <input
                type="number"
                step="0.5"
                placeholder="0.00"
                value={walletAmount}
                onChange={e => setWalletAmount(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 focus:border-purple-500 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 outline-none"
              />
            </div>
          </div>

          {/* Tips and Waiter assignment */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
            <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <Heart size={14} className="text-rose-500" />
              <span>إكرامية / تيبس النادل (اختياري)</span>
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">مبلغ التيبس (ج.م):</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={tipAmount}
                  onChange={e => setTipAmount(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">اسم الويتر / الكابتن:</label>
                <input
                  type="text"
                  placeholder="اسم النادل..."
                  value={waiterName}
                  onChange={e => setWaiterName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-amber-500"
                />
              </div>
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
            onClick={handleSubmit}
            disabled={!isFullyCovered}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <CheckCircle2 size={16} />
            <span>تأكيد السداد المقسم</span>
          </button>
        </div>
      </div>
    </div>
  );
};
