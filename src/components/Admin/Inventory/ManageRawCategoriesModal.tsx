import React, { useState } from 'react';
import { 
  X, 
  Plus, 
  Tags, 
  Trash2, 
  Check, 
  Sparkles,
  Boxes,
  AlertCircle
} from 'lucide-react';
import { 
  RawMaterial, 
  RawMaterialCategoryItem, 
  DEFAULT_RAW_CATEGORIES,
  saveRawMaterialCategory, 
  deleteRawMaterialCategory 
} from '../../../lib/recipeService';
import { toEnglishDigits } from '../../../lib/utils';

interface ManageRawCategoriesModalProps {
  restaurantId: string;
  isOpen: boolean;
  onClose: () => void;
  categories: RawMaterialCategoryItem[];
  materials: RawMaterial[];
  onRefresh: () => void;
  onSelectNewCategory?: (categoryId: string) => void;
}

const POPULAR_EMOJIS = [
  '🥛', '📦', '☕', '🥩', '🍞', '🍯', '🧃', '🥬', '🧂', 
  '🧊', '🧀', '🥖', '🍗', '🧅', '🧁', '🥫', '🥢', '🍳', 
  '🍫', '🏷️', '🍟', '🍋', '🍇', '🌾'
];

const PRESET_SUGGESTIONS = [
  { ar: 'ألبان وأجبان', icon: '🥛', en: 'Dairy & Cheese' },
  { ar: 'تعبئة وتغليف وأكواب', icon: '📦', en: 'Packaging & Cups' },
  { ar: 'لحوم ودواجن وأسماك', icon: '🥩', en: 'Meat & Poultry' },
  { ar: 'خضروات وفواكه طازجة', icon: '🥬', en: 'Fresh Produce' },
  { ar: 'بهارات وتوابل ومكسرات', icon: '🧂', en: 'Spices & Seasonings' },
  { ar: 'بن وإسبريسو ومشروبات ساخنة', icon: '☕', en: 'Coffee & Espresso' },
  { ar: 'مخبوزات وعجائن', icon: '🍞', en: 'Bakery & Dough' },
  { ar: 'سيرب وصوصات وتتبيلات', icon: '🍯', en: 'Syrups & Sauces' },
  { ar: 'عصائر ومشروبات باردة', icon: '🧃', en: 'Cold Drinks & Juices' },
  { ar: 'مجمدات ومصنعات', icon: '🧊', en: 'Frozen Goods' },
  { ar: 'مستلزمات ونظافة وضيافة', icon: '🏷️', en: 'Supplies & Hygiene' },
  { ar: 'شوكولاتة ومستلزمات حلا', icon: '🍫', en: 'Sweets & Confectionery' },
];

