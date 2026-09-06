// Enterprise Recipe & Food Cost Management Service (Bill of Materials)
// Designed for high-precision Cafe and Restaurant Inventory Control

export type RawMaterialUnit = 'g' | 'kg' | 'ml' | 'L' | 'pcs' | 'pack' | 'shot';

export type RawMaterialCategory = 
  | 'coffee' 
  | 'dairy' 
  | 'packaging' 
  | 'meat' 
  | 'bakery' 
  | 'sauces' 
  | 'beverage' 
  | 'general';

export interface RawMaterial {
  id: string;
  restaurant_id: string;
  name_ar: string;
  name_en: string;
  category: RawMaterialCategory;
  unit: RawMaterialUnit; // base storage unit: 'g', 'ml', 'pcs'
  current_stock: number; // in base units (grams, ml, pieces)
  min_alert_stock: number;
  cost_per_unit: number; // cost per 1 base unit (e.g. EGP per 1g, 1ml, 1 piece)
  supplier?: string;
  barcode?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RecipeIngredient {
  id: string;
  material_id: string;
  quantity: number; // in material's base unit
  notes?: string;
}

export interface ProductRecipe {
  product_id: string;
  restaurant_id: string;
  ingredients: RecipeIngredient[];
  updated_at?: string;
}

export interface PurchaseInvoiceItem {
  material_id: string;
  material_name: string;
  quantity: number;
  unit: RawMaterialUnit;
  unit_cost: number;
  total_cost: number;
}

export interface PurchaseInvoice {
  id: string;
  restaurant_id: string;
  invoice_number: string;
  supplier_name: string;
  date: string;
  items: PurchaseInvoiceItem[];
  total_amount: number;
  notes?: string;
  created_at: string;
}

export interface WasteRecord {
  id: string;
  restaurant_id: string;
  material_id: string;
  material_name: string;
  quantity: number;
  unit: RawMaterialUnit;
  cost: number;
  reason: string;
  performed_by: string;
  created_at: string;
}

export interface StocktakeItem {
  material_id: string;
  material_name: string;
  unit: RawMaterialUnit;
  system_stock: number;
  actual_stock: number;
  variance: number; // actual - system
  variance_cost: number; // variance * cost_per_unit
}

export interface StocktakeAudit {
  id: string;
  restaurant_id: string;
  audit_date: string;
  performed_by: string;
  items: StocktakeItem[];
  total_variance_cost: number;
  notes?: string;
}

export interface RawStockMovement {
  id: string;
  restaurant_id: string;
  material_id: string;
  material_name: string;
  type: 'sale_deduction' | 'purchase_in' | 'waste' | 'audit_adjustment' | 'manual_adjust';
  quantity: number; // positive or negative
  prev_stock: number;
  new_stock: number;
  unit: RawMaterialUnit;
  order_id?: string;
  reason: string;
  performed_by: string;
  timestamp: string;
}

export interface FullRecipeInventoryState {
  materials: RawMaterial[];
  recipes: Record<string, ProductRecipe>; // key: product_id
  purchases: PurchaseInvoice[];
  wastes: WasteRecord[];
  audits: StocktakeAudit[];
  movements: RawStockMovement[];
}

export interface RecipeCalculations {
  costOfIngredients: number;
  sellingPrice: number;
  grossProfit: number;
  foodCostPercentage: number;
  profitMarginPercentage: number;
  status: 'excellent' | 'normal' | 'high_cost';
}

// Default Seed Materials tailored for high-volume Cafes and Restaurants
export const DEFAULT_RAW_MATERIALS = (restaurantId: string): RawMaterial[] => [
  {
    id: 'mat_espresso_beans',
    restaurant_id: restaurantId,
    name_ar: 'بن إسبريسو كولومبي فاخر',
    name_en: 'Premium Espresso Beans',
    category: 'coffee',
    unit: 'g',
    current_stock: 10000, // 10 kg
    min_alert_stock: 2000, // 2 kg
    cost_per_unit: 0.75, // 0.75 EGP / g (750 EGP/kg)
    supplier: 'مطاحن البن الذهبي',
  },
  {
    id: 'mat_fresh_milk',
    restaurant_id: restaurantId,
    name_ar: 'حليب طازج كامل الدسم',
    name_en: 'Fresh Whole Milk',
    category: 'dairy',
    unit: 'ml',
    current_stock: 35000, // 35 L
    min_alert_stock: 8000, // 8 L
    cost_per_unit: 0.038, // 0.038 EGP / ml (38 EGP/L)
    supplier: 'مزارع دينا / جهينة',
  },
  {
    id: 'mat_cups_hot_9oz',
    restaurant_id: restaurantId,
    name_ar: 'أكواب ورقية 9 أونص دبل ساخن',
    name_en: 'Paper Cups 9oz Double Wall',
    category: 'packaging',
    unit: 'pcs',
    current_stock: 600,
    min_alert_stock: 150,
    cost_per_unit: 1.80,
    supplier: 'رويال باك لمستلزمات الكافيهات',
  },
  {
    id: 'mat_cups_cold_16oz',
    restaurant_id: restaurantId,
    name_ar: 'أكواب بلاستيك كريستال 16 أونص مثلج',
    name_en: 'Clear Crystal Cups 16oz',
    category: 'packaging',
    unit: 'pcs',
    current_stock: 500,
    min_alert_stock: 120,
    cost_per_unit: 2.30,
    supplier: 'رويال باك لمستلزمات الكافيهات',
  },
  {
    id: 'mat_cup_lids',
    restaurant_id: restaurantId,
    name_ar: 'أغطية أكواب سوداء محكمة',
    name_en: 'Cup Lids Black',
    category: 'packaging',
    unit: 'pcs',
    current_stock: 1100,
    min_alert_stock: 200,
    cost_per_unit: 0.60,
    supplier: 'رويال باك لمستلزمات الكافيهات',
  },
  {
    id: 'mat_syrup_vanilla',
    restaurant_id: restaurantId,
    name_ar: 'سيرب فانيليا مركز (Monin)',
    name_en: 'Vanilla Syrup (Monin)',
    category: 'sauces',
    unit: 'ml',
    current_stock: 4500,
    min_alert_stock: 1000,
    cost_per_unit: 0.28,
    supplier: 'شركة مونين مصر',
  },
  {
    id: 'mat_syrup_caramel',
    restaurant_id: restaurantId,
    name_ar: 'سيرب كراميل فرنسي (Monin)',
    name_en: 'Caramel Syrup (Monin)',
    category: 'sauces',
    unit: 'ml',
    current_stock: 4000,
    min_alert_stock: 1000,
    cost_per_unit: 0.28,
    supplier: 'شركة مونين مصر',
  },
  {
    id: 'mat_sauce_chocolate',
    restaurant_id: restaurantId,
    name_ar: 'صوص شيكولاتة بلجيكي داكنة',
    name_en: 'Dark Chocolate Belgian Sauce',
    category: 'sauces',
    unit: 'g',
    current_stock: 3500,
    min_alert_stock: 800,
    cost_per_unit: 0.18,
    supplier: 'كاليبو للشيكولاتة',
  },
  {
    id: 'mat_tea_english',
    restaurant_id: restaurantId,
    name_ar: 'شاي إنجليزي فاخر فتل',
    name_en: 'English Breakfast Tea Bags',
    category: 'beverage',
    unit: 'pcs',
    current_stock: 400,
    min_alert_stock: 80,
    cost_per_unit: 1.50,
    supplier: 'أحمد تي / تويننجز',
  },
  {
    id: 'mat_burger_buns',
    restaurant_id: restaurantId,
    name_ar: 'خبز بريوش بالزبدة طازج',
    name_en: 'Fresh Brioche Burger Buns',
    category: 'bakery',
    unit: 'pcs',
    current_stock: 150,
    min_alert_stock: 35,
    cost_per_unit: 6.50,
    supplier: 'مخبوزات ريتش بيك',
  },
  {
    id: 'mat_beef_patty',
    restaurant_id: restaurantId,
    name_ar: 'لحم برجر بلدي صافي 150 جرام',
    name_en: 'Beef Burger Patty 150g',
    category: 'meat',
    unit: 'pcs',
    current_stock: 120,
    min_alert_stock: 25,
    cost_per_unit: 48.00,
    supplier: 'جزارة المزرعة الطازجة',
  },
  {
    id: 'mat_cheddar_cheese',
    restaurant_id: restaurantId,
    name_ar: 'شرائح جبنة شيدر حمراء ذائبة',
    name_en: 'Cheddar Cheese Slices',
    category: 'dairy',
    unit: 'pcs',
    current_stock: 240,
    min_alert_stock: 50,
    cost_per_unit: 4.25,
    supplier: 'لافاش كيري / بريزيدن',
  },
  {
    id: 'mat_fries_potatoes',
    restaurant_id: restaurantId,
    name_ar: 'بطاطس فارم فريتس ممتازة',
    name_en: 'French Fries (Farm Frites)',
    category: 'general',
    unit: 'g',
    current_stock: 25000, // 25 kg
    min_alert_stock: 5000,
    cost_per_unit: 0.055, // 55 EGP/kg
    supplier: 'فارم فريتس',
  },
  {
    id: 'mat_burger_boxes',
    restaurant_id: restaurantId,
    name_ar: 'علب كرتون فاخرة لتقديم وسفري البرجر',
    name_en: 'Premium Burger Takeaway Boxes',
    category: 'packaging',
    unit: 'pcs',
    current_stock: 450,
    min_alert_stock: 100,
    cost_per_unit: 2.80,
    supplier: 'رويال باك لمستلزمات الكافيهات',
  }
];

// Calculation helper for single recipe food cost & margins
export function calculateRecipeCost(
  recipe: ProductRecipe | undefined,
  rawMaterials: RawMaterial[],
  sellingPrice: number
): RecipeCalculations {
  if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
    return {
      costOfIngredients: 0,
      sellingPrice: sellingPrice || 0,
      grossProfit: sellingPrice || 0,
      foodCostPercentage: 0,
      profitMarginPercentage: 100,
      status: 'excellent'
    };
  }

