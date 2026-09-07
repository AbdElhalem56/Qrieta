import React, { useState, useEffect } from 'react';
import { 
  Package, 
  AlertTriangle, 
  Plus, 
  Minus, 
  Edit3, 
  Search, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  Boxes, 
  ClipboardCheck, 
  FileText, 
  ArrowUpRight, 
  ArrowDownRight, 
  RefreshCw,
  Eye,
  Trash2,
  Lock,
  Wallet,
  Calendar,
  Layers,
  ChevronDown
} from 'lucide-react';
import { Product, Category } from '../../lib/supabase';
import { cn, formatCurrency } from '../../lib/utils';
import { 
  fetchRestaurantInventory, 
  updateProductStock, 
  InventoryState, 
  InventoryMovement 
} from '../../lib/inventoryService';
import { 
  fetchRestaurantRecipesData, 
  FullRecipeInventoryState 
} from '../../lib/recipeService';
import { RawMaterialsTable } from './Inventory/RawMaterialsTable';
import { RecipeBuilderTab } from './Inventory/RecipeBuilderTab';
import { PurchaseInvoicesTab } from './Inventory/PurchaseInvoicesTab';
import { WasteLogTab } from './Inventory/WasteLogTab';
import { StocktakeAuditTab } from './Inventory/StocktakeAuditTab';
import { MovementsLogTab } from './Inventory/MovementsLogTab';
import { ChefHat, Truck, AlertOctagon, History } from 'lucide-react';

interface InventoryAuditTabProps {
  restaurantId: string;
  restaurantName?: string;
  products: Product[];
  categories: Category[];
}

