import React, { useState } from 'react';
import { Truck, Plus, Search, Calendar, FileText, DollarSign, Eye, X } from 'lucide-react';
import { PurchaseInvoice, RawMaterial } from '../../../lib/recipeService';
import { formatCurrency, toEnglishDigits } from '../../../lib/utils';
import { NewPurchaseModal } from './NewPurchaseModal';

interface PurchaseInvoicesTabProps {
  restaurantId: string;
  purchases: PurchaseInvoice[];
  rawMaterials: RawMaterial[];
  onRefresh: () => void;
}

export const PurchaseInvoicesTab: React.FC<PurchaseInvoicesTabProps> = ({
  restaurantId,
  purchases,
  rawMaterials,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null);

  const totalSpent = purchases.reduce((acc, p) => acc + (p.total_amount || 0), 0);

  const filteredPurchases = purchases.filter(p =>
    (p.supplier_name && p.supplier_name.toLowerCase().includes(search.toLowerCase())) ||
    (p.invoice_number && p.invoice_number.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6 text-right">
      {/* Top Banner / KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <Truck size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 block">إجمالي فواتير وسندات الشراء</span>
            <span className="text-xl font-black text-gray-900">{toEnglishDigits(purchases.length)} فاتورة</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <DollarSign size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 block">إجمالي مشتريات المواد الخام</span>
            <span className="text-xl font-black text-emerald-600">{toEnglishDigits(formatCurrency(totalSpent))}</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-end">
          <button
            type="button"
            onClick={() => setIsNewModalOpen(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 px-5 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
          >
            <Plus size={18} />
            <span>+ تسجيل سند توريد وشراء جديد</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden p-5 space-y-4">
        <div className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="ابحث برقم الفاتورة أو اسم المورد..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 focus:bg-white rounded-2xl pr-10 pl-4 py-2.5 outline-none focus:ring-2 ring-blue-500 font-bold text-sm text-right"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-100">
              <tr>
                <th className="p-3">رقم الفاتورة</th>
                <th className="p-3">المورد</th>
                <th className="p-3 text-center">التاريخ</th>
                <th className="p-3 text-center">عدد البنود الموردة</th>
                <th className="p-3 text-center">المبلغ الإجمالي</th>
                <th className="p-3 text-center">عرض البنود</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400 font-bold">
                    لا توجد فواتير توريد مسجلة حتى الآن
                  </td>
                </tr>
              ) : (
                filteredPurchases.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="p-3 font-black text-gray-900">{p.invoice_number}</td>
                    <td className="p-3 font-bold text-gray-700">{p.supplier_name}</td>
                    <td className="p-3 text-center text-gray-500 font-medium">
                      {new Date(p.date || p.created_at).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="p-3 text-center font-bold text-gray-800">
                      {toEnglishDigits(p.items?.length || 0)} أصناف
                    </td>
                    <td className="p-3 text-center font-black text-blue-600 text-sm">
                      {toEnglishDigits(formatCurrency(p.total_amount))}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedInvoice(p)}
                        className="px-3 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                      >
                        عرض التفاصيل
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-gray-100 text-right space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-black text-lg">تفاصيل فاتورة #{selectedInvoice.invoice_number}</h3>
              <button onClick={() => setSelectedInvoice(null)} className="p-1 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>

            <div className="text-xs space-y-1 text-gray-600">
              <p>المورد: <strong>{selectedInvoice.supplier_name}</strong></p>
              <p>التاريخ: <strong>{selectedInvoice.date}</strong></p>
              {selectedInvoice.notes && <p>ملاحظات: {selectedInvoice.notes}</p>}
            </div>

            <div className="border rounded-2xl overflow-hidden">
              <table className="w-full text-xs text-right">
                <thead className="bg-gray-50 text-gray-600 font-bold">
                  <tr>
                    <th className="p-2.5">المادة</th>
                    <th className="p-2.5 text-center">الكمية</th>
                    <th className="p-2.5 text-center">سعر الوحدة</th>
                    <th className="p-2.5 text-center">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedInvoice.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-2.5 font-bold">{it.material_name}</td>
                      <td className="p-2.5 text-center">{toEnglishDigits(it.quantity)} {it.unit}</td>
                      <td className="p-2.5 text-center">{toEnglishDigits(it.unit_cost.toFixed(4))} ج.م</td>
                      <td className="p-2.5 text-center font-black text-blue-600">{toEnglishDigits(it.total_cost.toFixed(2))} ج.م</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2 border-t font-black">
              <span>الإجمالي العام:</span>
              <span className="text-blue-600 text-base">{toEnglishDigits(formatCurrency(selectedInvoice.total_amount))}</span>
            </div>
          </div>
        </div>
      )}

      {/* New Purchase Modal */}
      {isNewModalOpen && (
        <NewPurchaseModal
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