export const ManageRawCategoriesModal: React.FC<ManageRawCategoriesModalProps> = ({
  restaurantId,
  isOpen,
  onClose,
  categories,
  materials,
  onRefresh,
  onSelectNewCategory
}) => {
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('📦');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const currentCategories = categories && categories.length > 0 ? categories : DEFAULT_RAW_CATEGORIES;

  const handleAddCategory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!nameAr.trim()) {
      setError('يرجى كتابة اسم الفئة بالعربية');
      return;
    }

    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      const slug = 'cat_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
      const newCategory: RawMaterialCategoryItem = {
        id: slug,
        ar: nameAr.trim(),
        en: nameEn.trim() || undefined,
        icon: selectedIcon || '📦',
        is_default: false
      };

      await saveRawMaterialCategory(restaurantId, newCategory);
      setNameAr('');
      setNameEn('');
      setSuccessMsg(`تمت إضافة فئة "${newCategory.ar}" بنجاح!`);
      onRefresh();
      if (onSelectNewCategory) {
        onSelectNewCategory(newCategory.id);
      }
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setError(err.message || 'فشل في حفظ الفئة');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyPreset = async (preset: { ar: string; icon: string; en: string }) => {
    // Check if category with same name already exists
    const exists = currentCategories.some(c => c.ar === preset.ar);
    if (exists) {
      setError(`فئة "${preset.ar}" موجودة بالفعل في قائمتك.`);
      setTimeout(() => setError(''), 3000);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const slug = 'cat_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
      const newCategory: RawMaterialCategoryItem = {
        id: slug,
        ar: preset.ar,
        en: preset.en,
        icon: preset.icon,
        is_default: false
      };
      await saveRawMaterialCategory(restaurantId, newCategory);
      setSuccessMsg(`تمت إضافة "${preset.ar}" مباشرة!`);
      onRefresh();
      if (onSelectNewCategory) {
        onSelectNewCategory(newCategory.id);
      }
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setError('فشل في إضافة الفئة المقترحة');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: RawMaterialCategoryItem) => {
    const count = materials.filter(m => m.category === cat.id).length;
    let confirmMessage = `هل أنت متأكد من حذف فئة "${cat.ar}"؟`;
    if (count > 0) {
      confirmMessage += `\nيوجد ${count} مادة خام بهذه الفئة، سيتم نقلها تلقائياً إلى فئة "مواد عامة ومستلزمات".`;
    }

    if (!window.confirm(confirmMessage)) return;

    setSaving(true);
    try {
      await deleteRawMaterialCategory(restaurantId, cat.id);
      onRefresh();
      setSuccessMsg(`تم حذف فئة "${cat.ar}".`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      setError('تعذر حذف الفئة');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-2xl overflow-hidden my-auto text-right font-sans"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-orange-600 to-amber-600 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white">
              <Tags size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black">إدارة فئات المواد الخام والمخزون</h3>
              <p className="text-xs text-orange-100">
                إضافة وتخصيص فئات المواد الخام (مثل ألبان، تعبئة وتغليف، بهارات، خضار وغيرها)
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Notifications */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 font-bold flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-700 font-bold flex items-center gap-2">
              <Check size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Add Category Form */}
          <div className="bg-orange-50/50 p-4 sm:p-5 rounded-2xl border border-orange-100">
            <h4 className="text-xs font-black text-gray-900 flex items-center gap-2 mb-3">
              <Plus size={16} className="text-orange-600" />
              <span>إضافة فئة جديدة للمستودع</span>
            </h4>

            <form onSubmit={handleAddCategory} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-black text-gray-700 mb-1">
                    اسم الفئة بالعربية * (مثال: ألبان وأجبان، تعبئة وتغليف)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثل: ألبان وأجبان / تعبئة وتغليف..."
                    value={nameAr}
                    onChange={e => setNameAr(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:ring-2 ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black text-gray-700 mb-1">
                    أيقونة الفئة (رمز تعبيري)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="w-10 h-10 rounded-xl bg-white border border-gray-300 flex items-center justify-center text-xl shadow-xs">
                      {selectedIcon}
                    </span>
                    <input
                      type="text"
                      maxLength={4}
                      value={selectedIcon}
                      onChange={e => setSelectedIcon(e.target.value || '📦')}
                      className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-xs font-bold text-center outline-none focus:ring-2 ring-orange-500"
                    />
                  </div>
                </div>
              </div>

              {/* Quick Emojis */}
              <div>
                <span className="text-[10px] font-bold text-gray-500 block mb-1.5">اختر أيقونة سريعة:</span>
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setSelectedIcon(emoji)}
                      className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition-all cursor-pointer ${
                        selectedIcon === emoji 
                          ? 'bg-orange-500 text-white scale-110 shadow-xs ring-2 ring-orange-400' 
                          : 'bg-white hover:bg-orange-100 border border-gray-200'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={saving || !nameAr.trim()}
                  className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-black px-5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-orange-600/20 transition-all cursor-pointer"
                >
                  <Plus size={15} />
                  <span>{saving ? 'جارٍ الحفظ...' : 'حفظ الفئة الجديدة'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Quick Presets Suggestions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black text-gray-800 flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-500" />
                <span>فئات مقترحة شائعة (إضافة سريعة بضغطة زر)</span>
              </span>
              <span className="text-[10px] text-gray-400">انقر للإضافة الفورية</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {PRESET_SUGGESTIONS.map(p => {
                const isAdded = currentCategories.some(c => c.ar === p.ar);
                return (
                  <button
                    key={p.ar}
                    type="button"
                    disabled={isAdded || saving}
                    onClick={() => handleApplyPreset(p)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                      isAdded
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-default opacity-60'
                        : 'bg-white text-gray-700 hover:text-orange-600 border-gray-200 hover:border-orange-300 hover:bg-orange-50/40 cursor-pointer shadow-xs'
                    }`}
                  >
                    <span>{p.icon}</span>
                    <span>{p.ar}</span>
                    {isAdded ? (
                      <Check size={12} className="text-emerald-500" />
                    ) : (
                      <Plus size={12} className="text-orange-500 opacity-60" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Categories List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                <Tags size={15} className="text-gray-500" />
                <span>قائمة فئات المواد الخام المفعلة ({toEnglishDigits(currentCategories.length)})</span>
              </h4>
              <span className="text-[10px] text-gray-500">
                يمكنك التمرير الأفقي بينها في جدول المواد الخام
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {currentCategories.map(cat => {
                const count = materials.filter(m => m.category === cat.id).length;
                return (
                  <div 
                    key={cat.id}
                    className="p-3 bg-white rounded-2xl border border-gray-200 flex items-center justify-between gap-2 shadow-xs hover:border-orange-200 transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-100 text-lg flex items-center justify-center shrink-0">
                        {cat.icon || '📦'}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-gray-900">{cat.ar}</span>
                          {cat.is_default && (
                            <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">
                              أساسي
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1 mt-0.5">
                          <Boxes size={11} className="text-gray-400" />
                          <span>{toEnglishDigits(count)} مادة خام</span>
                        </span>
                      </div>
                    </div>

                    {!cat.is_default && (
                      <button
                        type="button"
                        onClick={() => handleDelete(cat)}
                        title="حذف الفئة"
                        className="w-7 h-7 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-all cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[11px] font-bold text-gray-500">
            تظهر هذه الفئات فورياً في شريط التصفح وشاشات إضافة التوريدات والريسبي
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-black bg-gray-900 hover:bg-black text-white transition-all cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
