import React, { useState, useMemo } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  Check, 
  ChefHat, 
  Sparkles, 
  Copy, 
  Layers, 
  Tag, 
  ChevronDown, 
  AlertCircle 
} from 'lucide-react';
import { Product, Category } from '../../../lib/supabase';
import { 
  RawMaterial, 
  ProductRecipe, 
  RecipeIngredient, 
  RecipeVariant,
  calculateRecipeCost, 
  formatMaterialQuantity,
  saveProductRecipe,
  getUnitArabicName,
  calculateIngredientsCost
} from '../../../lib/recipeService';
import { formatCurrency, toEnglishDigits } from '../../../lib/utils';

interface RecipeEditModalProps {
  restaurantId: string;
  product: Product;
  category?: Category;
  currentRecipe?: ProductRecipe;
  rawMaterials: RawMaterial[];
  onClose: () => void;
  onSaved: (updatedRecipe: ProductRecipe) => void;
}

export const RecipeEditModal: React.FC<RecipeEditModalProps> = ({
  restaurantId,
  product,
  category,
  currentRecipe,
  rawMaterials,
  onClose,
  onSaved,
}) => {
  // Base / default recipe ingredients
  const [baseIngredients, setBaseIngredients] = useState<RecipeIngredient[]>(
    currentRecipe?.ingredients ? JSON.parse(JSON.stringify(currentRecipe.ingredients)) : []
  );

  // Variant recipes (e.g. سادة, زيادة, مظبوط, دبل, إلخ)
  const [variants, setVariants] = useState<RecipeVariant[]>(
    currentRecipe?.variants ? JSON.parse(JSON.stringify(currentRecipe.variants)) : []
  );

  // Active tab: 'base' for default recipe, or variant.id
  const [activeTab, setActiveTab] = useState<string>('base');

  // Input states for adding materials
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [quantityInput, setQuantityInput] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // Quick option picker popover
  const [showOptionPicker, setShowOptionPicker] = useState<boolean>(false);
  const [customOptionName, setCustomOptionName] = useState<string>('');

  // Extract all available option choices from product.options, category.options, or standard presets
  const availableOptionChoices = useMemo(() => {
    const list: Array<{ name: string; option_name?: string; choice_id?: string }> = [];
    const seen = new Set<string>();

    // 1. From Product options
    if (product.options && Array.isArray(product.options)) {
      product.options.forEach(opt => {
        if (opt.choices && Array.isArray(opt.choices)) {
          opt.choices.forEach(ch => {
            const chName = ch.name_ar || (ch as any).name || ch.id;
            if (chName && !seen.has(chName)) {
              seen.add(chName);
              list.push({ name: chName, option_name: opt.name_ar, choice_id: ch.id });
            }
          });
        }
      });
    }

    // 2. From Category options
    if (category?.options && Array.isArray(category.options)) {
      category.options.forEach(opt => {
        if (opt.choices && Array.isArray(opt.choices)) {
          opt.choices.forEach(ch => {
            const chName = ch.name_ar || (ch as any).name || ch.id;
            if (chName && !seen.has(chName)) {
              seen.add(chName);
              list.push({ name: chName, option_name: opt.name_ar, choice_id: ch.id });
            }
          });
        }
      });
    }

    // 3. Common defaults for Coffee / Beverages if list is small
    const prodName = (product.name_ar || '').toLowerCase();
    const isCoffeeOrDrink = prodName.includes('قهوة') || prodName.includes('قهوه') || 
      prodName.includes('شاي') || prodName.includes('نسكافيه') || prodName.includes('لاتيه') || 
      prodName.includes('اسبريسو') || prodName.includes('مشروب') || prodName.includes('كابتشينو');

    if (isCoffeeOrDrink) {
      const coffeePresets = [
        { name: 'سادة', option_name: 'درجة السكر' },
        { name: 'مضبوط', option_name: 'درجة السكر' },
        { name: 'زيادة', option_name: 'درجة السكر' },
        { name: 'سكر خفيف', option_name: 'درجة السكر' },
        { name: 'دبل شوت', option_name: 'الإضافات' },
        { name: 'سنجل شوت', option_name: 'الإضافات' }
      ];
      coffeePresets.forEach(preset => {
        if (!seen.has(preset.name)) {
          seen.add(preset.name);
          list.push(preset);
        }
      });
    }

    return list;
  }, [product, category]);

  // Current active variant object if not 'base'
  const currentVariant = useMemo(() => {
    return variants.find(v => v.id === activeTab);
  }, [variants, activeTab]);

  // Active ingredients currently being viewed and edited
  const activeIngredients = useMemo(() => {
    if (activeTab === 'base') {
      return baseIngredients;
    }
    return currentVariant?.ingredients || [];
  }, [activeTab, baseIngredients, currentVariant]);

  // Calculate live food cost and margins for the ACTIVE tab
  const currentCalc = calculateRecipeCost(
    { product_id: product.id, restaurant_id: restaurantId, ingredients: activeIngredients },
    rawMaterials,
    product.price,
    activeIngredients
  );

  // Helper to update active ingredients
  const updateActiveIngredients = (newIngredients: RecipeIngredient[]) => {
    if (activeTab === 'base') {
      setBaseIngredients(newIngredients);
    } else {
      setVariants(prev => prev.map(v => v.id === activeTab ? { ...v, ingredients: newIngredients } : v));
    }
  };

  // Add an ingredient to the active recipe
  const handleAddIngredient = () => {
    if (!selectedMaterialId) return;
    const qty = parseFloat(quantityInput);
    if (isNaN(qty) || qty <= 0) {
      alert('يرجى إدخال كمية صحيحة أكبر من صفر');
      return;
    }

    const existingIndex = activeIngredients.findIndex(i => i.material_id === selectedMaterialId);
    if (existingIndex >= 0) {
      const updated = [...activeIngredients];
      updated[existingIndex].quantity += qty;
      updateActiveIngredients(updated);
    } else {
      updateActiveIngredients([
        ...activeIngredients,
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

  // Remove an ingredient
  const handleRemoveIngredient = (ingId: string) => {
    updateActiveIngredients(activeIngredients.filter(i => i.id !== ingId));
  };

  // Update ingredient quantity
  const handleUpdateIngredientQty = (ingId: string, newQty: number) => {
    if (newQty <= 0) return;
    updateActiveIngredients(
      activeIngredients.map(i => i.id === ingId ? { ...i, quantity: newQty } : i)
    );
  };

  // Add new variant recipe for a specific option / case
  const handleCreateVariant = (name: string, optionName?: string, choiceId?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    // Check if variant already exists
    const existing = variants.find(v => v.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setActiveTab(existing.id);
      setShowOptionPicker(false);
      setCustomOptionName('');
      return;
    }

    // Clone base ingredients as a convenient starting point
    const newVariant: RecipeVariant = {
      id: `var-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      option_name: optionName || 'خيار مخصص',
      choice_id: choiceId,
      ingredients: JSON.parse(JSON.stringify(baseIngredients))
    };

    setVariants([...variants, newVariant]);
    setActiveTab(newVariant.id);
    setShowOptionPicker(false);
    setCustomOptionName('');
  };

  // Delete a variant recipe
  const handleDeleteVariant = (varId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('هل أنت متأكد من حذف ريسبي هذه الحالة؟ سيتم تطبيق الريسبي الأساسي عليها.')) return;
    
    setVariants(prev => prev.filter(v => v.id !== varId));
    if (activeTab === varId) {
      setActiveTab('base');
    }
  };

  // Copy base ingredients into current variant
  const handleCopyFromBase = () => {
    if (activeTab === 'base') return;
    if (confirm('هل تريد استبدال مكونات هذه الحالة بنسخة طبق الأصل من الريسبي الأساسي؟')) {
      updateActiveIngredients(JSON.parse(JSON.stringify(baseIngredients)));
    }
  };

  // Save all recipes (base + variants)
  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedRecipe: ProductRecipe = {
        product_id: product.id,
        restaurant_id: restaurantId,
        ingredients: baseIngredients,
        variants: variants.filter(v => v.ingredients && v.ingredients.length > 0),
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
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-amber-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/30">
              <ChefHat size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-gray-900">{product.name_ar}</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800 font-bold">
                  {toEnglishDigits(formatCurrency(product.price))}
                </span>
                {variants.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-black">
                    {toEnglishDigits(variants.length)} حالات مخصصة
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                تحديد ريسبي خاص بكل خيار (سادة، زيادة، مظبوط...) لخصم المواد الخام بدقة
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

        {/* Option Variant Tabs Bar (شريط التبديل بين حالات المنتج: سادة / زيادة / مظبوط) */}
        <div className="px-6 py-3 bg-gray-50/90 border-b border-gray-200/80 shrink-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-gray-700">
              <Layers size={14} className="text-orange-500" />
              <span>اختر الحالة أو الخيار لتعديل الريسبي الخاص به:</span>
            </div>

            {/* Add Option Recipe Button with Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowOptionPicker(!showOptionPicker)}
                className="bg-orange-500 hover:bg-orange-600 text-white font-black text-[11px] px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Plus size={14} />
                <span>إضافة ريسبي لخيار (مثل: سادة أو زيادة)</span>
                <ChevronDown size={12} />
              </button>

              {/* Option Picker Popover */}
              {showOptionPicker && (
                <div className="absolute left-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-200 p-3.5 z-50 animate-in fade-in slide-in-from-top-2 text-right">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100 mb-2">
                    <span className="text-xs font-black text-gray-800">إضافة حالة أو خيار للمنتج</span>
                    <button 
                      type="button" 
                      onClick={() => setShowOptionPicker(false)}
                      className="text-gray-400 hover:text-gray-600 p-0.5"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Available options from product/presets */}
                  {availableOptionChoices.length > 0 && (
                    <div className="mb-3">
                      <span className="text-[10px] font-bold text-gray-400 block mb-1.5">
                        خيارات مقترحة من كارت الصنف:
                      </span>
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                        {availableOptionChoices.map((opt, idx) => {
                          const isAlreadyAdded = variants.some(v => v.name.toLowerCase() === opt.name.toLowerCase());
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleCreateVariant(opt.name, opt.option_name, opt.choice_id)}
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                                isAlreadyAdded
                                  ? 'bg-orange-50 text-orange-700 border-orange-200 font-black'
                                  : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-orange-50 hover:border-orange-300'
                              }`}
                            >
                              {opt.name}
                              {isAlreadyAdded && ' ✓'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Custom Option Name Input */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-1">
                      أو اكتب اسم حالة جديدة (مثلاً: بدون سكر، حليب لوز، دبل):
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder="اسم الخيار..."
                        value={customOptionName}
                        onChange={e => setCustomOptionName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCreateVariant(customOptionName);
                          }
                        }}
                        className="flex-1 bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-orange-500 text-right"
                      />
                      <button
                        type="button"
                        disabled={!customOptionName.trim()}
                        onClick={() => handleCreateVariant(customOptionName)}
                        className="bg-gray-900 hover:bg-black disabled:opacity-40 text-white font-bold text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                      >
                        إضافة
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Scrollable Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {/* Base Tab */}
            <button
              type="button"
              onClick={() => setActiveTab('base')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black shrink-0 transition-all cursor-pointer ${
                activeTab === 'base'
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <span>الريسبي الأساسي (الافتراضي)</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                activeTab === 'base' ? 'bg-orange-700 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {toEnglishDigits(baseIngredients.length)} مواد
              </span>
            </button>

            {/* Variant Tabs (سادة، زيادة، مظبوط...) */}
            {variants.map(v => {
              const isActive = activeTab === v.id;
              const cost = calculateIngredientsCost(v.ingredients, rawMaterials);
              return (
                <div
                  key={v.id}
                  onClick={() => setActiveTab(v.id)}
                  className={`group flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black shrink-0 transition-all cursor-pointer border ${
                    isActive
                      ? 'bg-orange-600 text-white border-orange-600 shadow-md shadow-orange-600/20'
                      : 'bg-white text-gray-800 hover:bg-gray-50 border-gray-200'
                  }`}
                >
                  <Tag size={12} className={isActive ? 'text-white' : 'text-orange-500'} />
                  <span>{v.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                    isActive ? 'bg-orange-700 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {toEnglishDigits(cost.toFixed(2))} ج
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteVariant(v.id, e)}
                    className={`p-0.5 rounded hover:bg-black/20 transition-colors cursor-pointer ${
                      isActive ? 'text-white/80 hover:text-white' : 'text-gray-400 hover:text-red-600'
                    }`}
                    title="حذف ريسبي هذا الخيار"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Metrics Bar (Recalculated specifically for the ACTIVE tab) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 border-b border-gray-200/70 text-center shrink-0">
          <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <span className="text-[11px] font-bold text-gray-400 block mb-1">سعر البيع للزبون</span>
            <span className="text-base font-black text-gray-900">{toEnglishDigits(formatCurrency(currentCalc.sellingPrice))}</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <span className="text-[11px] font-bold text-gray-400 block mb-1">
              تكلفة المواد الخام ({activeTab === 'base' ? 'الأساسي' : currentVariant?.name})
            </span>
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
        <div className="overflow-y-auto p-5 sm:p-6 flex-1 space-y-5">
          {/* Active Variant Info Banner */}
          {activeTab !== 'base' && currentVariant && (
            <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <Tag size={16} />
                </div>
                <div>
                  <h5 className="font-black text-blue-900 text-xs">
                    أنت الآن تعدّل الريسبي المخصص لحالة: <span className="underline decoration-blue-400">{currentVariant.name}</span>
                  </h5>
                  <p className="text-[11px] text-blue-700 font-medium">
                    عند طلب العميل قهوة ({currentVariant.name})، سيتم خصم هذه المكونات حصراً بدلاً من الأساسي
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={handleCopyFromBase}
                  className="bg-white hover:bg-blue-100 text-blue-800 border border-blue-200 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  title="نسخ مكونات الريسبي الأساسي لتعديلها بسهولة"
                >
                  <Copy size={13} />
                  <span>نسخ من الريسبي الأساسي</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteVariant(currentVariant.id)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  حذف الحالة
                </button>
              </div>
            </div>
          )}

          {/* Add Ingredient Section */}
          <div className="bg-orange-50/50 border border-orange-200/60 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3 text-orange-950 font-black text-sm">
              <Sparkles size={18} className="text-orange-600" />
              <span>
                إضافة مادة خام إلى ريسبي {activeTab === 'base' ? 'المنتج الأساسي' : `حالة (${currentVariant?.name})`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-6">
                <label className="block text-xs font-bold text-gray-600 mb-1.5">اختر المادة الخام من المخزن</label>
                <select
                  value={selectedMaterialId}
                  onChange={e => setSelectedMaterialId(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none text-right"
                >
                  <option value="">-- اضغط للاختيار من المخزن --</option>
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
                مكونات {activeTab === 'base' ? 'الريسبي الأساسي' : `حالة (${currentVariant?.name})`} ({toEnglishDigits(activeIngredients.length)} مواد)
              </h4>
              <span className="text-xs text-gray-400">تُخصم هذه المواد آلياً عند بيع المنتج</span>
            </div>

            {activeIngredients.length === 0 ? (
              <div className="text-center py-10 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-6">
                <ChefHat className="mx-auto text-gray-300 mb-2" size={40} />
                <p className="font-bold text-gray-600 text-sm">لم يتم إضافة مكونات لهذا الريسبي بعد</p>
                <p className="text-xs text-gray-400 mt-1">
                  اختر المواد الخام من الأعلى (مثل البن، السكر، الحليب) لربطها بـ {activeTab === 'base' ? 'المنتج' : `خيار ${currentVariant?.name}`}
                </p>
                {activeTab !== 'base' && baseIngredients.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCopyFromBase}
                    className="mt-3 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 font-bold text-xs px-4 py-2 rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Copy size={14} />
                    <span>نسخ مكونات الريسبي الأساسي الآن وتعديلها</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-right text-xs">
                  <thead className="bg-gray-100/80 text-gray-600 font-bold border-b border-gray-200">
                    <tr>
                      <th className="p-3">المادة الخام</th>
                      <th className="p-3 text-center">الكمية لكل كوب/وجبة</th>
                      <th className="p-3 text-center">تكلفة المكون</th>
                      <th className="p-3 text-center">نسبة من التكلفة</th>
                      <th className="p-3 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {activeIngredients.map((ing, idx) => {
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
          <div className="flex items-center gap-2 text-xs text-gray-500 font-bold">
            <span>إجمالي الحالات:</span>
            <span className="font-black text-gray-800">
              1 أساسي {variants.length > 0 ? `+ ${toEnglishDigits(variants.length)} حالات خيارات` : ''}
            </span>
          </div>

          <div className="flex items-center gap-3">
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
    </div>
  );
};