  const materialsMap = new Map<string, RawMaterial>();
  rawMaterials.forEach(m => materialsMap.set(m.id, m));

  let totalCost = 0;
  recipe.ingredients.forEach(ing => {
    const mat = materialsMap.get(ing.material_id);
    if (mat) {
      const lineCost = (ing.quantity || 0) * (mat.cost_per_unit || 0);
      totalCost += lineCost;
    }
  });

  const price = Math.max(0, sellingPrice || 0);
  const grossProfit = Math.max(0, price - totalCost);
  const foodCostPercentage = price > 0 ? Math.min(100, (totalCost / price) * 100) : 0;
  const profitMarginPercentage = price > 0 ? Math.max(0, (grossProfit / price) * 100) : 0;

  let status: 'excellent' | 'normal' | 'high_cost' = 'excellent';
  if (foodCostPercentage > 40) {
    status = 'high_cost';
  } else if (foodCostPercentage > 30) {
    status = 'normal';
  }

  return {
    costOfIngredients: Number(totalCost.toFixed(2)),
    sellingPrice: Number(price.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(2)),
    foodCostPercentage: Number(foodCostPercentage.toFixed(1)),
    profitMarginPercentage: Number(profitMarginPercentage.toFixed(1)),
    status
  };
}

// Convert units smoothly for display (e.g. 5200 g -> 5.20 كجم, 15000 ml -> 15.00 لتر)
export function formatMaterialQuantity(quantity: number, unit: RawMaterialUnit): { formatted: string; fullLabel: string } {
  const q = Number(quantity || 0);

  if (unit === 'g') {
    if (Math.abs(q) >= 1000) {
      const kg = (q / 1000).toFixed(2).replace(/\.?0+$/, '');
      return { formatted: `${kg} كجم`, fullLabel: `${kg} كيلوجرام (${q.toLocaleString('en-US')} جرام)` };
    }
    return { formatted: `${q.toLocaleString('en-US')} ج`, fullLabel: `${q.toLocaleString('en-US')} جرام` };
  }

  if (unit === 'ml') {
    if (Math.abs(q) >= 1000) {
      const l = (q / 1000).toFixed(2).replace(/\.?0+$/, '');
      return { formatted: `${l} لتر`, fullLabel: `${l} لتر (${q.toLocaleString('en-US')} مل)` };
    }
    return { formatted: `${q.toLocaleString('en-US')} مل`, fullLabel: `${q.toLocaleString('en-US')} ملليلتر` };
  }

  if (unit === 'pcs') {
    return { formatted: `${q.toLocaleString('en-US')} قطعة`, fullLabel: `${q.toLocaleString('en-US')} قطعة` };
  }

  if (unit === 'shot') {
    return { formatted: `${q.toLocaleString('en-US')} شوت`, fullLabel: `${q.toLocaleString('en-US')} شوت (جرعة)` };
  }

  if (unit === 'pack') {
    return { formatted: `${q.toLocaleString('en-US')} عبوة`, fullLabel: `${q.toLocaleString('en-US')} عبوة/باكت` };
  }

  return { formatted: `${q.toLocaleString('en-US')} ${unit}`, fullLabel: `${q.toLocaleString('en-US')} ${unit}` };
}

