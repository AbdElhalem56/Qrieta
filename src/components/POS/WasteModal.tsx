import React, { useState } from 'react';
import { X, Trash, AlertTriangle, CheckCircle2, User, FileText } from 'lucide-react';
import { Product } from '../../lib/supabase';
import { WasteRecord } from '../../lib/posStore';

interface WasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onConfirmWaste: (wasteData: Omit<WasteRecord, 'id' | 'recordedAt'>) => void;
  cashierName?: string;
  restaurantId?: string;
}

export const WasteModal: React.FC<WasteModalProps> = ({
  isOpen,
  onClose,
  products,
  onConfirmWaste,
  cashierName,
  restaurantId,
}) => {
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState<'expired' | 'damaged' | 'burned' | 'preparation_error' | 'other'>('damaged');
  const [responsiblePerson, setResponsiblePerson] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  if (!isOpen) return null;

  const selectedProduct = products.find(p => p.id === selectedProductId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !selectedProduct) {
      alert('يرجى اختيار الصنف التالف');
      return;
    }

    onConfirmWaste({
      restaurantId: restaurantId || '',
      productId: selectedProductId,
      productName: selectedProduct.name_ar || selectedProduct.name_en || (selectedProduct as any).name || 'صنف',
      quantity,
      costEstimate: selectedProduct.price * 0.45 * quantity,
      reason,
      reasonText: notes.trim() || undefined,
      recordedBy: responsiblePerson.trim() || cashierName || 'الكاشير',
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center font-bold shadow-md shadow-rose-600/20">
              <Trash size={22} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">تسجيل هالك وتالف (Waste & Spoilage)</h3>
              <p className="text-xs text-slate-500">خصم تالف التحضير أو انتهاء الصلاحية من المخزن</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200">
            <X size={20} />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1 bg-slate-50">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">اختر الصنف التالف:</label>
            <select
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              className="w-full bg-white border border-slate-300 focus:border-rose-500 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none shadow-sm"
              required
            >
              <option value="">-- اضغط لاختيار الصنف --</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name_ar} - ({p.price.toFixed(2)} ج.م)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">الكمية التالفة:</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-8 h-8 bg-white border border-slate-300 rounded-lg font-bold text-slate-700"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full text-center bg-white border border-slate-300 rounded-lg py-1 text-xs font-mono font-bold text-slate-800 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setQuantity(q => q + 1)}
                  className="w-8 h-8 bg-white border border-slate-300 rounded-lg font-bold text-slate-700"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">سبب الهلاك:</label>
              <select
                value={reason}
                onChange={e => setReason(e.target.value as any)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none shadow-sm"
              >
                <option value="damaged">كسر / تلف أثناء التحضير</option>
                <option value="expired">انتهاء الصلاحية</option>
                <option value="mistake">خطأ في الأوردر (Wrong Item)</option>
                <option value="quality">رفض الجودة / الشيف</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">المسؤول عن الهالك / الشيف (اختياري):</label>
            <input
              type="text"
              placeholder="اسم الشيف أو العضو المسؤول..."
              value={responsiblePerson}
              onChange={e => setResponsiblePerson(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none shadow-sm"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">ملاحظات إضافية وتوضيح السبب:</label>
            <textarea
              rows={2}
              placeholder="اكتب توضيح لسبب الإتلاف..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs text-slate-800 outline-none shadow-sm"
            />
          </div>

          {/* Footer actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition-all cursor-pointer"
            >
              <CheckCircle2 size={16} />
              <span>تسجيل الهالك وخصم المخزون</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
