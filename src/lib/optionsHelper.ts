import { CategoryOption, CategoryOptionChoice } from './supabase';

export interface OptionPreset {
  id: string;
  title: string;
  icon: string;
  option: CategoryOption;
}

export const OPTION_PRESETS: OptionPreset[] = [
  {
    id: 'sugar',
    title: 'درجة السكر (قهوة / شاي / مشروبات)',
    icon: '☕',
    option: {
      id: 'sugar_level',
      name_ar: 'درجة السكر',
      name_en: 'Sugar Level',
      choices: [
        { id: 'none', name_ar: 'بدون سكر', name_en: 'No Sugar', price_delta: 0 },
        { id: 'low', name_ar: 'سكر خفيف', name_en: 'Low Sugar', price_delta: 0 },
        { id: 'medium', name_ar: 'مظبوط', name_en: 'Medium', price_delta: 0 },
        { id: 'high', name_ar: 'زيادة', name_en: 'Extra Sweet', price_delta: 0 }
      ]
    }
  },
  {
    id: 'sizes',
    title: 'الأحجام (سمول / ميديم / كبير)',
    icon: '🍕',
    option: {
      id: 'item_size',
      name_ar: 'الحجم',
      name_en: 'Size',
      choices: [
        { id: 'small', name_ar: 'صغير (Small)', name_en: 'Small', price_delta: 0 },
        { id: 'medium', name_ar: 'وسط (Medium)', name_en: 'Medium', price_delta: 0 },
        { id: 'large', name_ar: 'كبير (Large)', name_en: 'Large', price_delta: 0 }
      ]
    }
  },
  {
    id: 'spicy',
    title: 'درجة الحرارة / الطعم (عادي / سبايسي)',
    icon: '🍗',
    option: {
      id: 'spice_level',
      name_ar: 'درجة الطعم',
      name_en: 'Spiciness',
      choices: [
        { id: 'regular', name_ar: 'عادي (Regular)', name_en: 'Regular', price: 100, price_delta: 0 },
        { id: 'spicy', name_ar: 'سبايسي (Spicy)', name_en: 'Spicy', price: 120, price_delta: 20 }
      ]
    }
  },
  {
    id: 'cooking',
    title: 'درجة الطهي (نصف استواء / كامل)',
    icon: '🥩',
    option: {
      id: 'cooking_level',
      name_ar: 'درجة الطهي',
      name_en: 'Cooking Level',
      choices: [
        { id: 'medium', name_ar: 'نصف استواء (Medium)', name_en: 'Medium', price_delta: 0 },
        { id: 'well_done', name_ar: 'كامل الاستواء (Well Done)', name_en: 'Well Done', price_delta: 0 },
        { id: 'crispy', name_ar: 'مقرمش (Crispy)', name_en: 'Crispy', price_delta: 0 }
      ]
    }
  },
  {
    id: 'ice',
    title: 'كمية الثلج للمشروبات',
    icon: '🧊',
    option: {
      id: 'ice_level',
      name_ar: 'كمية الثلج',
      name_en: 'Ice Level',
      choices: [
        { id: 'no_ice', name_ar: 'بدون ثلج', name_en: 'No Ice', price_delta: 0 },
        { id: 'less_ice', name_ar: 'ثلج قليل', name_en: 'Less Ice', price_delta: 0 },
        { id: 'regular_ice', name_ar: 'ثلج عادي', name_en: 'Regular Ice', price_delta: 0 }
      ]
    }
  }
];

