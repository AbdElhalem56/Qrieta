import React from 'react';
import { Plus, Trash2, Check, Sparkles, SlidersHorizontal, Layers } from 'lucide-react';
import { CategoryOption, CategoryOptionChoice } from '../lib/supabase';
import { OPTION_PRESETS, OptionPreset } from '../lib/optionsHelper';
import { cn } from '../lib/utils';

interface CategoryOptionsEditorProps {
  options: CategoryOption[];
  onChange: (newOptions: CategoryOption[]) => void;
  isRTL?: boolean;
}

export const CategoryOptionsEditor: React.FC<CategoryOptionsEditorProps> = ({
  options,
  onChange,
  isRTL = true
}) => {
  const handleTogglePreset = (preset: OptionPreset) => {
    const exists = options.some(opt => opt.id === preset.option.id || opt.name_ar === preset.option.name_ar);
    if (exists) {
      // Remove it
      onChange(options.filter(opt => opt.id !== preset.option.id && opt.name_ar !== preset.option.name_ar));
    } else {
      // Add it
      onChange([...options, { ...preset.option, id: `${preset.option.id}_${Date.now()}` }]);
    }
  };

  const handleAddCustomOption = () => {
    const newOpt: CategoryOption = {
      id: `custom_opt_${Date.now()}`,
      name_ar: '',
      name_en: '',
      choices: [
        { id: `c1_${Date.now()}`, name_ar: 'الخيار الأول', name_en: 'Option 1', price_delta: 0 },
        { id: `c2_${Date.now()}`, name_ar: 'الخيار الثاني', name_en: 'Option 2', price_delta: 0 }
      ]
    };
    onChange([...options, newOpt]);
  };

  const handleUpdateOptionName = (optIndex: number, nameAr: string) => {
    const updated = [...options];
    updated[optIndex] = { ...updated[optIndex], name_ar: nameAr };
    onChange(updated);
  };

  const handleRemoveOption = (optIndex: number) => {
    onChange(options.filter((_, idx) => idx !== optIndex));
  };

  const handleAddChoice = (optIndex: number) => {
    const updated = [...options];
    const targetOpt = updated[optIndex];
    const newChoice: CategoryOptionChoice = {
      id: `choice_${Date.now()}`,
      name_ar: `خيار ${targetOpt.choices.length + 1}`,
      name_en: `Choice ${targetOpt.choices.length + 1}`,
      price_delta: 0
    };
    updated[optIndex] = {
      ...targetOpt,
      choices: [...targetOpt.choices, newChoice]
    };
    onChange(updated);
  };

  const handleUpdateChoice = (optIndex: number, choiceIndex: number, nameAr: string) => {
    const updated = [...options];
    const targetOpt = updated[optIndex];
    const newChoices = [...targetOpt.choices];
    newChoices[choiceIndex] = {
      ...newChoices[choiceIndex],
      name_ar: nameAr
    };
    updated[optIndex] = { ...targetOpt, choices: newChoices };
    onChange(updated);
  };

  const handleRemoveChoice = (optIndex: number, choiceIndex: number) => {
    const updated = [...options];
    const targetOpt = updated[optIndex];
    if (targetOpt.choices.length <= 1) {
      alert('يجب أن يحتوي الخيار على اختيار واحد على الأقل.');
      return;
    }
    updated[optIndex] = {
      ...targetOpt,
      choices: targetOpt.choices.filter((_, cIdx) => cIdx !== choiceIndex)
    };
    onChange(updated);
  };

  return (
    <div className="space-y-4 bg-orange-50/40 p-5 rounded-2xl border border-orange-100/80 text-right">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-orange-950 font-black text-sm">
          <SlidersHorizontal size={18} className="text-orange-600" />
          <span>تخصيص الخيارات والأوبشنز التابعة للتصنيف</span>
        </div>
        <span className="text-xs bg-orange-100 text-orange-800 px-2.5 py-1 rounded-lg font-bold">
          {options.length > 0 ? `${options.length} خيار نشط` : 'اختياري'}
        </span>
      </div>

      <p className="text-xs text-gray-500 font-medium leading-relaxed">
        اختر من القوالب الجاهزة أدناه أو أضف خيارات مخصصة لتظهر للزبون عند طلب أي وجبة في هذا التصنيف (مثل مستويات السكر، أحجام الوجبة، درجة السبايسي، إلخ):
      </p>

      {/* Quick Presets Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
        {OPTION_PRESETS.map((preset) => {
          const isSelected = options.some(
            opt => opt.name_ar === preset.option.name_ar || opt.id.startsWith(preset.option.id)
          );
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleTogglePreset(preset)}
              className={cn(
                "flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all text-right cursor-pointer",
                isSelected
                  ? "bg-orange-600 text-white border-orange-600 shadow-sm"
                  : "bg-white text-gray-700 border-gray-200 hover:border-orange-300 hover:bg-orange-50/50"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{preset.icon}</span>
                <span>{preset.title}</span>
              </div>
              {isSelected ? (
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                  <Check size={13} strokeWidth={3} />
                </div>
              ) : (
                <Plus size={14} className="text-gray-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* Active Options Configuration List */}
      {options.length > 0 && (
        <div className="space-y-3 pt-3 border-t border-orange-200/60">
          <p className="text-xs font-black text-gray-700 flex items-center gap-1.5">
            <Layers size={14} className="text-orange-600" />
            <span>الخيارات المفعلة للتصنيف:</span>
          </p>

          <div className="space-y-3">
            {options.map((opt, optIdx) => (
              <div
                key={opt.id || optIdx}
                className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3 transition-all"
              >
                {/* Option Header */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-grow">
                    <span className="w-6 h-6 rounded-lg bg-orange-100 text-orange-700 font-bold text-xs flex items-center justify-center shrink-0">
                      {optIdx + 1}
                    </span>
                    <input
                      type="text"
                      value={opt.name_ar}
                      onChange={(e) => handleUpdateOptionName(optIdx, e.target.value)}
                      placeholder="اسم الخيار (مثال: درجة السكر، الحجم، درجة السبايسي...)"
                      className="flex-grow bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-900 outline-none focus:ring-2 focus:ring-orange-500 text-right"
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

                {/* Option Choices Chips/Inputs */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-gray-500 block">الاختيارات المتاحة للزبون:</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {opt.choices.map((choice, cIdx) => (
                      <div
                        key={choice.id || cIdx}
                        className="flex items-center gap-1 bg-gray-50 border border-gray-200 pl-1.5 pr-2.5 py-1 rounded-lg text-xs"
                      >
                        <input
                          type="text"
                          value={choice.name_ar}
                          onChange={(e) => handleUpdateChoice(optIdx, cIdx, e.target.value)}
                          className="bg-transparent border-none outline-none font-bold text-gray-800 text-xs w-28 text-right focus:bg-white focus:px-1 rounded"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveChoice(optIdx, cIdx)}
                          className="text-gray-400 hover:text-red-500 p-0.5 rounded cursor-pointer"
                          title="حذف الاختيار"
                        >
                          &times;
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => handleAddChoice(optIdx)}
                      className="flex items-center gap-1 text-orange-600 bg-orange-50 hover:bg-orange-100 border border-dashed border-orange-300 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Plus size={13} />
                      <span>إضافة اختيار</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Custom Option Button */}
      <div className="pt-1">
        <button
          type="button"
          onClick={handleAddCustomOption}
          className="w-full py-2.5 px-4 bg-white border border-dashed border-orange-300 hover:border-orange-500 text-orange-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-orange-50/60 transition-all cursor-pointer shadow-sm"
        >
          <Plus size={15} />
          <span>إضافة خيار مخصص يدوي (Custom Option)</span>
        </button>
      </div>
    </div>
  );
};
