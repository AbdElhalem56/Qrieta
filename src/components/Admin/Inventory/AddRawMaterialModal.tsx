import React, { useState } from 'react';
import { X, Check, Boxes, DollarSign, AlertTriangle, ShieldCheck, Tag, Plus } from 'lucide-react';
import { 
  RawMaterial, 
  RawMaterialUnit, 
  RawMaterialCategory, 
  RawMaterialCategoryItem,
  DEFAULT_RAW_CATEGORIES,
  RAW_CATEGORY_LABELS, 
  getUnitArabicName,
  saveRawMaterial 
} from '../../../lib/recipeService';
import { toEnglishDigits } from '../../../lib/utils';
import { ManageRawCategoriesModal } from './ManageRawCategoriesModal';

interface AddRawMaterialModalProps {
  restaurantId: string;
  editingMaterial?: RawMaterial | null;
  categories?: RawMaterialCategoryItem[];
  materials?: RawMaterial[];
  onClose: () => void;
  onSaved: () => void;
  onRefreshCategories?: () => void;
}

export const AddRawMaterialModal: React.FC<AddRawMaterialModalProps> = ({
  restaurantId,
  editingMaterial,
  categories,
  materials = [],
  onClose,
  onSaved,
  onRefreshCategories,
}) => {
  const categoriesList = categories && categories.length > 0 ? categories : DEFAULT_RAW_CATEGORIES;
  const [nameAr, setNameAr] = useState(editingMaterial?.name_ar || '');
  const [nameEn, setNameEn] = useState(editingMaterial?.name_en || '');
  const [category, setCategory] = useState<string>(
    editingMaterial?.category || (categoriesList[0]?.id || 'dairy')
  );
  const [unit, setUnit] = useState<RawMaterialUnit>(editingMaterial?.unit || 'g');
  const [currentStock, setCurrentStock] = useState<string>(editingMaterial ? String(editingMaterial.current_stock) : '1000');
  const [minAlertStock, setMinAlertStock] = useState<string>(editingMaterial ? String(editingMaterial.min_alert_stock) : '200');
  const [costPerUnit, setCostPerUnit] = useState<string>(editingMaterial ? String(editingMaterial.cost_per_unit) : '0.5');
  const [supplier, setSupplier] = useState(editingMaterial?.supplier || '');
  const [barcode, setBarcode] = useState(editingMaterial?.barcode || '');
  const [saving, setSaving] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  // Helper for quick bulk pricing (e.g. if user enters price per 1kg or 1L)
  const [bulkPriceHelper, setBulkPriceHelper] = useState('');

  const handleBulkPriceChange = (val: string) => {
    setBulkPriceHelper(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      if (unit === 'g' || unit === 'ml') {
        // Price per 1000g or 1000ml -> divide by 1000
        setCostPerUnit((num / 1000).toFixed(4));
      } else {
        setCostPerUnit(num.toFixed(2));
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameAr.trim()) {
      alert('يرجى إدخال اسم المادة الخام بالعربية');
      return;
    }

    const stockNum = parseFloat(currentStock);
    const alertNum = parseFloat(minAlertStock);
    const costNum = parseFloat(costPerUnit);

    if (isNaN(stockNum) || stockNum < 0) {
      alert('يرجى إدخال رصيد صحيح');
      return;
    }
    if (isNaN(costNum) || costNum < 0) {
      alert('يرجى إدخال تكلفة صحيحة');
      return;
    }

    setSaving(true);
    try {
      const matData: RawMaterial = {
        id: editingMaterial?.id || `mat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        restaurant_id: restaurantId,
        name_ar: nameAr.trim(),
        name_en: nameEn.trim() || nameAr.trim(),
        category: category as RawMaterialCategory,
        unit,
        current_stock: stockNum,
        min_alert_stock: isNaN(alertNum) ? 0 : alertNum,
        cost_per_unit: costNum,
        supplier: supplier.trim() || undefined,
        barcode: barcode.trim() || undefined,
      };

      await saveRawMaterial(restaurantId, matData);
      onSaved();
      onClose();
    } catch (err) {
      console.error('Error saving raw material:', err);
      alert('حدث خطأ أثناء حفظ المادة الخام');
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

      <div className="relative bg-white w-full max-w-2xl rounded-3xl shadow-2xl my-auto max-h-[92vh] flex flex-col border border-gray-100 overflow-hidden text-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gray-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/30">
              <Boxes size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900">
                {editingMaterial ? 'تعديل المادة الخام' : 'إضافة مادة خام جديدة'}
              </h3>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                تحديد وحدة القياس وتكلفة الشراء والرصيد الفعلي في مستودع الكافيه
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

        {/* Form Content */}
        <form onSubmit={handleSave} className="overflow-y-auto p-6 flex-1 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-700 mb-1.5">الاسم بالعربي *</label>
              <input
                required
                type="text"
                placeholder="مثلاً: بن إسبريسو كولومبي"
                value={nameAr}
                onChange={e => setNameAr(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 focus:bg-white rounded-xl px-4 py-3 outline-none focus:ring-2 ring-orange-500 text-right font-bold text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-700 mb-1.5">الاسم بالإنجليزي</label>
              <input
                type="text"
                placeholder="e.g. Colombian Espresso Beans"
                value={nameEn}
                onChange={e => setNameEn(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 focus:bg-white rounded-xl px-4 py-3 outline-none focus:ring-2 ring-orange-500 text-left font-bold text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-black text-gray-700">فئة المادة الخام</label>
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="text-[11px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={12} />
                  <span>+ فئة جديدة</span>
                </button>
              </div>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 focus:bg-white rounded-xl px-4 py-3 outline-none focus:ring-2 ring-orange-500 font-bold text-sm"
              >
                {categoriesList.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.icon || '📦'} {item.ar}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-black text-gray-700 mb-1.5">وحدة التخزين الأساسية *</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value as RawMaterialUnit)}
                className="w-full bg-gray-50 border border-gray-300 focus:bg-white rounded-xl px-4 py-3 outline-none focus:ring-2 ring-orange-500 font-bold text-sm"
              >
                <option value="g">جرام (g) - للبن، التوابل، اللحوم بالوزن</option>
                <option value="ml">ملليلتر (ml) - للحليب، السيرب، العصائر، الزيوت</option>
                <option value="pcs">قطعة (pcs) - للأكواب، الخبز، شرائح الجبن، الأكياس</option>
                <option value="shot">شوت / جرعة (shot) - للشوتات الجاهزة</option>
                <option value="pack">عبوة / كيس (pack)</option>
                <option value="kg">كيلوجرام (kg)</option>
                <option value="L">لتر (L)</option>
              </select>
            </div>
          </div>

          {/* Pricing Configurator */}
          <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-950 font-black text-xs">
              <DollarSign size={16} className="text-amber-600" />
              <span>تسعير وتكلفة الشراء للمادة الخام</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  التكلفة لكل 1 {getUnitArabicName(unit)} (ج.م) *
                </label>
                <input
                  required
                  type="number"
                  step="0.0001"
                  min="0"
                  value={costPerUnit}
                  onChange={e => setCostPerUnit(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:ring-2 ring-amber-500 font-black text-sm text-center"
                />
              </div>

              {(unit === 'g' || unit === 'ml') && (
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">
                    حاسبة سريعة: سعر الشراء لـ {unit === 'g' ? 'الكيلو (1000ج)' : 'اللتر (1000مل)'}
                  </label>
                  <input
                    type="number"
                    step="1"
                    placeholder={unit === 'g' ? 'مثلاً: 750 ج.م للكيلو' : 'مثلاً: 38 ج.م للتر'}
                    value={bulkPriceHelper}
                    onChange={e => handleBulkPriceChange(e.target.value)}
                    className="w-full bg-white border border-dashed border-amber-300 rounded-xl px-4 py-2.5 outline-none focus:ring-2 ring-amber-500 font-bold text-sm text-center"
                  />
                </div>
              )}
            </div>

            <p className="text-[11px] text-amber-800">
              💡 تُستخدم هذه التكلفة في حساب تكلفة الوجبات (Food Cost) بدقة تلقائياً عند إدخال الجرامات أو المللي لكل مشروب أو ساندوتش.
            </p>
          </div>

          {/* Stock Levels */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-700 mb-1.5">
                الرصيد الفعلي الحالي بالمخزن ({getUnitArabicName(unit)}) *
              </label>
              <input
                required
                type="number"
                step="0.1"
                min="0"
                value={currentStock}
                onChange={e => setCurrentStock(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 focus:bg-white rounded-xl px-4 py-3 outline-none focus:ring-2 ring-orange-500 font-bold text-sm text-center"
              />
              <span className="text-[10px] text-gray-400 block mt-1">
                {unit === 'g' ? 'إذا كان لديك 5 كجم اكتب 5000' : unit === 'ml' ? 'إذا كان لديك 20 لتر اكتب 20000' : 'عدد القطع'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-black text-gray-700 mb-1.5">
                الحد الأدنى للتنبيه بنواقص المخزن ({getUnitArabicName(unit)})
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={minAlertStock}
                onChange={e => setMinAlertStock(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 focus:bg-white rounded-xl px-4 py-3 outline-none focus:ring-2 ring-orange-500 font-bold text-sm text-center"
              />
              <span className="text-[10px] text-gray-400 block mt-1">
                عند وصول الرصيد لهذه النسبة يظهر تنبيه فوري باللون الأحمر
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-700 mb-1.5">اسم المورد الافتراضي</label>
              <input
                type="text"
                placeholder="مثلاً: شركة البن الذهبي"
                value={supplier}
                onChange={e => setSupplier(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 focus:bg-white rounded-xl px-4 py-3 outline-none focus:ring-2 ring-orange-500 text-right font-bold text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-700 mb-1.5">الباركود (اختياري)</label>
              <input
                type="text"
                placeholder="Scan or enter barcode"
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 focus:bg-white rounded-xl px-4 py-3 outline-none focus:ring-2 ring-orange-500 text-left font-bold text-sm"
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 font-bold text-sm transition-colors cursor-pointer"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-8 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl font-black text-sm flex items-center gap-2 shadow-lg shadow-orange-600/30 transition-all cursor-pointer"
            >
              {saving ? (
                <span>جاري الحفظ...</span>
              ) : (
                <>
                  <Check size={18} />
                  <span>{editingMaterial ? 'حفظ التعديلات' : 'إضافة المادة للمستودع'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {isCategoryModalOpen && (
        <ManageRawCategoriesModal
          restaurantId={restaurantId}
          isOpen={isCategoryModalOpen}
          onClose={() => setIsCategoryModalOpen(false)}
          categories={categoriesList}
          materials={materials}
          onRefresh={() => onRefreshCategories?.()}
          onSelectNewCategory={(newCatId) => {
            setCategory(newCatId);
            setIsCategoryModalOpen(false);
          }}
        />
      )}
    </div>
  );
};
