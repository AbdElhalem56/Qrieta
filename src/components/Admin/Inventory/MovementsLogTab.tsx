import React, { useState } from 'react';
import { History, Search, ArrowUpRight, ArrowDownLeft, Filter } from 'lucide-react';
import { RawStockMovement } from '../../../lib/recipeService';
import { toEnglishDigits } from '../../../lib/utils';

interface MovementsLogTabProps {
  movements: RawStockMovement[];
}

export const MovementsLogTab: React.FC<MovementsLogTabProps> = ({ movements }) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'sale_deduction' | 'purchase_in' | 'waste' | 'audit_adjustment'>('all');

  const filtered = movements.filter(m => {
    const matchesSearch = 
      (m.material_name && m.material_name.toLowerCase().includes(search.toLowerCase())) ||
      (m.reason && m.reason.toLowerCase().includes(search.toLowerCase())) ||
      (m.performed_by && m.performed_by.toLowerCase().includes(search.toLowerCase()));

    const matchesType = typeFilter === 'all' || m.type === typeFilter;

    return matchesSearch && matchesType;
  });

  const getTypeBadge = (type: RawStockMovement['type']) => {
    switch (type) {
      case 'sale_deduction':
        return (
          <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-800 px-2.5 py-1 rounded-xl font-bold text-[11px]">
            <span>خصم مبيعات (أوردر)</span>
          </span>
        );
      case 'purchase_in':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2.5 py-1 rounded-xl font-bold text-[11px]">
            <span>توريد وشراء (+)</span>
          </span>
        );
      case 'waste':
        return (
          <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 px-2.5 py-1 rounded-xl font-bold text-[11px]">
            <span>هدر وتالف (-)</span>
          </span>
        );
      case 'audit_adjustment':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 px-2.5 py-1 rounded-xl font-bold text-[11px]">
            <span>تسوية جرد فعلي</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 text-right">
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="ابحث برقم الفاتورة، اسم المادة، أو اسم المسؤول..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 focus:bg-white rounded-2xl pr-10 pl-4 py-2 outline-none focus:ring-2 ring-orange-500 font-bold text-xs text-right"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
              typeFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            الكل ({toEnglishDigits(movements.length)})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('sale_deduction')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
              typeFilter === 'sale_deduction' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            خصم مبيعات
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('purchase_in')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
              typeFilter === 'purchase_in' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            توريدات
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('waste')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
              typeFilter === 'waste' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            هدر
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('audit_adjustment')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
              typeFilter === 'audit_adjustment' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            تسويات جرد
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-100">
              <tr>
                <th className="p-3">المادة الخام</th>
                <th className="p-3 text-center">نوع الحركة</th>
                <th className="p-3 text-center">الكمية المتحركة</th>
                <th className="p-3 text-center">الرصيد قبل</th>
                <th className="p-3 text-center">الرصيد بعد</th>
                <th className="p-3">السبب والتفاصيل</th>
                <th className="p-3 text-center">المسؤول</th>
                <th className="p-3 text-center">التاريخ والتوقيت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400 font-bold">
                    لا توجد حركات مطابقة للفلتر
                  </td>
                </tr>
              ) : (
                filtered.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="p-3 font-black text-gray-900">{m.material_name}</td>
                    <td className="p-3 text-center">{getTypeBadge(m.type)}</td>
                    <td className="p-3 text-center font-black text-sm">
                      <span className={m.quantity > 0 ? 'text-emerald-600' : 'text-orange-600'}>
                        {m.quantity > 0 ? '+' : ''}{toEnglishDigits(m.quantity)} {m.unit}
                      </span>
                    </td>
                    <td className="p-3 text-center font-bold text-gray-500">
                      {toEnglishDigits(m.prev_stock)} {m.unit}
                    </td>
                    <td className="p-3 text-center font-black text-gray-800">
                      {toEnglishDigits(m.new_stock)} {m.unit}
                    </td>
                    <td className="p-3 font-medium text-gray-700">{m.reason}</td>
                    <td className="p-3 text-center text-gray-600 font-bold">{m.performed_by}</td>
                    <td className="p-3 text-center text-gray-400 font-medium">
                      {new Date(m.timestamp).toLocaleString('ar-EG')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
