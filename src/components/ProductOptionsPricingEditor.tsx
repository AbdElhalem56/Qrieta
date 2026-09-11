import React from 'react';
import { Plus, Trash2, SlidersHorizontal, Sparkles, DollarSign, Tag, RefreshCw, Flame, Pizza, Coffee, Layers } from 'lucide-react';
import { CategoryOption, CategoryOptionChoice } from '../lib/supabase';
import { cn } from '../lib/utils';

interface ProductOptionsPricingEditorProps {
  options: CategoryOption[];
  onChange: (options: CategoryOption[]) => void;
  basePrice: number;
  onBasePriceChange?: (price: number) => void;
  categoryName?: string;
  categoryOptions?: CategoryOption[];
  isRTL?: boolean;
}

export const ProductOptionsPricingEditor: React.FC<ProductOptionsPricingEditorProps> = ({
  options,
  onChange,
  basePrice,
  onBasePriceChange,
  categoryName,
  categoryOptions = [],
  isRTL = true
}) => {
  // Preset 1: Spicy / Regular
  const handleAddSpicyPreset = () => {
    const spicyOpt: CategoryOption = {
      id: `spice_level_${Date.now()}`,
      name_ar: 'درجة الطعم / الحرارة',
      name_en: 'Spiciness',
      choices: [
        { id: `regular_${Date.now()}`, name_ar: 'عادي', name_en: 'Regular', price: basePrice || 100, price_delta: 0 },
        { id: `spicy_${Date.now()}`, name_ar: 'حار (سبايسي)', name_en: 'Spicy', price: basePrice || 100, price_delta: 0 }
      ]
    };

    const existsIdx = options.findIndex(o => o.name_ar.includes('طعم') || o.name_ar.includes('حرارة') || o.name_ar.includes('سبايسي') || o.id.includes('spice'));
    if (existsIdx > -1) {
      const copy = [...options];
      copy[existsIdx] = spicyOpt;
      onChange(copy);
    } else {
      onChange([...options, spicyOpt]);
    }
  };

  // Preset 2: Size Preset (Small / Medium / Large)
  const handleAddSizePreset = () => {
    const sizeOpt: CategoryOption = {
      id: `item_size_${Date.now()}`,
      name_ar: 'الحجم',
      name_en: 'Size',
      choices: [
        { id: `small_${Date.now()}`, name_ar: 'صغير', name_en: 'Small', price: basePrice || 80, price_delta: 0 },
        { id: `medium_${Date.now()}`, name_ar: 'وسط', name_en: 'Medium', price: (basePrice ? Math.round(basePrice * 1.4) : 120), price_delta: 0 },
        { id: `large_${Date.now()}`, name_ar: 'كبير', name_en: 'Large', price: (basePrice ? Math.round(basePrice * 1.8) : 160), price_delta: 0 }
      ]
    };

    const existsIdx = options.findIndex(o => o.name_ar === 'الحجم' || o.id.includes('size'));
    if (existsIdx > -1) {
      const copy = [...options];
      copy[existsIdx] = sizeOpt;
      onChange(copy);
    } else {
      onChange([...options, sizeOpt]);
    }
  };

  // Preset 3: Sugar Level Preset
  const handleAddSugarPreset = () => {
    const sugarOpt: CategoryOption = {
      id: `sugar_level_${Date.now()}`,
      name_ar: 'درجة السكر',
      name_en: 'Sugar Level',
      choices: [
        { id: `none_${Date.now()}`, name_ar: 'بدون سكر', name_en: 'No Sugar', price: basePrice || 0, price_delta: 0 },
        { id: `low_${Date.now()}`, name_ar: 'سكر خفيف', name_en: 'Low Sugar', price: basePrice || 0, price_delta: 0 },
        { id: `medium_${Date.now()}`, name_ar: 'مظبوط', name_en: 'Medium', price: basePrice || 0, price_delta: 0 },
        { id: `high_${Date.now()}`, name_ar: 'زيادة', name_en: 'Extra Sweet', price: basePrice || 0, price_delta: 0 }
      ]
    };

    const existsIdx = options.findIndex(o => o.name_ar.includes('سكر') || o.id.includes('sugar'));
    if (existsIdx > -1) {
      const copy = [...options];
      copy[existsIdx] = sugarOpt;
      onChange(copy);
    } else {
      onChange([...options, sugarOpt]);
    }
  };

  // Import options directly from the active category
  const handleImportCategoryOptions = () => {
    if (!categoryOptions || categoryOptions.length === 0) return;
    const cloned: CategoryOption[] = JSON.parse(JSON.stringify(categoryOptions));
    // Ensure all choices have valid prices initialized
    cloned.forEach(opt => {
      opt.choices.forEach(ch => {
        if (ch.price === undefined || ch.price === null || isNaN(Number(ch.price))) {
          ch.price = basePrice || 0;
        }
      });
    });
    onChange(cloned);
  };

  const handleAddCustomOption = () => {
    const newOpt: CategoryOption = {
      id: `opt_${Date.now()}`,
      name_ar: 'خيار جديد',
      name_en: 'New Option',
      choices: [
        { id: `c1_${Date.now()}`, name_ar: 'عادي / اختيار 1', name_en: 'Choice 1', price: basePrice || 0, price_delta: 0 },
        { id: `c2_${Date.now()}`, name_ar: 'حار / اختيار 2', name_en: 'Choice 2', price: basePrice || 0, price_delta: 0 }
      ]
    };
    onChange([...options, newOpt]);
  };

  const handleUpdateOptionName = (optIdx: number, nameAr: string) => {
    const copy = [...options];
    copy[optIdx] = { ...copy[optIdx], name_ar: nameAr };
    onChange(copy);
  };

  const handleRemoveOption = (optIdx: number) => {
    onChange(options.filter((_, i) => i !== optIdx));
  };

  const handleAddChoice = (optIdx: number) => {
    const copy = [...options];
    const target = copy[optIdx];
    const newChoice: CategoryOptionChoice = {
      id: `choice_${Date.now()}`,
      name_ar: `اختيار ${target.choices.length + 1}`,
      name_en: `Choice ${target.choices.length + 1}`,
      price: basePrice || 0,
      price_delta: 0
    };
    copy[optIdx] = {
      ...target,
      choices: [...target.choices, newChoice]
    };
    onChange(copy);
  };

  const handleUpdateChoiceName = (optIdx: number, choiceIdx: number, nameAr: string) => {
    const copy = [...options];
    const target = copy[optIdx];
    const newChoices = [...target.choices];
    newChoices[choiceIdx] = {
      ...newChoices[choiceIdx],
      name_ar: nameAr
    };
    copy[optIdx] = { ...target, choices: newChoices };
    onChange(copy);
  };

  const handleUpdateChoicePrice = (optIdx: number, choiceIdx: number, priceVal: number) => {
    const copy = [...options];
    const target = copy[optIdx];
    const newChoices = [...target.choices];
    const currentBase = basePrice || 0;
    const delta = priceVal - currentBase;
    newChoices[choiceIdx] = {
      ...newChoices[choiceIdx],
      price: priceVal,
      price_delta: delta
    };
    copy[optIdx] = { ...target, choices: newChoices };
    onChange(copy);

    // If updating the first choice and basePrice was 0, sync base price
    if (choiceIdx === 0 && onBasePriceChange && priceVal > 0 && (!basePrice || basePrice === 0)) {
      onBasePriceChange(priceVal);
    }
  };

  const handleRemoveChoice = (optIdx: number, choiceIdx: number) => {
    const copy = [...options];
    const target = copy[optIdx];
    if (target.choices.length <= 1) {
      alert(isRTL ? 'يجب أن يحتوي الخيار على اختيار واحد على الأقل.' : 'Option must have at least one choice.');
      return;
    }
    copy[optIdx] = {
      ...target,
      choices: target.choices.filter((_, i) => i !== choiceIdx)
    };
    onChange(copy);
  };

  return (
    <div className="space-y-3 sm:space-y-4 bg-orange-50/50 p-3 sm:p-5 rounded-2xl border border-orange-200/80 text-right w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-orange-200/60 pb-3">
        <div>
          <div className="flex items-center gap-2 text-orange-950 font-black text-sm">
            <DollarSign size={17} className="text-orange-600 shrink-0" />
            <span>تحديد أسعار الخيارات والأحجام للمنتج</span>
          </div>
          <p className="text-[11px] sm:text-xs text-gray-500 font-medium mt-0.5">
            حدد أسعار الخيارات (مثل عادي / حار، صغير / وسط / كبير) ليتغير السعر تلقائياً للزبون
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {categoryOptions && categoryOptions.length > 0 && (
            <button
              type="button"
              onClick={handleImportCategoryOptions}
              className="bg-orange-600 hover:bg-orange-700 text-white px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1 shadow-sm cursor-pointer"
              title="جلب الخيارات المحددة في هذا التصنيف"
            >
              <RefreshCw size={12} className="animate-spin-slow shrink-0" />
              <span>جلب خيارات التصنيف {categoryName ? `(${categoryName})` : ''}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleAddSpicyPreset}
            className="bg-white hover:bg-orange-100 text-orange-800 border border-orange-200 px-2 sm:px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1 shadow-sm cursor-pointer"
          >
            <Flame size={12} className="text-red-500 shrink-0" />
            <span>+ عادي / حار</span>
          </button>

          <button
            type="button"
            onClick={handleAddSizePreset}
            className="bg-white hover:bg-orange-100 text-orange-800 border border-orange-200 px-2 sm:px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1 shadow-sm cursor-pointer"
          >
            <Pizza size={12} className="text-amber-500 shrink-0" />
            <span>+ أحجام</span>
          </button>

          <button
            type="button"
            onClick={handleAddCustomOption}
            className="bg-gray-900 hover:bg-black text-white px-2 sm:px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1 shadow-sm cursor-pointer"
          >
            <Plus size={12} className="shrink-0" />
            <span>+ خيار مخصص</span>
          </button>
        </div>
      </div>

      {options.length === 0 ? (
        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-dashed border-orange-200 text-center space-y-3">
          <Tag size={26} className="mx-auto text-orange-300" />
          <div>
            <h5 className="text-xs font-black text-gray-800">لم يتم تحديد خيارات تسعير بعد لهذا المنتج</h5>
            <p className="text-[11px] text-gray-400 mt-0.5">سيتم تطبيق السعر الأساسي ({basePrice || 0} جـ) فقط في حال عدم إضافة خيارات.</p>
          </div>

          <div className="flex flex-wrap justify-center gap-2 pt-1">
            {categoryOptions && categoryOptions.length > 0 ? (
              <button
                type="button"
                onClick={handleImportCategoryOptions}
                className="inline-flex items-center gap-1.5 bg-orange-600 text-white px-3.5 py-2 rounded-xl text-xs font-black shadow-md hover:bg-orange-700 transition-all cursor-pointer"
              >
                <RefreshCw size={13} />
                <span>تطبيق خيارات التصنيف {categoryName ? `(${categoryName})` : ''}</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleAddSpicyPreset}
              className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded-xl text-xs font-bold shadow-sm hover:bg-red-100 transition-all cursor-pointer"
            >
              <Flame size={13} className="text-red-500" />
              <span>إضافة خيار (عادي / حار)</span>
            </button>

            <button
              type="button"
              onClick={handleAddSizePreset}
              className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 px-3 py-2 rounded-xl text-xs font-bold shadow-sm hover:bg-amber-100 transition-all cursor-pointer"
            >
              <Pizza size={13} className="text-amber-500" />
              <span>إضافة أحجام (صغير / وسط / كبير)</span>
            </button>

            <button
              type="button"
              onClick={handleAddCustomOption}
              className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-800 border border-gray-200 px-3 py-2 rounded-xl text-xs font-bold hover:bg-gray-200 transition-all cursor-pointer"
            >
              <Plus size={13} />
              <span>خيار مخصص يدوي</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4 pt-1">
          {options.map((opt, optIdx) => (
            <div
              key={opt.id || optIdx}
              className="bg-white p-3 sm:p-4 rounded-2xl border border-gray-200 shadow-sm space-y-3"
            >
              {/* Option Title */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2 flex-grow min-w-0">
                  <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-orange-100 text-orange-700 font-black text-[11px] sm:text-xs flex items-center justify-center shrink-0">
                    {optIdx + 1}
                  </span>
                  <input
                    type="text"
                    value={opt.name_ar}
                    onChange={(e) => handleUpdateOptionName(optIdx, e.target.value)}
                    placeholder="اسم الخيار (مثال: درجة الطعم، الحجم، نوع الصوص...)"
                    className="w-full min-w-0 bg-gray-50 border border-gray-200 rounded-xl px-2.5 sm:px-3 py-1.5 text-xs font-bold text-gray-900 outline-none focus:ring-2 focus:ring-orange-500 text-right"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveOption(optIdx)}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                  title="حذف هذا الخيار"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Choices & Pricing Table */}
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] font-black text-gray-500 px-1">
                  <span className="col-span-6 sm:col-span-7">اسم الاختيار</span>
                  <span className="col-span-5 sm:col-span-4">السعر المحدد (جـ)</span>
                  <span className="col-span-1 text-center"></span>
                </div>

                {opt.choices.map((choice, choiceIdx) => {
                  const currentPrice = (choice.price !== undefined && choice.price !== null)
                    ? choice.price
                    : ((choice.price_delta !== undefined && choice.price_delta !== null && Number(choice.price_delta) !== 0)
                      ? basePrice + Number(choice.price_delta)
                      : basePrice);

                  return (
                    <div
                      key={choice.id || choiceIdx}
                      className="grid grid-cols-12 gap-1.5 sm:gap-2 items-center bg-gray-50/80 p-2 sm:p-2.5 rounded-xl border border-gray-200/80 hover:border-orange-300 transition-all"
                    >
                      {/* Choice Name */}
                      <div className="col-span-6 sm:col-span-7 min-w-0">
                        <input
                          type="text"
                          value={choice.name_ar}
                          onChange={(e) => handleUpdateChoiceName(optIdx, choiceIdx, e.target.value)}
                          placeholder="مثال: عادي، حار..."
                          className="w-full bg-white border border-gray-200 rounded-lg px-2 sm:px-3 py-1.5 text-xs font-bold text-gray-900 outline-none focus:ring-2 focus:ring-orange-500 text-right"
                        />
                      </div>

                      {/* Choice Price */}
                      <div className="col-span-5 sm:col-span-4 relative min-w-0">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={currentPrice !== undefined && currentPrice !== null ? currentPrice : ''}
                          onChange={(e) => handleUpdateChoicePrice(optIdx, choiceIdx, parseFloat(e.target.value) || 0)}
                          placeholder="السعر"
                          className="w-full bg-white border border-orange-300 text-orange-950 rounded-lg px-2 sm:px-3 py-1.5 text-xs font-black outline-none focus:ring-2 focus:ring-orange-500 text-right pl-6 sm:pl-7"
                        />
                        <span className="absolute left-1.5 sm:left-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-orange-600 pointer-events-none">
                          جـ
                        </span>
                      </div>

                      {/* Delete Choice */}
                      <div className="col-span-1 flex justify-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveChoice(optIdx, choiceIdx)}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
                          title="حذف هذا الاختيار"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div className="pt-1 flex justify-start">
                  <button
                    type="button"
                    onClick={() => handleAddChoice(optIdx)}
                    className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-bold text-orange-600 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>+ إضافة اختيار إضافي</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