export function getSmartDefaultOptions(
  productNameAr = '',
  productNameEn = '',
  categoryNameAr = '',
  categoryNameEn = ''
): CategoryOption[] {
  const combined = `${productNameAr} ${productNameEn} ${categoryNameAr} ${categoryNameEn}`.toLowerCase();

  // 1. Drinks / Coffee / Tea / Juices / Mojitos / Soda
  if (
    combined.includes('قهوة') || combined.includes('شاي') || combined.includes('مشروب') ||
    combined.includes('عصير') || combined.includes('ساخن') || combined.includes('بارد') ||
    combined.includes('لاتيه') || combined.includes('كافيه') || combined.includes('اسبريسو') ||
    combined.includes('موكا') || combined.includes('كابتشينو') || combined.includes('سموذي') ||
    combined.includes('موهيتو') || combined.includes('ايس') || combined.includes('آيس') ||
    combined.includes('coffee') || combined.includes('drink') || combined.includes('tea') ||
    combined.includes('beverage') || combined.includes('juice') || combined.includes('hot') ||
    combined.includes('cold') || combined.includes('latte') || combined.includes('espresso') ||
    combined.includes('mocha') || combined.includes('cappuccino') || combined.includes('smoothie') ||
    combined.includes('mojito') || combined.includes('ice')
  ) {
    const isCold = combined.includes('بارد') || combined.includes('عصير') || combined.includes('سموذي') || 
                   combined.includes('موهيتو') || combined.includes('ايس') || combined.includes('آيس') || 
                   combined.includes('cold') || combined.includes('ice') || combined.includes('juice') || 
                   combined.includes('smoothie') || combined.includes('mojito');

    const opts: CategoryOption[] = [
      {
        id: 'sugar_level',
        name_ar: 'درجة السكر',
        name_en: 'Sugar Level',
        choices: [
          { id: 'none', name_ar: 'بدون سكر', name_en: 'No Sugar', price_delta: 0 },
          { id: 'low', name_ar: 'سكر خفيف', name_en: 'Low Sugar', price_delta: 0 },
          { id: 'medium', name_ar: 'مظبوط', name_en: 'Medium', price_delta: 0 },
          { id: 'high', name_ar: 'زيادة', name_en: 'Extra Sweet', price_delta: 0 }
        ]
      }
    ];

    if (isCold) {
      opts.push({
        id: 'ice_level',
        name_ar: 'كمية الثلج',
        name_en: 'Ice Level',
        choices: [
          { id: 'no_ice', name_ar: 'بدون ثلج', name_en: 'No Ice', price_delta: 0 },
          { id: 'less_ice', name_ar: 'ثلج قليل', name_en: 'Less Ice', price_delta: 0 },
          { id: 'regular_ice', name_ar: 'ثلج عادي', name_en: 'Regular Ice', price_delta: 0 }
        ]
      });
    }

    return opts;
  }

  // 2. Pizza / Burger / Crepe / Pasta / Meals / Sandwiches
  if (
    combined.includes('بيتزا') || combined.includes('برجر') || combined.includes('وجب') ||
    combined.includes('ساندوتش') || combined.includes('كريب') || combined.includes('مكرونة') ||
    combined.includes('باستا') || combined.includes('طاجن') || combined.includes('طبق') ||
    combined.includes('pizza') || combined.includes('burger') || combined.includes('meal') ||
    combined.includes('sandwich') || combined.includes('crepe') || combined.includes('pasta')
  ) {
    const isBurgerOrChicken = combined.includes('برجر') || combined.includes('دجاج') || combined.includes('فراخ') ||
                              combined.includes('تشيكن') || combined.includes('burger') || combined.includes('chicken');
    const opts: CategoryOption[] = [
      {
        id: 'item_size',
        name_ar: 'الحجم',
        name_en: 'Size',
        choices: [
          { id: 'small', name_ar: 'صغير', name_en: 'Small', price_delta: 0 },
          { id: 'medium', name_ar: 'وسط', name_en: 'Medium', price_delta: 0 },
          { id: 'large', name_ar: 'كبير', name_en: 'Large', price_delta: 0 }
        ]
      }
    ];

    if (isBurgerOrChicken) {
      opts.push({
        id: 'spice_level',
        name_ar: 'درجة الطعم',
        name_en: 'Flavor',
        choices: [
          { id: 'regular', name_ar: 'عادي (Regular)', name_en: 'Regular', price_delta: 0 },
          { id: 'spicy', name_ar: 'سبايسي (Spicy)', name_en: 'Spicy', price_delta: 0 }
        ]
      });
    }

    return opts;
  }

  // 3. Chicken / Fried / Crispy / Shawarma / Wings / Broast / Meat
  if (
    combined.includes('دجاج') || combined.includes('فراخ') || combined.includes('تشيكن') ||
    combined.includes('بروست') || combined.includes('شاورما') || combined.includes('أجنحة') ||
    combined.includes('اجنحة') || combined.includes('استربس') || combined.includes('لحم') ||
    combined.includes('chicken') || combined.includes('fried') || combined.includes('crispy') ||
    combined.includes('shawarma') || combined.includes('wings') || combined.includes('strips')
  ) {
    return [
      {
        id: 'spice_level',
        name_ar: 'درجة الطعم',
        name_en: 'Spiciness',
        choices: [
          { id: 'regular', name_ar: 'عادي (Regular)', name_en: 'Regular', price: 100, price_delta: 0 },
          { id: 'spicy', name_ar: 'سبايسي (Spicy)', name_en: 'Spicy', price: 120, price_delta: 20 }
        ]
      }
    ];
  }

  // 4. Desserts / Sweets / Ice Cream
  if (
    combined.includes('حلو') || combined.includes('حلى') || combined.includes('كيك') ||
    combined.includes('ايس كريم') || combined.includes('آيس كريم') || combined.includes('وافل') ||
    combined.includes('بان كيك') || combined.includes('تشيز كيك') || combined.includes('حلوى') ||
    combined.includes('dessert') || combined.includes('sweet') || combined.includes('cake') ||
    combined.includes('waffle') || combined.includes('pancake') || combined.includes('ice cream')
  ) {
    return [
      {
        id: 'sweet_topping',
        name_ar: 'الإضافة / الصوص',
        name_en: 'Topping / Sauce',
        choices: [
          { id: 'chocolate', name_ar: 'شوكولاتة (Chocolate)', name_en: 'Chocolate', price_delta: 0 },
          { id: 'caramel', name_ar: 'كراميل (Caramel)', name_en: 'Caramel', price_delta: 0 },
          { id: 'nutella', name_ar: 'نوتيلا (Nutella)', name_en: 'Nutella', price_delta: 0 },
          { id: 'plain', name_ar: 'بدون إضافات', name_en: 'Plain', price_delta: 0 }
        ]
      }
    ];
  }

  // Universal Default for all other items so customer always has choices
  return [
    {
      id: 'portion_size',
      name_ar: 'الحجم / الكمية',
      name_en: 'Portion',
      choices: [
        { id: 'standard', name_ar: 'حجم عادي (Standard)', name_en: 'Standard', price_delta: 0 },
        { id: 'large', name_ar: 'حجم كبير (Large)', name_en: 'Large', price_delta: 0 }
      ]
    }
  ];
}

