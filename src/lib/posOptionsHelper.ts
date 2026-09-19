import { Product, Category, CategoryOption } from './supabase';
import { getLocalProductOptions, getLocalCategoryOptions } from './optionsHelper';

export function getProductRecipeFromStorage(restaurantId: string, productId: string) {
  try {
    const raw = localStorage.getItem(`qrieta_recipes_inventory_${restaurantId}`);
    if (raw) {
      const state = JSON.parse(raw);
      if (state.recipes && state.recipes[productId]) {
        return state.recipes[productId];
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

export interface POSOptionChoice {
  id: string;
  name: string;
  name_en?: string;
  priceDelta: number;
  price?: number;
}

export interface POSOptionGroup {
  id: string;
  name: string;
  name_en?: string;
  type: 'single' | 'multi';
  choices: POSOptionChoice[];
}

/**
 * Resolves all customization option groups for a product in Cashier POS.
 * Handles:
 * 1. Product-specific options (CategoryOption[] or flat array)
 * 2. Category options (from DB or local storage)
 * 3. Recipe variants (e.g. سادة، زيادة، مظبوط)
 * 4. Smart beverage sugar level classifications (بدون سكر، سكر خفيف، مظبوط، سكر زيادة)
 */
export function getProductOptionGroups(
  product: Product | null | undefined,
  categories: Category[] = [],
  restaurantId: string = ''
): POSOptionGroup[] {
  if (!product) return [];

  const groups: POSOptionGroup[] = [];
  const seenGroupIds = new Set<string>();

  const prodName = (product.name_ar || product.name_en || (product as any).name || '').toLowerCase();
  const catObj = categories.find(c => String(c.id) === String(product.category_id));
  const catName = (catObj?.name_ar || catObj?.name_en || (catObj as any)?.name || '').toLowerCase();
  const combinedText = `${prodName} ${catName}`;

  // Helper to parse CategoryOption[]
  const parseCategoryOptions = (optionsList: any[]) => {
    if (!Array.isArray(optionsList)) return;

    optionsList.forEach((opt, idx) => {
      if (!opt) return;

      // Check if it's structured CategoryOption with .choices
      if (opt.choices && Array.isArray(opt.choices) && opt.choices.length > 0) {
        const groupId = String(opt.id || `opt_${idx}`);
        if (seenGroupIds.has(groupId)) return;
        seenGroupIds.add(groupId);

        const groupName = opt.name_ar || opt.name_en || 'الخيارات';
        const isSingleChoice = 
          groupId.includes('sugar') || 
          groupName.includes('سكر') || 
          groupId.includes('size') || 
          groupName.includes('حجم') || 
          groupId.includes('spice') || 
          groupName.includes('حرارة') || 
          groupName.includes('طعم') ||
          groupId.includes('cooking') ||
          groupName.includes('طهي') ||
          groupId.includes('ice') ||
          groupName.includes('ثلج') ||
          groupName.includes('نوع') ||
          groupName.includes('درجة');

        const validChoices = opt.choices.filter((ch: any) => ch.id !== 'extra_spicy');
        const choices: POSOptionChoice[] = validChoices.map((ch: any, cIdx: number) => {
          let delta = 0;
          const choicePrice = (ch.price !== undefined && ch.price !== null && !isNaN(Number(ch.price))) ? Number(ch.price) : undefined;
          const choiceDelta = (ch.price_delta !== undefined && ch.price_delta !== null && !isNaN(Number(ch.price_delta))) ? Number(ch.price_delta) : undefined;

          if (choiceDelta !== undefined && choiceDelta !== 0) {
            delta = choiceDelta;
          } else if (choicePrice !== undefined) {
            const base = Number(product.price) || 0;
            delta = choicePrice - base;
          } else if (choiceDelta !== undefined) {
            delta = choiceDelta;
          }

          return {
            id: String(ch.id || `choice_${cIdx}`),
            name: ch.name_ar || ch.name_en || ch.id || `خيار ${cIdx + 1}`,
            name_en: ch.name_en,
            priceDelta: delta,
            price: choicePrice
          };
        });

        groups.push({
          id: groupId,
          name: groupName,
          name_en: opt.name_en,
          type: isSingleChoice ? 'single' : 'multi',
          choices
        });
      } else if (opt.name) {
        // Flat legacy option { name, price }
        const legacyGroupId = 'legacy_addons';
        let legacyGroup = groups.find(g => g.id === legacyGroupId);
        if (!legacyGroup) {
          legacyGroup = {
            id: legacyGroupId,
            name: 'الإضافات والخيارات',
            type: 'multi',
            choices: []
          };
          groups.push(legacyGroup);
          seenGroupIds.add(legacyGroupId);
        }

        legacyGroup.choices.push({
          id: `opt_${idx}`,
          name: opt.name,
          priceDelta: Number(opt.price) || 0
        });
      }
    });
  };

  // 1. Check direct product options
  if (product.options && Array.isArray(product.options) && product.options.length > 0) {
    parseCategoryOptions(product.options);
  }

  // 2. Check local product options storage
  if (product.id) {
    const localProdOpts = getLocalProductOptions(product.id);
    if (localProdOpts && localProdOpts.length > 0) {
      parseCategoryOptions(localProdOpts);
    }
  }

  // 3. Check direct category options
  if (catObj?.options && Array.isArray(catObj.options) && catObj.options.length > 0) {
    parseCategoryOptions(catObj.options);
  }

  // 4. Check local category options storage
  if (catObj?.id) {
    const localCatOpts = getLocalCategoryOptions(catObj.id);
    if (localCatOpts && localCatOpts.length > 0) {
      parseCategoryOptions(localCatOpts);
    }
  }

  // 5. Check recipe variants (e.g. سادة، زيادة، مظبوط)
  if (restaurantId && product.id) {
    const recipe = getProductRecipeFromStorage(restaurantId, product.id);
    if (recipe && recipe.variants && Array.isArray(recipe.variants) && recipe.variants.length > 0) {
      const hasVariantGroup = groups.some(g => g.id.includes('variant') || g.id.includes('sugar') || g.name.includes('سكر') || g.name.includes('حالة'));
      if (!hasVariantGroup) {
        groups.push({
          id: 'recipe_variants',
          name: 'حالة الصنف / الريسبي',
          type: 'single',
          choices: recipe.variants.map((v, vIdx) => ({
            id: v.id || `var_${vIdx}`,
            name: v.name,
            priceDelta: Number(v.price || 0)
          }))
        });
        seenGroupIds.add('recipe_variants');
      }
    }
  }

  // 6. Smart sugar classification for drinks / coffee / teas / juices
  const isDrink = /قهو|شاي|كافيه|لاتيه|اسبريسو|موكا|كابتشينو|عصير|مشروب|ساخن|بارد|كركديه|سحلب|نعناع|يانسون|موهيتو|سموذي|ببسي|كولا|صودا|coffee|tea|drink|latte|espresso|cappuccino|juice|smoothie|mojito/i.test(combinedText);
  const hasSugarGroup = groups.some(g => g.id.includes('sugar') || g.name.includes('سكر') || g.id === 'recipe_variants');

  if (isDrink && !hasSugarGroup) {
    groups.unshift({
      id: 'sugar_level',
      name: 'درجة السكر',
      name_en: 'Sugar Level',
      type: 'single',
      choices: [
        { id: 'none', name: 'بدون سكر (سادة)', name_en: 'No Sugar', priceDelta: 0 },
        { id: 'low', name: 'سكر خفيف', name_en: 'Low Sugar', priceDelta: 0 },
        { id: 'medium', name: 'مظبوط', name_en: 'Medium', priceDelta: 0 },
        { id: 'high', name: 'سكر زيادة', name_en: 'Extra Sweet', priceDelta: 0 }
      ]
    });
    seenGroupIds.add('sugar_level');
  }

  return groups;
}
