import React, { useState } from 'react';
import { 
  ChefHat, 
  Search, 
  Sparkles, 
  Edit3, 
  DollarSign, 
  Percent, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { Product, Category } from '../../../lib/supabase';
import { 
  RawMaterial, 
  ProductRecipe, 
  calculateRecipeCost 
} from '../../../lib/recipeService';
import { formatCurrency, toEnglishDigits } from '../../../lib/utils';
import { RecipeEditModal } from './RecipeEditModal';

interface RecipeBuilderTabProps {
  restaurantId: string;
  products: Product[];
  categories: Category[];
  rawMaterials: RawMaterial[];
  recipes: Record<string, ProductRecipe>;
  onRefresh: () => void;
}

export const RecipeBuilderTab: React.FC<RecipeBuilderTabProps> = ({
  restaurantId,
  products,
  categories,
  rawMaterials,
  recipes,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // KPIs
  const totalProducts = products.length;
  const productsWithRecipes = products.filter(p => recipes[p.id]?.ingredients?.length > 0);
  const productsWithoutRecipes = products.filter(p => !recipes[p.id] || recipes[p.id]?.ingredients?.length === 0);

  // Average food cost % across recipes
  const totalRecipeCalculations = productsWithRecipes.map(p => 
    calculateRecipeCost(recipes[p.id], rawMaterials, p.price)
  );
  const avgFoodCost = totalRecipeCalculations.length > 0
    ? (totalRecipeCalculations.reduce((acc, c) => acc + c.foodCostPercentage, 0) / totalRecipeCalculations.length).toFixed(1)
    : '0';

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchesSearch = 
      (p.name_ar && p.name_ar.toLowerCase().includes(search.toLowerCase())) ||
      (p.name_en && p.name_en.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory = selectedCategory === 'all' || p.category_id === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6 text-right">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
            <ChefHat size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 block">إجمالي أصناف المنيو</span>
            <span className="text-xl font-black text-gray-900">{toEnglishDigits(totalProducts)} صنف</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 block">أصناف تم ربط ريسبي لها</span>
            <span className="text-xl font-black text-emerald-600">
              {toEnglishDigits(productsWithRecipes.length)} صنف
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            <AlertCircle size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 block">أصناف بحاجة لريسبي</span>
            <span className="text-xl font-black text-amber-600">
              {toEnglishDigits(productsWithoutRecipes.length)} صنف
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <Percent size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 block">متوسط تكلفة الوجبات (Food Cost)</span>
            <span className="text-xl font-black text-blue-600">{toEnglishDigits(avgFoodCost)}%</span>
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
              placeholder="ابحث عن وجبة أو مشروب لتحديد وتعديل الريسبي..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 focus:bg-white rounded-2xl pr-10 pl-4 py-2.5 outline-none focus:ring-2 ring-orange-500 font-bold text-sm text-right"
            />
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
            جميع التصنيفات ({toEnglishDigits(products.length)})
          </button>
          {categories.map(cat => {
            const count = products.filter(p => p.category_id === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span>{cat.name_ar}</span>
                <span className="opacity-70 text-[10px] mr-1">({toEnglishDigits(count)})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recipes Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredProducts.map(prod => {
          const rec = recipes[prod.id];
          const hasRecipe = rec && rec.ingredients && rec.ingredients.length > 0;
          const calc = calculateRecipeCost(rec, rawMaterials, prod.price);
          const cat = categories.find(c => c.id === prod.category_id);

          return (
            <div
              key={prod.id}
              className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-5 flex flex-col justify-between"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    {prod.image_url ? (
                      <img 
                        src={prod.image_url} 
                        alt={prod.name_ar} 
                        className="w-12 h-12 rounded-2xl object-cover border border-gray-100" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center font-black">
                        <ChefHat size={22} />
                      </div>
                    )}
                    <div>
                      <h4 className="font-black text-gray-900 text-sm">{prod.name_ar}</h4>
                      <span className="text-[11px] text-gray-400 block">{cat?.name_ar || 'تصنيف عام'}</span>
                    </div>
                  </div>

                  <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-gray-100 text-gray-800">
                    {toEnglishDigits(formatCurrency(prod.price))}
                  </span>
                </div>

                {/* Recipe status / Ingredients Summary */}
                {hasRecipe ? (
                  <div className="bg-gray-50/80 rounded-2xl p-3 border border-gray-100 space-y-2.5 my-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 font-bold">تكلفة المواد الخام:</span>
                      <span className="font-black text-orange-600">
                        {toEnglishDigits(formatCurrency(calc.costOfIngredients))}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 font-bold">الربح الإجمالي للصنف:</span>
                      <span className="font-black text-emerald-600">
                        {toEnglishDigits(formatCurrency(calc.grossProfit))}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-200/60">
                      <span className="text-gray-500 font-bold">نسبة التكلفة (Food Cost):</span>
                      <span className={`font-black ${
                        calc.status === 'excellent' ? 'text-emerald-600' :
                        calc.status === 'normal' ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        {toEnglishDigits(calc.foodCostPercentage)}%
                      </span>
                    </div>

                    {/* Progress indicator */}
                    <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          calc.status === 'excellent' ? 'bg-emerald-500' :
                          calc.status === 'normal' ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(100, calc.foodCostPercentage)}%` }}
                      />
                    </div>

                    <div className="text-[10px] text-gray-400 font-medium">
                      يتكون من <strong>{toEnglishDigits(rec.ingredients.length)}</strong> مواد خام تُخصم آلياً
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-50/60 rounded-2xl p-3.5 border border-dashed border-amber-200 text-center my-3">
                    <p className="text-xs font-bold text-amber-800">لم يتم إعداد ريسبي لهذا الصنف بعد</p>
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      اضغط على زر التعديل بالأسفل لتحديد كميات الجرامات والمللي
                    </p>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={() => setEditingProduct(prod)}
                className={`w-full font-black py-2.5 px-4 rounded-2xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm ${
                  hasRecipe 
                    ? 'bg-gray-100 hover:bg-orange-500 hover:text-white text-gray-800'
                    : 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-600/20'
                }`}
              >
                <Edit3 size={16} />
                <span>{hasRecipe ? 'تعديل الريسبي والمكونات' : 'إعداد الريسبي والتكلفة'}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Recipe Edit Modal */}
      {editingProduct && (
        <RecipeEditModal
          restaurantId={restaurantId}
          product={editingProduct}
          currentRecipe={recipes[editingProduct.id]}
          rawMaterials={rawMaterials}
          onClose={() => setEditingProduct(null)}
          onSaved={() => {
            setEditingProduct(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
};
