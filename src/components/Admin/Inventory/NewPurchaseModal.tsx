import React, { useState } from 'react';
import { X, Plus, Trash2, Check, ShoppingCart, DollarSign, Calendar, Truck } from 'lucide-react';
import { 
  RawMaterial, 
  PurchaseInvoiceItem, 
  recordPurchaseInvoice, 
  getUnitArabicName 
} from '../../../lib/recipeService';
import { formatCurrency, toEnglishDigits } from '../../../lib/utils';

interface NewPurchaseModalProps {
  restaurantId: string;
  rawMaterials: RawMaterial[];
  onClose: () => void;
  onSaved: () => void;
}

export const NewPurchaseModal: React.FC<NewPurchaseModalProps> = ({
  restaurantId,
  rawMaterials,
  onClose,
  onSaved,
}) => {
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState(`PO-${Date.now().toString().slice(-6)}`);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseInvoiceItem[]>([]);

  // Item row input
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [quantityInput, setQuantityInput] = useState('');
  const [unitCostInput, setUnitCostInput] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAddItem = () => {
    if (!selectedMaterialId) return;
    const mat = rawMaterials.find(m => m.id === selectedMaterialId);
    if (!mat) return;

    const qty = parseFloat(quantityInput);
    const cost = parseFloat(unitCostInput);

    if (isNaN(qty) || qty <= 0) {
      alert('يرجى إدخال كمية صحيحة');
      return;
    }
    if (isNaN(cost) || cost <= 0) {
      alert('يرجى إدخال سعر شراء صحيح');
      return;
    }

    const totalCost = qty * cost;

    setItems([
      ...items,
      {
        material_id: mat.id,
        material_name: mat.name_ar,
        quantity: qty,
        unit: mat.unit,
        unit_cost: cost,
        total_cost: totalCost
      }
    ]);

    setSelectedMaterialId('');
    setQuantityInput('');
    setUnitCostInput('');
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, idx) => idx !== index));
  };

  const totalInvoiceAmount = items.reduce((acc, it) => acc + it.total_cost, 0);

  const handleSave = async () => {
    if (items.length === 0) {
      alert('يرجى إضافة بند واحد على الأقل لفاتورة التوريد');
      return;
    }

    setSaving(true);
    try {
      await recordPurchaseInvoice(restaurantId, {
        invoice_number: invoiceNumber.trim() || `PO-${Date.now().toString().slice(-6)}`,
        supplier_name: supplierName.trim() || 'مورد عام',
        date,
        items,
        notes: notes.trim() || undefined
      });
      onSaved();
      onClose();
    } catch (e) {
      console.error('Failed to save purchase invoice:', e);
      alert('حدث خطأ أثناء حفظ فاتورة التوريد');
    } finally {
      setSaving(false);
    }
  };

  const selectedMaterial = rawMaterials.find(m => m.id === selectedMaterialId);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
      />

      <div className="relative bg-white w-full max-w-3xl rounded-3xl shadow-2xl my-auto max-h-[92vh] flex flex-col border border-gray-100 overflow-hidden text-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Truck size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900">سند توريد وشراء بضاعة (Stock In)</h3>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                إضافة فواتير الموردين وزيادة رصيد المستودع واحتساب متوسط التكلفة تلقائياً
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

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-6 flex-1 space-y-5">
          {/* Invoice Header Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-200/80">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">اسم المورد أو الشركة *</label>
              <input
                type="text"
                placeholder="مثلاً: شركة البن الذهبي"
                value={supplierName}
                onChange={e => setSupplierName(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none text-right"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">رقم فاتورة المورد *</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none text-left"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">تاريخ التوريد</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none text-center"
              />
            </div>
          </div>

          {/* Add Item Row */}
          <div className="bg-blue-50/50 border border-blue-200/70 rounded-2xl p-4 space-y-3">
            <span className="text-xs font-black text-blue-900 block">إضافة مادة خام للفاتورة:</span>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5">
                <label className="block text-[11px] font-bold text-gray-600 mb-1">المادة الخام</label>
                <select
                  value={selectedMaterialId}
                  onChange={e => {
                    const id = e.target.value;
                    setSelectedMaterialId(id);
                    const mat = rawMaterials.find(m => m.id === id);
                    if (mat) {
                      setUnitCostInput(String(mat.cost_per_unit));
                    }
                  }}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">-- اختر المادة --</option>
                  {rawMaterials.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name_ar} ({getUnitArabicName(m.unit)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  الكمية الموردة {selectedMaterial ? `(${selectedMaterial.unit})` : ''}
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="مثال: 5000"
                  value={quantityInput}
                  onChange={e => setQuantityInput(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none text-center"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-gray-600 mb-1">سعر الوحدة (ج.م)</label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder="السعر"
                  value={unitCostInput}
                  onChange={e => setUnitCostInput(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none text-center"
                />
              </div>

              <div className="sm:col-span-2">
                <button
                  type="button"
                  disabled={!selectedMaterialId || !quantityInput || !unitCostInput}
                  onClick={handleAddItem}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-sm"
                >
                  <Plus size={16} />
                  <span>إضافة</span>
                </button>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-black text-gray-900 text-xs">بنود الفاتورة ({items.length})</h4>
              <span className="text-xs font-black text-blue-700">
                إجمالي الفاتورة: {toEnglishDigits(formatCurrency(totalInvoiceAmount))}
              </span>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 border border-dashed border-gray-200 rounded-2xl">
                <p className="text-xs text-gray-400 font-bold">لم تتم إضافة بنود بعد في هذه الفاتورة</p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-right text-xs">
                  <thead className="bg-gray-100 text-gray-600 font-bold border-b border-gray-200">
                    <tr>
                      <th className="p-3">المادة الخام</th>
                      <th className="p-3 text-center">الكمية</th>
                      <th className="p-3 text-center">سعر الشراء للوحدة</th>
                      <th className="p-3 text-center">الإجمالي</th>
                      <th className="p-3 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/30">
                        <td className="p-3 font-black text-gray-900">{it.material_name}</td>
                        <td className="p-3 text-center font-bold text-gray-700">
                          {toEnglishDigits(it.quantity)} {it.unit}
                        </td>
                        <td className="p-3 text-center font-bold text-gray-700">
                          {toEnglishDigits(it.unit_cost.toFixed(4))} ج.م
                        </td>
                        <td className="p-3 text-center font-black text-blue-600">
                          {toEnglishDigits(it.total_cost.toFixed(2))} ج.م
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 text-red-500 hover:text-red-700 rounded transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">ملاحظات إضافية على الفاتورة</label>
            <input
              type="text"
              placeholder="مثلاً: تم السداد نقداً / شيك رقم ..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3.5 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 font-bold text-sm transition-colors cursor-pointer"
          >
            إلغاء
          </button>

          <button
            type="button"
            disabled={saving || items.length === 0}
            onClick={handleSave}
            className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-black text-sm flex items-center gap-2 shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
          >
            {saving ? (
              <span>جاري حفظ الفاتورة وزيادة الرصيد...</span>
            ) : (
              <>
                <Check size={18} />
                <span>اعتماد التوريد وزيادة المخزون ({toEnglishDigits(formatCurrency(totalInvoiceAmount))})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
