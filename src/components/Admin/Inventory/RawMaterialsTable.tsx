import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  AlertTriangle, 
  Boxes, 
  Edit3, 
  Trash2, 
  TrendingDown, 
  Truck, 
  DollarSign, 
  Scale, 
  AlertCircle,
  Package,
  Layers,
  Filter
} from 'lucide-react';
import { 
  RawMaterial, 
  RawMaterialCategory, 
  RAW_CATEGORY_LABELS, 
  formatMaterialQuantity, 
  getUnitArabicName,
  deleteRawMaterial
} from '../../../lib/recipeService';
import { formatCurrency, toEnglishDigits } from '../../../lib/utils';
import { AddRawMaterialModal } from './AddRawMaterialModal';
import { NewPurchaseModal } from './NewPurchaseModal';
import { NewWasteModal } from './NewWasteModal';

interface RawMaterialsTableProps {
  restaurantId: string;
  materials: RawMaterial[];
  onRefresh: () => void;
}

export const RawMaterialsTable: React.FC<RawMaterialsTableProps> = ({
  restaurantId,
  materials,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<RawMaterial | null>(null);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [wasteModalMaterial, setWasteModalMaterial] = useState<RawMaterial | null>(null);
  const [isWasteModalOpen, setIsWasteModalOpen] = useState(false);

  // KPIs
  const totalMaterials = materials.length;
  const lowStockMaterials = materials.filter(m => m.current_stock > 0 && m.current_stock <= m.min_alert_stock);
  const outOfStockMaterials = materials.filter(m => m.current_stock <= 0);
  const totalWarehouseValuation = materials.reduce((acc, m) => acc + (m.current_stock * m.cost_per_unit), 0);

  // Filtered List
  const filteredMaterials = materials.filter(m => {
    const matchesSearch = 
      (m.name_ar && m.name_ar.toLowerCase().includes(search.toLowerCase())) ||
      (m.name_en && m.name_en.toLowerCase().includes(search.toLowerCase())) ||
      (m.supplier && m.supplier.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory = selectedCategory === 'all' || m.category === selectedCategory;

    let matchesStock = true;
    if (stockFilter === 'low') matchesStock = m.current_stock > 0 && m.current_stock <= m.min_alert_stock;
    if (stockFilter === 'out') matchesStock = m.current_stock <= 0;

    return matchesSearch && matchesCategory && matchesStock;
  });

  const handleDelete = async (mat: RawMaterial) => {
    if (window.confirm(`هل أنت متأكد من حذف المادة الخام (${mat.name_ar}) من المستودع؟ سيتم إزالتها من أي ريسبي مرتبط بها.`)) {
      await deleteRawMaterial(restaurantId, mat.id);
      onRefresh();
    }
  };

  return (
    <div className="space-y-6 text-right">
      {/* Top KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
            <Boxes size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 block">إجمالي المواد الخام</span>
            <span className="text-xl font-black text-gray-900">{toEnglishDigits(totalMaterials)} مادة</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <DollarSign size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 block">قيمة المخزون الإجمالية</span>
            <span className="text-xl font-black text-emerald-600">
              {toEnglishDigits(formatCurrency(totalWarehouseValuation))}
            </span>
          </div>
        </div>

        <div 
          onClick={() => setStockFilter(stockFilter === 'low' ? 'all' : 'low')}
          className={`p-4 rounded-3xl border shadow-sm flex items-center gap-3.5 cursor-pointer transition-all ${
            stockFilter === 'low' ? 'bg-amber-500 text-white border-amber-600' : 'bg-white border-gray-100'
          }`}
        >
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
            stockFilter === 'low' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-600'
          }`}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <span className={`text-xs font-bold block ${stockFilter === 'low' ? 'text-amber-100' : 'text-gray-400'}`}>
              مواد اقتربت من النفاد
            </span>
            <span className="text-xl font-black">{toEnglishDigits(lowStockMaterials.length)} مادة</span>
          </div>
        </div>

        <div 
          onClick={() => setStockFilter(stockFilter === 'out' ? 'all' : 'out')}
          className={`p-4 rounded-3xl border shadow-sm flex items-center gap-3.5 cursor-pointer transition-all ${
            stockFilter === 'out' ? 'bg-red-500 text-white border-red-600' : 'bg-white border-gray-100'
          }`}
        >
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
            stockFilter === 'out' ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'
          }`}>
            <AlertCircle size={24} />
          </div>
          <div>
            <span className={`text-xs font-bold block ${stockFilter === 'out' ? 'text-red-100' : 'text-gray-400'}`}>
              مواد نفدت تماماً
            </span>
            <span className="text-xl font-black">{toEnglishDigits(outOfStockMaterials.length)} مادة</span>
          </div>
        </div>
      </div>

      {/* Action Bar & Search */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="ابحث عن مادة خام (بن، حليب، أكواب، مورد...)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 focus:bg-white rounded-2xl pr-10 pl-4 py-2.5 outline-none focus:ring-2 ring-orange-500 font-bold text-sm text-right"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPurchaseModalOpen(true)}
              className="flex-1 sm:flex-initial bg-blue-600 hover:bg-blue-700 text-white font-black px-4 py-2.5 rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 transition-all cursor-pointer"
            >
              <Truck size={18} />
              <span>+ سند توريد وشراء</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingMaterial(null);
                setIsAddModalOpen(true);
              }}
              className="flex-1 sm:flex-initial bg-orange-600 hover:bg-orange-700 text-white font-black px-5 py-2.5 rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-orange-600/20 transition-all cursor-pointer"
            >
              <Plus size={18} />
              <span>+ مادة خام جديدة</span>
            </button>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-gray-900 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            الكل ({toEnglishDigits(materials.length)})
          </button>
          {Object.entries(RAW_CATEGORY_LABELS).map(([catKey, item]) => {
            const count = materials.filter(m => m.category === catKey).length;
            return (
              <button
                key={catKey}
                type="button"
                onClick={() => setSelectedCategory(catKey)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  selectedCategory === catKey
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.ar}</span>
                <span className="opacity-70 text-[10px]">({toEnglishDigits(count)})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Materials Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-gray-50/80 text-gray-500 font-bold border-b border-gray-100">
              <tr>
                <th className="p-4">المادة الخام</th>
                <th className="p-4 text-center">الفئة</th>
                <th className="p-4 text-center">الرصيد بالمستودع</th>
                <th className="p-4 text-center">حد التنبيه</th>
                <th className="p-4 text-center">تكلفة الشراء</th>
                <th className="p-4 text-center">إجمالي قيمة الرصيد</th>
                <th className="p-4 text-center">حالة التوفر</th>
                <th className="p-4 text-center">إجراءات سريعة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {filteredMaterials.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    <Boxes className="mx-auto text-gray-300 mb-2" size={40} />
                    <p className="font-bold text-sm">لا توجد مواد خام مطابقة للبحث أو الفلتر</p>
                  </td>
                </tr>
              ) : (
                filteredMaterials.map(mat => {
                  const qtyInfo = formatMaterialQuantity(mat.current_stock, mat.unit);
                  const alertInfo = formatMaterialQuantity(mat.min_alert_stock, mat.unit);
                  const isOut = mat.current_stock <= 0;
                  const isLow = mat.current_stock > 0 && mat.current_stock <= mat.min_alert_stock;
                  const lineTotalValue = mat.current_stock * mat.cost_per_unit;

                  // Rate display
                  const rateDisplay = mat.unit === 'g'
                    ? `${toEnglishDigits((mat.cost_per_unit * 1000).toFixed(0))} ج/كجم`
                    : mat.unit === 'ml'
                    ? `${toEnglishDigits((mat.cost_per_unit * 1000).toFixed(0))} ج/لتر`
                    : `${toEnglishDigits(mat.cost_per_unit.toFixed(2))} ج/قطعة`;

                  const catInfo = RAW_CATEGORY_LABELS[mat.category] || RAW_CATEGORY_LABELS.general;

                  return (
                    <tr key={mat.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="p-4">
                        <div className="font-black text-gray-900 text-sm">{mat.name_ar}</div>
                        <div className="text-[11px] text-gray-400">{mat.name_en}</div>
                        {mat.supplier && (
                          <span className="inline-block mt-1 text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-bold">
                            🚚 {mat.supplier}
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-center">
                        <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 px-2.5 py-1 rounded-xl text-[11px] font-bold">
                          <span>{catInfo.icon}</span>
                          <span>{catInfo.ar}</span>
                        </span>
                      </td>

                      <td className="p-4 text-center">
                        <div className="font-black text-gray-900 text-sm">
                          {toEnglishDigits(qtyInfo.formatted)}
                        </div>
                        {mat.unit !== 'pcs' && (
                          <div className="text-[10px] text-gray-400">
                            {toEnglishDigits(mat.current_stock.toLocaleString('en-US'))} {mat.unit}
                          </div>
                        )}
                      </td>

                      <td className="p-4 text-center font-bold text-gray-500">
                        {toEnglishDigits(alertInfo.formatted)}
                      </td>

                      <td className="p-4 text-center">
                        <div className="font-black text-gray-800">
                          {rateDisplay}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {toEnglishDigits(mat.cost_per_unit.toFixed(4))} ج / {mat.unit}
                        </div>
                      </td>

                      <td className="p-4 text-center font-black text-emerald-600 text-sm">
                        {toEnglishDigits(formatCurrency(lineTotalValue))}
                      </td>

                      <td className="p-4 text-center">
                        {isOut ? (
                          <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 px-2.5 py-1 rounded-xl text-xs font-black">
                            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                            <span>نافذ بالمستودع</span>
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2.5 py-1 rounded-xl text-xs font-black">
                            <span className="w-2 h-2 rounded-full bg-amber-600" />
                            <span>منخفض (اطلب توريد)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-xl text-xs font-black">
                            <span className="w-2 h-2 rounded-full bg-emerald-600" />
                            <span>متوفر وممتاز</span>
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setWasteModalMaterial(mat);
                              setIsWasteModalOpen(true);
                            }}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                            title="تسجيل هدر وتالف لهذه المادة"
                          >
                            <TrendingDown size={16} />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingMaterial(mat);
                              setIsAddModalOpen(true);
                            }}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
                            title="تعديل المادة وسعرها"
                          >
                            <Edit3 size={16} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(mat)}
                            className="p-1.5 text-gray-400 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                            title="حذف من المستودع"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {isAddModalOpen && (
        <AddRawMaterialModal
          restaurantId={restaurantId}
          editingMaterial={editingMaterial}
          onClose={() => setIsAddModalOpen(false)}
          onSaved={() => {
            setIsAddModalOpen(false);
            onRefresh();
          }}
        />
      )}

      {isPurchaseModalOpen && (
        <NewPurchaseModal
          restaurantId={restaurantId}
          rawMaterials={materials}
          onClose={() => setIsPurchaseModalOpen(false)}
          onSaved={() => {
            setIsPurchaseModalOpen(false);
            onRefresh();
          }}
        />
      )}

      {isWasteModalOpen && (
        <NewWasteModal
          restaurantId={restaurantId}
          rawMaterials={materials}
          preSelectedMaterial={wasteModalMaterial}
          onClose={() => setIsWasteModalOpen(false)}
          onSaved={() => {
            setIsWasteModalOpen(false);
            onRefresh();
          }}
        />
      )}
    </div>
  );
};