export function getCategoryDefaultOptions(categoryNameAr: string, categoryNameEn: string): CategoryOption[] {
  return getSmartDefaultOptions('', '', categoryNameAr, categoryNameEn);
}

const LOCAL_STORAGE_KEY_PREFIX = 'qreta_category_options_';
const PRODUCT_LOCAL_STORAGE_PREFIX = 'qreta_product_options_';

export function getLocalCategoryOptions(categoryId: string, fallbackNameAr = '', fallbackNameEn = ''): CategoryOption[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${categoryId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (err) {
    console.warn('Error reading category options from local storage:', err);
  }

  if (fallbackNameAr || fallbackNameEn) {
    return getSmartDefaultOptions('', '', fallbackNameAr, fallbackNameEn);
  }

  return [];
}

export function getLocalProductOptions(productId: string): CategoryOption[] {
  try {
    const raw = localStorage.getItem(`${PRODUCT_LOCAL_STORAGE_PREFIX}${productId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (err) {
    console.warn('Error reading product options from local storage:', err);
  }
  return [];
}

export function cleanAndEnrichOptions(
  options: CategoryOption[],
  product?: { name_ar?: string; name_en?: string },
  category?: { name_ar?: string; name_en?: string }
): CategoryOption[] {
  if (!Array.isArray(options)) return [];

  const combined = `${product?.name_ar || ''} ${product?.name_en || ''} ${category?.name_ar || ''} ${category?.name_en || ''}`.toLowerCase();
  const isChicken = combined.includes('فراخ') || combined.includes('دجاج') || combined.includes('chicken') || combined.includes('fried') || combined.includes('فرايد');

  return options.map(opt => {
    // 1. Remove extra_spicy choice always
    let choices = (opt.choices || []).filter(c => c.id !== 'extra_spicy');

    // 2. If this is spice_level for chicken category/product, ensure regular is 100 and spicy is 120 if not explicitly priced
    if (isChicken && (opt.id.includes('spice') || opt.name_ar?.includes('طعم') || opt.name_ar?.includes('حرارة') || opt.name_en?.toLowerCase().includes('spice'))) {
      choices = choices.map(c => {
        if (c.id === 'regular') {
          return {
            ...c,
            price: (c.price !== undefined && c.price !== null && !isNaN(Number(c.price)) && Number(c.price) > 0) ? Number(c.price) : 100,
            price_delta: (c.price_delta !== undefined && c.price_delta !== null) ? Number(c.price_delta) : 0
          };
        }
        if (c.id === 'spicy') {
          return {
            ...c,
            price: (c.price !== undefined && c.price !== null && !isNaN(Number(c.price)) && Number(c.price) > 0) ? Number(c.price) : 120,
            price_delta: (c.price_delta !== undefined && c.price_delta !== null && Number(c.price_delta) > 0) ? Number(c.price_delta) : 20
          };
        }
        return c;
      });
    }

    return {
      ...opt,
      choices
    };
  }).filter(opt => opt.choices && opt.choices.length > 0);
}

export function resolveProductOptions(
  product: { id?: string; name_ar?: string; name_en?: string; category_id?: string; options?: any },
  category?: { id?: string; name_ar?: string; name_en?: string; options?: any },
  serverCategoryOptionsMap?: Record<string, CategoryOption[]>,
  serverProductOptionsMap?: Record<string, CategoryOption[]>
): CategoryOption[] {
  // Category options resolver helper
  let directCatOpts = category?.options;
  if (typeof directCatOpts === 'string') {
    try { directCatOpts = JSON.parse(directCatOpts); } catch (e) { directCatOpts = undefined; }
  }

  const catId = category?.id || product?.category_id;
  const serverCatOpts = (catId && serverCategoryOptionsMap && serverCategoryOptionsMap[catId]) ? serverCategoryOptionsMap[catId] : undefined;

  let localCatOpts: CategoryOption[] | undefined;
  if (catId) {
    try {
      const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${catId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) localCatOpts = parsed;
      }
    } catch (e) {
      // ignore
    }
  }

  const resolvedCategoryOptions = (Array.isArray(directCatOpts) && directCatOpts.length > 0)
    ? directCatOpts
    : ((Array.isArray(serverCatOpts) && serverCatOpts.length > 0)
      ? serverCatOpts
      : localCatOpts);

  // If category has explicit option configuration from admin, it takes authoritative precedence for items in that category
  if (resolvedCategoryOptions && resolvedCategoryOptions.length > 0) {
    return cleanAndEnrichOptions(resolvedCategoryOptions, product, category);
  }

  // 1. Direct product options if attached to product object
  let directProductOpts = product?.options;
  if (typeof directProductOpts === 'string') {
    try { directProductOpts = JSON.parse(directProductOpts); } catch (e) { directProductOpts = undefined; }
  }
  if (Array.isArray(directProductOpts) && directProductOpts.length > 0) {
    return cleanAndEnrichOptions(directProductOpts, product, category);
  }

  // 2. Server product-specific options (with explicit size pricing)
  if (product?.id && serverProductOptionsMap && serverProductOptionsMap[product.id] && Array.isArray(serverProductOptionsMap[product.id]) && serverProductOptionsMap[product.id].length > 0) {
    return cleanAndEnrichOptions(serverProductOptionsMap[product.id], product, category);
  }

  // 3. Local product-specific options
  if (product?.id) {
    const localProdOpts = getLocalProductOptions(product.id);
    if (localProdOpts && Array.isArray(localProdOpts) && localProdOpts.length > 0) {
      return cleanAndEnrichOptions(localProdOpts, product, category);
    }
  }

  // 4. Smart options from Product Name + Category Name
  const smartOpts = getSmartDefaultOptions(
    product?.name_ar || '',
    product?.name_en || '',
    category?.name_ar || '',
    category?.name_en || ''
  );
  return cleanAndEnrichOptions(smartOpts, product, category);
}

export function calculateProductEffectivePrice(
  product: { price: number; id?: string },
  selectedOptionsMap: Record<string, string> = {},
  optionsList: CategoryOption[] = []
): number {
  const basePrice = Number(product.price) || 0;
  let totalDelta = 0;
  let hasExplicitStandalonePrice = false;
  let standalonePrice = 0;

  optionsList.forEach((opt) => {
    const selectedChoiceId = selectedOptionsMap[opt.id] || (opt.choices[0]?.id);
    const choice = opt.choices.find(c => c.id === selectedChoiceId);
    if (choice) {
      const hasPrice = choice.price !== undefined && choice.price !== null && !isNaN(Number(choice.price)) && Number(choice.price) > 0;
      const hasDelta = choice.price_delta !== undefined && choice.price_delta !== null && !isNaN(Number(choice.price_delta));
      const numPrice = hasPrice ? Number(choice.price) : undefined;
      const numDelta = hasDelta ? Number(choice.price_delta) : undefined;

      if (hasPrice && numPrice !== undefined) {
        if (!hasExplicitStandalonePrice) {
          standalonePrice = numPrice;
          hasExplicitStandalonePrice = true;
        } else {
          totalDelta += (numDelta !== undefined && numDelta !== 0 ? numDelta : (numPrice - basePrice));
        }
      } else if (hasDelta && numDelta !== undefined) {
        totalDelta += numDelta;
      }
    }
  });

  if (hasExplicitStandalonePrice) {
    return Math.max(0, standalonePrice + totalDelta);
  }

  return Math.max(0, basePrice + totalDelta);
}

export function getProductPriceRange(
  product: { price: number; id?: string },
  optionsList: CategoryOption[] = []
): { minPrice: number; maxPrice: number; hasMultiplePrices: boolean } {
  const base = Number(product.price) || 0;
  const prices: number[] = [];

  if (base > 0) {
    prices.push(base);
  }

  optionsList.forEach(opt => {
    opt.choices.forEach(ch => {
      const hasPrice = ch.price !== undefined && ch.price !== null && !isNaN(Number(ch.price)) && Number(ch.price) > 0;
      const hasDelta = ch.price_delta !== undefined && ch.price_delta !== null && !isNaN(Number(ch.price_delta)) && Number(ch.price_delta) !== 0;

      if (hasPrice) {
        prices.push(Number(ch.price));
      } else if (hasDelta && base > 0) {
        prices.push(Math.max(0, base + Number(ch.price_delta)));
      }
    });
  });

  if (prices.length === 0) {
    prices.push(base);
  }

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const hasMultiplePrices = minPrice !== maxPrice && maxPrice > 0;

  return { minPrice, maxPrice, hasMultiplePrices };
}

export async function saveCategoryOptions(categoryId: string, options: CategoryOption[]) {
  try {
    // 1. Local Storage
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${categoryId}`, JSON.stringify(options));

    // 2. Server Sync
    fetch('/api/admin/save-category-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: categoryId, options })
    }).catch(e => console.warn('Server options sync background error:', e));
  } catch (err) {
    console.warn('Error saving category options:', err);
  }
}