// Get Unit Name in Arabic
export function getUnitArabicName(unit: RawMaterialUnit): string {
  switch (unit) {
    case 'g': return 'جرام (g)';
    case 'kg': return 'كيلوجرام (kg)';
    case 'ml': return 'ملليلتر (ml)';
    case 'L': return 'لتر (L)';
    case 'pcs': return 'قطعة (pcs)';
    case 'pack': return 'عبوة / باكت';
    case 'shot': return 'شوت / جرعة';
    default: return unit;
  }
}

// Category labels
export const RAW_CATEGORY_LABELS: Record<RawMaterialCategory, { ar: string; icon: string }> = {
  coffee: { ar: 'بن وإسبريسو', icon: '☕' },
  dairy: { ar: 'ألبان وأجبان', icon: '🥛' },
  packaging: { ar: 'تعبئة وتغليف وأكواب', icon: '📦' },
  meat: { ar: 'لحوم ودواجن', icon: '🥩' },
  bakery: { ar: 'مخبوزات وخبز', icon: '🍞' },
  sauces: { ar: 'سيرب وصوصات', icon: '🍯' },
  beverage: { ar: 'مشروبات وشاي', icon: '🧃' },
  general: { ar: 'مواد عامة ومستلزمات', icon: '🛒' },
};

