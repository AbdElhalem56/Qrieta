import React, { useState } from 'react';
import { AlertOctagon, Plus, Search, Trash2, Calendar, DollarSign, ArrowDownRight } from 'lucide-react';
import { WasteRecord, RawMaterial } from '../../../lib/recipeService';
import { formatCurrency, toEnglishDigits } from '../../../lib/utils';
import { NewWasteModal } from './NewWasteModal';

interface WasteLogTabProps {
  restaurantId: string;
  wastes: WasteRecord[];
  rawMaterials: RawMaterial[];
  onRefresh: () => void;
}

export const WasteLogTab: React.FC<WasteLogTabProps> = ({
  restaurantId,
  wastes,
  rawMaterials,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  const totalWasteLoss = wastes.reduce((acc, w) => acc + (w.cost || 0), 0);

  const filteredWastes = wastes.filter(w =>
    (w.material_name && w.material_name.toLowerCase().includes(search.toLowerCase())) ||
    (w.reason && w.reason.toLowerCase().includes(search.toLowerCase())) ||
    (w.performed_by && w.performed_by.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6 text-right">
      {/* Top Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
            <AlertOctagon size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 block">إجمالي حركات الهدر المسجلة</span>
            <span className="text-xl font-black text-gray-900">{toEnglishDigits(wastes.length)} حركة</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <DollarSign size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 block">إجمالي الخسارة المالية من الهدر</span>
            <span className="text-xl font-black text-red-600">{toEnglishDigits(formatCurrency(totalWasteLoss))}</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-end">
          <button
            type="button"
            onClick={() => setIsNewModalOpen(true)}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-3 px-5 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
          >
            <Plus size={18} />
            <span>+ تسجيل هدر / تلف مادة خام</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden p-5 space-y-4">
        <div className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="ابحث عن مادة مهدرة أو سبب الهدر..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 focus:bg-white rounded-2xl pr-10 pl-4 py-2.5 outline-none focus:ring-2 ring-red-500 font-bold text-sm text-right"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-100">
              <tr>
                <th className="p-3">المادة الخام المهدرة</th>
                <th className="p-3 text-center">الكمية المهدرة</th>
                <th className="p-3 text-center">الخسارة المالية</th>
                <th className="p-3">سبب الهدر</th>
                <th className="p-3 text-center">المسؤول</th>
                <th className="p-3 text-center">التاريخ والتوقيت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredWastes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400 font-bold">
                    لا توجد حركات هدر مسجلة حتى الآن (مؤشر ممتاز لضبط الجودة!)
                  </td>
                </tr>
              ) : (
                filteredWastes.map(w => (
                  <tr key={w.id} className="hover:bg-red-50/20 transition-colors">
                    <td className="p-3 font-black text-gray-900">{w.material_name}</td>
                    <td className="p-3 text-center font-black text-red-600">
                      {toEnglishDigits(w.quantity)} {w.unit}
                    </td>
                    <td className="p-3 text-center font-black text-red-600 text-sm">
                      {toEnglishDigits(formatCurrency(w.cost))}
                    </td>
                    <td className="p-3 text-gray-700 font-bold">{w.reason}</td>
                    <td className="p-3 text-center text-gray-600 font-bold">{w.performed_by}</td>
                    <td className="p-3 text-center text-gray-400 font-medium">
                      {new Date(w.created_at).toLocaleString('ar-EG')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isNewModalOpen && (
        <NewWasteModal
          restaurantId={restaurantId}
          rawMaterials={rawMaterials}
          onClose={() => setIsNewModalOpen(false)}
          onSaved={() => {
            setIsNewModalOpen(false);
            onRefresh();
          }}
        />
      )}
    </div>
  );
};
