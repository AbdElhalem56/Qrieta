import React, { useState } from 'react';
import { 
  ClipboardCheck, 
  Search, 
  Check, 
  AlertTriangle, 
  History, 
  DollarSign, 
  Calendar, 
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Boxes
} from 'lucide-react';
import { 
  RawMaterial, 
  StocktakeAudit, 
  StocktakeItem, 
  recordStocktakeAudit, 
  formatMaterialQuantity,
  getUnitArabicName 
} from '../../../lib/recipeService';
import { formatCurrency, toEnglishDigits } from '../../../lib/utils';

interface StocktakeAuditTabProps {
  restaurantId: string;
  materials: RawMaterial[];
  audits: StocktakeAudit[];
  onRefresh: () => void;
}

export const StocktakeAuditTab: React.FC<StocktakeAuditTabProps> = ({
  restaurantId,
  materials,
  audits,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [actualCounts, setActualCounts] = useState<Record<string, string>>({});
  const [performedBy, setPerformedBy] = useState('مدير الفرع / المسؤول');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<'current' | 'history'>('current');
  const [selectedAuditDetail, setSelectedAuditDetail] = useState<StocktakeAudit | null>(null);

  // Initialize actual count defaults to system count if not touched
  const handleCountChange = (matId: string, val: string) => {
    setActualCounts(prev => ({ ...prev, [matId]: val }));
  };

  const filteredMaterials = materials.filter(m =>
    (m.name_ar && m.name_ar.toLowerCase().includes(search.toLowerCase())) ||
    (m.name_en && m.name_en.toLowerCase().includes(search.toLowerCase()))
  );

  // Calculate variances for items where user entered actual counts
  const itemsWithCounts: StocktakeItem[] = materials
    .filter(m => actualCounts[m.id] !== undefined && actualCounts[m.id].trim() !== '')
    .map(m => {
      const actual = parseFloat(actualCounts[m.id]) || 0;
      const variance = actual - m.current_stock;
      const varianceCost = variance * m.cost_per_unit;
      return {
        material_id: m.id,
        material_name: m.name_ar,
        unit: m.unit,
        system_stock: m.current_stock,
        actual_stock: actual,
        variance,
        variance_cost: Number(varianceCost.toFixed(2))
      };
    });

  const totalVarianceCost = itemsWithCounts.reduce((acc, it) => acc + it.variance_cost, 0);
  const deficitItemsCount = itemsWithCounts.filter(it => it.variance < 0).length;
  const surplusItemsCount = itemsWithCounts.filter(it => it.variance > 0).length;

  const handleApplyAudit = async () => {
    if (itemsWithCounts.length === 0) {
      alert('يرجى إدخال الرصيد الفعلي لمادة خام واحدة على الأقل قبل تسوية الجرد');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من اعتماد وتسوية الجرد لـ ${itemsWithCounts.length} مواد خام؟ سيتم تحديث أرصدة المستودع فوراً لتطابق الجرد الفعلي.`)) {
      return;
    }

    setSaving(true);
    try {
      await recordStocktakeAudit(restaurantId, {
        performed_by: performedBy.trim() || 'مدير الفرع',
        items: itemsWithCounts,
        notes: notes.trim() || undefined
      });
      alert('تم اعتماد الجرد الفعلي وتسوية أرصدة المستودع بنجاح!');
      setActualCounts({});
      setNotes('');
      onRefresh();
    } catch (e) {
      console.error('Failed to record stocktake audit:', e);
      alert('حدث خطأ أثناء اعتماد الجرد');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-right">
      {/* View Switcher Bar */}
      <div className="bg-white p-3 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveView('current');
              setSelectedAuditDetail(null);
            }}
            className={`px-4 py-2 rounded-2xl font-black text-xs transition-all cursor-pointer flex items-center gap-2 ${
              activeView === 'current'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <ClipboardCheck size={16} />
            <span>الجرد الفعلي الحالي والتسوية</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('history')}
            className={`px-4 py-2 rounded-2xl font-black text-xs transition-all cursor-pointer flex items-center gap-2 ${
              activeView === 'history'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <History size={16} />
            <span>سجل عمليات الجرد السابقة ({toEnglishDigits(audits.length)})</span>
          </button>
        </div>

        {activeView === 'current' && (
          <button
            type="button"
            disabled={saving || itemsWithCounts.length === 0}
            onClick={handleApplyAudit}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black px-5 py-2 rounded-2xl text-xs flex items-center gap-2 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <Check size={16} />
            <span>اعتماد وتسوية الجرد ({toEnglishDigits(itemsWithCounts.length)} مواد)</span>
          </button>
        )}
      </div>

      {activeView === 'current' ? (
        <>
          {/* Audit KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
              <span className="text-xs font-bold text-gray-400 block mb-1">المواد التي تم جردها</span>
              <span className="text-xl font-black text-gray-900">
                {toEnglishDigits(itemsWithCounts.length)} / {toEnglishDigits(materials.length)}
              </span>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
              <span className="text-xs font-bold text-gray-400 block mb-1">مواد بها عجز (-)</span>
              <span className="text-xl font-black text-red-600">{toEnglishDigits(deficitItemsCount)} مادة</span>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
              <span className="text-xs font-bold text-gray-400 block mb-1">مواد بها زيادة (+)</span>
              <span className="text-xl font-black text-emerald-600">{toEnglishDigits(surplusItemsCount)} مادة</span>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
              <span className="text-xs font-bold text-gray-400 block mb-1">صافي الأثر المالي للفروقات</span>
              <span className={`text-xl font-black ${
                totalVarianceCost < 0 ? 'text-red-600' : totalVarianceCost > 0 ? 'text-emerald-600' : 'text-gray-900'
              }`}>
                {toEnglishDigits(formatCurrency(totalVarianceCost))}
              </span>
            </div>
          </div>

          {/* Audit Inputs & Materials Table */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative flex-1 w-full">
                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="ابحث عن مادة خام لإدخال وزنها أو كميتها الفعلية..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 focus:bg-white rounded-2xl pr-10 pl-4 py-2.5 outline-none focus:ring-2 ring-orange-500 font-bold text-sm text-right"
                />
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="اسم القائم بالجرد"
                  value={performedBy}
                  onChange={e => setPerformedBy(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 ring-orange-500 w-full sm:w-48 text-right"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-100">
                  <tr>
                    <th className="p-3">المادة الخام</th>
                    <th className="p-3 text-center">الرصيد الدفتري (السيستم)</th>
                    <th className="p-3 text-center">الرصيد الفعلي (على الرف)</th>
                    <th className="p-3 text-center">الفارق (عجز / زيادة)</th>
                    <th className="p-3 text-center">التكلفة المالية للفارق</th>
                    <th className="p-3 text-center">إجراء سريع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredMaterials.map(mat => {
                    const actualVal = actualCounts[mat.id];
                    const hasEntered = actualVal !== undefined && actualVal.trim() !== '';
                    const actualNum = parseFloat(actualVal) || 0;
                    const variance = hasEntered ? actualNum - mat.current_stock : 0;
                    const varianceCost = variance * mat.cost_per_unit;
                    const sysInfo = formatMaterialQuantity(mat.current_stock, mat.unit);

                    return (
                      <tr key={mat.id} className={`hover:bg-gray-50/70 transition-colors ${
                        hasEntered && variance < 0 ? 'bg-red-50/20' : hasEntered && variance > 0 ? 'bg-emerald-50/20' : ''
                      }`}>
                        <td className="p-3">
                          <div className="font-black text-gray-900">{mat.name_ar}</div>
                          <div className="text-[10px] text-gray-400">{getUnitArabicName(mat.unit)}</div>
                        </td>

                        <td className="p-3 text-center font-bold text-gray-700">
                          {toEnglishDigits(sysInfo.formatted)}
                        </td>

                        <td className="p-3 text-center">
                          <div className="inline-flex items-center gap-1.5 bg-gray-50 p-1 rounded-xl border border-gray-200">
                            <input
                              type="number"
                              step="0.1"
                              placeholder={String(mat.current_stock)}
                              value={actualVal !== undefined ? actualVal : ''}
                              onChange={e => handleCountChange(mat.id, e.target.value)}
                              className="w-24 text-center font-black text-sm bg-white rounded-lg border border-gray-300 py-1 outline-none focus:ring-2 ring-orange-500"
                            />
                            <span className="text-xs font-bold text-gray-500">{mat.unit}</span>
                          </div>
                        </td>

                        <td className="p-3 text-center">
                          {hasEntered ? (
                            <span className={`font-black text-xs px-2 py-1 rounded-lg ${
                              variance < 0 
                                ? 'bg-red-100 text-red-800' 
                                : variance > 0 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : 'bg-gray-100 text-gray-700'
                            }`}>
                              {variance > 0 ? '+' : ''}{toEnglishDigits(variance)} {mat.unit}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs font-bold">لم يُجرد</span>
                          )}
                        </td>

                        <td className="p-3 text-center">
                          {hasEntered && variance !== 0 ? (
                            <span className={`font-black text-xs ${varianceCost < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {toEnglishDigits(formatCurrency(varianceCost))}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs font-bold">-</span>
                          )}
                        </td>

                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleCountChange(mat.id, String(mat.current_stock))}
                            className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                          >
                            مطابق للسيستم
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* History View */
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden p-5">
          <h3 className="text-base font-black text-gray-900 mb-4">أرشيف عمليات الجرد الدوري والتسويات</h3>

          {audits.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ClipboardCheck className="mx-auto text-gray-300 mb-2" size={40} />
              <p className="font-bold text-sm">لم يتم تسجيل عمليات جرد سابقة حتى الآن</p>
            </div>
          ) : (
            <div className="space-y-4">
              {audits.map(aud => (
                <div 
                  key={aud.id}
                  className="border border-gray-200 rounded-2xl p-4 hover:border-orange-200 transition-all bg-gray-50/50"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-gray-200/80 pb-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-gray-900 text-sm">
                          جرد بتاريخ {new Date(aud.audit_date).toLocaleDateString('ar-EG')}
                        </span>
                        <span className="text-[11px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded font-bold">
                          المسؤول: {aud.performed_by}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 mt-0.5 block">
                        تم فحص وتدقيق {toEnglishDigits(aud.items.length)} مادة خام
                      </span>
                    </div>

                    <div className="text-left">
                      <span className="text-[11px] text-gray-400 block font-bold">الأثر المالي للتسوية</span>
                      <span className={`font-black text-base ${
                        aud.total_variance_cost < 0 ? 'text-red-600' : 'text-emerald-600'
                      }`}>
                        {toEnglishDigits(formatCurrency(aud.total_variance_cost))}
                      </span>
                    </div>
                  </div>

                  {/* Summary of items in audit */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {aud.items.map((item, idx) => (
                      <div key={idx} className="bg-white p-2 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                        <span className="font-bold text-gray-800">{item.material_name}</span>
                        <span className={`font-black ${item.variance < 0 ? 'text-red-600' : item.variance > 0 ? 'text-emerald-600' : 'text-gray-500'}`}>
                          {item.variance > 0 ? '+' : ''}{toEnglishDigits(item.variance)} {item.unit} ({toEnglishDigits(formatCurrency(item.variance_cost))})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
