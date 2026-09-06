import React, { useState } from 'react';
import { X, Plus, Trash2, Check, AlertCircle, DollarSign, Scale, Percent, ChefHat, Sparkles } from 'lucide-react';
import { Product } from '../../../lib/supabase';
import { 
  RawMaterial, 
  ProductRecipe, 
  RecipeIngredient, 
  calculateRecipeCost, 
  formatMaterialQuantity,
  saveProductRecipe,
  getUnitArabicName
} from '../../../lib/recipeService';
import { formatCurrency, toEnglishDigits } from '../../../lib/utils';

interface RecipeEditModalProps {
  restaurantId: string;
  product: Product;
  currentRecipe?: ProductRecipe;
  rawMaterials: RawMaterial[];
  onClose: () => void;
  onSaved: (updatedRecipe: ProductRecipe) => void;
}

export const RecipeEditModal: React.FC<RecipeEditModalProps> = ({
  restaurantId,
  product,
  currentRecipe,
  rawMaterials,
  onClose,
  onSaved,
}) => {
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(
    currentRecipe?.ingredients ? JSON.parse(JSON.stringify(currentRecipe.ingredients)) : []
  );
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [quantityInput, setQuantityInput] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // Calculate live food cost and margins
  const currentCalc = calculateRecipeCost(
    { product_id: product.id, restaurant_id: restaurantId, ingredients },
    rawMaterials,
    product.price
  );

  const handleAddIngredient = () => {
    if (!selectedMaterialId) return;
    const qty = parseFloat(quantityInput);
    if (isNaN(qty) || qty <= 0) {
      alert('يرجى إدخال كمية صحيحة أكبر من صفر');
      return;
    }

    // Check if material already exists in ingredients
    const existingIndex = ingredients.findIndex(i => i.material_id === selectedMaterialId);
    if (existingIndex >= 0) {
      const updated = [...ingredients];
      updated[existingIndex].quantity += qty;
      setIngredients(updated);
    } else {
      setIngredients([
        ...ingredients,
        {
          id: `ing-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          material_id: selectedMaterialId,
          quantity: qty,
        }
      ]);
    }

    setSelectedMaterialId('');
    setQuantityInput('');
  };

  const handleRemoveIngredient = (ingId: string) => {
    setIngredients(ingredients.filter(i => i.id !== ingId));
  };

  const handleUpdateIngredientQty = (ingId: string, newQty: number) => {
    if (newQty <= 0) return;
    setIngredients(ingredients.map(i => i.id === ingId ? { ...i, quantity: newQty } : i));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedRecipe: ProductRecipe = {
        product_id: product.id,
        restaurant_id: restaurantId,
        ingredients,
        updated_at: new Date().toISOString()
      };
      await saveProductRecipe(restaurantId, updatedRecipe);
      onSaved(updatedRecipe);
      onClose();
    } catch (e) {
      console.error('Failed to save recipe:', e);
      alert('حدث خطأ أثناء حفظ الريسبي');
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
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-amber-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/30">
              <ChefHat size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-gray-900">{product.name_ar}</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800 font-bold">
                  {toEnglishDigits(formatCurrency(product.price))}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                تحديد نسب المكونات الخام وحساب تكلفة الوجبة وهامش الربح بدقة
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

        {/* Live Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 border-b border-gray-200/70 text-center">
          <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <span className="text-[11px] font-bold text-gray-400 block mb-1">سعر البيع للزبون</span>
            <span className="text-base font-black text-gray-900">{toEnglishDigits(formatCurrency(currentCalc.sellingPrice))}</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <span className="text-[11px] font-bold text-gray-400 block mb-1">تكلفة المواد الخام (COGS)</span>
            <span className="text-base font-black text-orange-600">{toEnglishDigits(formatCurrency(currentCalc.costOfIngredients))}</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <span className="text-[11px] font-bold text-gray-400 block mb-1">الربح الإجمالي (Gross Profit)</span>
            <span className="text-base font-black text-emerald-600">{toEnglishDigits(formatCurrency(currentCalc.grossProfit))}</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <span className="text-[11px] font-bold text-gray-400 block mb-1">نسبة التكلفة (Food Cost %)</span>
            <div className="flex items-center justify-center gap-1.5">
              <span className={`text-base font-black ${
                currentCalc.status === 'excellent' ? 'text-emerald-600' :
                currentCalc.status === 'normal' ? 'text-amber-600' : 'text-red-600'
              }`}>
                {toEnglishDigits(currentCalc.foodCostPercentage)}%
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                currentCalc.status === 'excellent' ? 'bg-emerald-100 text-emerald-800' :
                currentCalc.status === 'normal' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
              }`}>
                {currentCalc.status === 'excellent' ? 'ممتاز' : currentCalc.status === 'normal' ? 'طبيعي' : 'مرتفع'}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-5 sm:p-6 flex-1 space-y-6">
          {/* Add Ingredient Section */}
          <div className="bg-orange-50/50 border border-orange-200/60 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3 text-orange-950 font-black text-sm">
              <Sparkles size={18} className="text-orange-600" />
              <span>إضافة مادة خام إلى ريسبي هذا المنتج</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-6">
                <label className="block text-xs font-bold text-gray-600 mb-1.5">اختر المادة الخام من المخزن</label>
                <select
                  value={selectedMaterialId}
                  onChange={e => setSelectedMaterialId(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none text-right"
                >
                  <option value="">-- اضغط للاختيار --</option>
                  {rawMaterials.map(mat => {
                    const costDisplay = mat.unit === 'g' 
                      ? `${toEnglishDigits((mat.cost_per_unit * 1000).toFixed(0))} ج/كجم`
                      : mat.unit === 'ml'
                      ? `${toEnglishDigits((mat.cost_per_unit * 1000).toFixed(0))} ج/لتر`
                      : `${toEnglishDigits(mat.cost_per_unit.toFixed(2))} ج/قطعة`;
                    return (
                      <option key={mat.id} value={mat.id}>
                        {mat.name_ar} ({getUnitArabicName(mat.unit)}) - تكلفة: {costDisplay}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-bold text-gray-600 mb-1.5">
                  الكمية {selectedMaterial ? `(${getUnitArabicName(selectedMaterial.unit)})` : ''}
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder={selectedMaterial?.unit === 'g' ? 'مثلاً: 18' : selectedMaterial?.unit === 'ml' ? 'مثلاً: 160' : 'مثلاً: 1'}
                  value={quantityInput}
                  onChange={e => setQuantityInput(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none text-center"
                />
              </div>

              <div className="sm:col-span-3">
                <button
                  type="button"
                  disabled={!selectedMaterialId || !quantityInput}
                  onClick={handleAddIngredient}
                  className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-black py-2.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-orange-600/20"
                >
                  <Plus size={18} />
                  <span>إضافة للمكونات</span>
                </button>
              </div>
            </div>

            {selectedMaterial && (
              <div className="mt-2.5 text-xs text-orange-800 bg-orange-100/60 p-2 rounded-xl flex items-center justify-between">
                <span>
                  الوحدة الأساسية: <strong>{getUnitArabicName(selectedMaterial.unit)}</strong> | الرصيد الحالي بالمخزن: <strong>{formatMaterialQuantity(selectedMaterial.current_stock, selectedMaterial.unit).formatted}</strong>
                </span>
                <span>
                  سعر الوحدة: <strong>{toEnglishDigits(selectedMaterial.cost_per_unit.toFixed(4))} ج.م</strong>
                </span>
              </div>
            )}
          </div>

          {/* Ingredients Table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-black text-gray-900 text-sm">
                مكونات الريسبي الحالية ({toEnglishDigits(ingredients.length)} مكونات)
              </h4>
              <span className="text-xs text-gray-400">تُخصم هذه الكميات بدقة من المخزن عند كل أوردر</span>
            </div>

            {ingredients.length === 0 ? (
              <div className="text-center py-10 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-6">
                <ChefHat className="mx-auto text-gray-300 mb-2" size={40} />
                <p className="font-bold text-gray-600 text-sm">لم يتم إضافة مكونات لهذا المنتج بعد</p>
                <p className="text-xs text-gray-400 mt-1">
                  اختر المواد الخام من الأعلى (مثل البن، الحليب، الأكواب، الصوصات) لربطها بالمنتج تلقائياً
                </p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-right text-xs">
                  <thead className="bg-gray-100/80 text-gray-600 font-bold border-b border-gray-200">
                    <tr>
                      <th className="p-3">المادة الخام</th>
                      <th className="p-3 text-center">الكمية لكل منتج</th>
                      <th className="p-3 text-center">تكلفة المكون</th>
                      <th className="p-3 text-center">نسبة من تكلفة الوجبة</th>
                      <th className="p-3 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ingredients.map((ing, idx) => {
                      const mat = rawMaterials.find(m => m.id === ing.material_id);
                      if (!mat) return null;
                      const lineCost = ing.quantity * mat.cost_per_unit;
                      const costShare = currentCalc.costOfIngredients > 0 
                        ? ((lineCost / currentCalc.costOfIngredients) * 100).toFixed(0) 
                        : 0;

                      return (
                        <tr key={ing.id || idx} className="hover:bg-orange-50/30 transition-colors">
                          <td className="p-3">
                            <div className="font-black text-gray-900">{mat.name_ar}</div>
                            <div className="text-[11px] text-gray-400">{mat.name_en}</div>
                          </td>
                          <td className="p-3 text-center">
                            <div className="inline-flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg border border-gray-200">
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={ing.quantity}
                                onChange={e => handleUpdateIngredientQty(ing.id, parseFloat(e.target.value) || 0)}
                                className="w-16 text-center font-bold bg-white rounded border border-gray-200 text-xs py-0.5 outline-none"
                              />
                              <span className="font-bold text-gray-600">{mat.unit}</span>
                            </div>
                          </td>
                          <td className="p-3 text-center font-black text-orange-600">
                            {toEnglishDigits(lineCost.toFixed(2))} ج.م
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="w-14 bg-gray-100 rounded-full h-2 overflow-hidden">
                                <div 
                                  className="bg-orange-500 h-full rounded-full" 
                                  style={{ width: `${Math.min(100, Number(costShare))}%` }} 
                                />
                              </div>
                              <span className="font-bold text-gray-600">{toEnglishDigits(costShare)}%</span>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveIngredient(ing.id)}
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="حذف من الريسبي"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
            disabled={saving}
            onClick={handleSave}
            className="px-8 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl font-black text-sm flex items-center gap-2 shadow-lg shadow-orange-600/30 transition-all cursor-pointer"
          >
            {saving ? (
              <span>جاري الحفظ...</span>
            ) : (
              <>
                <Check size={18} />
                <span>حفظ الريسبي وتأكيد التكلفة</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