// Main Storage Key
const getLocalKey = (restaurantId: string) => `qrieta_recipes_inventory_${restaurantId}`;

// Fetch all recipe and raw materials data
export async function fetchRestaurantRecipesData(restaurantId: string): Promise<FullRecipeInventoryState> {
  const localKey = getLocalKey(restaurantId);
  let state: FullRecipeInventoryState = {
    materials: [],
    recipes: {},
    purchases: [],
    wastes: [],
    audits: [],
    movements: []
  };

  try {
    const raw = localStorage.getItem(localKey);
    if (raw) {
      state = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed reading local recipe storage:', e);
  }

  // Try server endpoint
  try {
    const res = await fetch(`/api/inventory/recipes-data?restaurant_id=${encodeURIComponent(restaurantId)}`);
    if (res.ok) {
      const serverData = await res.json();
      if (serverData.success) {
        state = {
          materials: serverData.materials && serverData.materials.length > 0 ? serverData.materials : state.materials,
          recipes: serverData.recipes && Object.keys(serverData.recipes).length > 0 ? serverData.recipes : state.recipes,
          purchases: serverData.purchases && serverData.purchases.length > 0 ? serverData.purchases : state.purchases,
          wastes: serverData.wastes && serverData.wastes.length > 0 ? serverData.wastes : state.wastes,
          audits: serverData.audits && serverData.audits.length > 0 ? serverData.audits : state.audits,
          movements: serverData.movements && serverData.movements.length > 0 ? serverData.movements : state.movements,
        };
      }
    }
  } catch (err) {
    // offline or server fallback
  }

  // Auto-seed if completely empty for this restaurant
  if (!state.materials || state.materials.length === 0) {
    state.materials = DEFAULT_RAW_MATERIALS(restaurantId);
  }

  // Persist locally
  try {
    localStorage.setItem(localKey, JSON.stringify(state));
  } catch (e) {}

  return state;
}

// Save or Update a Raw Material
export async function saveRawMaterial(restaurantId: string, material: RawMaterial): Promise<FullRecipeInventoryState> {
  const state = await fetchRestaurantRecipesData(restaurantId);
  const existingIndex = state.materials.findIndex(m => m.id === material.id);

  if (existingIndex >= 0) {
    const prev = state.materials[existingIndex];
    state.materials[existingIndex] = {
      ...material,
      updated_at: new Date().toISOString()
    };

    // If stock changed manually, record an adjustment movement
    if (prev.current_stock !== material.current_stock) {
      const delta = material.current_stock - prev.current_stock;
      state.movements.unshift({
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        restaurant_id: restaurantId,
        material_id: material.id,
        material_name: material.name_ar,
        type: 'manual_adjust',
        quantity: delta,
        prev_stock: prev.current_stock,
        new_stock: material.current_stock,
        unit: material.unit,
        reason: 'تعديل يدوي للرصيد من شاشة المواد الخام',
        performed_by: 'المدير المسؤول',
        timestamp: new Date().toISOString()
      });
    }
  } else {
    state.materials.push({
      ...material,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    state.movements.unshift({
      id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      restaurant_id: restaurantId,
      material_id: material.id,
      material_name: material.name_ar,
      type: 'manual_adjust',
      quantity: material.current_stock,
      prev_stock: 0,
      new_stock: material.current_stock,
      unit: material.unit,
      reason: 'إضافة مادة خام جديدة للسيستم',
      performed_by: 'المدير المسؤول',
      timestamp: new Date().toISOString()
    });
  }

  // Save local
  localStorage.setItem(getLocalKey(restaurantId), JSON.stringify(state));

  // Sync to server
  try {
    await fetch('/api/inventory/recipes-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurantId, data: state })
    });
  } catch (e) {}

  return state;
}

// Delete Raw Material
export async function deleteRawMaterial(restaurantId: string, materialId: string): Promise<FullRecipeInventoryState> {
  const state = await fetchRestaurantRecipesData(restaurantId);
  state.materials = state.materials.filter(m => m.id !== materialId);

  // Clean from recipes
  Object.values(state.recipes).forEach(rec => {
    rec.ingredients = rec.ingredients.filter(ing => ing.material_id !== materialId);
  });

  localStorage.setItem(getLocalKey(restaurantId), JSON.stringify(state));

  try {
    await fetch('/api/inventory/recipes-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurantId, data: state })
    });
  } catch (e) {}

  return state;
}

// Save Recipe for a Product
export async function saveProductRecipe(restaurantId: string, recipe: ProductRecipe): Promise<FullRecipeInventoryState> {
  const state = await fetchRestaurantRecipesData(restaurantId);
  state.recipes[recipe.product_id] = {
    ...recipe,
    updated_at: new Date().toISOString()
  };

  localStorage.setItem(getLocalKey(restaurantId), JSON.stringify(state));

  try {
    await fetch('/api/inventory/recipes-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurantId, data: state })
    });
  } catch (e) {}

  return state;
}

