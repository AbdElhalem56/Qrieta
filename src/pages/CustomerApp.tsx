import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase, Restaurant, Table, Category, Product, CategoryOption } from '../lib/supabase';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  ShoppingBag, 
  Plus, 
  Minus, 
  X, 
  CheckCircle2, 
  ChevronRight, 
  Globe,
  UtensilsCrossed,
  LayoutDashboard,
  CheckCircle,
  Bell,
  SlidersHorizontal,
  MapPin,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Bike,
  Phone,
  User,
  Navigation
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { getLocalCategoryOptions, syncAllCategoryOptions, resolveProductOptions, calculateProductEffectivePrice, getProductPriceRange } from '../lib/optionsHelper';
import { calculateDistanceMeters, getCurrentPosition, fetchAllServerGeofences } from '../lib/geoHelper';
import { initMetaPixel, trackViewContent, trackAddToCart, trackPurchase, trackCallWaiter } from '../lib/analytics';

type CartItem = {
  product: Product;
  quantity: number;
  notes: string;
  sugar: 'none' | 'low' | 'medium' | 'high';
  selectedOptions?: Record<string, string>; // { [optionId: string]: choiceId }
  selectedOptionLabels?: { optionName: string; choiceName: string }[];
};

export default function CustomerApp() {
  const { restaurantSlug, tableId } = useParams();
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [serverOptions, setServerOptions] = useState<Record<string, CategoryOption[]>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [geoState, setGeoState] = useState<{
    status: 'idle' | 'checking' | 'inside' | 'outside' | 'denied' | 'error';
    distance?: number;
    userLat?: number;
    userLng?: number;
    errorMessage?: string;
  }>({ status: 'idle' });

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [customization, setCustomization] = useState<{
    sugar: 'none' | 'low' | 'medium' | 'high';
    selectedOptions: Record<string, string>;
    notes: string;
  }>({ sugar: 'none', selectedOptions: {}, notes: '' });
  const [deliveryInfo, setDeliveryInfo] = useState<{
    customerName: string;
    phone: string;
    address: string;
    notes: string;
  }>({ customerName: '', phone: '', address: '', notes: '' });
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<number | null>(null);
  const [waiterCalled, setWaiterCalled] = useState(false);
  const [isCallingWaiter, setIsCallingWaiter] = useState(false);

  // Delivery order is active when no specific tableId is present in URL
  const isDeliveryOrder = !tableId;

  useEffect(() => {
    fetchData();
    document.dir = isRTL ? 'rtl' : 'ltr';
  }, [restaurantSlug, isRTL]);

  const fetchData = async () => {
    // Resolve slug from param or from subdomain (e.g. burger.qrieta.com)
    let effectiveSlug = restaurantSlug;
    if (!effectiveSlug && typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname.includes('qrieta.com') && !hostname.startsWith('www.') && hostname !== 'qrieta.com') {
        effectiveSlug = hostname.split('.')[0];
      }
    }

    if (!effectiveSlug) return;

    // 1. First fetch server-synced category options
    let syncedOpts: Record<string, CategoryOption[]> = {};
    try {
      syncedOpts = await syncAllCategoryOptions();
      setServerOptions(syncedOpts);
    } catch (e) {
      console.warn('Options sync error:', e);
    }

    const { data: res } = await supabase
      .from('restaurants')
      .select('*')
      .eq('slug', effectiveSlug)
      .single();

    if (res) {
      // Initialize Meta Pixel if configured for this restaurant
      if (res.fb_pixel_id) {
        initMetaPixel(res.fb_pixel_id);
      }

      // Merge server geofences if present
      try {
        const geofences = await fetchAllServerGeofences();
        if (geofences[res.id]) {
          res.geofence_enabled = geofences[res.id].geofence_enabled ?? res.geofence_enabled;
          res.latitude = geofences[res.id].latitude ?? res.latitude;
          res.longitude = geofences[res.id].longitude ?? res.longitude;
          res.geofence_radius_meters = geofences[res.id].geofence_radius_meters ?? res.geofence_radius_meters;
          res.service_fee_percentage = geofences[res.id].service_fee_percentage !== undefined 
            ? geofences[res.id].service_fee_percentage 
            : (res.service_fee_percentage !== undefined ? res.service_fee_percentage : 0);
        }
      } catch (e) {
        console.warn('Geofence sync error:', e);
      }

      setRestaurant(res);

      // If table QR ordering is active and restaurant has geofence enabled, check location
      if (tableId && res.geofence_enabled && res.latitude && res.longitude) {
        checkGeofence(res);
      }
      
      const queries: any[] = [
        supabase.from('categories').select('*').eq('restaurant_id', res.id).order('sort_order'),
        supabase.from('products').select('*').eq('restaurant_id', res.id)
      ];

      // Fetch table info if tableId exists
      if (tableId) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(tableId)) {
          queries.push(supabase.from('tables').select('*').eq('id', tableId).maybeSingle());
        } else {
          // If tableId in URL is table number (e.g., '1', '5', 'T-12')
          queries.push(supabase.from('tables').select('*').eq('restaurant_id', res.id).eq('table_number', tableId).maybeSingle());
        }
      }

      const results = await Promise.all(queries);
      const rawCategories = results[0].data || [];
      const formattedCategories = rawCategories.map((cat: any) => ({
        ...cat,
        options: cat.options && cat.options.length > 0 
          ? cat.options 
          : (syncedOpts[cat.id] || getLocalCategoryOptions(cat.id, cat.name_ar, cat.name_en))
      }));

      setCategories(formattedCategories);
      setProducts(results[1].data || []);
      if (results[2]?.data) setTable(results[2].data);
    }
    setLoading(false);
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name_en.toLowerCase().includes(search.toLowerCase()) || 
                           p.name_ar.includes(search);
      
      // If searching, ignore category filter (Global Search)
      if (search.trim() !== '') return matchesSearch;

      const matchesCategory = (activeCategory === 'all' || !activeCategory) ? true : p.category_id === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, activeCategory]);

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'ar' : 'en';
    i18n.changeLanguage(newLang);
    localStorage.setItem('i18nextLng', newLang);
  };

  // Helper to open product modal with default options pre-selected
  const handleOpenProduct = (product: Product) => {
    const cat = categories.find(c => String(c.id) === String(product.category_id));
    const catOpts: CategoryOption[] = resolveProductOptions(product, cat, serverOptions);

    const initialSelections: Record<string, string> = {};
    catOpts.forEach(opt => {
      if (opt.choices && opt.choices.length > 0) {
        initialSelections[opt.id] = opt.choices[0].id;
      }
    });

    setSelectedProduct(product);
    setCustomization({
      sugar: 'none',
      selectedOptions: initialSelections,
      notes: ''
    });

    // Track Meta Pixel ViewContent event
    trackViewContent({
      id: product.id,
      name_ar: product.name_ar,
      name_en: product.name_en,
      price: product.price,
      category: cat?.name_ar || cat?.name_en
    });
  };

  const addToCart = (
    product: Product, 
    custom: { 
      sugar: 'none' | 'low' | 'medium' | 'high'; 
      selectedOptions?: Record<string, string>; 
      notes: string 
    } = { sugar: 'none', selectedOptions: {}, notes: '' }
  ) => {
    // Build human-readable option labels
    const cat = categories.find(c => String(c.id) === String(product.category_id));
    const catOpts: CategoryOption[] = resolveProductOptions(product, cat, serverOptions);
    
    // Calculate dynamic effective price according to selected size/options
    const effectivePrice = calculateProductEffectivePrice(product, custom.selectedOptions, catOpts);
    const productWithEffectivePrice: Product = {
      ...product,
      price: effectivePrice
    };

    // Track Meta Pixel AddToCart event
    trackAddToCart({
      id: product.id,
      name: isRTL ? product.name_ar : (product.name_en || product.name_ar),
      price: effectivePrice,
      quantity: 1
    });

    const labels: { optionName: string; choiceName: string }[] = [];
    if (custom.selectedOptions) {
      Object.entries(custom.selectedOptions).forEach(([optId, choiceId]) => {
        const opt = catOpts.find(o => o.id === optId);
        const choice = opt?.choices.find(ch => ch.id === choiceId);
        if (opt && choice) {
          labels.push({
            optionName: isRTL ? opt.name_ar : (opt.name_en || opt.name_ar),
            choiceName: isRTL ? choice.name_ar : (choice.name_en || choice.name_ar)
          });
        }
      });
    }

    const customKey = JSON.stringify(custom.selectedOptions || {});

    setCart(prev => {
      // Find item with same product AND same customizations AND same effective price
      const existingIdx = prev.findIndex(item => 
        item.product.id === product.id && 
        item.product.price === effectivePrice &&
        item.sugar === custom.sugar && 
        item.notes === custom.notes &&
        JSON.stringify(item.selectedOptions || {}) === customKey
      );
      
      if (existingIdx > -1) {
        const newItems = [...prev];
        newItems[existingIdx] = { 
          ...newItems[existingIdx], 
          quantity: newItems[existingIdx].quantity + 1 
        };
        return newItems;
      }
      return [...prev, { 
        product: productWithEffectivePrice, 
        quantity: 1, 
        notes: custom.notes, 
        sugar: custom.sugar,
        selectedOptions: custom.selectedOptions,
        selectedOptionLabels: labels
      }];
    });
    setSelectedProduct(null);
    setCustomization({ sugar: 'none', selectedOptions: {}, notes: '' });
  };

  const updateQuantity = (e: React.MouseEvent, index: number, delta: number) => {
    e.stopPropagation();
    setCart(prev => {
      const newItems = [...prev];
      if (!newItems[index]) return prev;
      const newQty = Math.max(0, newItems[index].quantity + delta);
      if (newQty === 0) return prev.filter((_, i) => i !== index);
      newItems[index] = { ...newItems[index], quantity: newQty };
      return newItems;
    });
  };

  const subtotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  // Service fee is strictly for dine-in / table orders. For delivery orders, service fee is completely removed (0%)
  const serviceFeePercentage = isDeliveryOrder ? 0 : Number(restaurant?.service_fee_percentage || 0);
  const serviceFeeAmount = subtotal * (serviceFeePercentage / 100);
  const total = subtotal + serviceFeeAmount;
  const currency = (amount: number) => formatCurrency(amount, isRTL ? 'ar-EG' : 'en-US');

  const checkGeofence = async (targetRes?: Restaurant): Promise<boolean> => {
    const activeRes = targetRes || restaurant;
    if (!activeRes || !activeRes.geofence_enabled || !activeRes.latitude || !activeRes.longitude) {
      return true; // No geofence restriction active
    }

    setGeoState(prev => ({ ...prev, status: 'checking' }));
    try {
      const pos = await getCurrentPosition();
      const dist = calculateDistanceMeters(
        pos.latitude,
        pos.longitude,
        activeRes.latitude,
        activeRes.longitude
      );
      const allowedRadius = activeRes.geofence_radius_meters || 100;

      if (dist <= allowedRadius) {
        setGeoState({
          status: 'inside',
          distance: dist,
          userLat: pos.latitude,
          userLng: pos.longitude
        });
        return true;
      } else {
        setGeoState({
          status: 'outside',
          distance: dist,
          userLat: pos.latitude,
          userLng: pos.longitude
        });
        return false;
      }
    } catch (err: any) {
      setGeoState({
        status: 'denied',
        errorMessage: err.message || 'تعذر تحديد الموقع الجغرافي'
      });
      return false;
    }
  };

  const placeOrder = async () => {
    if (!restaurant || cart.length === 0) return;

    if (isDeliveryOrder) {
      if (!deliveryInfo.customerName.trim()) {
        alert(isRTL ? '⚠️ يرجى كتابة اسم المستلم لإتمام طلب التوصيل.' : 'Please enter customer name for delivery.');
        return;
      }
      if (!deliveryInfo.phone.trim() || deliveryInfo.phone.trim().length < 6) {
        alert(isRTL ? '⚠️ يرجى كتابة رقم هاتف صحيح للتواصل وتأكيد التوصيل.' : 'Please enter a valid phone number for delivery.');
        return;
      }
      if (!deliveryInfo.address.trim()) {
        alert(isRTL ? '⚠️ يرجى كتابة عنوان التوصيل بالتفصيل (الشارع، العمارة، رقم الشقة).' : 'Please enter detailed delivery address.');
        return;
      }
    } else {
      // Check geofence if table ordering is active and restaurant has geofence enabled
      if (tableId && restaurant.geofence_enabled && restaurant.latitude && restaurant.longitude) {
        const isAllowed = await checkGeofence();
        if (!isAllowed) {
          if (geoState.status === 'outside') {
            alert(`⚠️ لا يمكن إتمام الطلب: أنت خارج النطاق الجغرافي للمطعم (${geoState.distance} متر، والحد الأقصى المسموح ${restaurant.geofence_radius_meters || 100} متر). الطلب عبر كود الطاولة متاح فقط داخل المطعم.`);
          } else {
            alert('⚠️ يلزم تفعيل إذن الموقع الجغرافي للتحقق من تواجدك داخل صالة المطعم قبل إرسال طلب الطاولة.');
          }
          return;
        }
      }
    }

    setLoading(true);

    try {
      // Validate tableId format: Supabase expects uuid. 
      // If tableId is not a valid UUID format or delivery order, we set it to null
      let validTableId = null;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!isDeliveryOrder && tableId && uuidRegex.test(tableId)) {
        validTableId = tableId;
      }
      
      const orderPayload = {
        restaurant_id: restaurant.id,
        table_id: validTableId,
        total_price: parseFloat(total.toFixed(2)),
        status: 'new'
      };

      console.log('Inserting order header:', orderPayload);

      // Only select 'id' to minimize RLS requirements on the response
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select('id')
        .single();

      if (orderErr) {
        console.error('Order insertion failed:', orderErr);
        throw new Error(orderErr.message);
      }

      if (order) {
        const deliveryHeader = isDeliveryOrder
          ? `[🛵 دليفري | الاسم: ${deliveryInfo.customerName.trim()} | هاتف: ${deliveryInfo.phone.trim()} | العنوان: ${deliveryInfo.address.trim()}${deliveryInfo.notes.trim() ? ` | ملاحظات: ${deliveryInfo.notes.trim()}` : ''}]`
          : '';

        const orderItemsList = cart.map((item, itemIdx) => {
          // Compile chosen options into notes string if any
          let compiledNotes = item.notes ? item.notes.trim() : '';
          if (item.selectedOptionLabels && item.selectedOptionLabels.length > 0) {
            const optionsSummary = item.selectedOptionLabels.map(l => `${l.optionName}: ${l.choiceName}`).join(' | ');
            compiledNotes = compiledNotes ? `[${optionsSummary}] - ${compiledNotes}` : `[${optionsSummary}]`;
          }

          if (deliveryHeader && itemIdx === 0) {
            compiledNotes = compiledNotes ? `${deliveryHeader} - ${compiledNotes}` : deliveryHeader;
          }

          // Check if any option is sugar-related
          let derivedSugar = item.sugar;
          if (derivedSugar === 'none' && item.selectedOptionLabels) {
            const sugarOpt = item.selectedOptionLabels.find(l => 
              l.optionName.includes('سكر') || l.optionName.toLowerCase().includes('sugar')
            );
            if (sugarOpt) {
              const ch = sugarOpt.choiceName.toLowerCase();
              if (ch.includes('خفيف') || ch.includes('low')) derivedSugar = 'low';
              else if (ch.includes('وسط') || ch.includes('مظبوط') || ch.includes('medium')) derivedSugar = 'medium';
              else if (ch.includes('زيادة') || ch.includes('extra') || ch.includes('high')) derivedSugar = 'high';
            }
          }

          return {
            order_id: order.id,
            product_id: item.product.id,
            quantity: item.quantity,
            notes: compiledNotes || null,
            sugar_level: derivedSugar === 'none' ? 'none' : 
                         (derivedSugar === 'low' ? 'low' : 
                          (derivedSugar === 'medium' ? 'medium' : 
                           (derivedSugar === 'high' ? 'high' : 'none'))),
            price_at_order: parseFloat(item.product.price.toString())
          };
        });

        console.log('Inserting order line items:', orderItemsList);

        const { error: itemsErr } = await supabase
          .from('order_items')
          .insert(orderItemsList);

        if (itemsErr) {
          console.error('Order items insertion failed:', itemsErr);
          throw new Error(itemsErr.message);
        }

        setCart([]);
        setIsCartOpen(false);
        setLastOrderId(order.id);
        setOrderPlaced(true);

        // Track Meta Pixel Purchase event
        trackPurchase({
          id: order.id,
          total: total,
          itemsCount: cart.reduce((acc, item) => acc + item.quantity, 0),
          restaurantName: restaurant?.name
        });

        setTimeout(() => {
          setOrderPlaced(false);
          setLastOrderId(null);
        }, 5000);
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      // Friendly Arabic message for the user
      alert(`فشل في إرسال الطلب: ${err.message || 'خطأ غير معروف'}`);
    } finally {
      setLoading(false);
    }
  };

  const callWaiter = async () => {
    if (!restaurant || isCallingWaiter || waiterCalled) return;

    // Check geofence if table ordering is active and restaurant has geofence enabled
    if (tableId && restaurant.geofence_enabled && restaurant.latitude && restaurant.longitude) {
      const isAllowed = await checkGeofence();
      if (!isAllowed) {
        if (geoState.status === 'outside') {
          alert(`⚠️ لا يمكن نداء النادل: أنت خارج النطاق الجغرافي للمطعم (${geoState.distance} متر).`);
        } else {
          alert('⚠️ يلزم تفعيل الموقع الجغرافي للتأكد من تواجدك على الطاولة.');
        }
        return;
      }
    }
    
    setIsCallingWaiter(true);
    
    try {
      let validTableId = table?.id || null;
      if (!validTableId && tableId) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(tableId)) {
          validTableId = tableId;
        }
      }

      let sent = false;

      // 1. Try server API endpoint /api/call-waiter
      try {
        const response = await fetch('/api/call-waiter', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            restaurant_id: restaurant.id,
            table_id: validTableId,
            table_number: table?.table_number || (validTableId ? null : tableId)
          })
        });

        const resData = await response.json();
        if (response.ok && resData.success) {
          sent = true;
        }
      } catch (apiErr) {
        console.warn('/api/call-waiter fetch failed, trying direct supabase:', apiErr);
      }

      // 2. Direct client supabase insert fallback
      if (!sent) {
        const { error } = await supabase
          .from('waiter_calls')
          .insert({
            restaurant_id: restaurant.id,
            table_id: validTableId,
            status: 'pending'
          });

        if (error) {
          console.error('Detailed Waiter Call Error:', error);
          throw error;
        }
      }

      setWaiterCalled(true);
      trackCallWaiter(table?.table_number || (tableId ? String(tableId) : undefined));
      // Reset after 30 seconds to prevent spam but allow calling again later
      setTimeout(() => setWaiterCalled(false), 30000); 
    } catch (err: any) {
      console.error('Call Waiter Exception:', err);
      alert(isRTL ? 'عفواً، حدث خطأ أثناء إرسال النداء. يرجى المحاولة مرة أخرى.' : 'Something went wrong. Please try again.');
    } finally {
      setIsCallingWaiter(false);
    }
  };

  const primaryColor = restaurant?.primary_color || '#f97316';
  const secondaryColor = restaurant?.secondary_color || '#fb923c';

  if (loading) return <div className="h-screen flex items-center justify-center font-sans tracking-tight">جاري التحميل...</div>;
  if (!restaurant) return <div className="h-screen flex items-center justify-center font-sans tracking-tight">المطعم غير موجود</div>;
  
  if (!restaurant.is_active) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-8 text-center" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="max-w-md">
          <div className="w-24 h-24 bg-red-100 text-red-600 rounded-[40px] flex items-center justify-center mx-auto mb-8 shadow-sm">
            <UtensilsCrossed size={48} />
          </div>
          <h1 className="text-3xl font-black mb-4">
            {isRTL ? 'الخدمة متوقفة مؤقتاً' : 'Service Temporarily Paused'}
          </h1>
          <p className="text-gray-500 font-medium leading-relaxed">
            {isRTL 
              ? 'عذراً، هذا المطعم غير متاح حالياً لاستقبال الطلبات. يرجى المحاولة مرة أخرى في وقت لاحق.'
              : 'Sorry, this restaurant is currently not accepting orders. Please check back later.'
            }
          </p>
          <div className="mt-8 pt-8 border-t">
            <p className="text-xs text-gray-400 font-black uppercase tracking-tighter">Qrieta System</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#1D1D1F] font-sans pb-32">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100/60 px-4 py-3.5 flex items-center justify-between shadow-sm">
        <div className="flex-1" />

        <div className="flex-[3] flex flex-col items-center text-center overflow-hidden">
          <h1 className="text-xl md:text-2xl font-black tracking-tight truncate w-full text-gray-900">{restaurant.name}</h1>
          {(table || tableId) && (
            <p className="text-[10px] font-black uppercase text-gray-400 tracking-tighter mt-0.5">
              {isRTL ? 'طاولة' : 'Table'} {table ? (table.table_number || table.name) : (tableId && /^[0-9a-f]{8}/.test(tableId) ? tableId.slice(0, 4) : tableId)}
            </p>
          )}
        </div>

        <div className="flex-1 flex justify-end items-center gap-2">
          {cart.length > 0 && (
            <button 
              onClick={() => setIsCartOpen(true)}
              className="relative p-3 bg-gray-100 rounded-2xl text-gray-900 active:scale-95 transition-all"
            >
              <ShoppingBag size={22} style={{ color: primaryColor }} />
              <span 
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white"
              >
                {cart.length}
              </span>
            </button>
          )}
        </div>
      </header>

      {/* Main Actions Card */}
      <div className="px-6 mt-2 mb-2 relative z-10 font-sans">
        <div className="bg-white rounded-[24px] p-2.5 shadow-xl shadow-gray-200/40 border border-gray-100 flex items-stretch gap-2.5">
          
          {/* Language Switch */}
          <button 
            onClick={toggleLanguage} 
            className="flex-1 h-14 rounded-[18px] border border-gray-200 flex items-center justify-center gap-2.5 active:scale-95 transition-all bg-white hover:bg-gray-50"
          >
            <Globe size={18} className="text-gray-400 shrink-0" />
            <span className="text-[13px] font-semibold text-gray-600">
              {isRTL ? 'English | العربي' : 'عربي | EN'}
            </span>
          </button>
          
          {/* Call Waiter (for Table orders) OR Delivery Badge (for Delivery orders) */}
          {!isDeliveryOrder ? (
            <button 
              onClick={callWaiter}
              disabled={isCallingWaiter || waiterCalled}
              className={cn(
                "flex-1 h-14 rounded-[18px] font-black transition-all active:scale-95 flex items-center justify-between px-3.5 gap-2",
                waiterCalled 
                  ? "bg-green-500 text-white" 
                  : "text-white"
              )}
              style={!waiterCalled ? { backgroundColor: primaryColor } : {}}
            >
              <div className={cn("flex flex-col leading-[1.2]", isRTL ? "items-end text-right" : "items-start text-left")}>
                <span className="text-[13px] font-black tracking-tight">
                  {waiterCalled 
                    ? (isRTL ? 'طلبك مرسل' : 'Notified')
                    : (isRTL ? 'نداء النادل' : 'Call Waiter')
                  }
                </span>
                <span className="text-[10px] font-medium opacity-80">
                  {waiterCalled
                    ? (isRTL ? 'النادل في طريقه إليك' : 'Coming right now!')
                    : (isRTL ? 'سنرسل النادل إليك' : "We'll notify our staff")
                  }
                </span>
              </div>

              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                {isCallingWaiter ? (
                  <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : waiterCalled ? (
                  <CheckCircle size={20} className="text-white" />
                ) : (
                  <Bell size={20} className={cn("text-white", !waiterCalled && "animate-swing")} />
                )}
              </div>
            </button>
          ) : (
            <div className="flex-1 h-14 rounded-[18px] bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200/80 px-3.5 flex items-center justify-between">
              <div className={cn("flex flex-col leading-[1.2]", isRTL ? "items-end text-right" : "items-start text-left")}>
                <span className="text-[12px] font-black text-purple-900 flex items-center gap-1">
                  <Bike size={14} className="text-purple-600 inline shrink-0" />
                  {isRTL ? 'طلب دليفري وتوصيل' : 'Delivery Mode'}
                </span>
                <span className="text-[10px] font-bold text-purple-600">
                  {isRTL ? '0% رسوم خدمة صالة' : '0% Service Fee'}
                </span>
              </div>
              <span className="text-[10px] font-black bg-purple-200/70 text-purple-900 px-2 py-1 rounded-lg">
                {isRTL ? 'أي مكان' : 'Anywhere'}
              </span>
            </div>
          )}

        </div>
      </div>

      {/* Geofence Status Notice for Table QR Orders */}
      {tableId && restaurant?.geofence_enabled && restaurant.latitude && restaurant.longitude && (
        <div className="px-6 mb-3">
          {geoState.status === 'checking' && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center justify-between text-xs text-amber-800">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-amber-600/30 border-t-amber-600 rounded-full animate-spin" />
                <span className="font-bold">جاري التحقق من التواجد داخل نطاق المطعم...</span>
              </div>
            </div>
          )}

          {geoState.status === 'inside' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center justify-between text-xs text-emerald-800">
              <div className="flex items-center gap-2 font-bold">
                <ShieldCheck size={16} className="text-emerald-600" />
                <span>تم تأكيد موقعك داخل نطاق المطعم ({geoState.distance}م)</span>
              </div>
              <span className="text-[10px] bg-emerald-100/80 px-2 py-0.5 rounded-full font-black text-emerald-700">
                طاولة مفعّلة
              </span>
            </div>
          )}

          {geoState.status === 'outside' && (
            <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 space-y-2 text-red-900 shadow-sm">
              <div className="flex items-center gap-2 font-black text-sm text-red-700">
                <AlertTriangle size={18} />
                <span>أنت خارج النطاق الجغرافي للمطعم ({geoState.distance} متر)</span>
              </div>
              <p className="text-xs text-red-600 font-medium leading-relaxed">
                تم قفل طلبات الطاولات لضمان التواجد الفعلي داخل الصالة (الحد المسموح {restaurant.geofence_radius_meters || 100} متر).
              </p>
              <div className="pt-1 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => checkGeofence()}
                  className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <RefreshCw size={12} />
                  <span>إعادة فحص موقعي</span>
                </button>
                <span className="text-[11px] font-bold text-red-500">
                  {restaurant.name}
                </span>
              </div>
            </div>
          )}

          {(geoState.status === 'denied' || geoState.status === 'error') && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 space-y-2 text-amber-900">
              <div className="flex items-center gap-2 font-black text-xs text-amber-800">
                <MapPin size={16} className="text-amber-600" />
                <span>يتطلب طلب الطاولة السماح بالموقع الجغرافي</span>
              </div>
              <p className="text-[11px] text-amber-700 font-medium">
                يرجى تفعيل صلاحية الـ GPS في المتصفح للتأكد من التواجد داخل المطعم.
              </p>
              <button
                type="button"
                onClick={() => checkGeofence()}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw size={12} />
                <span>السماح وتحديد الموقع</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Hero / Welcome Banner */}
      <div className="px-6 mb-4 mt-2">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="relative overflow-hidden rounded-[28px] p-6 h-48 flex flex-col justify-center shadow-2xl shadow-green-900/10 transition-all hover:scale-[1.01]"
          style={{ 
            background: `linear-gradient(135deg, ${primaryColor} 0%, #1A2E11 100%)`,
          }}
        >
          {/* Background Textures */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
            <div className="absolute top-0 right-0 w-full h-full rotate-12 scale-150">
              <UtensilsCrossed size={300} className="text-white" />
            </div>
          </div>

          <div className="relative z-10 space-y-3">
            <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white/90 text-[10px] font-black uppercase tracking-[0.2em]">
              {isRTL ? 'قائمة اليوم' : 'Daily Menu'}
            </div>
            <h2 className={cn(
              "text-2xl md:text-4xl font-black text-white leading-[1.5] max-w-[280px]",
              isRTL ? "text-right" : "text-left"
            )}>
              {isRTL ? 'اختياراتنا اللي هتعجبك من أول مرة' : 'Choices you will love from the first bite'}
            </h2>
          </div>
          
          {/* Decorative Glow */}
          <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-white/10 rounded-full blur-[80px]" />
        </motion.div>
      </div>

      {/* Search Bar */}
      <div className="px-6 pb-2">
        <div className="relative">
          <Search className={cn("absolute top-1/2 -translate-y-1/2 text-gray-400", isRTL ? "right-5" : "left-5")} size={20} />
          <input
            type="text"
            placeholder={t('search') || (isRTL ? 'ابحث عن صنفك المفضل...' : 'Search flavors...')}
            className={cn(
              "w-full bg-white border border-gray-100 shadow-sm rounded-2xl py-4 outline-none transition-all font-bold text-base placeholder:text-gray-300",
              isRTL ? "pr-14 pl-6 text-right" : "pl-14 pr-6 text-left"
            )}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="px-4 py-6 overflow-x-auto no-scrollbar flex items-center gap-3">
        <button
          onClick={() => setActiveCategory('all')}
          className={cn(
            "px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-300 whitespace-nowrap",
            activeCategory === 'all' 
              ? "text-white shadow-lg translate-y-[-1px]" 
              : "bg-gray-100 text-gray-400 hover:bg-gray-200"
          )}
          style={activeCategory === 'all' ? { backgroundColor: primaryColor, boxShadow: `0 10px 20px -5px ${primaryColor}60` } : {}}
        >
          {t('all') || (isRTL ? 'الكل' : 'All')}
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={cn(
              "px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-300 whitespace-nowrap",
              activeCategory === cat.id 
                ? "text-white shadow-lg translate-y-[-1px]" 
                : "bg-gray-100 text-gray-400 hover:bg-gray-200"
            )}
            style={activeCategory === cat.id ? { backgroundColor: primaryColor, boxShadow: `0 10px 20px -5px ${primaryColor}60` } : {}}
          >
            {isRTL ? cat.name_ar : cat.name_en}
          </button>
        ))}
      </div>

      {/* Product List - Compact Layout */}
      <div className="px-6 space-y-4">
        <AnimatePresence mode='popLayout'>
          {filteredProducts.map((p, idx) => (
            <motion.div
              layout
              key={p.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
              onClick={() => p.availability && handleOpenProduct(p)}
              className={cn(
                "group relative bg-white rounded-[28px] overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all cursor-pointer flex p-3 gap-4",
                !p.availability && "opacity-60 grayscale"
              )}
            >
              {p.image_url && (
                <div className="w-28 h-28 flex-shrink-0 relative rounded-[20px] overflow-hidden">
                  <img src={p.image_url} alt={p.name_en} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  {!p.availability && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="bg-white/90 text-black text-[10px] font-black px-3 py-1.5 rounded-full uppercase whitespace-nowrap">
                        {isRTL ? 'غير متوفر حالياً' : 'Unavailable'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className={cn("flex-grow flex flex-col py-1", isRTL ? "text-right" : "text-left")}>
                <div className="flex items-start justify-between mb-1">
                  <h3 className="text-lg font-black tracking-tight transition-colors">
                    {isRTL ? p.name_ar : p.name_en}
                  </h3>
                </div>
                <p className="text-gray-400 text-xs font-semibold leading-relaxed line-clamp-2 mb-2">
                  {isRTL ? p.description_ar : p.description_en}
                </p>

                {/* Show available category options indicator if any */}
                {(() => {
                  const cat = categories.find(c => String(c.id) === String(p.category_id));
                  const opts = resolveProductOptions(p, cat, serverOptions);
                  if (!opts || opts.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {opts.slice(0, 2).map((opt, oIdx) => (
                        <span 
                          key={oIdx}
                          className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 flex items-center gap-1"
                        >
                          <SlidersHorizontal size={10} style={{ color: primaryColor }} />
                          <span>{isRTL ? opt.name_ar : (opt.name_en || opt.name_ar)}</span>
                        </span>
                      ))}
                    </div>
                  );
                })()}
                {!p.availability && (
                  <p className={cn("text-red-500 text-[10px] font-black mb-1", isRTL ? "text-right" : "text-left")}>
                    {isRTL ? 'غير متاح حالياً' : 'Currently Unavailable'}
                  </p>
                )}
                
                <div className="mt-auto flex items-center justify-between">
                  {(() => {
                    const cat = categories.find(c => String(c.id) === String(p.category_id));
                    const catOpts = resolveProductOptions(p, cat, serverOptions);
                    const range = getProductPriceRange(p, catOpts);
                    return (
                      <div>
                        {range.hasMultiplePrices ? (
                          <div className="flex items-baseline gap-1">
                            <span className="text-[10px] font-bold text-gray-400">{isRTL ? 'يبدأ من' : 'From'}</span>
                            <span className="font-black text-lg" style={{ color: primaryColor }}>
                              {currency(range.minPrice)}
                            </span>
                          </div>
                        ) : (
                          <span className="font-black text-lg">
                            {currency(p.price)}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  <div 
                    className="w-10 h-10 rounded-[14px] flex items-center justify-center text-white shadow-lg active:scale-95 transition-all"
                    style={p.availability ? { backgroundColor: primaryColor, boxShadow: `0 8px 16px ${primaryColor}40` } : { backgroundColor: '#E5E7EB' }}
                  >
                    <Plus size={20} strokeWidth={3} />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Empty State */}
      {filteredProducts.length === 0 && (
        <div className="py-20 text-center px-6">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="text-gray-300" size={32} />
          </div>
          <h3 className="font-black text-xl mb-2">{isRTL ? 'لا توجد نتائج' : 'No results found'}</h3>
          <p className="text-gray-400 font-medium">{isRTL ? 'جرب البحث عن شيء آخر أو تصفح الأقسام' : 'Try searching for something else or browse categories'}</p>
        </div>
      )}

      {/* Product Sheet */}
      <AnimatePresence>
        {selectedProduct && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProduct(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90]"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              className="fixed inset-x-0 bottom-0 bg-white rounded-t-[40px] z-[100] max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="sticky top-0 bg-white/80 backdrop-blur-md z-10 px-6 py-2 flex items-center justify-between">
                <button 
                  onClick={() => setSelectedProduct(null)} 
                  className={cn("p-2 bg-gray-50 text-gray-900 rounded-xl", isRTL ? "ml-auto" : "mr-auto")}
                >
                  <X size={20} />
                </button>
                <div className="w-12 h-1.5 bg-gray-200 rounded-full absolute left-1/2 -translate-x-1/2 top-3" />
              </div>

              <div className="flex-grow overflow-y-auto px-6 pb-24">
                {selectedProduct.image_url && (
                  <div className="aspect-video w-full rounded-3xl overflow-hidden mb-6 shadow-md">
                    <img src={selectedProduct.image_url} className="w-full h-full object-cover" />
                  </div>
                )}
                
                <div className={cn("mb-6", isRTL ? "text-right" : "text-left")}>
                  <h2 className="text-2xl font-black mb-2">{isRTL ? selectedProduct.name_ar : selectedProduct.name_en}</h2>
                  <p className="text-gray-500 font-medium leading-relaxed">{isRTL ? selectedProduct.description_ar : selectedProduct.description_en}</p>
                </div>

                {/* Dynamic Category Options & Customizations */}
                <div className="space-y-6">
                  {(() => {
                    const selectedProdCat = categories.find(c => String(c.id) === String(selectedProduct.category_id));
                    const catOptions: CategoryOption[] = resolveProductOptions(selectedProduct, selectedProdCat, serverOptions);

                    if (!catOptions || catOptions.length === 0) {
                      return null;
                    }

                    return (
                      <div className="space-y-5">
                        {catOptions.map((opt) => {
                          const currentChoice = customization.selectedOptions[opt.id] || (opt.choices[0]?.id || '');

                          return (
                            <div key={opt.id} className="space-y-2.5">
                              <div className="flex items-center justify-between">
                                <h3 className="text-sm font-black text-gray-900 tracking-tight flex items-center gap-1.5">
                                  <SlidersHorizontal size={14} style={{ color: primaryColor }} />
                                  <span>{isRTL ? opt.name_ar : (opt.name_en || opt.name_ar)}</span>
                                </h3>
                              </div>

                              <div className={cn(
                                "grid gap-2",
                                opt.choices.length === 2 ? "grid-cols-2" :
                                opt.choices.length === 3 ? "grid-cols-3" :
                                opt.choices.length === 4 ? "grid-cols-2 sm:grid-cols-4" :
                                "grid-cols-2"
                              )}>
                                {opt.choices.map((choice) => {
                                  const isSelected = currentChoice === choice.id;
                                  // Compute choice display price (either explicit choice.price, or base price + delta)
                                  const displayPrice = (choice.price !== undefined && choice.price !== null && !isNaN(Number(choice.price)))
                                    ? Number(choice.price)
                                    : ((choice.price_delta !== undefined && choice.price_delta !== null && Number(choice.price_delta) !== 0)
                                      ? Number(selectedProduct.price) + Number(choice.price_delta)
                                      : Number(selectedProduct.price));

                                  return (
                                    <button
                                      type="button"
                                      key={choice.id}
                                      onClick={() => {
                                        setCustomization({
                                          ...customization,
                                          selectedOptions: {
                                            ...customization.selectedOptions,
                                            [opt.id]: choice.id
                                          }
                                        });
                                      }}
                                      className={cn(
                                        "p-3.5 sm:p-4 rounded-2xl border-2 transition-all text-center flex flex-col items-center justify-center gap-1.5 cursor-pointer active:scale-95",
                                        isSelected 
                                          ? "shadow-lg scale-[1.03]" 
                                          : "border-gray-100 bg-gray-50/90 text-gray-700 hover:border-gray-300 hover:bg-white"
                                      )}
                                      style={isSelected ? { 
                                        borderColor: primaryColor, 
                                        backgroundColor: `${primaryColor}14`, 
                                        color: primaryColor,
                                        boxShadow: `0 8px 18px ${primaryColor}25`
                                      } : {}}
                                    >
                                      <span className="font-black text-sm md:text-base leading-tight">
                                        {isRTL ? choice.name_ar : (choice.name_en || choice.name_ar)}
                                      </span>
                                      
                                      <span className={cn(
                                        "text-xs md:text-sm font-black px-2 py-0.5 rounded-lg transition-colors",
                                        isSelected 
                                          ? "bg-white/80 shadow-xs text-gray-900" 
                                          : "bg-gray-200/70 text-gray-700"
                                      )} style={isSelected ? { color: primaryColor } : {}}>
                                        {currency(displayPrice)}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  <div>
                    <h3 className="text-sm font-black uppercase text-gray-900 mb-3 tracking-[0.1em]">{isRTL ? 'ملاحظات إضافية' : 'Extra Notes'}</h3>
                    <textarea
                      value={customization.notes}
                      onChange={(e) => setCustomization({ ...customization, notes: e.target.value })}
                      placeholder={isRTL ? 'أي ملاحظات أو طلبات خاصة؟...' : 'Any special requests?...'}
                      className={cn("w-full bg-gray-50 border-none rounded-2xl p-4 min-h-[90px] outline-none focus:ring-4 transition-all font-bold text-sm placeholder:text-gray-300 shadow-inner", isRTL ? "text-right" : "text-left")}
                      style={{ '--tw-ring-color': `${primaryColor}20` } as React.CSSProperties}
                    />
                  </div>
                </div>
              </div>

              {/* Sticky Action Footer */}
              {(() => {
                const selectedProdCat = categories.find(c => String(c.id) === String(selectedProduct.category_id));
                const catOptions = resolveProductOptions(selectedProduct, selectedProdCat, serverOptions);
                const currentDynamicPrice = calculateProductEffectivePrice(selectedProduct, customization.selectedOptions, catOptions);

                return (
                  <div className="p-6 bg-white border-t border-gray-100 flex items-center gap-4">
                    <div className={cn("flex-shrink-0", isRTL ? "text-right" : "text-left")}>
                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{isRTL ? 'المجموع' : 'Total Price'}</p>
                      <p className="text-2xl font-black tracking-tight" style={{ color: primaryColor }}>
                        {currency(currentDynamicPrice)}
                      </p>
                    </div>
                    <button
                      onClick={() => addToCart(selectedProduct, customization)}
                      className="flex-grow text-white py-4 rounded-[20px] font-black text-lg shadow-xl hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-3 cursor-pointer"
                      style={{ backgroundColor: primaryColor, boxShadow: `0 12px 24px -10px ${primaryColor}60` }}
                    >
                      <span>{isRTL ? 'تأكيد الإضافة' : 'Confirm & Add'}</span>
                      <ShoppingBag size={18} />
                    </button>
                  </div>
                );
              })()}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating Cart Button */}
      <AnimatePresence>
        {cart.length > 0 && !isCartOpen && (
          <motion.div
            key="floating-cart-button"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-6 right-6 z-[80]"
          >
            <button
              onClick={() => setIsCartOpen(true)}
              className="w-full flex items-center justify-between px-6 py-4 rounded-3xl text-white shadow-2xl transition-all"
              style={{ backgroundColor: primaryColor, boxShadow: `0 20px 40px -10px ${primaryColor}60` }}
            >
              <div className="flex items-center gap-4">
                <div className="relative">
                  <ShoppingBag size={24} />
                  <span className="absolute -top-2 -right-2 bg-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full shadow-sm" style={{ color: primaryColor }}>
                    {cart.length}
                  </span>
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-black opacity-80 uppercase tracking-widest">{isRTL ? 'سلة المشتريات' : 'Shopping Cart'}</p>
                  <p className="text-xl font-black">{currency(total)}</p>
                </div>
              </div>
              <ChevronRight size={24} className={cn(isRTL && "rotate-180")} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cart Sheet */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110]"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 bg-white rounded-t-[48px] z-[120] max-h-[92vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gray-100 rounded-2xl" style={{ color: primaryColor }}>
                    <ShoppingBag size={24} />
                  </div>
                  <h2 className="text-2xl font-black tracking-tight">{isRTL ? 'سلتك' : 'Your Order'}</h2>
                </div>
                <button onClick={() => setIsCartOpen(false)} className="p-3 bg-gray-50 text-gray-900 rounded-2xl">
                  <X size={24} />
                </button>
              </div>
              
              <div className="flex-grow overflow-y-auto p-8 space-y-6">
                {cart.map((item, idx) => (
                  <motion.div 
                    layout
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    key={idx} 
                    className="flex gap-6 items-center"
                  >
                    {item.product.image_url && (
                      <div className="w-24 h-24 rounded-3xl overflow-hidden flex-shrink-0 shadow-sm border border-gray-100">
                        <img src={item.product.image_url} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    
                    <div className={cn("flex-grow", isRTL ? "text-right" : "text-left")}>
                      <div className="flex items-start justify-between mb-1">
                        <span className="font-black text-lg leading-tight">{isRTL ? item.product.name_ar : item.product.name_en}</span>
                        <div className={isRTL ? "text-right" : "text-left"}>
                          <p className="font-black text-lg" style={{ color: primaryColor }}>{currency(item.product.price * item.quantity)}</p>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-1.5 mt-1 justify-start mb-3">
                        {item.selectedOptionLabels && item.selectedOptionLabels.map((lbl, lIdx) => (
                          <span 
                            key={lIdx}
                            className="px-2.5 py-0.5 rounded-lg text-[10px] font-black border"
                            style={{ 
                              backgroundColor: `${primaryColor}10`, 
                              borderColor: `${primaryColor}30`,
                              color: primaryColor 
                            }}
                          >
                            {lbl.choiceName}
                          </span>
                        ))}
                        {item.sugar !== 'none' && !item.selectedOptionLabels?.some(l => l.optionName.includes('سكر')) && (
                          <span className="bg-gray-100 text-gray-700 px-2.5 py-0.5 rounded-lg text-[10px] font-black">
                            {isRTL ? `سكر ${item.sugar === 'low' ? 'خفيف' : item.sugar === 'medium' ? 'وسط' : 'زيادة'}` : `${item.sugar} sugar`}
                          </span>
                        )}
                        {item.notes && (
                          <span className="bg-gray-100 text-gray-500 px-2.5 py-0.5 rounded-lg text-[10px] font-medium italic max-w-[160px] truncate">
                            "{item.notes}"
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-3">
                        <div className="flex items-center bg-gray-100 p-1 rounded-2xl">
                          <button 
                            onClick={(e) => updateQuantity(e, idx, -1)} 
                            className="w-10 h-10 flex items-center justify-center bg-white rounded-[14px] shadow-sm text-gray-400 hover:text-red-500 transition-all active:scale-95"
                          >
                            <Minus size={16} strokeWidth={3} />
                          </button>
                          <span className="px-4 font-black w-10 text-center text-lg">{item.quantity}</span>
                          <button 
                            onClick={(e) => updateQuantity(e, idx, 1)} 
                            className="w-10 h-10 flex items-center justify-center bg-white rounded-[14px] shadow-sm text-gray-900 transition-all active:scale-95"
                            style={{ color: primaryColor }}
                          >
                            <Plus size={16} strokeWidth={3} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
              {/* Delivery Details Form when isDeliveryOrder is true */}
              {isDeliveryOrder && (
                <div className="p-6 bg-purple-50/60 border-t border-purple-100 space-y-3.5">
                  <div className="flex items-center gap-2 text-purple-950 font-black text-sm">
                    <Bike size={18} className="text-purple-600" />
                    <span>{isRTL ? 'بيانات التوصيل (دليفري خارجي)' : 'Delivery Information'}</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">
                        {isRTL ? 'الاسم بالكامل *' : 'Full Name *'}
                      </label>
                      <div className="relative">
                        <User size={15} className={cn("absolute top-3 text-gray-400", isRTL ? "right-3" : "left-3")} />
                        <input
                          type="text"
                          value={deliveryInfo.customerName}
                          onChange={(e) => setDeliveryInfo(prev => ({ ...prev, customerName: e.target.value }))}
                          placeholder={isRTL ? "مثال: أحمد محمد" : "e.g. John Doe"}
                          className={cn("w-full bg-white border border-gray-200 rounded-xl py-2.5 text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent", isRTL ? "pr-9 pl-3" : "pl-9 pr-3")}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">
                        {isRTL ? 'رقم الهاتف / الواتساب *' : 'Phone / WhatsApp *'}
                      </label>
                      <div className="relative">
                        <Phone size={15} className={cn("absolute top-3 text-gray-400", isRTL ? "right-3" : "left-3")} />
                        <input
                          type="tel"
                          value={deliveryInfo.phone}
                          onChange={(e) => setDeliveryInfo(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder={isRTL ? "مثال: 01012345678" : "e.g. 01012345678"}
                          className={cn("w-full bg-white border border-gray-200 rounded-xl py-2.5 text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent", isRTL ? "pr-9 pl-3" : "pl-9 pr-3")}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">
                      {isRTL ? 'عنوان التوصيل بالتفصيل *' : 'Delivery Address *'}
                    </label>
                    <div className="relative">
                      <MapPin size={15} className={cn("absolute top-3 text-gray-400", isRTL ? "right-3" : "left-3")} />
                      <input
                        type="text"
                        value={deliveryInfo.address}
                        onChange={(e) => setDeliveryInfo(prev => ({ ...prev, address: e.target.value }))}
                        placeholder={isRTL ? "المنطقة، الشارع، رقم المبنى، رقم الشقة" : "Area, Street, Building, Flat #"}
                        className={cn("w-full bg-white border border-gray-200 rounded-xl py-2.5 text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent", isRTL ? "pr-9 pl-3" : "pl-9 pr-3")}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">
                      {isRTL ? 'ملاحظات إضافية للتوصيل (اختياري)' : 'Delivery Notes (Optional)'}
                    </label>
                    <input
                      type="text"
                      value={deliveryInfo.notes}
                      onChange={(e) => setDeliveryInfo(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder={isRTL ? "علامة مميزة، وقت معين، أو رن الجرس" : "Landmarks, specific timing, etc."}
                      className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}
 
              <div className="p-8 bg-gray-50 border-t border-gray-100 space-y-4">
                {/* Price Breakdown */}
                <div className="space-y-2 pb-2 border-b border-gray-200/60">
                  <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                    <span>{isRTL ? 'مجموع الأصناف' : 'Subtotal'}</span>
                    <span className="font-black text-gray-800">{currency(subtotal)}</span>
                  </div>

                  {/* If delivery, show 0% fee with clear badge */}
                  {isDeliveryOrder ? (
                    <div className="flex items-center justify-between text-xs font-bold text-purple-700 bg-purple-50/80 px-3 py-2 rounded-xl border border-purple-100">
                      <span className="flex items-center gap-1.5">
                        <Bike size={14} className="text-purple-600 shrink-0" />
                        <span>{isRTL ? 'رسوم خدمة الصالة (طلب دليفري)' : 'Dine-in Service Fee'}</span>
                      </span>
                      <span className="font-black text-purple-700 bg-purple-200/60 px-2 py-0.5 rounded-md text-[11px]">
                        {isRTL ? 'مجاناً 0% (معفى)' : '0% FREE'}
                      </span>
                    </div>
                  ) : (
                    serviceFeePercentage > 0 && (
                      <div className="flex items-center justify-between text-xs font-bold text-indigo-700 bg-indigo-50/70 px-3 py-2 rounded-xl">
                        <span className="flex items-center gap-1">
                          <span>{isRTL ? `قيمة الخدمة والضريبة المضافة (${serviceFeePercentage}%)` : `Service Fee & VAT (${serviceFeePercentage}%)`}</span>
                        </span>
                        <span className="font-black">+{currency(serviceFeeAmount)}</span>
                      </div>
                    )
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className={cn("flex flex-col", isRTL ? "text-right" : "text-left")}>
                    <span className="text-gray-400 font-black uppercase text-[10px] tracking-widest">{isRTL ? 'الإجمالي النهائي' : 'Grand Total'}</span>
                    <span className="text-3xl font-black" style={{ color: primaryColor }}>{currency(total)}</span>
                  </div>
                </div>
                
                <button
                  onClick={placeOrder}
                  disabled={loading}
                  className="w-full text-white py-6 rounded-[28px] font-black text-xl shadow-2xl hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-4"
                  style={{ backgroundColor: primaryColor, boxShadow: `0 20px 40px -10px ${primaryColor}60` }}
                >
                  {loading ? (
                    <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>{isDeliveryOrder ? (isRTL ? 'تأكيد وإرسال طلب التوصيل' : 'Submit Delivery Order') : (isRTL ? 'إرسال الطلب' : 'Complete Order')}</span>
                      <CheckCircle2 size={24} />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* Success Notification */}
      <AnimatePresence>
        {orderPlaced && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-white/90 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-24 h-24 bg-green-500 text-white rounded-[32px] flex items-center justify-center shadow-xl mb-6"
            >
              <CheckCircle2 size={48} strokeWidth={3} />
            </motion.div>
            <h2 className="text-3xl font-black mb-2">
              {isDeliveryOrder ? (isRTL ? 'تم استلام طلب التوصيل!' : 'Delivery Order Received!') : (isRTL ? 'تم استلام طلبك!' : 'Order Placed!')}
            </h2>
            <p className="text-gray-600 font-medium mb-3">
              {isRTL ? `رقم الطلب الخاص بك هو #${lastOrderId}` : `Your order #${lastOrderId} has been received.`}
            </p>
            {isDeliveryOrder && deliveryInfo.phone && (
              <p className="text-xs text-purple-700 bg-purple-50 border border-purple-200 px-4 py-2 rounded-xl mb-6 font-bold max-w-sm">
                {isRTL ? `سيتواصل معك فريق ${restaurant.name} على رقم (${deliveryInfo.phone}) لتأكيد التوصيل.` : `We will contact you at ${deliveryInfo.phone} to confirm delivery.`}
              </p>
            )}
            <button
              onClick={() => setOrderPlaced(false)}
              className="bg-gray-900 text-white px-8 py-4 rounded-2xl font-black active:scale-95 transition-all"
            >
              {isRTL ? 'حسناً' : 'Done'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waiter Notified Notification */}
      <AnimatePresence>
        {waiterCalled && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-32 left-6 right-6 z-[200] bg-orange-600 text-white p-4 rounded-2xl shadow-2xl text-center font-bold flex items-center justify-center gap-3"
          >
            <Bell size={20} className="animate-bounce" />
            <span>{isRTL ? 'تم إرسال طلبك، النادل في الطريق إليك' : 'Waiter has been notified!'}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
