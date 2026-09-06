import React, { useState } from 'react';
import { X, Trash2, Check, AlertOctagon, DollarSign } from 'lucide-react';
import { RawMaterial, recordWaste, getUnitArabicName } from '../../../lib/recipeService';
import { formatCurrency, toEnglishDigits } from '../../../lib/utils';

interface NewWasteModalProps {
  restaurantId: string;
  rawMaterials: RawMaterial[];
  preSelectedMaterial?: RawMaterial | null;
  onClose: () => void;
  onSaved: () => void;
}

export const NewWasteModal: React.FC<NewWasteModalProps> = ({
  restaurantId,
  rawMaterials,
  preSelectedMaterial,
  onClose,
  onSaved,
}) => {
  const [selectedMaterialId, setSelectedMaterialId] = useState(preSelectedMaterial?.id || '');
  const [quantityInput, setQuantityInput] = useState('');
  const [reason, setReason] = useState('انتهت الصلاحية / تالف');
  const [performedBy, setPerformedBy] = useState('مدير الفرع');
  const [customNotes, setCustomNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedMaterial = rawMaterials.find(m => m.id === selectedMaterialId);
  const qty = parseFloat(quantityInput) || 0;
  const estimatedCost = selectedMaterial ? qty * selectedMaterial.cost_per_unit : 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterialId) {
      alert('يرجى اختيار المادة الخام');
      return;
    }
    if (qty <= 0) {
      alert('يرجى إدخال كمية صحيحة أكبر من صفر');
      return;
    }

    setSaving(true);
    try {
      const fullReason = customNotes.trim() ? `${reason} (${customNotes.trim()})` : reason;
      await recordWaste(restaurantId, {
        material_id: selectedMaterialId,
        quantity: qty,
        reason: fullReason,
        performed_by: performedBy.trim() || 'المسؤول'
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error('Error logging waste:', err);
      alert('حدث خطأ أثناء تسجيل الهدر');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
      />

      <div className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl my-auto max-h-[92vh] flex flex-col border border-gray-100 overflow-hidden text-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-red-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-600/30">
              <AlertOctagon size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900">تسجيل هدر وتوالف (Waste Log)</h3>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                خصم المواد التالفة أو المنسكبة من المخزن واحتساب الخسارة المالية
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-white rounded-full transition-colors cursor-pointer shadow-sm"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="overflow-y-auto p-6 flex-1 space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-700 mb-1.5">المادة الخام التالفة *</label>
            <select
              value={selectedMaterialId}
              onChange={e => setSelectedMaterialId(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 focus:bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:ring-2 ring-red-500"
            >
              <option value="">-- اضغط لاختيار المادة الخام --</option>
              {rawMaterials.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name_ar} (الرصيد بالمخزن: {m.current_stock} {m.unit})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-gray-700 mb-1.5">
              الكمية المهدرة {selectedMaterial ? `(${getUnitArabicName(selectedMaterial.unit)})` : ''} *
            </label>
            <input
              required
              type="number"
              step="0.1"
              min="0.1"
              placeholder="مثلاً: 250"
              value={quantityInput}
              onChange={e => setQuantityInput(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 focus:bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:ring-2 ring-red-500 text-center"
            />
          </div>

          {selectedMaterial && qty > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-red-900 block">قيمة الخسارة المالية الناتجة:</span>
                <span className="text-[11px] text-red-700">تُحتسب بناءً على متوسط سعر الشراء</span>
              </div>
              <span className="text-xl font-black text-red-600">
                {toEnglishDigits(formatCurrency(estimatedCost))}
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-black text-gray-700 mb-1.5">سبب التلف والهدر *</label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 focus:bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:ring-2 ring-red-500"
            >
              <option value="انتهت الصلاحية / تالف">انتهت الصلاحية / تالف</option>
              <option value="انسكاب أثناء العمل / سقوط">انسكاب أثناء العمل / سقوط</option>
              <option value="حرق شوت إسبريسو / خطأ باريستا">حرق شوت إسبريسو / خطأ باريستا</option>
              <option value="تلف في التخزين / سوء تبريد">تلف في التخزين / سوء تبريد</option>
              <option value="عيب مصنعي أو مورد">عيب مصنعي أو مورد</option>
              <option value="أخرى">سبب آخر</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-gray-700 mb-1.5">المسؤول / من أبلغ عن الهدر</label>
            <input
              type="text"
              value={performedBy}
              onChange={e => setPerformedBy(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 focus:bg-white rounded-xl px-4 py-2.5 font-bold text-xs outline-none focus:ring-2 ring-red-500 text-right"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-gray-700 mb-1.5">تفاصيل أو ملاحظات إضافية</label>
            <textarea
              rows={2}
              placeholder="اكتب أي ملاحظة عن الحادثة..."
              value={customNotes}
              onChange={e => setCustomNotes(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 focus:bg-white rounded-xl p-3 text-xs outline-none focus:ring-2 ring-red-500"
            />
          </div>

          <div className="pt-3 flex items-center justify-between border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 font-bold text-sm transition-colors cursor-pointer"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={saving || !selectedMaterialId || qty <= 0}
              className="px-8 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-black text-sm flex items-center gap-2 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
            >
              {saving ? (
                <span>جاري التسجيل...</span>
              ) : (
                <>
                  <Trash2 size={18} />
                  <span>تأكيد تسجيل الهدر وخصم الرصيد</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