// Record Purchase Invoice (إضافة فاتورة توريد وزيادة أرصدة المواد الخام)
export async function recordPurchaseInvoice(
  restaurantId: string,
  invoiceData: {
    invoice_number: string;
    supplier_name: string;
    date: string;
    items: PurchaseInvoiceItem[];
    notes?: string;
  }
): Promise<FullRecipeInventoryState> {
  const state = await fetchRestaurantRecipesData(restaurantId);
  const invoiceId = `inv-${Date.now()}`;
  const totalAmount = invoiceData.items.reduce((acc, item) => acc + (item.total_cost || 0), 0);

  const newInvoice: PurchaseInvoice = {
    id: invoiceId,
    restaurant_id: restaurantId,
    invoice_number: invoiceData.invoice_number || `PO-${Date.now().toString().slice(-6)}`,
    supplier_name: invoiceData.supplier_name || 'مورد عام',
    date: invoiceData.date || new Date().toISOString().slice(0, 10),
    items: invoiceData.items,
    total_amount: totalAmount,
    notes: invoiceData.notes,
    created_at: new Date().toISOString()
  };

  state.purchases.unshift(newInvoice);

  // Replenish stock for each item & recalculate weighted average cost
  invoiceData.items.forEach(item => {
    const mat = state.materials.find(m => m.id === item.material_id);
    if (mat) {
      const prevStock = mat.current_stock;
      const addedQty = item.quantity;
      const nextStock = prevStock + addedQty;

      // Weighted average cost calculation
      if (nextStock > 0 && item.unit_cost > 0) {
        const totalOldValue = prevStock * mat.cost_per_unit;
        const totalNewValue = addedQty * item.unit_cost;
        const newCost = (totalOldValue + totalNewValue) / nextStock;
        mat.cost_per_unit = Number(newCost.toFixed(4));
      }

      mat.current_stock = nextStock;
      mat.updated_at = new Date().toISOString();

      state.movements.unshift({
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        restaurant_id: restaurantId,
        material_id: mat.id,
        material_name: mat.name_ar,
        type: 'purchase_in',
        quantity: addedQty,
        prev_stock: prevStock,
        new_stock: nextStock,
        unit: mat.unit,
        reason: `فاتورة توريد #${newInvoice.invoice_number} من ${newInvoice.supplier_name}`,
        performed_by: 'إدارة المشتريات والمخازن',
        timestamp: new Date().toISOString()
      });
    }
  });

  localStorage.setItem(getLocalKey(restaurantId), JSON.stringify(state));

  try {
    await fetch('/api/inventory/recipes-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurantId, data: state })
    });
  } catch (e) {}

  return state;
}