export async function saveProductOptions(productId: string, options: CategoryOption[]) {
  try {
    // 1. Local Storage
    localStorage.setItem(`${PRODUCT_LOCAL_STORAGE_PREFIX}${productId}`, JSON.stringify(options));

    // 2. Server Sync
    fetch('/api/admin/save-product-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, options })
    }).catch(e => console.warn('Server product options sync background error:', e));
  } catch (err) {
    console.warn('Error saving product options:', err);
  }
}

export function removeLocalCategoryOptions(categoryId: string) {
  try {
    localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}${categoryId}`);
  } catch (err) {
    console.warn('Error removing category options from local storage:', err);
  }
}

export function removeLocalProductOptions(productId: string) {
  try {
    localStorage.removeItem(`${PRODUCT_LOCAL_STORAGE_PREFIX}${productId}`);
  } catch (err) {
    console.warn('Error removing product options from local storage:', err);
  }
}

export async function syncAllCategoryOptions(): Promise<Record<string, CategoryOption[]>> {
  try {
    const res = await fetch('/api/category-options');
    if (res.ok) {
      const data = await res.json();
      if (data.options) {
        Object.entries(data.options).forEach(([catId, opts]) => {
          localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${catId}`, JSON.stringify(opts));
        });
        return data.options;
      }
    }
  } catch (err) {
    console.warn('Sync all category options background error:', err);
  }
  return {};
}

export async function syncAllProductOptions(): Promise<Record<string, CategoryOption[]>> {
  try {
    const res = await fetch('/api/product-options');
    if (res.ok) {
      const data = await res.json();
      if (data.options) {
        Object.entries(data.options).forEach(([prodId, opts]) => {
          localStorage.setItem(`${PRODUCT_LOCAL_STORAGE_PREFIX}${prodId}`, JSON.stringify(opts));
        });
        return data.options;
      }
    }
  } catch (err) {
    console.warn('Sync all product options background error:', err);
  }
  return {};
}