export const InventoryAuditTab: React.FC<InventoryAuditTabProps> = ({
  restaurantId,
  restaurantName,
  products,
  categories,
}) => {
  const [subTab, setSubTab] = useState<
    'raw_materials' | 'recipes' | 'purchases' | 'waste' | 'raw_audit' | 'raw_movements' | 'stock' | 'audit' | 'movements' | 'cashier_shifts'
  >('raw_materials');
  const [recipeData, setRecipeData] = useState<FullRecipeInventoryState>({
    materials: [],
    recipes: {},
    purchases: [],
    wastes: [],
    audits: [],
    movements: []
  });
  const [inventory, setInventory] = useState<InventoryState>({
    stock: {},
    minAlerts: {},
    movements: [],
    shiftLogs: [],
    audits: []
  });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');

  // Modal states
  const [activeModal, setActiveModal] = useState<'stock_in' | 'waste' | 'adjust' | null>(null);
  const [targetProduct, setTargetProduct] = useState<Product | null>(null);
  const [quantityInput, setQuantityInput] = useState<string>('');
  const [reasonInput, setReasonInput] = useState<string>('');

  // Physical count state
  const [auditCounts, setAuditCounts] = useState<Record<string, number>>({});
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditNotes, setAuditNotes] = useState('');

  // Load Inventory & Recipe Data
  const loadData = async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const [data, recData] = await Promise.all([
        fetchRestaurantInventory(restaurantId),
        fetchRestaurantRecipesData(restaurantId)
      ]);
      // Initialize default stock if empty
      const initializedStock = { ...data.stock };
      products.forEach((p) => {
        if (initializedStock[p.id] === undefined) {
          initializedStock[p.id] = 25; // standard initial stock
        }
      });
      setInventory({
        ...data,
        stock: initializedStock
      });
      setRecipeData(recData);
    } catch (e) {
      console.error('Error loading inventory & recipes:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [restaurantId, products.length]);

  // Calculations & KPIs
  const totalProductsCount = products.length;
  const lowStockCount = products.filter(p => {
    const current = inventory.stock[p.id] ?? 25;
    const minAlert = inventory.minAlerts[p.id] ?? 5;
    return current > 0 && current <= minAlert;
  }).length;

  const outOfStockCount = products.filter(p => {
    const current = inventory.stock[p.id] ?? 25;
    return current <= 0;
  }).length;

  const estimatedStockValue = products.reduce((acc, p) => {
    const current = inventory.stock[p.id] ?? 25;
    return acc + (current * (parseFloat(p.price.toString()) || 0));
  }, 0);

  // Filtered Products List
  const filteredProducts = products.filter(p => {
    const current = inventory.stock[p.id] ?? 25;
    const minAlert = inventory.minAlerts[p.id] ?? 5;

    const matchesSearch = 
      (p.name_ar && p.name_ar.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.name_en && p.name_en.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCat = selectedCategory === 'all' || p.category_id === selectedCategory;

    let matchesStock = true;
    if (stockFilter === 'low') matchesStock = current > 0 && current <= minAlert;
    if (stockFilter === 'out') matchesStock = current <= 0;

    return matchesSearch && matchesCat && matchesStock;
  });

  // Action handlers
  const handleOpenActionModal = (prod: Product, modalType: 'stock_in' | 'waste' | 'adjust') => {
    setTargetProduct(prod);
    setActiveModal(modalType);
    setQuantityInput('');
    setReasonInput('');
  };

  const handleSaveStockAction = async () => {
    if (!targetProduct) return;
    const qty = parseFloat(quantityInput);
    if (isNaN(qty) || qty <= 0) {
      alert('يرجى إدخال كمية صحيحة');
      return;
    }

    try {
      if (activeModal === 'stock_in') {
        await updateProductStock(restaurantId, {
          productId: targetProduct.id,
          productName: targetProduct.name_ar || targetProduct.name_en,
          delta: qty,
          type: 'stock_in',
          reason: reasonInput.trim() || 'توريد جديد من الإدارة',
          performedBy: 'المدير'
        });
      } else if (activeModal === 'waste') {
        await updateProductStock(restaurantId, {
          productId: targetProduct.id,
          productName: targetProduct.name_ar || targetProduct.name_en,
          delta: -qty,
          type: 'waste',
          reason: reasonInput.trim() || 'هالك / تالف مسجل من الإدارة',
          performedBy: 'المدير'
        });
      } else if (activeModal === 'adjust') {
        await updateProductStock(restaurantId, {
          productId: targetProduct.id,
          productName: targetProduct.name_ar || targetProduct.name_en,
          newStock: qty,
          type: 'adjustment',
          reason: reasonInput.trim() || 'تعديل دفتري يدوي',
          performedBy: 'المدير'
        });
      }

      setActiveModal(null);
      setTargetProduct(null);
      loadData();
    } catch (err) {
      alert('فشل في حفظ التعديل على المخزون');
    }
  };

  // Start / Save Physical Audit
  const handleStartAudit = () => {
    setIsAuditing(true);
    const initialCounts: Record<string, number> = {};
    products.forEach(p => {
      initialCounts[p.id] = inventory.stock[p.id] ?? 25;
    });
    setAuditCounts(initialCounts);
  };

  const handleCommitAudit = async () => {
    if (!confirm('هل أنت متأكد من اعتماد الجرد وتحديث أرصدة المخزون بالقيم المحصورة؟')) return;

    for (const p of products) {
      const counted = auditCounts[p.id];
      const current = inventory.stock[p.id] ?? 25;
      if (counted !== undefined && counted !== current) {
        await updateProductStock(restaurantId, {
          productId: p.id,
          productName: p.name_ar || p.name_en,
          newStock: counted,
          type: 'audit',
          reason: `تسوية جرد دوري (${auditNotes || 'مطابقة الجرد الفعلي'})`,
          performedBy: 'المدير'
        });
      }
    }

    setIsAuditing(false);
    setAuditNotes('');
    alert('تم حفظ واعتماد الجرد بنجاح وتحديث كافة الأرصدة');
    loadData();
  };

  return (
    <div className="space-y-6 text-right font-sans">
      {/* Top Header & Navigation Subtabs */}
      <div className="bg-white p-4 sm:p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-col xl:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <Boxes className="text-orange-500" />
            <span>نظام الريسبي والمخزون المتقدم وحساب تكلفة الوجبات</span>
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            إدارة متكاملة للمواد الخام، خصم تلقائي من الأوردرات بالجرامات، حساب Food Cost، سندات التوريد، والهدر الفعلي
          </p>
        </div>

        {/* Subtab Switcher */}
        <div className="flex flex-wrap gap-1.5 bg-gray-100 p-1.5 rounded-2xl w-full xl:w-auto">
          <button
            onClick={() => setSubTab('raw_materials')}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer",
              subTab === 'raw_materials' ? "bg-orange-500 text-white shadow-md shadow-orange-500/20" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <Boxes size={15} />
            <span>المواد الخام بالمستودع ({recipeData.materials.length})</span>
          </button>

          <button
            onClick={() => setSubTab('recipes')}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer",
              subTab === 'recipes' ? "bg-orange-500 text-white shadow-md shadow-orange-500/20" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <ChefHat size={15} />
            <span>شجرة الريسبي والتكاليف</span>
          </button>

          <button
            onClick={() => setSubTab('purchases')}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer",
              subTab === 'purchases' ? "bg-orange-500 text-white shadow-md shadow-orange-500/20" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <Truck size={15} />
            <span>سندات التوريد والشراء ({recipeData.purchases.length})</span>
          </button>

          <button
            onClick={() => setSubTab('waste')}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer",
              subTab === 'waste' ? "bg-orange-500 text-white shadow-md shadow-orange-500/20" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <AlertOctagon size={15} />
            <span>سجل الهدر والتوالف ({recipeData.wastes.length})</span>
          </button>

          <button
            onClick={() => setSubTab('raw_audit')}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer",
              subTab === 'raw_audit' ? "bg-orange-500 text-white shadow-md shadow-orange-500/20" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <ClipboardCheck size={15} />
            <span>الجرد الفعلي وتسوية العجز</span>
          </button>

          <button
            onClick={() => setSubTab('raw_movements')}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer",
              subTab === 'raw_movements' ? "bg-orange-500 text-white shadow-md shadow-orange-500/20" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <History size={15} />
            <span>حركات المواد اللحظية ({recipeData.movements.length})</span>
          </button>

          <button
            onClick={() => setSubTab('stock')}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer",
              subTab === 'stock' ? "bg-orange-500 text-white shadow-md shadow-orange-500/20" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <Package size={15} />
            <span>الأصناف الجاهزة</span>
          </button>

          <button
            onClick={() => setSubTab('cashier_shifts')}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer",
              subTab === 'cashier_shifts' ? "bg-orange-500 text-white shadow-md shadow-orange-500/20" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <Wallet size={15} />
            <span>رقابة الكاشير والدرج</span>
          </button>
        </div>
      </div>

      {/* Enterprise Recipe & Raw Materials Tabs */}
      {subTab === 'raw_materials' && (
        <RawMaterialsTable
          restaurantId={restaurantId}
          materials={recipeData.materials}
          categories={recipeData.categories}
          onRefresh={loadData}
        />
      )}

      {subTab === 'recipes' && (
        <RecipeBuilderTab
          restaurantId={restaurantId}
          products={products}
          categories={categories}
          rawMaterials={recipeData.materials}
          recipes={recipeData.recipes}
          onRefresh={loadData}
        />
      )}

      {subTab === 'purchases' && (
        <PurchaseInvoicesTab
          restaurantId={restaurantId}
          purchases={recipeData.purchases}
          rawMaterials={recipeData.materials}
          onRefresh={loadData}
        />
      )}

      {subTab === 'waste' && (
        <WasteLogTab
          restaurantId={restaurantId}
          wastes={recipeData.wastes}
          rawMaterials={recipeData.materials}
          onRefresh={loadData}
        />
      )}

      {subTab === 'raw_audit' && (
        <StocktakeAuditTab
          restaurantId={restaurantId}
          materials={recipeData.materials}
          audits={recipeData.audits}
          onRefresh={loadData}
        />
      )}

      {subTab === 'raw_movements' && (
        <MovementsLogTab
          movements={recipeData.movements}
        />
      )}

      {/* KPI Cards for legacy finished products stock */}
      {(subTab === 'stock' || subTab === 'audit' || subTab === 'movements') && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-gray-400">إجمالي الأصناف بالمخزن</span>
              <p className="text-2xl font-black text-gray-900">{totalProductsCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <Boxes size={20} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-amber-600">أصناف قريبة من النفاذ</span>
              <p className="text-2xl font-black text-amber-600">{lowStockCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-red-600">أصناف نفذت بالكامل</span>
              <p className="text-2xl font-black text-red-600">{outOfStockCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
              <Minus size={20} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-emerald-600">القيمة التقديرية للمخزون</span>
              <p className="text-xl font-black text-emerald-600 font-mono">{formatCurrency(estimatedStockValue)}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign size={20} />
            </div>
          </div>
        </div>
      )}

      {/* Subtab 1: Stock Control Table */}
      {subTab === 'stock' && (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-4 sm:p-6 space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-72">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="بحث عن منتج في المخزن..."
                className="w-full pr-9 pl-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="bg-gray-50 border border-gray-200 text-xs font-bold px-3 py-2 rounded-xl outline-none"
              >
                <option value="all">كافة التصنيفات</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name_ar || c.name_en}</option>
                ))}
              </select>

              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setStockFilter('all')}
                  className={cn("px-3 py-1 rounded-lg transition-all", stockFilter === 'all' ? "bg-white shadow-sm text-gray-800" : "text-gray-500")}
                >
                  الكل
                </button>
                <button
                  onClick={() => setStockFilter('low')}
                  className={cn("px-3 py-1 rounded-lg transition-all", stockFilter === 'low' ? "bg-white shadow-sm text-amber-600 font-bold" : "text-gray-500")}
                >
                  منخفض ({lowStockCount})
                </button>
                <button
                  onClick={() => setStockFilter('out')}
                  className={cn("px-3 py-1 rounded-lg transition-all", stockFilter === 'out' ? "bg-white shadow-sm text-red-600 font-bold" : "text-gray-500")}
                >
                  نافذ ({outOfStockCount})
                </button>
              </div>

              <button
                onClick={loadData}
                className="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-600"
                title="تحديث البيانات"
              >
                <RefreshCw size={14} className={loading ? "animate-spin text-orange-500" : ""} />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-gray-50 text-gray-400 text-[11px] font-black uppercase tracking-wider border-b">
                  <th className="py-3 px-4">المنتج</th>
                  <th className="py-3 px-4">التصنيف</th>
                  <th className="py-3 px-4">السعر</th>
                  <th className="py-3 px-4 text-center">الرصيد الحالي</th>
                  <th className="py-3 px-4 text-center">حد التنبيه</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                  <th className="py-3 px-4 text-left">إجراءات المخزون</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs font-bold">
                {filteredProducts.map(prod => {
                  const current = inventory.stock[prod.id] ?? 25;
                  const minAlert = inventory.minAlerts[prod.id] ?? 5;
                  const isOut = current <= 0;
                  const isLow = current > 0 && current <= minAlert;
                  const cat = categories.find(c => c.id === prod.category_id);

                  return (
                    <tr key={prod.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {prod.image_url ? (
                            <img src={prod.image_url} alt="" className="w-9 h-9 rounded-xl object-cover border" />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400">
                              <Package size={16} />
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-gray-900">{prod.name_ar || prod.name_en}</p>
                            {prod.name_en && <p className="text-[10px] text-gray-400 font-normal">{prod.name_en}</p>}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-gray-500">
                        {cat?.name_ar || cat?.name_en || 'عام'}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-gray-800">
                        {formatCurrency(parseFloat(prod.price.toString()))}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className={cn(
                          "px-3 py-1 rounded-xl font-mono text-sm font-black inline-block",
                          isOut ? "bg-red-100 text-red-700 border border-red-200" :
                          isLow ? "bg-amber-100 text-amber-800 border border-amber-200" :
                          "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        )}>
                          {current} وحدة
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <input
                          type="number"
                          defaultValue={minAlert}
                          onBlur={async (e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val) && val >= 0) {
                              await updateProductStock(restaurantId, {
                                productId: prod.id,
                                productName: prod.name_ar || prod.name_en,
                                minAlert: val
                              });
                            }
                          }}
                          className="w-16 py-1 text-center bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono font-bold outline-none focus:border-orange-500"
                        />
                      </td>

                      <td className="py-3 px-4 text-center">
                        {isOut ? (
                          <span className="px-2.5 py-1 bg-red-50 text-red-600 rounded-full text-[10px] font-black">
                            نافذ
                          </span>
                        ) : isLow ? (
                          <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-black">
                            منخفض
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black">
                            متوفر
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-left">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenActionModal(prod, 'stock_in')}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[11px] font-bold border border-emerald-200 flex items-center gap-1 shadow-sm"
                            title="إضافة وارد جديد"
                          >
                            <Plus size={12} />
                            <span>وارد</span>
                          </button>

                          <button
                            onClick={() => handleOpenActionModal(prod, 'waste')}
                            className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-[11px] font-bold border border-red-200 flex items-center gap-1 shadow-sm"
                            title="تسجيل هالك / منصرف"
                          >
                            <Minus size={12} />
                            <span>هالك</span>
                          </button>

                          <button
                            onClick={() => handleOpenActionModal(prod, 'adjust')}
                            className="p-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-[11px] font-bold border border-gray-200"
                            title="تعديل الرصيد يدوياً"
                          >
                            <Edit3 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 2: Physical Audit & Discrepancies */}
      {subTab === 'audit' && (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-4 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b">
            <div>
              <h4 className="text-lg font-black text-gray-900">الجرد الدوري الفعلي للمخزن ومطابقة العجز</h4>
              <p className="text-xs text-gray-500 mt-0.5">
                قم بإدخال الكميات الفعلية المعدودة يدوياً وسيقوم النظام باحتساب الفارق (عجز / زيادة) وتحديث الدفاتر
              </p>
            </div>

            {!isAuditing ? (
              <button
                onClick={handleStartAudit}
                className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-orange-500/20"
              >
                <ClipboardCheck size={16} />
                <span>بدء جلسة جرد جديدة</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAuditing(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-xs"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleCommitAudit}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                >
                  <CheckCircle2 size={16} />
                  <span>اعتماد الجرد وحفظ التسوية</span>
                </button>
              </div>
            )}
          </div>

          {isAuditing && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold">
                  !
                </div>
                <div>
                  <p className="font-bold text-xs text-amber-900">أنت الآن في وضع الجرد الفعلي المباشر</p>
                  <p className="text-[11px] text-amber-700">قم بتعبئة عمود "الرصيد الفعلي المحصور" لكل صنف</p>
                </div>
              </div>
              <input
                type="text"
                value={auditNotes}
                onChange={e => setAuditNotes(e.target.value)}
                placeholder="ملاحظات الجرد (مثلاً: جرد نهاية الأسبوع)..."
                className="w-full sm:w-72 px-3 py-1.5 bg-white border border-amber-300 rounded-xl text-xs font-bold outline-none"
              />
            </div>
          )}

          {/* Audit Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-gray-50 text-gray-400 text-[11px] font-black uppercase tracking-wider border-b">
                  <th className="py-3 px-4">الصنف</th>
                  <th className="py-3 px-4 text-center">الرصيد الدفتري المسجل</th>
                  <th className="py-3 px-4 text-center">الرصيد الفعلي المعدود</th>
                  <th className="py-3 px-4 text-center">الفارق (عجز / زيادة)</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs font-bold">
                {products.map(prod => {
                  const bookStock = inventory.stock[prod.id] ?? 25;
                  const countedStock = isAuditing 
                    ? (auditCounts[prod.id] ?? bookStock)
                    : bookStock;
                  const diff = countedStock - bookStock;

                  return (
                    <tr key={prod.id} className="hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <span className="font-bold text-gray-900">{prod.name_ar || prod.name_en}</span>
                      </td>

                      <td className="py-3 px-4 text-center font-mono text-gray-600">
                        {bookStock} وحدة
                      </td>

                      <td className="py-3 px-4 text-center">
                        {isAuditing ? (
                          <input
                            type="number"
                            min="0"
                            value={auditCounts[prod.id] ?? ''}
                            onChange={e => {
                              const val = parseInt(e.target.value, 10);
                              setAuditCounts(prev => ({
                                ...prev,
                                [prod.id]: isNaN(val) ? 0 : val
                              }));
                            }}
                            className="w-24 py-1.5 text-center font-mono text-sm font-bold bg-white border-2 border-orange-400 rounded-xl outline-none"
                          />
                        ) : (
                          <span className="font-mono text-gray-500 font-bold">{bookStock} وحدة</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-bold">
                        {diff === 0 ? (
                          <span className="text-gray-400">0 (متطابق)</span>
                        ) : diff < 0 ? (
                          <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded-lg">
                            {diff} (عجز)
                          </span>
                        ) : (
                          <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">
                            +{diff} (زيادة)
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {diff === 0 ? (
                          <span className="text-emerald-600 flex items-center justify-center gap-1 text-[11px]">
                            <CheckCircle2 size={12} />
                            <span>مطابق</span>
                          </span>
                        ) : (
                          <span className="text-red-500 text-[11px] font-black">
                            يوجد فارق
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 3: Movements History */}
      {subTab === 'movements' && (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b">
            <div>
              <h4 className="font-black text-gray-900">سجل حركات المخزن والتوريدات والهالك</h4>
              <p className="text-xs text-gray-500">تتبع زمني لكافة عمليات البيع والتوريد والهالك المسجلة</p>
            </div>
            <span className="px-3 py-1 bg-gray-100 rounded-full text-xs font-bold text-gray-600">
              {inventory.movements.length} حركة مسجلة
            </span>
          </div>

          {inventory.movements.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <FileText size={36} className="mx-auto mb-2 text-gray-300" />
              <p className="font-bold text-sm">لا توجد حركات مخزن مسجلة حتى الآن</p>
              <p className="text-xs text-gray-400">ستظهر هنا تلقائياً عند بيع أصناف بالكاشير أو إضافة وارد أو هالك</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse min-w-[650px]">
                <thead>
                  <tr className="bg-gray-50 text-gray-400 text-[11px] font-black uppercase tracking-wider border-b">
                    <th className="py-3 px-4">الوقت والتاريخ</th>
                    <th className="py-3 px-4">الصنف</th>
                    <th className="py-3 px-4 text-center">نوع الحركة</th>
                    <th className="py-3 px-4 text-center">الكمية</th>
                    <th className="py-3 px-4 text-center">الرصيد (قبل / بعد)</th>
                    <th className="py-3 px-4">السبب والملاحظات</th>
                    <th className="py-3 px-4">المسؤول</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs font-bold">
                  {inventory.movements.map((mov) => {
                    const isIncrease = mov.type === 'stock_in' || (mov.newStock > mov.prevStock);
                    return (
                      <tr key={mov.id} className="hover:bg-gray-50">
                        <td className="py-3 px-4 text-gray-500 font-mono text-[11px]">
                          {new Date(mov.timestamp).toLocaleDateString('ar-EG')} - {new Date(mov.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-4 font-black text-gray-800">
                          {mov.productName}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-black",
                            mov.type === 'stock_in' ? "bg-emerald-100 text-emerald-800" :
                            mov.type === 'waste' ? "bg-red-100 text-red-800" :
                            mov.type === 'sale' ? "bg-blue-100 text-blue-800" :
                            mov.type === 'audit' ? "bg-purple-100 text-purple-800" :
                            "bg-gray-100 text-gray-800"
                          )}>
                            {mov.type === 'stock_in' ? 'توريد وارد' :
                             mov.type === 'waste' ? 'هالك / تالف' :
                             mov.type === 'sale' ? 'مبيعات' :
                             mov.type === 'audit' ? 'تسوية جرد' : 'تعديل يدوي'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold">
                          <span className={isIncrease ? "text-emerald-600" : "text-red-600"}>
                            {isIncrease ? `+${mov.quantity}` : `-${mov.quantity}`}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-gray-500 text-[11px]">
                          {mov.prevStock} ➔ {mov.newStock}
                        </td>
                        <td className="py-3 px-4 text-gray-600 max-w-xs truncate">
                          {mov.reason || '—'}
                        </td>
                        <td className="py-3 px-4 text-gray-400 font-normal text-[11px]">
                          {mov.performedBy}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Subtab 4: Cashier Shifts & Drawer Live Monitor */}
      {subTab === 'cashier_shifts' && (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-4 sm:p-6 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b">
            <div>
              <h4 className="font-black text-gray-900">مراقبة الوردية الحية والدرج النقدي للكاشير</h4>
              <p className="text-xs text-gray-500">متابعة دقيقة لمبيعات الكاشير النقدية، الإيداعات والمسحوبات، والعجز والزيادة بالدرج</p>
            </div>
            <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>متابعة حية مباشرة</span>
            </span>
          </div>

          {/* Drawer Audit Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
              <span className="text-xs text-gray-400 font-bold block mb-1">الوردية الحالية بالكاشير</span>
              <p className="text-base font-black text-gray-800">
                {inventory.shiftLogs && inventory.shiftLogs[0]?.cashierName 
                  ? `الكاشير: ${inventory.shiftLogs[0].cashierName}`
                  : 'كاشير الفرع الرئيسي'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                وقت الفتح: {inventory.shiftLogs && inventory.shiftLogs[0]?.openedAt
                  ? new Date(inventory.shiftLogs[0].openedAt).toLocaleTimeString('ar-EG')
                  : 'اليوم'}
              </p>
            </div>

            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
              <span className="text-xs text-gray-400 font-bold block mb-1">عهدة الدرج الافتتاحية</span>
              <p className="text-xl font-mono font-black text-blue-700">
                {formatCurrency(inventory.shiftLogs?.[0]?.startingCash || 500)}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">المبلغ المسلم للكاشير لبدء العمل</p>
            </div>

            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
              <span className="text-xs text-gray-400 font-bold block mb-1">إجمالي المبيعات بالوردية</span>
              <p className="text-xl font-mono font-black text-emerald-700">
                {formatCurrency(inventory.shiftLogs?.[0]?.totalSales || 0)}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                ({inventory.shiftLogs?.[0]?.ordersCount || 0}) طلبات مسجلة
              </p>
            </div>
          </div>

          {/* Shift History Records */}
          <div className="space-y-3">
            <h5 className="font-bold text-sm text-gray-800">سجل الورديات وإغلاقات الكاشير (تقارير Z التاريخية)</h5>
            {(!inventory.shiftLogs || inventory.shiftLogs.length === 0) ? (
              <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed">
                <Wallet size={32} className="mx-auto mb-2 text-gray-300" />
                <p className="font-bold text-xs">لا توجد إغلاقات ورديات سابقة مسجلة</p>
                <p className="text-[11px] text-gray-400">ستسجل هنا التقارير فور إغلاق الكاشير للوردية (Z-Report)</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse min-w-[650px]">
                  <thead>
                    <tr className="bg-gray-50 text-gray-400 text-[11px] font-black uppercase tracking-wider border-b">
                      <th className="py-3 px-4">تاريخ الوردية</th>
                      <th className="py-3 px-4">الكاشير</th>
                      <th className="py-3 px-4 text-center">العهدة</th>
                      <th className="py-3 px-4 text-center">مبيعات كاش</th>
                      <th className="py-3 px-4 text-center">مبيعات فيزا/محافظ</th>
                      <th className="py-3 px-4 text-center">الإجمالي</th>
                      <th className="py-3 px-4 text-center">الفارق والدرج</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs font-bold">
                    {inventory.shiftLogs.map((s: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="py-3 px-4 font-mono text-gray-600">
                          {new Date(s.openedAt || Date.now()).toLocaleDateString('ar-EG')}
                        </td>
                        <td className="py-3 px-4 font-bold text-gray-900">
                          {s.cashierName || 'كاشير'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          {formatCurrency(s.startingCash || 0)}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-emerald-600">
                          {formatCurrency(s.cashSales || 0)}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-blue-600">
                          {formatCurrency((s.cardSales || 0) + (s.walletSales || 0))}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-black text-gray-900">
                          {formatCurrency(s.totalSales || 0)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {s.difference !== undefined ? (
                            s.difference === 0 ? (
                              <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg text-[10px] font-black">
                                مطابق تماماً
                              </span>
                            ) : s.difference < 0 ? (
                              <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded-lg text-[10px] font-black">
                                عجز: {formatCurrency(Math.abs(s.difference))}
                              </span>
                            ) : (
                              <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg text-[10px] font-black">
                                زيادة: +{formatCurrency(s.difference)}
                              </span>
                            )
                          ) : (
                            <span className="text-gray-400 text-[10px]">الوردية جارية</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stock Action Modal (In / Waste / Adjust) */}
      {activeModal && targetProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-100 text-right space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b">
              <h4 className="font-black text-base text-gray-900">
                {activeModal === 'stock_in' ? 'تسجيل وارد جديد للمخزن' :
                 activeModal === 'waste' ? 'تسجيل هالك / تالف' : 'تعديل الرصيد يدوياً'}
              </h4>
              <button
                onClick={() => { setActiveModal(null); setTargetProduct(null); }}
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="bg-gray-50 p-3 rounded-2xl">
              <p className="text-xs font-bold text-gray-500 mb-1">المنتج المحدد:</p>
              <p className="text-sm font-black text-gray-900">{targetProduct.name_ar || targetProduct.name_en}</p>
              <p className="text-xs text-gray-600 font-mono mt-1">
                الرصيد الحالي بالمخزن: <span className="font-bold text-orange-600">{inventory.stock[targetProduct.id] ?? 25} وحدة</span>
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  {activeModal === 'adjust' ? 'الرصيد الجديد الصحيح (وحدة):' : 'الكمية (وحدة):'}
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantityInput}
                  onChange={e => setQuantityInput(e.target.value)}
                  placeholder="أدخل الكمية بالوحدات..."
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold font-mono outline-none focus:border-orange-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  السبب / اسم المورد / الملاحظات:
                </label>
                <input
                  type="text"
                  value={reasonInput}
                  onChange={e => setReasonInput(e.target.value)}
                  placeholder={
                    activeModal === 'stock_in' ? 'فاتورة توريد / اسم المورد...' :
                    activeModal === 'waste' ? 'سبب الهالك (انتهاء صلاحية، كسر، خطأ تحضير)...' :
                    'سبب التعديل اليدوي...'
                  }
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t">
              <button
                onClick={() => { setActiveModal(null); setTargetProduct(null); }}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-xs"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveStockAction}
                className={cn(
                  "flex-1 py-2.5 text-white rounded-xl font-bold text-xs shadow-md transition-all",
                  activeModal === 'stock_in' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20" :
                  activeModal === 'waste' ? "bg-red-600 hover:bg-red-700 shadow-red-600/20" :
                  "bg-orange-500 hover:bg-orange-600 shadow-orange-500/20"
                )}
              >
                حفظ التعديل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