// Record Waste (تسجيل هدر أو تلف لمادة خام وخصمها)
export async function recordWaste(
  restaurantId: string,
  wasteData: {
    material_id: string;
    quantity: number;
    reason: string;
    performed_by: string;
  }
): Promise<FullRecipeInventoryState> {
  const state = await fetchRestaurantRecipesData(restaurantId);
  const mat = state.materials.find(m => m.id === wasteData.material_id);

  if (mat) {
    const prevStock = mat.current_stock;
    const wasteQty = wasteData.quantity;
    const nextStock = Math.max(0, prevStock - wasteQty);
    const wasteCost = Number((wasteQty * mat.cost_per_unit).toFixed(2));

    mat.current_stock = nextStock;
    mat.updated_at = new Date().toISOString();

    const record: WasteRecord = {
      id: `wst-${Date.now()}`,
      restaurant_id: restaurantId,
      material_id: mat.id,
      material_name: mat.name_ar,
      quantity: wasteQty,
      unit: mat.unit,
      cost: wasteCost,
      reason: wasteData.reason,
      performed_by: wasteData.performed_by || 'المسؤول',
      created_at: new Date().toISOString()
    };

    state.wastes.unshift(record);

    state.movements.unshift({
      id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      restaurant_id: restaurantId,
      material_id: mat.id,
      material_name: mat.name_ar,
      type: 'waste',
      quantity: -wasteQty,
      prev_stock: prevStock,
      new_stock: nextStock,
      unit: mat.unit,
      reason: `هدر وتوالف: ${wasteData.reason} (خسارة ${wasteCost} ج.م)`,
      performed_by: wasteData.performed_by || 'المسؤول',
      timestamp: new Date().toISOString()
    });
  }

  localStorage.setItem(getLocalKey(restaurantId), JSON.stringify(state));

  try {
    await fetch('/api/inventory/recipes-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurantId, data: state })
    });
  } catch (e) {}

  return state;
}

// Record Physical Stocktake Audit (الجرد الدوري وتسوية الفروقات والعجز)
export async function recordStocktakeAudit(
  restaurantId: string,
  auditData: {
    performed_by: string;
    items: StocktakeItem[];
    notes?: string;
  }
): Promise<FullRecipeInventoryState> {
  const state = await fetchRestaurantRecipesData(restaurantId);
  const auditId = `aud-${Date.now()}`;
  const totalVarianceCost = auditData.items.reduce((acc, item) => acc + (item.variance_cost || 0), 0);

  const newAudit: StocktakeAudit = {
    id: auditId,
    restaurant_id: restaurantId,
    audit_date: new Date().toISOString(),
    performed_by: auditData.performed_by,
    items: auditData.items,
    total_variance_cost: Number(totalVarianceCost.toFixed(2)),
    notes: auditData.notes
  };

  state.audits.unshift(newAudit);

  // Adjust stock levels to match physical counts
  auditData.items.forEach(item => {
    const mat = state.materials.find(m => m.id === item.material_id);
    if (mat && item.variance !== 0) {
      const prevStock = mat.current_stock;
      mat.current_stock = item.actual_stock;
      mat.updated_at = new Date().toISOString();

      const sign = item.variance > 0 ? 'زيادة' : 'عجز';
      state.movements.unshift({
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        restaurant_id: restaurantId,
        material_id: mat.id,
        material_name: mat.name_ar,
        type: 'audit_adjustment',
        quantity: item.variance,
        prev_stock: prevStock,
        new_stock: item.actual_stock,
        unit: mat.unit,
        reason: `تسوية جرد فعلي (${sign} ${Math.abs(item.variance)} ${mat.unit}) - أثر مالي: ${item.variance_cost.toFixed(2)} ج.م`,
        performed_by: auditData.performed_by,
        timestamp: new Date().toISOString()
      });
    }
  });

  localStorage.setItem(getLocalKey(restaurantId), JSON.stringify(state));

  try {
    await fetch('/api/inventory/recipes-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurantId, data: state })
    });
  } catch (e) {}

  return state;
}

// -------------------------------------------------------------
// CORE DEDUCTION ENGINE (محرك الخصم التلقائي بنسبة 100% عند البيع)
// Deducts raw materials according to product recipe for all orders
// -------------------------------------------------------------
export async function deductOrderRecipeStock(
  restaurantId: string,
  items: Array<{
    id?: string;
    menuItemId?: string;
    product_id?: string;
    name: string;
    quantity: number;
    options?: any[];
  }>,
  orderRef: string,
  cashierOrActor: string = 'كاشير'
): Promise<{ success: boolean; deductedIngredientsCount: number; warnings: string[] }> {
  if (!restaurantId || !items || items.length === 0) {
    return { success: true, deductedIngredientsCount: 0, warnings: [] };
  }

  const state = await fetchRestaurantRecipesData(restaurantId);
  const materialsMap = new Map<string, RawMaterial>();
  state.materials.forEach(m => materialsMap.set(m.id, m));

  let deductedCount = 0;
  const warnings: string[] = [];
  const now = new Date().toISOString();

  items.forEach(item => {
    const productId = item.id || item.menuItemId || item.product_id;
    const orderQty = Math.max(1, item.quantity || 1);

    if (!productId) return;

    const recipe = state.recipes[productId];
    if (recipe && recipe.ingredients && recipe.ingredients.length > 0) {
      recipe.ingredients.forEach(ing => {
        const mat = materialsMap.get(ing.material_id);
        if (mat) {
          const totalDeduct = (ing.quantity || 0) * orderQty;
          const prev = mat.current_stock;
          const next = Math.max(0, prev - totalDeduct);

          mat.current_stock = next;
          mat.updated_at = now;
          deductedCount++;

          // Check if low stock warning
          if (next <= mat.min_alert_stock && prev > mat.min_alert_stock) {
            warnings.push(`المادة الخام (${mat.name_ar}) اقتربت من النفاد! الرصيد المتبقي: ${next} ${mat.unit}`);
          }

          state.movements.unshift({
            id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            restaurant_id: restaurantId,
            material_id: mat.id,
            material_name: mat.name_ar,
            type: 'sale_deduction',
            quantity: -totalDeduct,
            prev_stock: prev,
            new_stock: next,
            unit: mat.unit,
            order_id: orderRef,
            reason: `خصم مبيعات تلقائي: ${item.name} x ${orderQty} (طلب #${orderRef})`,
            performed_by: cashierOrActor,
            timestamp: now
          });
        }
      });
    }
  });

  // Limit movements list to avoid unbounded growth
  if (state.movements.length > 1000) {
    state.movements = state.movements.slice(0, 1000);
  }

  // Persist locally
  localStorage.setItem(getLocalKey(restaurantId), JSON.stringify(state));

  // Sync to server
  try {
    await fetch('/api/inventory/recipes-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurantId, data: state })
    });
  } catch (e) {}

  return { success: true, deductedIngredientsCount: deductedCount, warnings };
}
