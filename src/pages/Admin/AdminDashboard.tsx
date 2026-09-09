import React, { useEffect, useState, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseUrl, supabaseAnonKey, Category, Product, CategoryOption } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import qretaLogo from '../../assets/images/qreta_logo_1787613852268.jpg';
import { CategoryOptionsEditor } from '../../components/CategoryOptionsEditor';
import { ProductOptionsPricingEditor } from '../../components/ProductOptionsPricingEditor';
import { 
  getLocalCategoryOptions, 
  saveCategoryOptions, 
  syncAllCategoryOptions,
  getLocalProductOptions,
  saveProductOptions,
  syncAllProductOptions,
  resolveProductOptions
} from '../../lib/optionsHelper';
import { 
  DeliveryZone, 
  fetchAllServerDeliveryZones, 
  getLocalDeliveryZones, 
  syncDeliveryZones 
} from '../../lib/deliveryHelper';
import { getStoredCashierPin, setStoredCashierPin } from '../../lib/posOfflineStore';
import { InventoryAuditTab } from '../../components/Admin/InventoryAuditTab';
import { fetchLiveOrders, updateLiveOrderStatus, LiveOrder, getDisplayOrderNumber } from '../../lib/ordersService';
import { 
  Plus, 
  Trash2, 
  Edit, 
  BarChart3, 
  LayoutList, 
  LayoutDashboard,
  Coffee, 
  Save, 
  X,
  Menu,
  History,
  Tags,
  TrendingUp,
  Package,
  Eye,
  EyeOff,
  Users,
  DollarSign,
  Calendar,
  Settings,
  Globe,
  Palette,
  LogOut,
  CheckCircle2,
  Sparkles,
  UserPlus,
  Upload,
  Image as ImageLucide,
  Headphones,
  Phone,
  MessageSquare,
  Copy,
  Check,
  LifeBuoy,
  Clock,
  ShieldCheck,
  SlidersHorizontal,
  Layers,
  QrCode,
  Download,
  ExternalLink,
  Target,
  Bike,
  MonitorCheck,
  Lock,
  Key,
  Boxes,
  Smartphone,
  Store,
  RefreshCw,
  FileSpreadsheet,
  Search,
  Filter,
  ChevronDown
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { fetchOrdersByDateRange, generateOrdersExcelSheet } from '../../lib/excelExport';
import { ShiftsReportsTab } from '../../components/Admin/ShiftsReportsTab';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { formatCurrency, toEnglishDigits, cn } from '../../lib/utils';
import { getStoredActiveShift, getStoredShiftReports, getCashierShiftConfigs } from '../../lib/shiftsStore';
import { motion, AnimatePresence } from 'motion/react';

export default function AdminDashboard() {
  const { profile, signOut, loading: authLoading } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [peakHoursData, setPeakHoursData] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [waiterStats, setWaiterStats] = useState<Record<string, { orderCount: number; avgTime: number }>>({});
  const [orderCount, setOrderCount] = useState(0);
  const [itemSoldCount, setItemSoldCount] = useState(0);
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [analyticsMode, setAnalyticsMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [tables, setTables] = useState<any[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [activeTab, setActiveTab] = useState<'categories' | 'menu' | 'tables_qr' | 'orders' | 'shifts' | 'staff' | 'analytics' | 'settings' | 'support' | 'inventory'>('categories');
  const [phoneCopied, setPhoneCopied] = useState(false);
  
  // Real-time live orders from both Cashier POS and Customer App
  const [adminLiveOrders, setAdminLiveOrders] = useState<LiveOrder[]>([]);
  const [ordersSourceFilter, setOrdersSourceFilter] = useState<'all' | 'cashier_pos' | 'customer_app'>('all');
  const [ordersTypeFilter, setOrdersTypeFilter] = useState<'all' | 'dine_in' | 'delivery' | 'takeaway'>('all');
  const [isUpdatingOrderStatus, setIsUpdatingOrderStatus] = useState<string | null>(null);
  const [newCat, setNewCat] = useState({ en: '', ar: '' });
  const [newCatOptions, setNewCatOptions] = useState<CategoryOption[]>([]);
  const [editingCategoryOptions, setEditingCategoryOptions] = useState<CategoryOption[]>([]);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [availableRestaurants, setAvailableRestaurants] = useState<any[]>([]);
  const [isMultiCafeSelectorOpen, setIsMultiCafeSelectorOpen] = useState(false);
  const [isSavingColors, setIsSavingColors] = useState(false);
  const [deleteModalItem, setDeleteModalItem] = useState<{ type: 'product' | 'category'; id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteToast, setDeleteToast] = useState<string | null>(null);
  const isRTL = true;
  
  // Form states
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [editingProductOptions, setEditingProductOptions] = useState<CategoryOption[]>([]);
  const [serverProductOptions, setServerProductOptions] = useState<Record<string, CategoryOption[]>>({});
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [copiedDeliveryLink, setCopiedDeliveryLink] = useState(false);

  // Delivery Zones State
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneFee, setNewZoneFee] = useState<string>('30');
  const [newZoneTime, setNewZoneTime] = useState<string>('30-45 دقيقة');
  const [isSavingDeliveryZones, setIsSavingDeliveryZones] = useState(false);
  const [deliveryToast, setDeliveryToast] = useState<string | null>(null);

  // POS Cashier PIN Management State
  const [cashierPinInput, setCashierPinInput] = useState<string>('1234');
  const [cashierPinSavedToast, setCashierPinSavedToast] = useState<string | null>(null);
  const [showCashierPin, setShowCashierPin] = useState<boolean>(false);

  useEffect(() => {
    if (restaurant?.id) {
      const pin = getStoredCashierPin(restaurant.id);
      setCashierPinInput(pin || '1234');
    }
  }, [restaurant?.id]);

  // Live orders poller for Admin Dashboard (syncs POS + Customer App orders in real time)
  useEffect(() => {
    if (!restaurant?.id) return;
    let isMounted = true;
    const loadLive = async () => {
      try {
        const live = await fetchLiveOrders(restaurant.id);
        if (isMounted) setAdminLiveOrders(live);
      } catch (e) {
        console.error('Error fetching admin live orders:', e);
      }
    };
    loadLive();
    const timer = setInterval(loadLive, 4000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [restaurant?.id]);

  // Excel Export Custom Dates State
  const [excelStartDate, setExcelStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [excelEndDate, setExcelEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [excelStatusFilter, setExcelStatusFilter] = useState<'all' | 'delivered' | 'preparing' | 'new' | 'cancelled'>('all');
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [excelExportToast, setExcelExportToast] = useState<string | null>(null);

  // Orders Sheet Search & Status Filters
  const [ordersSearchTerm, setOrdersSearchTerm] = useState('');
  const [ordersStatusFilter, setOrdersStatusFilter] = useState<'all' | 'new' | 'preparing' | 'ready' | 'delivered' | 'cancelled'>('all');
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<any | null>(null);

  // Quick Preset Handlers for Excel dates
  const setExcelPreset = (preset: 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth' | 'allTime') => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (preset === 'today') {
      setExcelStartDate(todayStr);
      setExcelEndDate(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().split('T')[0];
      setExcelStartDate(yStr);
      setExcelEndDate(yStr);
    } else if (preset === 'last7') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      setExcelStartDate(d.toISOString().split('T')[0]);
      setExcelEndDate(todayStr);
    } else if (preset === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      setExcelStartDate(start);
      setExcelEndDate(todayStr);
    } else if (preset === 'lastMonth') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
      setExcelStartDate(start);
      setExcelEndDate(end);
    } else if (preset === 'allTime') {
      setExcelStartDate('2024-01-01');
      setExcelEndDate(todayStr);
    }
  };

  // Export by specified dates handler
  const handleExportExcelByDate = async () => {
    if (!restaurant?.id) return;
    setIsExportingExcel(true);
    try {
      const fetched = await fetchOrdersByDateRange({
        restaurantId: restaurant.id,
        startDate: excelStartDate,
        endDate: excelEndDate,
        status: excelStatusFilter
      });

      if (fetched.length === 0) {
        alert(`لم يتم العثور على أي طلبات في الفترة من ${excelStartDate} إلى ${excelEndDate}`);
        return;
      }

      const result = generateOrdersExcelSheet(fetched, adminLiveOrders, {
        restaurantName: restaurant.name_ar || restaurant.name_en || 'المطعم',
        startDate: excelStartDate,
        endDate: excelEndDate,
        fileNamePrefix: `سجل_الطلبات_${restaurant.name_ar ? restaurant.name_ar.replace(/\s+/g, '_') : 'الفرع'}`
      });

      setExcelExportToast(`تم بنجاح تصدير ${result.ordersCount} طلب بإجمالي ${formatCurrency(result.totalRevenue)} إلى ملف Excel (${result.fileName})`);
      setTimeout(() => setExcelExportToast(null), 6000);
    } catch (err: any) {
      console.error('Excel export error:', err);
      alert('حدث خطأ أثناء تصدير ملف الإكسيل: ' + (err.message || 'يرجى المحاولة مجدداً'));
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleAdminUpdateOrderStatus = async (orderId: string | number, newStatus: LiveOrder['status']) => {
    if (!restaurant?.id) return;
    setIsUpdatingOrderStatus(String(orderId));
    try {
      await updateLiveOrderStatus(orderId, restaurant.id, newStatus);
      setAdminLiveOrders(prev => prev.map(o => String(o.id) === String(orderId) ? { ...o, status: newStatus } : o));
      setOrders(prev => prev.map(o => String(o.id) === String(orderId) ? { ...o, status: newStatus === 'completed' ? 'delivered' : newStatus } : o));
    } catch (e) {
      console.error('Error updating live order status from admin:', e);
    } finally {
      setIsUpdatingOrderStatus(null);
    }
  };

  // 1-Click Export of currently displayed sheet orders
  const handleExportCurrentSheet = () => {
    if (!restaurant?.id || displayedSheetOrders.length === 0) {
      alert('لا توجد طلبات معروضة حالياً لتصديرها');
      return;
    }
    const result = generateOrdersExcelSheet(displayedSheetOrders, adminLiveOrders, {
      restaurantName: restaurant.name_ar || restaurant.name_en || 'المطعم',
      startDate: selectedDate,
      endDate: selectedDate,
      fileNamePrefix: `عرض_الطلبات_المفلتر`
    });
    setExcelExportToast(`تم بنجاح تصدير ${result.ordersCount} طلب إلى ملف Excel (${result.fileName})`);
    setTimeout(() => setExcelExportToast(null), 6000);
  };

  const displayedSheetOrders = useMemo(() => {
    const liveMap = new Map<string, LiveOrder>();
    adminLiveOrders.forEach(lo => liveMap.set(String(lo.id), lo));

    // Gather shift data for robust cashier and payment method mapping
    const restId = restaurant?.id || '';
    const storedActive = restId ? getStoredActiveShift(restId) : null;
    const storedReports = restId ? getStoredShiftReports(restId) : [];
    const shiftConfigs = restId ? getCashierShiftConfigs(restId) : [];
    const fallbackCashier = storedActive?.cashierName || shiftConfigs[0]?.cashierName || 'كاشير 1';

    const allShiftOrders: any[] = [];
    if (storedActive?.orders) allShiftOrders.push(...storedActive.orders);
    storedReports.forEach(r => {
      if (r.shift?.orders) allShiftOrders.push(...r.shift.orders);
    });

    const map = new Map<string, any>();

    // 1. Map historical orders with any live updates
    orders.forEach(o => {
      const live = liveMap.get(String(o.id)) || 
                   Array.from(liveMap.values()).find(lo => 
                     lo.daily_order_number && o.daily_order_number && 
                     Number(lo.daily_order_number) === Number(o.daily_order_number)
                   );

      const noteText = [
        o.notes,
        o.order_items?.[0]?.notes,
        ...(Array.isArray(o.order_items) ? o.order_items.map((it: any) => it.notes) : [])
      ].filter(Boolean).join(' ');

      const isCustomerApp = live?.source === 'customer_app' || 
                            o.source === 'customer_app' || 
                            Boolean(noteText.includes('طلب زبون') || noteText.includes('تطبيق الزبائن'));

      // Check matching shift order
      const matchingShiftOrder = allShiftOrders.find((so: any) => 
        String(so.id) === String(o.id) || 
        (so.daily_order_number && o.daily_order_number && Number(so.daily_order_number) === Number(o.daily_order_number))
      );

      // Resolve Cashier Name
      const cashierMatch = noteText.match(/كاشير:\s*([^|\]]+)/);
      let cashierName = live?.cashier_name || 
                        (o as any).cashier_name || 
                        (cashierMatch ? cashierMatch[1].trim() : null) ||
                        matchingShiftOrder?.cashier_name;

      if (!cashierName) {
        cashierName = isCustomerApp ? 'تطبيق الزبائن (أونلاين)' : fallbackCashier;
      }

      // Resolve Payment Method
      let paymentMethod = live?.payment_method || 
                          (o as any).payment_method || 
                          matchingShiftOrder?.payment_method;

      if (!paymentMethod) {
        if (noteText.includes('دفع: card') || noteText.includes('دفع: visa') || noteText.includes('فيزا') || noteText.includes('بطاقة')) {
          paymentMethod = 'card';
        } else if (noteText.includes('دفع: wallet') || noteText.includes('دفع: instapay') || noteText.includes('انستاباي') || noteText.includes('محفظة')) {
          paymentMethod = 'wallet';
        } else if (noteText.includes('دفع: split') || noteText.includes('مقسم') || noteText.includes('مجزأ')) {
          paymentMethod = 'split';
        } else {
          paymentMethod = 'cash';
        }
      }

      // Resolve Order Type
      let orderType: 'dine_in' | 'delivery' | 'takeaway' = 'dine_in';
      if (live?.order_type) {
        orderType = live.order_type;
      } else if (matchingShiftOrder?.order_type) {
        orderType = matchingShiftOrder.order_type;
      } else if (noteText.includes('دليفري') || noteText.includes('توصيل')) {
        orderType = 'delivery';
      } else if (noteText.includes('سفري') || noteText.includes('تيك أواي') || noteText.includes('takeaway')) {
        orderType = 'takeaway';
      } else if (o.tables || o.table_id) {
        orderType = 'dine_in';
      }

      // Resolve Table Number
      const tableMatch = noteText.match(/طاولة\s*([^|\]]+)/);
      const tableNumber = live?.table_number || o.tables?.table_number || (tableMatch ? tableMatch[1].trim() : null);

      map.set(String(o.id), {
        ...o,
        daily_order_number: o.daily_order_number || live?.daily_order_number || getDisplayOrderNumber(o),
        status: live?.status || o.status,
        source: isCustomerApp ? 'customer_app' : 'cashier_pos',
        cashier_name: cashierName,
        payment_method: paymentMethod,
        order_type: orderType,
        table_number: tableNumber,
        tables: tableNumber ? { table_number: tableNumber } : o.tables,
        customer_name: live?.customer_name || (o as any).customer_name || '',
        customer_phone: live?.customer_phone || (o as any).customer_phone || '',
        delivery_address: live?.delivery_address || (o as any).delivery_address || '',
        live_items: live?.items,
        payment_status: live?.payment_status || (o.status === 'delivered' || o.status === 'completed' ? 'paid' : 'unpaid')
      });
    });

    // 2. Add any active live orders not yet in database
    adminLiveOrders.forEach(lo => {
      const existingKey = Array.from(map.keys()).find(k => {
        const item = map.get(k);
        return k === String(lo.id) || (item?.daily_order_number && lo.daily_order_number && Number(item.daily_order_number) === Number(lo.daily_order_number));
      });

      if (!existingKey) {
        const noteText = lo.notes || '';
        const isCustomerApp = lo.source === 'customer_app' || Boolean(noteText.includes('طلب زبون') || noteText.includes('تطبيق الزبائن'));
        const cashierMatch = noteText.match(/كاشير:\s*([^|\]]+)/);
        const cashierName = lo.cashier_name || (cashierMatch ? cashierMatch[1].trim() : (isCustomerApp ? 'تطبيق الزبائن (أونلاين)' : fallbackCashier));

        let payMethod = lo.payment_method;
        if (!payMethod) {
          if (noteText.includes('دفع: card') || noteText.includes('فيزا') || noteText.includes('بطاقة')) payMethod = 'card';
          else if (noteText.includes('دفع: wallet') || noteText.includes('انستاباي') || noteText.includes('محفظة')) payMethod = 'wallet';
          else if (noteText.includes('دفع: split') || noteText.includes('مقسم')) payMethod = 'split';
          else payMethod = 'cash';
        }

        map.set(String(lo.id), {
          id: lo.id,
          daily_order_number: lo.daily_order_number,
          restaurant_id: lo.restaurant_id,
          status: lo.status,
          total_price: lo.total_price,
          created_at: lo.created_at,
          source: isCustomerApp ? 'customer_app' : 'cashier_pos',
          cashier_name: cashierName,
          payment_method: payMethod,
          order_type: lo.order_type || (lo.table_number ? 'dine_in' : 'takeaway'),
          customer_name: lo.customer_name,
          customer_phone: lo.customer_phone,
          delivery_address: lo.delivery_address,
          tables: lo.table_number ? { table_number: lo.table_number } : null,
          table_number: lo.table_number,
          order_items: (lo.items || []).map(it => ({
            quantity: it.quantity,
            unit_price: it.price,
            products: { name_ar: it.name, name_en: it.name }
          })),
          live_items: lo.items,
          payment_status: lo.payment_status || 'unpaid',
          notes: lo.notes
        });
      }
    });

    let list = Array.from(map.values());

    // 1. Primary Classification filter (بيع مباشر من الكاشير / تطبيق الزبائن)
    if (ordersSourceFilter === 'customer_app') {
      list = list.filter(o => o.source === 'customer_app');
    } else if (ordersSourceFilter === 'cashier_pos') {
      list = list.filter(o => o.source === 'cashier_pos' || o.source === 'pos' || o.source !== 'customer_app');
    }

    // 2. Sub-classification filter (صالة / دليفري / تيك أواي)
    if (ordersTypeFilter !== 'all') {
      list = list.filter(o => o.order_type === ordersTypeFilter);
    }

    // 3. Status filter
    if (ordersStatusFilter !== 'all') {
      list = list.filter(o => {
        if (ordersStatusFilter === 'delivered') return o.status === 'delivered' || o.status === 'completed';
        return o.status === ordersStatusFilter;
      });
    }

    // 4. Search term filter
    if (ordersSearchTerm.trim()) {
      const q = ordersSearchTerm.trim().toLowerCase();
      list = list.filter(o => {
        const numMatch = String(o.daily_order_number || o.id).includes(q);
        const nameMatch = (o.customer_name || '').toLowerCase().includes(q);
        const phoneMatch = (o.customer_phone || '').includes(q);
        const tableMatch = o.table_number ? String(o.table_number).includes(q) : (o.tables?.table_number ? String(o.tables.table_number).includes(q) : false);
        const cashierMatch = (o.cashier_name || '').toLowerCase().includes(q);
        const notesMatch = (o.notes || '').toLowerCase().includes(q);
        const itemMatch = (o.order_items || []).some((it: any) => 
          (it.products?.name_ar || it.products?.name_en || '').toLowerCase().includes(q)
        ) || (o.live_items || []).some((it: any) =>
          (it.name || '').toLowerCase().includes(q)
        );
        return numMatch || nameMatch || phoneMatch || tableMatch || cashierMatch || notesMatch || itemMatch;
      });
    }

    list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    return list;
  }, [orders, adminLiveOrders, ordersSourceFilter, ordersTypeFilter, ordersStatusFilter, ordersSearchTerm, restaurant]);

  const handleSaveCashierPin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!restaurant?.id) return;
    const clean = cashierPinInput.trim();
    if (!clean || clean.length < 4) {
      alert('يرجى كتابة رمز PIN مكون من 4 أرقام على الأقل');
      return;
    }
    setStoredCashierPin(restaurant.id, clean);
    setCashierPinSavedToast(`تم بنجاح حفظ وتعيين كلمة سر الكاشير الجديدة: ${clean}`);
    setTimeout(() => setCashierPinSavedToast(null), 5000);
  };

  const openAddProductModal = () => {
    const firstCatId = categories[0]?.id || '';
    const initialPrice = 0;
    const targetCat = categories.find(c => c.id === firstCatId);
    const catOpts = targetCat?.options || (targetCat?.id ? getLocalCategoryOptions(targetCat.id, targetCat?.name_ar, targetCat?.name_en) : []);

    setEditingProduct({
      name_ar: '',
      name_en: '',
      price: initialPrice,
      category_id: firstCatId,
      availability: true
    });
    setEditingProductOptions(catOpts && catOpts.length > 0 ? JSON.parse(JSON.stringify(catOpts)) : []);
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (p: Product) => {
    setEditingProduct(p);
    const cat = categories.find(c => c.id === p.category_id);
    const resolved = resolveProductOptions(p, cat, undefined, serverProductOptions);
    setEditingProductOptions(resolved && resolved.length > 0 ? JSON.parse(JSON.stringify(resolved)) : []);
    setIsProductModalOpen(true);
  };

  const copyRegisterLink = () => {
    if (!profile?.restaurant_id) return;
    const link = `${window.location.origin}/register?restaurant_id=${profile.restaurant_id}`;
    navigator.clipboard.writeText(link);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  useEffect(() => {
    const initData = async () => {
      // Fetch all cafes in system for multi-branch switching
      const { data: allRests } = await supabase.from('restaurants').select('*').order('name');
      if (allRests && allRests.length > 0) {
        setAvailableRestaurants(allRests);
      }

      const savedResId = localStorage.getItem('admin_selected_restaurant_id');
      let resId = savedResId || profile?.restaurant_id;
      if (!resId || (allRests && allRests.length > 0 && !allRests.some((r: any) => r.id === resId))) {
        resId = allRests?.[0]?.id || profile?.restaurant_id;
      }

      if (resId) {
        fetchData(resId);
        fetchStaff(resId);
        fetchRestaurant(resId);
        fetchTables(resId);
        fetchDeliveryZones(resId);
      }
    };

    initData();
  }, [profile, selectedDate, analyticsMode]);

  const handleSwitchRestaurant = (newResId: string) => {
    localStorage.setItem('admin_selected_restaurant_id', newResId);
    setIsMultiCafeSelectorOpen(false);
    fetchData(newResId);
    fetchStaff(newResId);
    fetchRestaurant(newResId);
    fetchTables(newResId);
    fetchDeliveryZones(newResId);
  };

  const fetchDeliveryZones = async (resId?: string) => {
    const targetId = resId || profile?.restaurant_id || restaurant?.id;
    if (!targetId) return;
    try {
      const allZones = await fetchAllServerDeliveryZones();
      if (allZones[targetId] && allZones[targetId].length > 0) {
        setDeliveryZones(allZones[targetId]);
      } else {
        const local = getLocalDeliveryZones(targetId);
        setDeliveryZones(local);
      }
    } catch (e) {
      console.warn('Error fetching delivery zones:', e);
      const local = getLocalDeliveryZones(targetId);
      setDeliveryZones(local);
    }
  };

  const handleAddDeliveryZone = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newZoneName.trim()) {
      alert('يرجى إدخال اسم المنطقة أو المكان (مثل: بورسعيد، بورفؤاد)');
      return;
    }
    const feeNum = parseFloat(newZoneFee) || 0;
    const newZone: DeliveryZone = {
      id: 'dz_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      name: newZoneName.trim(),
      fee: feeNum,
      estimated_time: newZoneTime.trim() || undefined,
      is_active: true
    };
    setDeliveryZones(prev => [...prev, newZone]);
    setNewZoneName('');
  };

  const handleAddPresetZone = (name: string, fee: number, time = '30-45 دقيقة') => {
    if (deliveryZones.some(z => z.name === name)) {
      alert(`المنطقة "${name}" مضافة بالفعل`);
      return;
    }
    const newZone: DeliveryZone = {
      id: 'dz_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      name,
      fee,
      estimated_time: time,
      is_active: true
    };
    setDeliveryZones(prev => [...prev, newZone]);
  };

  const handleRemoveDeliveryZone = (id: string) => {
    setDeliveryZones(prev => prev.filter(z => z.id !== id));
  };

  const handleToggleDeliveryZone = (id: string) => {
    setDeliveryZones(prev => prev.map(z => z.id === id ? { ...z, is_active: !z.is_active } : z));
  };

  const handleUpdateDeliveryZoneFee = (id: string, feeVal: string) => {
    const fee = parseFloat(feeVal) || 0;
    setDeliveryZones(prev => prev.map(z => z.id === id ? { ...z, fee } : z));
  };

  const handleSaveDeliveryZones = async () => {
    const targetId = profile?.restaurant_id || restaurant?.id;
    if (!targetId) {
      alert('لم يتم تحديد المطعم');
      return;
    }
    setIsSavingDeliveryZones(true);
    try {
      await syncDeliveryZones(targetId, deliveryZones);
      setDeliveryToast('تم حفظ وتحديث أسعار ومناطق التوصيل بنجاح!');
      setTimeout(() => setDeliveryToast(null), 3500);
    } catch (err: any) {
      console.error('Error saving delivery zones:', err);
      alert('حدث خطأ أثناء حفظ مناطق التوصيل');
    } finally {
      setIsSavingDeliveryZones(false);
    }
  };

  const fetchTables = async (resId?: string) => {
    const targetId = resId || profile?.restaurant_id || restaurant?.id;
    if (!targetId) return;
    setIsLoadingTables(true);
    try {
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .eq('restaurant_id', targetId)
        .order('table_number', { ascending: true });
      
      if (error) {
        console.error('Error fetching tables:', error);
      } else {
        // Sort numerically if possible
        const sorted = (data || []).sort((a: any, b: any) => {
          const numA = parseInt(a.table_number, 10);
          const numB = parseInt(b.table_number, 10);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return String(a.table_number).localeCompare(String(b.table_number));
        });
        setTables(sorted);
      }
    } catch (err) {
      console.error('Fetch tables error:', err);
    } finally {
      setIsLoadingTables(false);
    }
  };

  const downloadQR = (tableNum: string) => {
    const svg = document.getElementById(`admin-qr-${tableNum}`);
    if (!svg) return;
    const canvas = document.createElement("canvas");
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvasContext = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      canvasContext?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = tableNum === 'delivery' ? `${restaurant?.name || 'Restaurant'}-Delivery-QR.png` : `Table-${tableNum}-QR.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  const fetchRestaurant = async (resId?: string) => {
    const targetId = resId || profile?.restaurant_id;
    if (!targetId) return;
    const { data } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', targetId)
      .single();
    if (data) {
      const cachedPixel = localStorage.getItem(`qrieta_fb_pixel_${data.id}`);
      setRestaurant({
        ...data,
        fb_pixel_id: data.fb_pixel_id || cachedPixel || ''
      });
    }
  };

  const updateRestaurantColors = async () => {
    if (!restaurant) return;
    setIsSavingColors(true);
    try {
      // 1. Guaranteed standard columns in restaurants table
      const basePayload: Record<string, any> = {
        name: restaurant.name,
        primary_color: restaurant.primary_color,
        secondary_color: restaurant.secondary_color,
        logo_url: restaurant.logo_url
      };

      // 2. Try extended payload if database has fb_pixel_id column
      const extendedPayload: Record<string, any> = {
        ...basePayload,
        fb_pixel_id: restaurant.fb_pixel_id || null
      };

      let { error } = await supabase
        .from('restaurants')
        .update(extendedPayload)
        .eq('id', restaurant.id);

      // If failed due to missing columns in DB schema (e.g. fb_pixel_id or other column not present in schema)
      if (error && (error.message?.includes('column') || error.message?.includes('schema cache'))) {
        console.warn('Extended columns update failed, retrying with core columns:', error.message);
        const retryRes = await supabase
          .from('restaurants')
          .update(basePayload)
          .eq('id', restaurant.id);
        error = retryRes.error;
      }

      if (error) {
        alert('حدث خطأ أثناء حفظ الإعدادات: ' + error.message);
      } else {
        // Persist fb_pixel_id locally to guarantee it stays available
        if (restaurant.fb_pixel_id) {
          localStorage.setItem(`qrieta_fb_pixel_${restaurant.id}`, restaurant.fb_pixel_id);
        } else {
          localStorage.removeItem(`qrieta_fb_pixel_${restaurant.id}`);
        }
        alert(isRTL ? 'تم حفظ جميع الإعدادات بنجاح!' : 'Settings saved successfully!');
      }
    } catch (err: any) {
      console.error('Error in updateRestaurantColors:', err);
      alert('حدث خطأ أثناء الحفظ: ' + (err.message || 'فشلت العملية'));
    } finally {
      setIsSavingColors(false);
    }
  };

  const fetchData = async (resId?: string) => {
    const targetId = resId || profile?.restaurant_id;
    if (!targetId) return;
    try {
      let query = supabase.from('orders')
        .select('*, order_items(*, products(*)), tables(table_number)')
        .eq('restaurant_id', targetId)
        .order('id', { ascending: false });

      if (analyticsMode === 'daily') {
        query = query.gte('created_at', `${selectedDate}T00:00:00`)
                     .lte('created_at', `${selectedDate}T23:59:59`);
      } else if (analyticsMode === 'weekly') {
        const d = new Date(selectedDate);
        const day = d.getDay(); // 0 is Sunday
        const diff = (day + 1) % 7;
        const start = new Date(d);
        start.setDate(d.getDate() - diff);
        start.setHours(0,0,0,0);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23,59,59,999);
        
        query = query.gte('created_at', start.toISOString())
                     .lte('created_at', end.toISOString());
      } else {
        const [year, month] = selectedDate.split('-');
        const startDate = `${year}-${month}-01T00:00:00`;
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        const endDate = `${year}-${month}-${lastDay}T23:59:59`;
        query = query.gte('created_at', startDate).lte('created_at', endDate);
      }

      const [cats, prods, ordersResult] = await Promise.all([
        supabase.from('categories').select('*').eq('restaurant_id', targetId).order('sort_order'),
        supabase.from('products').select('*').eq('restaurant_id', targetId),
        query
      ]);

      // Automatically purge unwanted legacy auto-created 'مشروبات ساخنة' / 'Hot Drinks' category if present
      const rawCats = cats.data || [];
      const unwantedDefaultCats = rawCats.filter((cat: any) => 
        (cat.name_ar === 'مشروبات ساخنة' || cat.name_en === 'Hot Drinks') &&
        !(prods.data || []).some((p: any) => p.category_id === cat.id)
      );

      if (unwantedDefaultCats.length > 0) {
        for (const unwanted of unwantedDefaultCats) {
          try {
            await supabase.from('categories').delete().eq('id', unwanted.id);
            await fetch('/api/admin/delete-category', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ category_id: unwanted.id })
            }).catch(() => {});
          } catch (delErr) {
            console.warn('Auto delete unwanted category error:', delErr);
          }
        }
      }

      const filteredCats = rawCats.filter((cat: any) => 
        !unwantedDefaultCats.some((u: any) => u.id === cat.id)
      );

      const formattedCats = filteredCats.map((cat: any) => ({
        ...cat,
        options: cat.options && cat.options.length > 0 ? cat.options : getLocalCategoryOptions(cat.id)
      }));

      setCategories(formattedCats);
      setProducts(prods.data || []);
      const fetchedOrders = (ordersResult.data || []).map((ord: any) => ({
        ...ord,
        daily_order_number: ord.daily_order_number || getDisplayOrderNumber(ord)
      }));
      setOrderCount(fetchedOrders.length);
      setOrders(fetchedOrders);

      // Sync server product options
      syncAllProductOptions().then((optsMap) => {
        if (optsMap) setServerProductOptions(optsMap);
      }).catch(() => {});
      
      // Process analytics safely
      if (ordersResult.data) {
        let totalItems = 0;
        let revenueTotal = 0;
        const itemsMap: Record<string, number> = {};
        const dailyRevenueMap: Record<string, number> = {};

        ordersResult.data.forEach((order: any) => {
          revenueTotal += Number(order.total_price || 0);
          const d = new Date(order.created_at);
          let groupKey: string;
          
          if (analyticsMode === 'daily') {
            const hour = d.getHours();
            const ampm = hour >= 12 ? 'مساءً' : 'صباحاً';
            const displayHour = hour % 12 || 12;
            groupKey = `${displayHour} ${ampm}`;
          } else {
            groupKey = d.toLocaleDateString();
          }
          
          dailyRevenueMap[groupKey] = (dailyRevenueMap[groupKey] || 0) + Number(order.total_price || 0);

          order.order_items?.forEach((item: any) => {
            const name = item.products?.name_ar || item.products?.name_en || 'غير معروف';
            itemsMap[name] = (itemsMap[name] || 0) + item.quantity;
            totalItems += item.quantity;
          });
        });

        setTotalRevenue(revenueTotal);
        setItemSoldCount(totalItems);

        // Revenue Chart Data
        const revData = Object.entries(dailyRevenueMap).map(([name, value]) => {
          let sortKey: number;
          if (analyticsMode === 'daily') {
            const parts = name.split(' ');
            let h = parseInt(parts[0]);
            const isPM = parts[1] === 'مساءً';
            if (isPM && h < 12) h += 12;
            if (!isPM && h === 12) h = 0;
            sortKey = h;
          } else {
            sortKey = new Date(name).getTime();
          }
          return { name, revenue: value, sortKey };
        }).sort((a, b) => a.sortKey - b.sortKey);
        
        setRevenueData(revData);

        const chartData = Object.entries(itemsMap)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => (b.value as number) - (a.value as number))
          .slice(0, 10);
        setAnalytics(chartData);

        const hoursMap: Record<number, number> = {};
        for (let i = 0; i < 24; i++) hoursMap[i] = 0;
        
        ordersResult.data.forEach((order: any) => {
          const date = new Date(order.created_at);
          const hour = date.getHours();
          hoursMap[hour] = (hoursMap[hour] || 0) + 1;
        });

        const hourlyData = Object.entries(hoursMap).map(([hour, count]) => {
          const h = parseInt(hour);
          const ampm = h >= 12 ? 'مساءً' : 'صباحاً';
          const hour12 = h % 12 || 12;
          return {
            hour: `${hour12} ${ampm}`,
            count,
            rawHour: h
          };
        }).sort((a, b) => a.rawHour - b.rawHour);
        
        setPeakHoursData(hourlyData);
      } else if (ordersResult.error) {
        console.error('Analytics fetch error:', ordersResult.error);
      }
    } catch (err) {
      console.error('Fetch data error:', err);
    }
  };

  const fetchStaff = async (resId?: string) => {
    const targetId = resId || profile?.restaurant_id || restaurant?.id;
    if (!targetId) return;

    const { data: staffData, error: staffError } = await supabase
      .from('profiles')
      .select('*')
      .eq('restaurant_id', targetId)
      .eq('role', 'waiter')
      .order('created_at', { ascending: false });
    
    if (staffData) {
      setStaff(staffData);
      
      // Calculate stats for waiters
      const { data: ordersData } = await supabase
        .from('orders')
        .select('id, waiter_id, created_at, delivered_at')
        .eq('restaurant_id', targetId)
        .eq('status', 'delivered')
        .not('waiter_id', 'is', null)
        .not('delivered_at', 'is', null);

      if (ordersData) {
        const stats: Record<string, { orderCount: number; avgTime: number }> = {};
        const waiterGroups: Record<string, number[]> = {};

        ordersData.forEach(order => {
          if (order.waiter_id) {
            if (!waiterGroups[order.waiter_id]) waiterGroups[order.waiter_id] = [];
            const duration = (new Date(order.delivered_at).getTime() - new Date(order.created_at).getTime()) / (1000 * 60); // in minutes
            waiterGroups[order.waiter_id].push(duration);
          }
        });

        Object.keys(waiterGroups).forEach(wid => {
          const times = waiterGroups[wid];
          stats[wid] = {
            orderCount: times.length,
            avgTime: times.reduce((a, b) => a + b, 0) / times.length
          };
        });
        setWaiterStats(stats);
      }
    } else if (staffError) {
      console.error('Staff fetch error:', staffError);
    }
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const deleteStaff = async (id: string) => {
    try {
      const { data, error } = await supabase.rpc('delete_staff_member', { target_user_id: id });
      
      if (error) {
        // Fallback direct delete from profiles
        const { error: delError } = await supabase.from('profiles').delete().eq('id', id);
        if (delError) {
          alert('فشل في حذف الموظف: ' + (error.message || delError.message));
        } else {
          alert('تم حذف الموظف بنجاح');
          setConfirmDeleteId(null);
          fetchStaff();
        }
      } else if (data && data.success === false) {
        alert('فشل في حذف الموظف: ' + data.message);
      } else {
        alert('تم حذف الموظف بنجاح');
        setConfirmDeleteId(null);
        fetchStaff();
      }
    } catch (err: any) {
      console.error('Unexpected delete error:', err);
      alert('حدث خطأ غير متوقع');
    }
  };

  const [newWaiterEmail, setNewWaiterEmail] = useState('');
  const [newWaiterPassword, setNewWaiterPassword] = useState('');
  const [newWaiterName, setNewWaiterName] = useState('');
  const [isAddingWaiter, setIsAddingWaiter] = useState(false);
  const [addWaiterError, setAddWaiterError] = useState<string | null>(null);
  const [addWaiterSuccess, setAddWaiterSuccess] = useState<string | null>(null);

  const handleAddWaiter = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddWaiterError(null);
    setAddWaiterSuccess(null);
    
    const cleanName = newWaiterName.trim();
    const cleanEmail = newWaiterEmail.trim().toLowerCase();
    const cleanPassword = newWaiterPassword.trim();

    if (!cleanName || !cleanEmail || !cleanPassword) {
      setAddWaiterError('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    if (cleanPassword.length < 6) {
      setAddWaiterError('يجب أن تتكون كلمة المرور من 6 أحرف أو أرقام على الأقل');
      return;
    }

    let targetRestaurantId = profile?.restaurant_id || restaurant?.id;
    if (!targetRestaurantId) {
      const { data: resList } = await supabase.from('restaurants').select('id, name').limit(1);
      if (resList && resList.length > 0) {
        targetRestaurantId = resList[0].id;
      }
    }

    if (!targetRestaurantId) {
      setAddWaiterError('خطأ: لم يتم العثور على مطعم مرتبط بهذا الحساب. يرجى التأكد من وجود مطعم في النظام.');
      return;
    }

    setIsAddingWaiter(true);
    try {
      let created = false;

      // 1. Try server API endpoint /api/create-waiter
      try {
        const response = await fetch('/api/create-waiter', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: cleanName,
            email: cleanEmail,
            password: cleanPassword,
            restaurant_id: targetRestaurantId
          })
        });

        const resData = await response.json();
        if (response.ok && (resData.success || resData.user || resData.user_id)) {
          created = true;
          setAddWaiterSuccess(resData.message || `تمت إضافة النادل "${cleanName}" بنجاح!`);
        } else if (response.status !== 404 && resData.error && !resData.error.includes('SUPABASE_SERVICE_ROLE_KEY')) {
          console.warn('API returned error, trying RPC:', resData.error);
        }
      } catch (apiErr) {
        console.warn('/api/create-waiter unavailable or errored:', apiErr);
      }

      // 2. Fallback to RPC function admin_create_user
      if (!created) {
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc('admin_create_user', {
            new_email: cleanEmail,
            new_password: cleanPassword,
            new_full_name: cleanName,
            new_role: 'waiter',
            new_restaurant_id: targetRestaurantId
          });

          if (!rpcError && rpcData) {
            if (rpcData.success) {
              created = true;
              setAddWaiterSuccess(rpcData.message || `تمت إضافة النادل "${cleanName}" بنجاح!`);
            } else {
              throw new Error(rpcData.message || 'فشل في إضافة النادل');
            }
          }
        } catch (rpcErr: any) {
          console.warn('RPC failed or not found, trying client signup:', rpcErr);
        }
      }

      // 3. Fallback to isolated client signup
      if (!created) {
        const tempAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        });

        const { data: authData, error: authError } = await tempAuthClient.auth.signUp({
          email: cleanEmail,
          password: cleanPassword,
          options: {
            data: {
              full_name: cleanName,
              role: 'waiter',
              restaurant_id: targetRestaurantId,
              restaurant_name: restaurant?.name || profile?.restaurant_name || ''
            }
          }
        });

        if (authError) throw authError;

        if (authData.user) {
          const { error: profileError } = await supabase.from('profiles').upsert({
            id: authData.user.id,
            email: cleanEmail,
            full_name: cleanName,
            role: 'waiter',
            restaurant_id: targetRestaurantId,
            restaurant_name: restaurant?.name || profile?.restaurant_name || null
          });

          if (profileError) {
            console.warn('Profile upsert warning:', profileError);
          }
        }

        setAddWaiterSuccess(`تمت إضافة النادل "${cleanName}" بنجاح! يمكنه تسجيل الدخول الآن.`);
      }
      
      setNewWaiterEmail('');
      setNewWaiterPassword('');
      setNewWaiterName('');
      
      // Refresh staff list immediately
      await fetchStaff(targetRestaurantId);
      setTimeout(() => setAddWaiterSuccess(null), 8000);
    } catch (err: any) {
      console.error('Add waiter error:', err);
      if (err.message?.includes('already registered') || err.message?.includes('User already registered') || err.message?.includes('مسجل مسبقاً')) {
        setAddWaiterError('هذا البريد الإلكتروني مسجل مسبقاً في النظام.');
      } else if (err.message?.includes('rate limit')) {
        setAddWaiterError('لقد تجاوزت الحد المسموح لإرسال الطلبات. يرجى الانتظار دقيقة والمحاولة مرة أخرى.');
      } else {
        setAddWaiterError(err.message || 'فشل في إضافة النادل');
      }
    } finally {
      setIsAddingWaiter(false);
    }
  };

  const fetchCategories = async () => {
    if (!profile?.restaurant_id) return;
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('restaurant_id', profile.restaurant_id)
      .order('sort_order');
    if (data) {
      const filtered = data.filter((cat: any) => 
        !(cat.name_ar === 'مشروبات ساخنة' || cat.name_en === 'Hot Drinks') ||
        products.some((p: any) => p.category_id === cat.id)
      );
      const formatted = filtered.map((cat: any) => ({
        ...cat,
        options: cat.options && cat.options.length > 0 ? cat.options : getLocalCategoryOptions(cat.id, cat.name_ar, cat.name_en)
      }));
      setCategories(formatted);
    }
  };

  const handleCategorySave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCat.en || !newCat.ar || !profile?.restaurant_id) return;
    
    try {
      const { data: createdCat, error } = await supabase
        .from('categories')
        .insert({
          restaurant_id: profile.restaurant_id,
          name_en: newCat.en,
          name_ar: newCat.ar,
          sort_order: categories.length
        })
        .select()
        .single();

      if (error) {
        alert(error.message);
        return;
      }

      if (createdCat && newCatOptions.length > 0) {
        await saveCategoryOptions(createdCat.id, newCatOptions);
      }

      setNewCat({ en: '', ar: '' });
      setNewCatOptions([]);
      fetchCategories();
      fetchData();
    } catch (err: any) {
      console.error('Error saving category:', err);
      alert('حدث خطأ أثناء حفظ التصنيف.');
    }
  };

  const handleProductSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    const payload = {
      ...editingProduct,
      restaurant_id: profile.restaurant_id,
    };

    let savedId = editingProduct.id;

    if (editingProduct.id) {
      await supabase.from('products').update(payload).eq('id', editingProduct.id);
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('products')
        .insert(payload)
        .select('id')
        .single();
      
      if (inserted?.id) {
        savedId = inserted.id;
      }
    }

    if (savedId) {
      await saveProductOptions(savedId, editingProductOptions);
      setServerProductOptions(prev => ({ ...prev, [savedId!]: editingProductOptions }));
    }
    
    setIsProductModalOpen(false);
    setEditingProduct(null);
    setEditingProductOptions([]);
    fetchData();
  };

  const toggleAvailability = async (product: Product) => {
    await supabase
      .from('products')
      .update({ availability: !product.availability })
      .eq('id', product.id);
    fetchData();
  };

  const executeDelete = async () => {
    if (!deleteModalItem) return;
    const { type, id, name } = deleteModalItem;
    setIsDeleting(true);

    try {
      if (type === 'product') {
        // 1. API route
        try {
          await fetch('/api/admin/delete-product', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: id })
          });
        } catch (apiErr) {
          console.warn('API delete product error:', apiErr);
        }

        // 2. Direct Supabase / RPC fallback
        try {
          await supabase.from('order_items').update({ product_id: null }).eq('product_id', id);
          await supabase.from('products').delete().eq('id', id);
        } catch (sbErr) {
          console.warn('Supabase delete product error:', sbErr);
        }

        // Immediate optimistic UI update
        setProducts(prev => prev.filter(p => p.id !== id));
        setDeleteToast(`تم حذف المنتج "${name}" بنجاح.`);
        setTimeout(() => setDeleteToast(null), 3500);
        fetchData();
      } else {
        // Category
        // 1. API route
        try {
          await fetch('/api/admin/delete-category', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category_id: id })
          });
        } catch (apiErr) {
          console.warn('API delete category error:', apiErr);
        }

        // 2. Direct Supabase fallback
        try {
          await supabase.from('products').update({ category_id: null }).eq('category_id', id);
          await supabase.from('categories').delete().eq('id', id);
        } catch (sbErr) {
          console.warn('Supabase delete category error:', sbErr);
        }

        // Immediate optimistic UI update
        setCategories(prev => prev.filter(c => c.id !== id));
        setDeleteToast(`تم حذف التصنيف "${name}" بنجاح.`);
        setTimeout(() => setDeleteToast(null), 3500);
        fetchCategories();
        fetchData();
      }
    } catch (err: any) {
      console.error('Delete execution error:', err);
      setDeleteToast('حدث خطأ أثناء محاولة الحذف.');
      setTimeout(() => setDeleteToast(null), 3500);
    } finally {
      setIsDeleting(false);
      setDeleteModalItem(null);
    }
  };

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const startEditingCategory = (cat: Category) => {
    setEditingCategory(cat);
    const existingOpts = cat.options && cat.options.length > 0 ? cat.options : getLocalCategoryOptions(cat.id, cat.name_ar, cat.name_en);
    setEditingCategoryOptions(existingOpts);
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    try {
      const { error } = await supabase
        .from('categories')
        .update({
          name_en: editingCategory.name_en,
          name_ar: editingCategory.name_ar
        })
        .eq('id', editingCategory.id);
      
      if (error) {
        alert(error.message);
        return;
      }

      await saveCategoryOptions(editingCategory.id, editingCategoryOptions);
      setEditingCategory(null);
      setEditingCategoryOptions([]);
      fetchCategories();
      fetchData();
    } catch (err: any) {
      console.error('Error updating category:', err);
      alert('حدث خطأ أثناء تحديث التصنيف.');
    }
  };

  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [isSavingShift, setIsSavingShift] = useState<string | null>(null);
  const [shiftTimes, setShiftTimes] = useState({ start: '', end: '' });
  const [shiftStatus, setShiftStatus] = useState<{id: string, type: 'success' | 'error', message: string} | null>(null);

  const formatTimeForInput = (time: string | null) => {
    if (!time) return '';
    // Format "08:00:00" to "08:00"
    return time.split(':').slice(0, 2).join(':');
  };

  const saveShift = async (staffId: string) => {
    console.log('saveShift called for:', staffId);
    setShiftStatus(null);

    if (!shiftTimes.start || !shiftTimes.end) {
      setShiftStatus({ id: staffId, type: 'error', message: 'يرجى اختيار الوقت' });
      return;
    }

    setIsSavingShift(staffId);
    try {
      console.log('Updating profiles in supabase...', { staffId, shiftTimes });
      const { error } = await supabase
        .from('profiles')
        .update({
          shift_start: shiftTimes.start,
          shift_end: shiftTimes.end
        })
        .eq('id', staffId);
      
      if (error) throw error;
      
      console.log('Update successful');
      setShiftStatus({ id: staffId, type: 'success', message: 'تم الحفظ!' });
      
      // Auto-close edit mode after a delay
      setTimeout(() => {
        setEditingShiftId(null);
        setShiftStatus(null);
      }, 1500);
      
      fetchStaff();
    } catch (error: any) {
      console.error('Detailed error in saveShift:', error);
      setShiftStatus({ id: staffId, type: 'error', message: error.message || 'فشل الحفظ' });
    } finally {
      setIsSavingShift(null);
    }
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center font-sans">جاري التحميل...</div>;
  if (!profile) return (
    <div className="h-screen flex flex-col items-center justify-center p-6 text-center font-sans">
      <p className="text-gray-600 font-bold mb-4">لم يتم العثور على الملف الشخصي</p>
      <button 
        onClick={() => signOut()}
        className="px-6 py-2.5 bg-orange-500 text-white rounded-xl font-bold shadow-md hover:bg-orange-600 transition-all"
      >
        تسجيل الخروج
      </button>
    </div>
  );

  if (!profile.restaurant_id && profile.role !== 'super_admin') {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center p-6 text-center" dir="rtl">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl border shadow-sm">
          <div className="w-20 h-20 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <LayoutDashboard size={40} />
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-3">الحساب غير مرتبط بمطعم</h2>
          <p className="text-gray-500 font-medium mb-6 leading-relaxed">
            مرحباً {profile.full_name || ''}، حسابك مسجل كمدير ولكن لم يتم ربطه بمطعم بعد. يرجى من مدير النظام تعيين المطعم الخاص بك من جدول الملفات الشخصية (Profiles).
          </p>
          <button 
            onClick={() => signOut()}
            className="flex items-center gap-2 px-6 py-3.5 bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-600 rounded-xl w-full transition-all font-bold justify-center"
          >
            <LogOut size={18} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row" dir="rtl">
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center border border-gray-100 bg-white">
            <img src={qretaLogo} alt="Qrieta Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          </div>
          <span className="font-bold text-lg italic tracking-tighter">Qrieta</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-0 z-40 bg-white transform transition-transform duration-300 md:relative md:translate-x-0 md:flex md:w-64 md:border-l md:shadow-sm flex-col p-6",
        isMobileMenuOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
      )}>
        <div className="hidden md:flex items-center gap-3 mb-10 px-2">
          <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center border border-gray-100 bg-white shadow-sm">
            <img src={qretaLogo} alt="Qrieta Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          </div>
          <span className="font-black text-xl italic tracking-tighter">Qrieta</span>
        </div>

        <nav className="flex-grow space-y-2 mt-4 md:mt-0">
          <a
            href={restaurant?.id ? `/pos?restaurant_id=${restaurant.id}&restaurant_slug=${restaurant.slug}` : '/pos'}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-right bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black shadow-md shadow-blue-500/20 mb-3 group"
          >
            <div className="flex items-center gap-3">
              <MonitorCheck size={20} className="text-blue-200" />
              <span>شاشة الكاشير (POS)</span>
            </div>
            <ExternalLink size={14} className="opacity-70 group-hover:opacity-100 transition-opacity" />
          </a>

          <button 
            onClick={() => { setActiveTab('categories'); setIsMobileMenuOpen(false); }}
            className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-right", activeTab === 'categories' ? "bg-orange-500 text-white font-bold shadow-lg" : "text-gray-500 hover:bg-gray-100")}
          >
            <Tags size={20} />
            <span>التصنيفات</span>
          </button>
          <button 
            onClick={() => { setActiveTab('menu'); setIsMobileMenuOpen(false); }}
            className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-right", activeTab === 'menu' ? "bg-orange-500 text-white font-bold shadow-lg" : "text-gray-500 hover:bg-gray-100")}
          >
            <Package size={20} />
            <span>قائمة الطعام</span>
          </button>
          <button 
            onClick={() => { setActiveTab('tables_qr'); setIsMobileMenuOpen(false); }}
            className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-right", activeTab === 'tables_qr' ? "bg-orange-500 text-white font-bold shadow-lg" : "text-gray-500 hover:bg-gray-100")}
          >
            <QrCode size={20} />
            <span>QR Code الطاولات</span>
          </button>
          <button 
            onClick={() => { setActiveTab('orders'); setIsMobileMenuOpen(false); }}
            className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-right", activeTab === 'orders' ? "bg-orange-500 text-white font-bold shadow-lg" : "text-gray-500 hover:bg-gray-100")}
          >
            <History size={20} />
            <span>سجل الطلبات</span>
            {adminLiveOrders.filter(o => o.status === 'new').length > 0 && (
              <span className="w-5 h-5 rounded-full bg-rose-500 text-white font-mono font-bold text-[10px] flex items-center justify-center mr-auto animate-pulse">
                {adminLiveOrders.filter(o => o.status === 'new').length}
              </span>
            )}
          </button>
          <button 
            onClick={() => { setActiveTab('shifts'); setIsMobileMenuOpen(false); }}
            className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-right", activeTab === 'shifts' ? "bg-orange-500 text-white font-bold shadow-lg" : "text-gray-500 hover:bg-gray-100")}
          >
            <Clock size={20} />
            <span>الورديات وتقارير X/Z</span>
          </button>
          <button 
            onClick={() => { setActiveTab('inventory'); setIsMobileMenuOpen(false); }}
            className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-right", activeTab === 'inventory' ? "bg-orange-500 text-white font-bold shadow-lg" : "text-gray-500 hover:bg-gray-100")}
          >
            <Boxes size={20} />
            <span>المخزون والـ Recipe 🥩</span>
          </button>
          <button 
            onClick={() => { setActiveTab('staff'); setIsMobileMenuOpen(false); }}
            className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-right", activeTab === 'staff' ? "bg-orange-500 text-white font-bold shadow-lg" : "text-gray-500 hover:bg-gray-100")}
          >
            <Users size={20} />
            <span>طاقم العمل</span>
          </button>
          <button 
            onClick={() => { setActiveTab('analytics'); setIsMobileMenuOpen(false); }}
            className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-right", activeTab === 'analytics' ? "bg-orange-500 text-white font-bold shadow-lg" : "text-gray-500 hover:bg-gray-100")}
          >
            <BarChart3 size={20} />
            <span>الإحصائيات</span>
          </button>
          <button 
            onClick={() => { setActiveTab('settings'); setIsMobileMenuOpen(false); }}
            className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-right", activeTab === 'settings' ? "bg-orange-500 text-white font-bold shadow-lg" : "text-gray-500 hover:bg-gray-100")}
          >
            <Settings size={20} />
            <span>الإعدادات</span>
          </button>
          <button 
            onClick={() => { setActiveTab('support'); setIsMobileMenuOpen(false); }}
            className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-right", activeTab === 'support' ? "bg-orange-500 text-white font-bold shadow-lg" : "text-gray-500 hover:bg-gray-100")}
          >
            <Headphones size={20} />
            <span>مشاكل متعلقة بالسيستم</span>
          </button>
        </nav>

        <div className="pt-4 mt-auto border-t">
          <button 
            onClick={() => signOut()}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-right text-red-600 hover:bg-red-50 font-bold"
          >
            <LogOut size={20} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      <main className="flex-grow p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-gray-900 capitalize italic mb-1">
                {activeTab === 'menu' ? 'المنتجات' : 
                 activeTab === 'categories' ? 'التصنيفات' : 
                 activeTab === 'tables_qr' ? 'رموز QR للطاولات' :
                 activeTab === 'shifts' ? 'ورديات الكاشير وتقارير الإغلاق X/Z' :
                 activeTab === 'staff' ? 'الموظفين' : 
                 activeTab === 'orders' ? 'سجل الطلبات الحية والتاريخية' : 
                 activeTab === 'inventory' ? 'إدارة المخزون وتكلفة المواد' :
                 activeTab === 'settings' ? 'إعدادات المطعم' : 
                 activeTab === 'support' ? 'مشاكل متعلقة بالسيستم' : 'التحليلات'}
              </h2>
              {restaurant?.name && (
                <p className="text-xs text-gray-400 font-bold flex items-center gap-1.5">
                  <span>الفرع النشط:</span>
                  <span className="text-gray-700 font-black">{restaurant.name}</span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Multi-Cafe Branch Selector */}
              {availableRestaurants.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setIsMultiCafeSelectorOpen(!isMultiCafeSelectorOpen)}
                    className="flex items-center gap-2 bg-white border border-gray-200 hover:border-orange-500/50 shadow-sm px-3.5 py-2 rounded-2xl transition-all font-bold text-xs text-gray-800 cursor-pointer"
                  >
                    <div className="w-5 h-5 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                      <Store size={12} />
                    </div>
                    <span className="max-w-[120px] truncate">{restaurant?.name || 'اختر الكافيه'}</span>
                    <span className="text-[10px] bg-gray-100 text-gray-600 font-mono px-1.5 py-0.5 rounded-md">
                      {availableRestaurants.length} فروع
                    </span>
                    <ChevronDown size={14} className="text-gray-400" />
                  </button>

                  {isMultiCafeSelectorOpen && (
                    <div className="absolute left-0 sm:right-0 sm:left-auto mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 animate-in fade-in slide-in-from-top-2">
                      <div className="px-3 py-2 text-[11px] font-black text-gray-400 uppercase tracking-wider">
                        الكافيهات المربوطة بالسحابة
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-1">
                        {availableRestaurants.map((res: any) => (
                          <button
                            key={res.id}
                            onClick={() => handleSwitchRestaurant(res.id)}
                            className={cn(
                              "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-right text-xs font-bold transition-all cursor-pointer",
                              restaurant?.id === res.id
                                ? "bg-orange-50 text-orange-600 font-black"
                                : "text-gray-700 hover:bg-gray-50"
                            )}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <Coffee size={14} className={restaurant?.id === res.id ? "text-orange-500" : "text-gray-400"} />
                              <span className="truncate">{res.name}</span>
                            </div>
                            {restaurant?.id === res.id && (
                              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Supabase Cloud Live Status Badge */}
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200/80 px-3 py-2 rounded-2xl text-emerald-700 text-xs font-black shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>سحابة Supabase نشطة</span>
              </div>

              {activeTab === 'menu' && (
                <button 
                  onClick={openAddProductModal}
                  className="bg-gray-900 text-white px-5 py-2.5 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 transition-all shadow-md cursor-pointer text-xs"
                >
                  <Plus size={16} />
                  <span>إضافة منتج</span>
                </button>
              )}
            </div>
          </div>

          {/* Analytics View */}
          {activeTab === 'analytics' && (
            <div className="grid gap-6">
              <div className="bg-white p-6 rounded-3xl border shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex gap-2 bg-gray-100 p-1 rounded-2xl w-full md:w-auto">
                  <button 
                    onClick={() => setAnalyticsMode('daily')}
                    className={cn("flex-grow md:flex-none px-6 py-2 rounded-xl font-bold transition-all", analyticsMode === 'daily' ? "bg-white shadow-sm text-orange-600" : "text-gray-500")}
                  >
                    يومي
                  </button>
                  <button 
                    onClick={() => setAnalyticsMode('weekly')}
                    className={cn("flex-grow md:flex-none px-6 py-2 rounded-xl font-bold transition-all", analyticsMode === 'weekly' ? "bg-white shadow-sm text-orange-600" : "text-gray-500")}
                  >
                    أسبوعي
                  </button>
                  <button 
                    onClick={() => setAnalyticsMode('monthly')}
                    className={cn("flex-grow md:flex-none px-6 py-2 rounded-xl font-bold transition-all", analyticsMode === 'monthly' ? "bg-white shadow-sm text text-orange-600" : "text-gray-500")}
                  >
                    شهري
                  </button>
                </div>
                <div className="flex items-center gap-4 w-full md:w-auto">
                  <span className="font-bold text-gray-400">التاريخ:</span>
                  <input 
                    type={analyticsMode === 'monthly' ? "month" : "date"}
                    value={analyticsMode === 'monthly' ? selectedDate.substring(0, 7) : selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="flex-grow md:flex-none bg-gray-50 border px-6 py-2 rounded-2xl outline-none font-bold"
                  />
                </div>
              </div>

              {analyticsMode === 'weekly' && (
                <div className="bg-orange-50 border border-orange-100 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                  <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white shadow-sm">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-0.5">النطاق الزمني الأسبوعي (السبت - الجمعة)</p>
                    <p className="text-sm font-black text-orange-700">
                      {(() => {
                        const d = new Date(selectedDate);
                        const day = d.getDay();
                        const diff = (day + 1) % 7;
                        const start = new Date(d);
                        start.setDate(d.getDate() - diff);
                        const end = new Date(start);
                        end.setDate(start.getDate() + 6);
                        return `من ${start.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })} إلى ${end.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}`;
                      })()}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-3xl border shadow-sm text-right">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><TrendingUp /></div>
                    <span className="text-gray-500 font-bold uppercase tracking-widest text-xs">عدد الطلبات</span>
                  </div>
                  <p className="text-4xl font-black">{orderCount}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl border shadow-sm text-right">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-green-50 text-green-600 rounded-2xl"><Package /></div>
                    <span className="text-gray-500 font-bold uppercase tracking-widest text-xs">الأصناف المباعة</span>
                  </div>
                  <p className="text-4xl font-black">{itemSoldCount}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl border shadow-sm text-right">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl"><DollarSign /></div>
                    <span className="text-gray-500 font-bold uppercase tracking-widest text-xs">الإيرادات</span>
                  </div>
                  <p className="text-4xl font-black">{formatCurrency(totalRevenue)}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl border shadow-sm text-right">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl"><Coffee /></div>
                    <span className="text-gray-500 font-bold uppercase tracking-widest text-xs">الأصناف المتاحة</span>
                  </div>
                  <p className="text-4xl font-black">{products.length}</p>
                </div>
              </div>

              <div className="bg-white pt-8 pb-4 rounded-3xl border shadow-sm overflow-hidden">
                <h3 className="text-xl font-bold mb-8 px-8 text-right">تحليل الإيرادات اليومية</h3>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueData} margin={{ top: 0, right: 10, left: 30, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} width={60} tick={{ dx: -10 }} />
                      <Tooltip cursor={{fill: '#8b5cf610'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                      <Bar dataKey="revenue" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white pt-8 pb-4 rounded-3xl border shadow-sm overflow-hidden">
                  <h3 className="text-xl font-bold mb-8 px-8 text-right">أكثر الأصناف طلباً</h3>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics} margin={{ top: 0, right: 10, left: 30, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} />
                        <YAxis axisLine={false} tickLine={false} width={60} tick={{ dx: -10 }} />
                        <Tooltip cursor={{fill: '#f9731610'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="value" fill="#f97316" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white pt-8 pb-4 rounded-3xl border shadow-sm overflow-hidden">
                  <h3 className="text-xl font-bold mb-8 px-8 text-right">تحليل ساعات الذروة (عدد الطلبات)</h3>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={peakHoursData} margin={{ top: 0, right: 10, left: 30, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis 
                          dataKey="hour" 
                          axisLine={false} 
                          tickLine={false} 
                          interval={2}
                          tickFormatter={(value) => {
                            const hour = parseInt(value);
                            const period = hour >= 12 ? 'م' : 'ص';
                            const displayHour = hour % 12 || 12;
                            return `${displayHour} ${period}`;
                          }}
                          style={{ fontSize: '10px', fontWeight: 'bold' }}
                        />
                        <YAxis axisLine={false} tickLine={false} allowDecimals={false} width={60} tick={{ dx: -10 }} />
                        <Tooltip 
                          cursor={{fill: '#3b82f610'}} 
                          contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}}
                          labelFormatter={(value) => {
                            const hour = parseInt(value);
                            const period = hour >= 12 ? 'م' : 'ص';
                            const displayHour = hour % 12 || 12;
                            return `${displayHour}:00 ${period}`;
                          }}
                        />
                        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Orders View */}
          {activeTab === 'orders' && (
            <div className="grid gap-8">
              {/* 📊 1. Excel Export Center */}
              <div className="bg-gradient-to-br from-emerald-900/5 via-emerald-50/50 to-white rounded-[32px] p-6 md:p-8 border border-emerald-200/80 shadow-lg space-y-6 text-right">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-emerald-100 pb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/25">
                      <FileSpreadsheet size={26} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-black text-gray-900">تصدير سجل الطلبات إلى Excel (.xlsx)</h3>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-black">
                          تقارير إكسيل
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 font-medium mt-0.5">
                        حدد التواريخ التي تريدها لاستخراج شيت إكسيل شامل بجميع الفواتير والأصناف والعملاء جاهز للحفظ والطباعة
                      </p>
                    </div>
                  </div>

                  {/* Preset date buttons */}
                  <div className="flex flex-wrap gap-1.5 bg-white/80 p-1.5 rounded-2xl border border-emerald-100 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setExcelPreset('today')}
                      className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-all cursor-pointer"
                    >
                      اليوم
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcelPreset('yesterday')}
                      className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-all cursor-pointer"
                    >
                      أمس
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcelPreset('last7')}
                      className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-all cursor-pointer"
                    >
                      آخر 7 أيام
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcelPreset('thisMonth')}
                      className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-all cursor-pointer"
                    >
                      هذا الشهر
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcelPreset('lastMonth')}
                      className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-all cursor-pointer"
                    >
                      الشهر الماضي
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcelPreset('allTime')}
                      className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-all cursor-pointer"
                    >
                      كامل السجل
                    </button>
                  </div>
                </div>

                {/* Controls Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                  <div>
                    <label className="block text-xs font-black text-gray-700 mb-1.5">من تاريخ:</label>
                    <input
                      type="date"
                      value={excelStartDate}
                      onChange={(e) => setExcelStartDate(e.target.value)}
                      className="w-full bg-white border border-emerald-200 px-4 py-2.5 rounded-2xl outline-none font-bold text-sm text-gray-800 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-gray-700 mb-1.5">إلى تاريخ:</label>
                    <input
                      type="date"
                      value={excelEndDate}
                      onChange={(e) => setExcelEndDate(e.target.value)}
                      className="w-full bg-white border border-emerald-200 px-4 py-2.5 rounded-2xl outline-none font-bold text-sm text-gray-800 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-gray-700 mb-1.5">تصفية حالة الطلب:</label>
                    <select
                      value={excelStatusFilter}
                      onChange={(e) => setExcelStatusFilter(e.target.value as any)}
                      className="w-full bg-white border border-emerald-200 px-4 py-2.5 rounded-2xl outline-none font-bold text-sm text-gray-800 focus:ring-2 focus:ring-emerald-500/20 shadow-sm cursor-pointer"
                    >
                      <option value="all">جميع الحالات (الكل)</option>
                      <option value="delivered">الطلبات المسلمة والناجحة فقط</option>
                      <option value="preparing">قيد التحضير</option>
                      <option value="new">جديد</option>
                      <option value="cancelled">الملغية فقط</option>
                    </select>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={handleExportExcelByDate}
                      disabled={isExportingExcel}
                      className="w-full py-2.5 px-6 bg-emerald-600 hover:bg-emerald-700 active:scale-98 disabled:opacity-50 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
                    >
                      {isExportingExcel ? (
                        <>
                          <RefreshCw size={18} className="animate-spin" />
                          <span>جاري إنشاء الإكسيل...</span>
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet size={18} />
                          <span>تحميل شيت Excel (.xlsx)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Export Success Toast Banner */}
                {excelExportToast && (
                  <div className="bg-emerald-100/80 border border-emerald-300 text-emerald-900 px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                      <span>{excelExportToast}</span>
                    </div>
                    <button
                      onClick={() => setExcelExportToast(null)}
                      className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* 📋 2. The Unified Orders Sheet (الشيت وسجل الطلبات المتكامل) */}
              <div className="bg-white rounded-[32px] p-6 md:p-8 border border-gray-100 shadow-xl space-y-6">
                {/* Header with Title & Quick Export */}
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-gray-100 pb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/25">
                      <History size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-black text-gray-900">شيت وسجل الطلبات المتكامل</h3>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span>بث وتحديث مباشر</span>
                        </span>
                        <span className="text-xs text-gray-400 font-bold mr-1">
                          ({displayedSheetOrders.length} طلب)
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 font-medium mt-0.5">
                        عرض جدولي متكامل لجميع الطلبات الصادرة من كاشير الفرع وتطبيق الزبائن مع إمكانية البحث والتصفية وتحديث الحالة فوراً
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                    {/* Quick export of currently visible sheet */}
                    <button
                      type="button"
                      onClick={handleExportCurrentSheet}
                      className="flex-1 sm:flex-none px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      title="تصدير الشيت الحالي المفلتر المعروض على الشاشة فوراً"
                    >
                      <Download size={14} />
                      <span>تصدير الشيت المعروض</span>
                    </button>

                    {/* Instant refresh */}
                    <button
                      type="button"
                      onClick={() => {
                        if (restaurant?.id) {
                          fetchLiveOrders(restaurant.id).then(setAdminLiveOrders);
                          fetchData();
                        }
                      }}
                      className="flex-1 sm:flex-none px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl border border-gray-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RefreshCw size={14} className={isUpdatingOrderStatus ? "animate-spin" : ""} />
                      <span>تحديث فوري</span>
                    </button>
                  </div>
                </div>

                {/* 📊 Compact KPI Stat Strip for the Sheet */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="bg-gray-50 border border-gray-100 p-3.5 rounded-2xl">
                    <span className="text-[10px] font-black text-gray-400 block mb-0.5">إجمالي الطلبات</span>
                    <p className="text-xl font-black text-gray-900 font-mono">{displayedSheetOrders.length}</p>
                    <span className="text-[10px] text-gray-400 font-medium">طلب مسجل</span>
                  </div>

                  <div className="bg-emerald-50/60 border border-emerald-100 p-3.5 rounded-2xl">
                    <span className="text-[10px] font-black text-emerald-600 block mb-0.5">إجمالي المبيعات</span>
                    <p className="text-lg font-black text-emerald-900">
                      {formatCurrency(displayedSheetOrders.reduce((sum, o) => sum + Number(o.total_price || 0), 0))}
                    </p>
                    <span className="text-[10px] text-emerald-600/80 font-medium">قيمة الفواتير</span>
                  </div>

                  <div className="bg-purple-50/60 border border-purple-100 p-3.5 rounded-2xl">
                    <span className="text-[10px] font-black text-purple-600 block mb-0.5">تطبيق الزبائن</span>
                    <p className="text-xl font-black text-purple-900 font-mono">
                      {toEnglishDigits(displayedSheetOrders.filter(o => o.source === 'customer_app').length)}
                    </p>
                    <span className="text-[10px] text-purple-600/80 font-medium">طلب أونلاين</span>
                  </div>

                  <div className="bg-amber-50/60 border border-amber-100 p-3.5 rounded-2xl">
                    <span className="text-[10px] font-black text-amber-600 block mb-0.5">بيع مباشر من الكاشير</span>
                    <p className="text-xl font-black text-amber-900 font-mono">
                      {toEnglishDigits(displayedSheetOrders.filter(o => o.source === 'cashier_pos').length)}
                    </p>
                    <span className="text-[10px] text-amber-600/80 font-medium">فاتورة كاشير</span>
                  </div>

                  <div className="bg-blue-50/60 border border-blue-100 p-3.5 rounded-2xl">
                    <span className="text-[10px] font-black text-blue-600 block mb-0.5">طلبات الصالة</span>
                    <p className="text-xl font-black text-blue-900 font-mono">
                      {toEnglishDigits(displayedSheetOrders.filter(o => o.order_type === 'dine_in').length)}
                    </p>
                    <span className="text-[10px] text-blue-600/80 font-medium">طاولات</span>
                  </div>

                  <div className="bg-teal-50/60 border border-teal-100 p-3.5 rounded-2xl">
                    <span className="text-[10px] font-black text-teal-600 block mb-0.5">طلبات دليفري</span>
                    <p className="text-xl font-black text-teal-900 font-mono">
                      {toEnglishDigits(displayedSheetOrders.filter(o => o.order_type === 'delivery').length)}
                    </p>
                    <span className="text-[10px] text-teal-600/80 font-medium">توصيل منزلي</span>
                  </div>

                  <div className="bg-orange-50/60 border border-orange-100 p-3.5 rounded-2xl">
                    <span className="text-[10px] font-black text-orange-600 block mb-0.5">طلبات تيك أواي</span>
                    <p className="text-xl font-black text-orange-900 font-mono">
                      {toEnglishDigits(displayedSheetOrders.filter(o => o.order_type === 'takeaway').length)}
                    </p>
                    <span className="text-[10px] text-orange-600/80 font-medium">سفري / استلام</span>
                  </div>
                </div>

                {/* 🔍 Filter & Search Bar */}
                <div className="space-y-4 pt-2 border-t border-gray-100">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    {/* Search box */}
                    <div className="relative w-full md:w-80">
                      <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={ordersSearchTerm}
                        onChange={(e) => setOrdersSearchTerm(e.target.value)}
                        placeholder="بحث برقم الطلب، العميل، الهاتف، أو الصنف..."
                        className="w-full bg-gray-50 border border-gray-200 pr-10 pl-4 py-2.5 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all"
                      />
                      {ordersSearchTerm && (
                        <button
                          type="button"
                          onClick={() => setOrdersSearchTerm('')}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {/* Date mode & picker */}
                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => setAnalyticsMode('daily')}
                          className={cn("flex-1 sm:flex-none px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer", analyticsMode === 'daily' ? "bg-white shadow-sm text-orange-600" : "text-gray-500")}
                        >
                          يومي
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnalyticsMode('weekly')}
                          className={cn("flex-1 sm:flex-none px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer", analyticsMode === 'weekly' ? "bg-white shadow-sm text-orange-600" : "text-gray-500")}
                        >
                          أسبوعي
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnalyticsMode('monthly')}
                          className={cn("flex-1 sm:flex-none px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer", analyticsMode === 'monthly' ? "bg-white shadow-sm text-orange-600" : "text-gray-500")}
                        >
                          شهري
                        </button>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <input
                          type={analyticsMode === 'monthly' ? "month" : "date"}
                          value={analyticsMode === 'monthly' ? selectedDate.substring(0, 7) : selectedDate}
                          onChange={(e) => setSelectedDate(e.target.value)}
                          className="w-full sm:w-auto bg-gray-50 border border-gray-200 px-4 py-2 rounded-2xl outline-none font-bold text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Filter Pills: Classification & Sub-types */}
                  <div className="space-y-2.5 pt-2">
                    {/* Primary Classification: بيع مباشر من الكاشير vs تطبيق الزبائن */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black text-gray-700 ml-1">التصنيف:</span>
                      {[
                        { id: 'all', label: 'الكل' },
                        { id: 'cashier_pos', label: '🏬 بيع مباشر من الكاشير' },
                        { id: 'customer_app', label: '📱 تطبيق الزبائن' },
                      ].map(tab => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setOrdersSourceFilter(tab.id as any)}
                          className={cn(
                            "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer",
                            ordersSourceFilter === tab.id
                              ? "bg-gray-900 text-white shadow-sm ring-2 ring-gray-900/20"
                              : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                          )}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Sub-classification: صالة وانهي طاولة / دليفري / تيك أواي */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-black text-gray-500 ml-1">نوع الطلب:</span>
                        {[
                          { id: 'all', label: 'الكل' },
                          { id: 'dine_in', label: '🍽️ صالة' },
                          { id: 'delivery', label: '🛵 دليفري' },
                          { id: 'takeaway', label: '🛍️ تيك أواي (سفري)' },
                        ].map(typeTab => (
                          <button
                            key={typeTab.id}
                            type="button"
                            onClick={() => setOrdersTypeFilter(typeTab.id as any)}
                            className={cn(
                              "px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer",
                              ordersTypeFilter === typeTab.id
                                ? "bg-orange-500 text-white shadow-xs"
                                : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                            )}
                          >
                            {typeTab.label}
                          </button>
                        ))}
                      </div>

                      {/* Status Filters */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-black text-gray-500 ml-1">الحالة:</span>
                        {[
                          { id: 'all', label: 'الكل' },
                          { id: 'new', label: 'جديد' },
                          { id: 'preparing', label: 'قيد التحضير' },
                          { id: 'ready', label: 'جاهز' },
                          { id: 'delivered', label: 'تم التسليم' },
                          { id: 'cancelled', label: 'ملغي' },
                        ].map(tab => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setOrdersStatusFilter(tab.id as any)}
                            className={cn(
                              "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer",
                              ordersStatusFilter === tab.id
                                ? "bg-orange-600 text-white shadow-sm"
                                : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                            )}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 📋 The Sheet Table */}
                <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
                  <div className="overflow-x-auto text-right">
                    <table className="w-full min-w-[900px] border-collapse">
                      <thead className="bg-gray-50/90 border-b border-gray-200 text-gray-600 text-xs font-black uppercase tracking-wider">
                        <tr>
                          <th className="px-5 py-3.5">رقم الطلب والوقت</th>
                          <th className="px-5 py-3.5">التصنيف والنوع</th>
                          <th className="px-5 py-3.5">اسم الكاشير والدفع</th>
                          <th className="px-5 py-3.5">العميل / التوصيل</th>
                          <th className="px-5 py-3.5">الأصناف والكميات</th>
                          <th className="px-5 py-3.5">قيمة الفاتورة</th>
                          <th className="px-5 py-3.5">حالة الطلب</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-sm">
                        {displayedSheetOrders.map((order) => {
                          const dateObj = new Date(order.created_at || Date.now());
                          const timeStr = toEnglishDigits(dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
                          const dateStr = toEnglishDigits(dateObj.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }));
                          const rawOrderNum = order.daily_order_number || getDisplayOrderNumber(order);
                          const orderNum = toEnglishDigits(rawOrderNum);

                          // Normalize items
                          const itemsList: Array<{ name: string; quantity: number; price?: number; notes?: string }> = [];
                          if (Array.isArray(order.order_items) && order.order_items.length > 0) {
                            order.order_items.forEach((it: any) => {
                              itemsList.push({
                                name: it.products?.name_ar || it.products?.name_en || 'صنف',
                                quantity: it.quantity || 1,
                                price: it.unit_price,
                                notes: it.notes
                              });
                            });
                          } else if (Array.isArray(order.live_items) && order.live_items.length > 0) {
                            order.live_items.forEach((it: any) => {
                              itemsList.push({
                                name: it.name || 'صنف',
                                quantity: it.quantity || 1,
                                price: it.price,
                                notes: it.notes
                              });
                            });
                          }

                          const tableNumDisplay = toEnglishDigits(order.table_number || order.tables?.table_number || 'عامة');

                          return (
                            <tr 
                              key={String(order.id)} 
                              onClick={() => setSelectedOrderForDetails(order)}
                              className="hover:bg-orange-50/40 transition-colors cursor-pointer"
                              title="انقر لعرض تفاصيل الطلب والفاتورة الكاملة"
                            >
                              {/* 1. Order Number & Time (English Digits) */}
                              <td className="px-5 py-3.5 align-middle">
                                <div className="flex items-center gap-2">
                                  <span className="w-10 h-10 rounded-xl bg-orange-100 text-orange-800 font-black text-sm flex items-center justify-center font-mono shadow-xs">
                                    #{orderNum}
                                  </span>
                                  <div>
                                    <div className="font-bold text-gray-900 text-xs flex items-center gap-1 font-mono">
                                      <Clock size={12} className="text-gray-400" />
                                      <span>{timeStr}</span>
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-medium font-mono">{dateStr}</span>
                                  </div>
                                </div>
                              </td>

                              {/* 2. Classification & Type (بيع مباشر من الكاشير / تطبيق الزبائن + صالة/طاولة/دليفري/تيك اواي) */}
                              <td className="px-5 py-3.5 align-middle">
                                <div className="space-y-1">
                                  {order.source === 'customer_app' ? (
                                    <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-lg text-[10px] font-black">
                                      <Smartphone size={10} />
                                      <span>تطبيق الزبائن</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-lg text-[10px] font-black">
                                      <Store size={10} />
                                      <span>بيع مباشر من الكاشير</span>
                                    </span>
                                  )}

                                  <div>
                                    {order.order_type === 'dine_in' ? (
                                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200/60 px-2 py-0.5 rounded-lg text-[10px] font-black">
                                        <Coffee size={10} />
                                        <span>صالة - طاولة {tableNumDisplay}</span>
                                      </span>
                                    ) : order.order_type === 'delivery' ? (
                                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2 py-0.5 rounded-lg text-[10px] font-black">
                                        <Bike size={10} />
                                        <span>دليفري (توصيل)</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 border border-gray-200/60 px-2 py-0.5 rounded-lg text-[10px] font-black">
                                        <span>🛍️ سفري (تيك أواي)</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* 3. Cashier Name & Payment Method */}
                              <td className="px-5 py-3.5 align-middle">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 text-xs font-black text-gray-800">
                                    <span className="text-amber-600 text-sm">👤</span>
                                    <span className="truncate max-w-[130px]" title={order.cashier_name || (order.source === 'customer_app' ? 'تطبيق الزبائن (أونلاين)' : 'كاشير 1')}>
                                      {order.cashier_name || (order.source === 'customer_app' ? 'تطبيق الزبائن (أونلاين)' : 'كاشير 1')}
                                    </span>
                                  </div>
                                  <div>
                                    {order.payment_method === 'card' ? (
                                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200/70 px-2 py-0.5 rounded-lg text-[10px] font-black">
                                        <span>💳 فيزا</span>
                                      </span>
                                    ) : order.payment_method === 'wallet' ? (
                                      <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200/70 px-2 py-0.5 rounded-lg text-[10px] font-black">
                                        <span>📱 إنستاباي</span>
                                      </span>
                                    ) : order.payment_method === 'split' ? (
                                      <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 border border-orange-200/70 px-2 py-0.5 rounded-lg text-[10px] font-black">
                                        <span>🔄 مقسّم</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200/70 px-2 py-0.5 rounded-lg text-[10px] font-black">
                                        <span>💵 كاش</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* 4. Customer Info (English Digits) */}
                              <td className="px-5 py-3.5 align-middle">
                                <div className="space-y-0.5">
                                  <p className="font-black text-xs text-gray-900">
                                    {order.customer_name || 'عميل الفرع'}
                                  </p>
                                  {order.customer_phone ? (
                                    <a
                                      href={`tel:${order.customer_phone}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-[11px] font-bold text-orange-600 hover:underline font-mono block"
                                      dir="ltr"
                                    >
                                      {toEnglishDigits(order.customer_phone)}
                                    </a>
                                  ) : null}
                                  {order.delivery_address && (
                                    <p className="text-[10px] text-gray-500 truncate max-w-[180px]" title={order.delivery_address}>
                                      📍 {order.delivery_address}
                                    </p>
                                  )}
                                </div>
                              </td>

                              {/* 5. Items summary (English Digits) */}
                              <td className="px-5 py-3.5 align-middle">
                                <div className="flex flex-wrap gap-1 max-w-[240px]">
                                  {itemsList.slice(0, 3).map((it, idx) => (
                                    <span
                                      key={idx}
                                      className="bg-orange-50 group-hover:bg-orange-100 text-orange-700 border border-orange-200/60 text-[10px] px-2 py-0.5 rounded-md font-bold transition-colors font-mono"
                                    >
                                      {toEnglishDigits(it.quantity)}x {it.name}
                                    </span>
                                  ))}
                                  {itemsList.length > 3 && (
                                    <span className="bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5 rounded-md font-bold font-mono">
                                      +{toEnglishDigits(itemsList.length - 3)} آخرين
                                    </span>
                                  )}
                                  {itemsList.length === 0 && (
                                    <span className="text-gray-400 text-xs">لا توجد أصناف</span>
                                  )}
                                </div>
                              </td>

                              {/* 6. Total Price & Payment Status (English Digits) */}
                              <td className="px-5 py-3.5 align-middle">
                                <p className="font-black text-gray-900 text-sm font-mono">
                                  {formatCurrency(order.total_price)}
                                </p>
                                <span className={cn(
                                  "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                  order.payment_status === 'paid' || order.status === 'delivered' || order.status === 'completed'
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-amber-50 text-amber-700"
                                )}>
                                  {order.payment_status === 'paid' || order.status === 'delivered' || order.status === 'completed' ? 'مدفوع ✓' : 'غير مدفوع'}
                                </span>
                              </td>

                              {/* 7. Status Badge */}
                              <td className="px-5 py-3.5 align-middle">
                                <span className={cn(
                                  "px-2.5 py-1 rounded-xl text-[11px] font-black inline-block border",
                                  order.status === 'delivered' || order.status === 'completed'
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : order.status === 'preparing'
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : order.status === 'ready'
                                    ? "bg-purple-50 text-purple-700 border-purple-200 animate-pulse"
                                    : order.status === 'cancelled'
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : "bg-amber-50 text-amber-800 border-amber-200 animate-pulse"
                                )}>
                                  {order.status === 'new' ? 'جديد 📥' :
                                   order.status === 'preparing' ? 'قيد التحضير 👨‍🍳' :
                                   order.status === 'ready' ? 'جاهز للتسليم 🔔' :
                                   order.status === 'delivered' || order.status === 'completed' ? 'تم التسليم ✅' : 'ملغي ❌'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}

                        {displayedSheetOrders.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-6 py-16 text-center text-gray-400">
                              <History size={40} className="mx-auto text-gray-300 mb-2" />
                              <p className="font-bold text-gray-600 text-sm">لا توجد طلبات تطابق معايير التصفية المحددة</p>
                              <p className="text-xs text-gray-400 mt-1">جرّب تغيير التاريخ أو اختيار "الكل" لعرض الطلبات</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* 🔍 3. Order Details Modal */}
              {selectedOrderForDetails && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                  <div className="bg-white rounded-[32px] p-6 md:p-8 max-w-lg w-full border shadow-2xl space-y-5 animate-in fade-in zoom-in-95 text-right">
                    <div className="flex items-center justify-between border-b pb-4">
                      <div className="flex items-center gap-2">
                        <span className="w-10 h-10 rounded-2xl bg-orange-100 text-orange-700 font-black text-base flex items-center justify-center font-mono">
                          #{selectedOrderForDetails.daily_order_number || getDisplayOrderNumber(selectedOrderForDetails)}
                        </span>
                        <div>
                          <h4 className="font-black text-gray-900 text-base">تفاصيل الفاتورة والطلب</h4>
                          <span className="text-xs text-gray-400">
                            {new Date(selectedOrderForDetails.created_at || Date.now()).toLocaleString('ar-EG')}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedOrderForDetails(null)}
                        className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {/* Customer & Type Overview */}
                    <div className="bg-gray-50 p-4 rounded-2xl space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-bold">المصدر:</span>
                        <span className="font-black text-gray-800">
                          {selectedOrderForDetails.source === 'customer_app' ? '📱 تطبيق الزبائن (أونلاين)' : '🏬 كاشير الفرع (POS)'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-bold">الكاشير المسؤول:</span>
                        <span className="font-black text-amber-700">
                          👤 {selectedOrderForDetails.cashier_name || 'كاشير الفرع'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-bold">طريقة الدفع:</span>
                        <span className="font-black text-gray-900">
                          {selectedOrderForDetails.payment_method === 'card' ? '💳 بطاقة بنكية / فيزا' :
                           selectedOrderForDetails.payment_method === 'wallet' ? '📱 إنستاباي / محفظة إلكترونية' :
                           selectedOrderForDetails.payment_method === 'split' ? '🔄 دفع مجزأ (مقسم)' : '💵 نقداً (كاش)'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-bold">النوع:</span>
                        <span className="font-black text-gray-800">
                          {selectedOrderForDetails.order_type === 'dine_in'
                            ? `🍽️ صالة - طاولة ${selectedOrderForDetails.tables?.table_number || selectedOrderForDetails.table_number || 'عامة'}`
                            : selectedOrderForDetails.order_type === 'delivery'
                            ? '🛵 دليفري (توصيل منزلي)'
                            : '🛍️ سفري (تيك أواي)'}
                        </span>
                      </div>
                      {selectedOrderForDetails.customer_name && (
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-bold">اسم العميل:</span>
                          <span className="font-black text-gray-800">{selectedOrderForDetails.customer_name}</span>
                        </div>
                      )}
                      {selectedOrderForDetails.customer_phone && (
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-bold">رقم الهاتف:</span>
                          <span className="font-black text-orange-600 font-mono" dir="ltr">{selectedOrderForDetails.customer_phone}</span>
                        </div>
                      )}
                      {selectedOrderForDetails.delivery_address && (
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-bold">عنوان التوصيل:</span>
                          <span className="font-black text-gray-800">{selectedOrderForDetails.delivery_address}</span>
                        </div>
                      )}
                      {selectedOrderForDetails.notes && (
                        <div className="pt-2 border-t border-gray-200">
                          <span className="text-gray-500 font-bold block mb-0.5">ملاحظات الطلب:</span>
                          <span className="text-gray-700 font-medium">{selectedOrderForDetails.notes}</span>
                        </div>
                      )}
                    </div>

                    {/* Itemized Table */}
                    <div>
                      <h5 className="font-black text-xs text-gray-700 mb-2">الأصناف والوجبات المطلوبة:</h5>
                      <div className="border rounded-2xl overflow-hidden divide-y divide-gray-100">
                        {(() => {
                          const items: any[] = [];
                          if (Array.isArray(selectedOrderForDetails.order_items)) {
                            selectedOrderForDetails.order_items.forEach((it: any) => items.push({
                              name: it.products?.name_ar || it.products?.name_en || 'صنف',
                              qty: it.quantity || 1,
                              price: it.unit_price || it.products?.price || 0,
                              notes: it.notes
                            }));
                          } else if (Array.isArray(selectedOrderForDetails.live_items)) {
                            selectedOrderForDetails.live_items.forEach((it: any) => items.push({
                              name: it.name || 'صنف',
                              qty: it.quantity || 1,
                              price: it.price || 0,
                              notes: it.notes
                            }));
                          }

                          return items.map((it, i) => (
                            <div key={i} className="p-3 flex items-center justify-between text-xs bg-white">
                              <div>
                                <span className="font-black text-gray-900">{it.qty}x {it.name}</span>
                                {it.notes && <p className="text-[10px] text-gray-400 mt-0.5">{it.notes}</p>}
                              </div>
                              <span className="font-black text-gray-700 font-mono">
                                {it.price ? formatCurrency(it.price * it.qty) : '-'}
                              </span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>

                    {/* Total */}
                    <div className="bg-orange-50 border border-orange-100 p-4 rounded-2xl flex items-center justify-between">
                      <span className="font-black text-gray-900 text-sm">إجمالي الفاتورة:</span>
                      <span className="font-black text-orange-600 text-xl font-mono">
                        {formatCurrency(selectedOrderForDetails.total_price)}
                      </span>
                    </div>

                    {/* Action buttons inside modal */}
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          handleAdminUpdateOrderStatus(selectedOrderForDetails.id, 'completed');
                          setSelectedOrderForDetails(null);
                        }}
                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-colors cursor-pointer"
                      >
                        تسليم الطلب واعتماده ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedOrderForDetails(null)}
                        className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      >
                        إغلاق
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Menu Items View */}
          {activeTab === 'menu' && (
            <div className="bg-white rounded-3xl border shadow-sm overflow-x-auto text-right mb-10">
              <table className="w-full min-w-[700px]">
                <thead className="bg-gray-50 text-gray-500 text-xs font-black uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4">المنتج</th>
                    <th className="px-6 py-4">السعر</th>
                    <th className="px-6 py-4">التصنيف</th>
                    <th className="px-6 py-4 text-center">الحالة</th>
                    <th className="px-6 py-4 text-left">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {products.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100/80 text-orange-600 flex items-center justify-center font-black text-base shadow-sm shrink-0">
                            <Coffee size={22} className="text-orange-500" />
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-900">{p.name_ar}</p>
                            <p className="text-xs text-gray-400">{p.name_en}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold">{formatCurrency(p.price)}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {categories.find(c => c.id === p.category_id)?.name_ar || 'غير مصنف'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center">
                          <button 
                            onClick={() => toggleAvailability(p)}
                            className={cn(
                              "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold transition-all",
                              p.availability ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"
                            )}
                          >
                            {p.availability ? <Eye size={14}/> : <EyeOff size={14}/>}
                            {p.availability ? 'متاح' : 'معطل'}
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-left">
                        <div className="flex items-center justify-start gap-2">
                          <button 
                            type="button"
                            onClick={() => openEditProductModal(p)}
                            className="p-2.5 hover:bg-orange-50 text-gray-400 hover:text-orange-600 rounded-xl transition-colors cursor-pointer"
                            title={isRTL ? "تعديل" : "Edit"}
                          >
                            <Edit size={18} />
                          </button>
                          <button 
                            type="button"
                            onClick={() => {
                              setDeleteModalItem({
                                type: 'product',
                                id: p.id,
                                name: p.name_ar || p.name_en || 'هذا المنتج'
                              });
                            }}
                            className="p-2.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl border border-red-100 transition-all shadow-sm flex items-center justify-center cursor-pointer active:scale-95"
                            title={isRTL ? "حذف المنتج" : "Delete Product"}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tables QR Codes View (Read-Only for Restaurant Admin) */}
          {activeTab === 'tables_qr' && (
            <div className="space-y-8 text-right animate-in fade-in duration-300">
              {/* Delivery / Direct Menu QR Card (Permanent & Highlighted) */}
              {(() => {
                const deliveryUrl = `${window.location.origin}/r/${restaurant?.slug || profile?.restaurant_id}`;
                return (
                  <div className="bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900 text-white rounded-3xl md:rounded-[36px] p-6 md:p-10 shadow-2xl relative overflow-hidden border border-purple-400/20">
                    <div className="absolute top-0 left-0 -mt-12 -ml-12 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute bottom-0 right-0 -mb-12 -mr-12 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

                    <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8">
                      <div className="space-y-4 max-w-xl text-right">
                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-purple-500/30 border border-purple-400/30 rounded-full text-xs font-black text-purple-200">
                          <Bike size={16} className="text-purple-300" />
                          <span>رمز QR ورابط الدليفري والطلبات الخارجية</span>
                        </div>

                        <h3 className="text-2xl md:text-3xl font-black text-white leading-snug">
                          رابط و QR كود الدليفري المباشر
                        </h3>

                        <p className="text-sm text-purple-200/90 leading-relaxed font-medium">
                          هذا الرمز والرابط مخصصان لطلبات الدليفري والطلبات الخارجية. يعمل من أي مكان (بدون قيود النطاق الجغرافي للمطعم)، وتُحسب الطلبات فيه تلقائياً بدون رسوم خدمة الصالة (0% خدمة)، وتصل للويتر كطلب دليفري مع بيانات العميل.
                        </p>

                        <div className="pt-2 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => downloadQR('delivery')}
                            className="bg-white text-purple-950 hover:bg-purple-50 px-5 py-3 rounded-2xl font-black text-xs md:text-sm flex items-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer"
                          >
                            <Download size={16} />
                            <span>تحميل كود الـ QR للدليفري (PNG)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(deliveryUrl);
                              setCopiedDeliveryLink(true);
                              setTimeout(() => setCopiedDeliveryLink(false), 2500);
                            }}
                            className="bg-white/15 hover:bg-white/25 border border-white/20 text-white px-4 py-3 rounded-2xl font-bold text-xs md:text-sm flex items-center gap-2 transition-all cursor-pointer"
                          >
                            {copiedDeliveryLink ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                            <span>{copiedDeliveryLink ? 'تم نسخ الرابط!' : 'نسخ رابط الدليفري'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setActiveTab('settings')}
                            className="bg-purple-500/40 hover:bg-purple-500/60 border border-purple-300/40 text-purple-100 px-4 py-3 rounded-2xl font-bold text-xs md:text-sm flex items-center gap-2 transition-all cursor-pointer"
                          >
                            <Settings size={15} />
                            <span>تعديل مناطق وأسعار التوصيل</span>
                          </button>

                          <a
                            href={deliveryUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-purple-200 hover:text-white px-3 py-2 text-xs font-bold flex items-center gap-1.5 underline underline-offset-4"
                          >
                            <ExternalLink size={14} />
                            <span>معاينة الرابط</span>
                          </a>
                        </div>

                        {/* Active Delivery Zones Pill Preview */}
                        {deliveryZones.filter(z => z.is_active !== false).length > 0 && (
                          <div className="pt-3 border-t border-purple-800/60 space-y-2">
                            <span className="text-[11px] font-bold text-purple-200 block">
                              مناطق وأسعار التوصيل المحددة للزبائن:
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {deliveryZones.filter(z => z.is_active !== false).map(z => (
                                <span 
                                  key={z.id} 
                                  className="px-2.5 py-1 bg-purple-900/80 border border-purple-700/60 text-purple-100 rounded-xl text-[11px] font-black flex items-center gap-1.5"
                                >
                                  <span>{z.name}</span>
                                  <span className="bg-purple-700/80 px-1.5 py-0.5 rounded-md text-[10px] text-purple-200">
                                    {z.fee} جـ
                                  </span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* QR Display Card */}
                      <div className="bg-white p-5 rounded-3xl shadow-2xl flex flex-col items-center shrink-0 border-4 border-purple-300/30">
                        <span className="text-[11px] font-black text-purple-900 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <Bike size={14} />
                          <span>رابط الدليفري</span>
                        </span>
                        <div className="p-2 bg-gray-50 rounded-2xl border border-gray-100">
                          <QRCodeSVG
                            id="admin-qr-delivery"
                            value={deliveryUrl}
                            size={160}
                            level="H"
                            includeMargin
                          />
                        </div>
                        <span className="text-[10px] text-gray-500 font-mono font-bold mt-2 max-w-[170px] truncate text-center" dir="ltr">
                          /r/{restaurant?.slug || profile?.restaurant_id}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="bg-white rounded-3xl md:rounded-[36px] border border-gray-200/80 p-6 md:p-10 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6 mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-sm">
                      <QrCode size={26} />
                    </div>
                    <div>
                      <h3 className="text-xl md:text-2xl font-black text-gray-900">رموز QR الخاصة بطاولات المطعم</h3>
                      <p className="text-xs md:text-sm text-gray-500 font-medium mt-0.5">
                        يمكنك استعراض وتحميل رموز الـ QR الخاصة بطاولات مطعمك لطباعتها ووضعها على الطاولات
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <span className="bg-blue-50 text-blue-700 border border-blue-200 px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5">
                      <ShieldCheck size={15} />
                      <span>عرض وطباعة فقط (الإضافة والحذف عبر إدارة النظام)</span>
                    </span>
                  </div>
                </div>

                {isLoadingTables ? (
                  <div className="py-20 text-center">
                    <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-sm font-bold text-gray-500">جاري تحميل طاولات المطعم...</p>
                  </div>
                ) : tables.length === 0 ? (
                  <div className="text-center py-16 bg-gray-50/70 rounded-3xl border border-dashed border-gray-200">
                    <div className="w-16 h-16 bg-gray-100 text-gray-400 rounded-3xl flex items-center justify-center mx-auto mb-4">
                      <QrCode size={32} />
                    </div>
                    <h4 className="text-lg font-black text-gray-800 mb-1">لا توجد طاولات مضافة حتى الآن</h4>
                    <p className="text-xs text-gray-400 max-w-md mx-auto">
                      لم يتم إضافة أي طاولات لمطعمك بعد. يرجى التواصل مع إدارة النظام (Super Admin) أو الدعم الفني لإضافة طاولاتك.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {tables.map(table => {
                      const tableUrl = `${window.location.origin}/r/${restaurant?.slug || profile?.restaurant_id}/t/${table.id}`;
                      return (
                        <div 
                          key={table.id} 
                          className="bg-gray-50 hover:bg-white p-6 rounded-3xl border border-gray-200/80 transition-all hover:shadow-xl hover:border-orange-200 flex flex-col items-center group text-center"
                        >
                          <div className="flex items-center justify-between w-full mb-3 px-1">
                            <span className="text-[11px] font-black uppercase text-gray-400 tracking-wider">رقم الطاولة</span>
                            <span className="bg-orange-100 text-orange-800 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                              نشطة
                            </span>
                          </div>

                          <div className="w-16 h-16 bg-white border-2 border-orange-100 rounded-2xl flex items-center justify-center font-black text-3xl text-gray-900 italic shadow-sm mb-4 group-hover:scale-105 transition-transform">
                            {table.table_number}
                          </div>
                          
                          <div className="p-3.5 bg-white rounded-2xl shadow-sm border border-gray-200 mb-5 relative group/qr">
                            <QRCodeSVG 
                              id={`admin-qr-${table.table_number}`}
                              value={tableUrl} 
                              size={150}
                              level="H"
                              includeMargin
                            />
                          </div>

                          <div className="w-full space-y-2">
                            <button 
                              type="button"
                              onClick={() => downloadQR(table.table_number)}
                              className="w-full bg-gray-900 text-white hover:bg-orange-600 px-4 py-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                            >
                              <Download size={15} />
                              <span>تحميل رمز QR (PNG)</span>
                            </button>

                            <a 
                              href={tableUrl} 
                              target="_blank" 
                              rel="noreferrer"
                              className="w-full bg-white hover:bg-gray-100 text-gray-600 border border-gray-200 px-3 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <ExternalLink size={13} />
                              <span>معاينة الرابط المباشر</span>
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Categories View */}
          {activeTab === 'categories' && (
            <div className="max-w-4xl bg-white rounded-3xl border border-gray-200/80 p-6 md:p-8 shadow-sm text-right space-y-8">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center">
                    <Tags size={22} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-gray-900">إدارة التصنيفات وخيارات الوجبات</h2>
                    <p className="text-xs text-gray-500 font-medium">أضف تصنيفات جديدة وحدد الخيارات (مثل السكر، الأحجام، السبايسي) لتظهر تلقائياً للزبون</p>
                  </div>
                </div>
              </div>

              {/* Add New Category Form */}
              <form onSubmit={handleCategorySave} className="bg-gray-50/70 p-6 rounded-3xl border border-gray-200/70 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-sm text-gray-900 flex items-center gap-2">
                    <Plus size={16} className="text-orange-600" />
                    <span>إضافة تصنيف جديد</span>
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">اسم التصنيف (بالعربي) *</label>
                    <input 
                      required
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 ring-orange-500 text-right font-bold text-sm shadow-sm" 
                      placeholder="أدخل اسم التصنيف..." 
                      value={newCat.ar}
                      onChange={e => setNewCat({...newCat, ar: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Category Name (English) *</label>
                    <input 
                      required
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 ring-orange-500 font-bold text-sm shadow-sm text-left" 
                      placeholder="Enter category name..." 
                      value={newCat.en}
                      onChange={e => setNewCat({...newCat, en: e.target.value})}
                    />
                  </div>
                </div>

                {/* Category Options Configurator */}
                <CategoryOptionsEditor
                  options={newCatOptions}
                  onChange={setNewCatOptions}
                  isRTL={isRTL}
                />

                <div className="flex justify-end pt-2">
                  <button 
                    type="submit" 
                    className="bg-gray-900 hover:bg-black text-white px-8 py-3.5 rounded-2xl font-bold shadow-lg hover:shadow-xl active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Plus size={18} />
                    <span>إنشاء التصنيف مع الخيارات</span>
                  </button>
                </div>
              </form>

              {/* Categories List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-base text-gray-900">
                    التصنيفات الحالية ({categories.length})
                  </h3>
                </div>

                <div className="space-y-3">
                  {categories.map(c => {
                    const isEditing = editingCategory?.id === c.id;
                    const catOptions: CategoryOption[] = isEditing ? editingCategoryOptions : (c.options || []);

                    return (
                      <div 
                        key={c.id} 
                        className={cn(
                          "p-5 rounded-2xl border transition-all",
                          isEditing 
                            ? "bg-orange-50/40 border-orange-300 shadow-md" 
                            : "bg-white hover:bg-gray-50/80 border-gray-200 shadow-sm"
                        )}
                      >
                        {isEditing ? (
                          <form onSubmit={handleUpdateCategory} className="space-y-5">
                            <div className="flex items-center justify-between pb-3 border-b border-orange-200/60">
                              <span className="font-black text-sm text-orange-950">تعديل التصنيف والخيارات</span>
                              <div className="flex items-center gap-2">
                                <button 
                                  type="submit" 
                                  className="bg-green-600 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm hover:bg-green-700 transition-colors cursor-pointer"
                                >
                                  <Save size={14} />
                                  <span>حفظ التعديلات</span>
                                </button>
                                <button 
                                  type="button" 
                                  onClick={() => { setEditingCategory(null); setEditingCategoryOptions([]); }} 
                                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                >
                                  إلغاء
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">الاسم بالعربي</label>
                                <input 
                                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 outline-none font-bold text-sm text-right"
                                  value={editingCategory.name_ar}
                                  onChange={e => setEditingCategory({...editingCategory, name_ar: e.target.value})}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">English Name</label>
                                <input 
                                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 outline-none font-bold text-sm text-left"
                                  value={editingCategory.name_en}
                                  onChange={e => setEditingCategory({...editingCategory, name_en: e.target.value})}
                                />
                              </div>
                            </div>

                            <CategoryOptionsEditor
                              options={editingCategoryOptions}
                              onChange={setEditingCategoryOptions}
                              isRTL={isRTL}
                            />
                          </form>
                        ) : (
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="space-y-2">
                              <div className="flex items-center gap-3">
                                <span className="font-black text-base text-gray-900">{c.name_ar}</span>
                                <span className="text-xs text-gray-400 font-medium">({c.name_en})</span>
                              </div>

                              {/* Options Badges */}
                              {catOptions && catOptions.length > 0 ? (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {catOptions.map((opt, oIdx) => (
                                    <span 
                                      key={opt.id || oIdx}
                                      className="inline-flex items-center gap-1 bg-orange-50 text-orange-800 border border-orange-200/70 px-2.5 py-1 rounded-lg text-xs font-bold"
                                    >
                                      <SlidersHorizontal size={11} className="text-orange-600" />
                                      <span>{opt.name_ar}</span>
                                      <span className="text-[10px] text-orange-600 font-normal">
                                        ({opt.choices.map(ch => ch.name_ar).join(' / ')})
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[11px] text-gray-400 italic">بدون خيارات مخصصة (تلقائي)</span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-center">
                              <button 
                                type="button"
                                onClick={() => startEditingCategory(c)} 
                                className="p-2.5 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-all cursor-pointer flex items-center gap-1 text-xs font-bold border border-transparent hover:border-orange-200"
                                title={isRTL ? "تعديل التصنيف والخيارات" : "Edit"}
                              >
                                <Edit size={16}/>
                                <span>تعديل الخيارات</span>
                              </button>
                              <button 
                                type="button"
                                onClick={() => {
                                  setDeleteModalItem({
                                    type: 'category',
                                    id: c.id,
                                    name: c.name_ar || c.name_en || 'هذا التصنيف'
                                  });
                                }}
                                className="p-2.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl border border-red-100 transition-all shadow-sm flex items-center justify-center cursor-pointer active:scale-95"
                                title={isRTL ? "حذف التصنيف" : "Delete Category"}
                              >
                                <Trash2 size={16}/>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {/* Staff View */}
          {activeTab === 'staff' && (
            <div className="space-y-6 text-right">
              {/* POS Cashier PIN Security Management Card */}
              <div className="bg-white rounded-3xl border border-amber-200/80 shadow-sm p-6 sm:p-8 space-y-5">
                <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                  <div>
                    <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                      <Lock className="text-amber-500" size={22} />
                      <span>تعيين كلمة سر / رمز PIN للكاشير (POS PIN)</span>
                    </h3>
                    <p className="text-xs text-gray-500 font-medium mt-1">
                      أنت كمدير المطعم تحدد هنا كلمة المرور الخاصة بجهاز الكاشير. الكاشير لن يستطيع فتح النظام إلا بالرمز الذي تحدده أنت.
                    </p>
                  </div>
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                    <Key size={22} />
                  </div>
                </div>

                {cashierPinSavedToast && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl font-bold text-xs flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>{cashierPinSavedToast}</span>
                  </div>
                )}

                <form onSubmit={handleSaveCashierPin} className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <div className="flex-1 space-y-1 text-right">
                      <label className="text-xs font-black text-gray-600 block">
                        رمز PIN للكاشير (4 إلى 6 أرقام):
                      </label>
                      <div className="relative">
                        <input
                          type={showCashierPin ? "text" : "password"}
                          value={cashierPinInput}
                          onChange={e => setCashierPinInput(e.target.value)}
                          placeholder="مثال: 5678"
                          className="w-full bg-white border border-gray-200 focus:border-amber-500 rounded-xl px-4 py-3 font-mono font-bold text-base text-gray-900 outline-none shadow-sm"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowCashierPin(!showCashierPin)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                        >
                          {showCashierPin ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-end gap-2 pt-2 sm:pt-0">
                      <button
                        type="submit"
                        className="px-6 py-3.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded-xl shadow-md shadow-amber-500/20 transition-all cursor-pointer active:scale-95 flex items-center gap-2 whitespace-nowrap"
                      >
                        <Save size={16} />
                        <span>حفظ كلمة سر الكاشير</span>
                      </button>

                      {restaurant?.id && (
                        <a
                          href={`/pos?restaurant_id=${restaurant.id}&restaurant_slug=${restaurant.slug || ''}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-4 py-3.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <ExternalLink size={15} />
                          <span>فتح الكاشير (POS)</span>
                        </a>
                      )}
                    </div>
                  </div>
                </form>
              </div>

              <div className="bg-white rounded-3xl border shadow-sm p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold">إضافة نادل جديد</h3>
                  <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl">
                    <Users />
                  </div>
                </div>
                
                <form onSubmit={handleAddWaiter} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2 text-right">
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">الأسم الكامل</label>
                      <input 
                        required
                        className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 ring-orange-500/10 focus:border-orange-500 transition-all text-right font-bold" 
                        placeholder="أدخل اسم النادل" 
                        value={newWaiterName}
                        onChange={e => setNewWaiterName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2 text-right">
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">البريد الإلكتروني</label>
                      <input 
                        required
                        type="email"
                        className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 ring-orange-500/10 focus:border-orange-500 transition-all text-right font-bold" 
                        placeholder="waiter@example.com" 
                        value={newWaiterEmail}
                        onChange={e => setNewWaiterEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2 text-right">
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">كلمة المرور</label>
                      <input 
                        required
                        type="password"
                        className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 ring-orange-500/10 focus:border-orange-500 transition-all text-right font-bold text-left" 
                        placeholder="6+ حروف أو أرقام" 
                        value={newWaiterPassword}
                        onChange={e => setNewWaiterPassword(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  {addWaiterError && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm font-bold border border-red-200 flex items-center gap-2">
                       <X size={18} className="shrink-0" />
                       <span>{addWaiterError}</span>
                    </div>
                  )}

                  {addWaiterSuccess && (
                    <div className="bg-emerald-50 text-emerald-800 p-4 rounded-2xl text-sm font-bold border border-emerald-200 flex items-center gap-2">
                       <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                       <span>{addWaiterSuccess}</span>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button 
                      type="submit" 
                      disabled={isAddingWaiter}
                      className="bg-orange-600 text-white px-10 py-4 rounded-2xl font-black shadow-xl shadow-orange-200 hover:bg-orange-700 hover:translate-y-[-2px] active:translate-y-0 transition-all flex items-center gap-3 disabled:opacity-50 disabled:translate-y-0"
                    >
                      {isAddingWaiter ? (
                        <>
                          <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>جاري إضافة النادل...</span>
                        </>
                      ) : (
                        <>
                          <span>إضافة النادل الآن</span>
                          <Plus size={20} />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              <div className="bg-white rounded-3xl border shadow-sm p-8">
                <h3 className="text-xl font-bold mb-8">أداء طاقم العمل</h3>
                <div className="grid gap-4">
                  {staff.map(s => {
                    const stats = waiterStats[s.id] || { orderCount: 0, avgTime: 0 };
                    return (
                      <div key={s.id} className="flex flex-col gap-4 p-6 bg-gray-50 rounded-2xl border hover:border-orange-200 transition-all">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-black text-xl uppercase">
                              {s.full_name?.[0] || 'W'}
                            </div>
                            <div className="text-right">
                              <p className="font-black text-lg">{s.full_name || 'نادل بدون اسم'}</p>
                              <p className="text-xs text-gray-400 italic">
                                {s.email}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 md:gap-4">
                            <div className="text-center bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 min-w-[80px]">
                               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">الأوردرات</p>
                               <p className="text-lg font-black text-blue-600">{stats.orderCount}</p>
                            </div>
                            {confirmDeleteId === s.id ? (
                              <div className="flex items-center gap-1.5 bg-red-50 p-1.5 rounded-xl border border-red-100">
                                <button 
                                  onClick={() => deleteStaff(s.id)}
                                  className="bg-red-600 text-white px-3 py-2 rounded-lg text-xs font-black hover:bg-red-700 transition-colors shadow-sm whitespace-nowrap"
                                >
                                  تأكيد
                                </button>
                                <button 
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="bg-white text-gray-500 px-3 py-2 rounded-lg text-xs font-black border hover:bg-gray-50 transition-colors"
                                >
                                  إلغاء
                                </button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => setConfirmDeleteId(s.id)}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                              >
                                <span className="text-sm font-black whitespace-nowrap">حذف الموظف</span>
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Shift Management Section */}
                        <div className="mt-2 pt-4 border-t border-gray-100 flex flex-col items-start justify-between gap-3 w-full">
                          <div className="w-full">
                            <div className="flex items-center gap-2 mb-2">
                              <Calendar size={18} className="text-orange-500 shrink-0" />
                              <span className="text-sm font-bold text-gray-800">موعد العمل (الشيفت):</span>
                            </div>

                            {editingShiftId === s.id ? (
                              <div className="bg-orange-50/70 p-3.5 sm:p-4 rounded-2xl border border-orange-200/80 mt-2 space-y-3 w-full max-w-lg">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                                  {/* Shift Start */}
                                  <div className="space-y-1">
                                    <label className="block text-[11px] font-black text-gray-600">
                                      موعد الحضور (البدء)
                                    </label>
                                    <input 
                                      type="time" 
                                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"
                                      value={shiftTimes.start}
                                      onChange={e => setShiftTimes({...shiftTimes, start: e.target.value})}
                                    />
                                  </div>

                                  {/* Shift End */}
                                  <div className="space-y-1">
                                    <label className="block text-[11px] font-black text-gray-600">
                                      موعد الانصراف (الانتهاء)
                                    </label>
                                    <input 
                                      type="time" 
                                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"
                                      value={shiftTimes.end}
                                      onChange={e => setShiftTimes({...shiftTimes, end: e.target.value})}
                                    />
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-orange-200/60">
                                  <div className="flex items-center gap-2">
                                    <button 
                                      type="button"
                                      onClick={() => saveShift(s.id)}
                                      disabled={isSavingShift === s.id}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-black shadow-sm transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                    >
                                      {isSavingShift === s.id ? (
                                        <>
                                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                          <span>جاري الحفظ...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Save size={14} />
                                          <span>حفظ الشيفت</span>
                                        </>
                                      )}
                                    </button>
                                    <button 
                                      type="button"
                                      onClick={() => {
                                        setEditingShiftId(null);
                                        setShiftStatus(null);
                                      }}
                                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                    >
                                      إلغاء
                                    </button>
                                  </div>

                                  {shiftStatus && shiftStatus.id === s.id && (
                                    <span className={cn(
                                      "text-xs font-bold px-2.5 py-1 rounded-lg",
                                      shiftStatus.type === 'success' ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-red-100 text-red-800 border border-red-200"
                                    )}>
                                      {shiftStatus.message}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2.5">
                                {s.shift_start && s.shift_end ? (
                                  <span className="bg-orange-100 text-orange-900 border border-orange-200 px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5">
                                    <Clock size={13} className="text-orange-600 shrink-0" />
                                    <span>{formatTimeForInput(s.shift_start)} إلى {formatTimeForInput(s.shift_end)}</span>
                                  </span>
                                ) : (
                                  <span className="text-gray-400 text-xs italic bg-gray-100 px-3 py-1.5 rounded-xl">لا يوجد شيفت محدد</span>
                                )}
                                <button 
                                  type="button"
                                  onClick={() => {
                                    setEditingShiftId(s.id);
                                    setShiftTimes({ 
                                      start: formatTimeForInput(s.shift_start) || '09:00', 
                                      end: formatTimeForInput(s.shift_end) || '17:00' 
                                    });
                                  }}
                                  className="text-orange-600 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
                                >
                                  <Edit size={13} />
                                  <span>تعديل الموعد</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {staff.length === 0 && (
                    <div className="text-center py-12 text-gray-400 font-bold">لا يوجد نوادل مسجلين حالياً</div>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* Cashier Shifts and Financial Reports Tab (X/Z Reports) */}
          {activeTab === 'shifts' && restaurant && (
            <ShiftsReportsTab
              restaurantId={restaurant.id}
              restaurantName={restaurant.name || 'المطعم'}
              orders={orders}
              liveOrders={adminLiveOrders}
            />
          )}
          {/* Settings View */}
          {activeTab === 'settings' && restaurant && (
            <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
              {/* POS Cashier PIN Management Card in Settings */}
              <div className="bg-white p-6 md:p-8 rounded-[36px] border border-amber-100 shadow-xl shadow-gray-200/50 space-y-5">
                <div className="flex items-center justify-between border-b pb-4">
                  <div>
                    <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                      <Lock className="text-amber-500" size={22} />
                      <span>كلمة سر ورمز PIN الكاشير (POS PIN)</span>
                    </h3>
                    <p className="text-xs text-gray-500 font-medium mt-1">
                      الرمز السري المخصص لتسجيل دخول موظف الكاشير لنقطة البيع التابعة لهذا المطعم
                    </p>
                  </div>
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                    <Key size={22} />
                  </div>
                </div>

                {cashierPinSavedToast && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl font-bold text-xs flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>{cashierPinSavedToast}</span>
                  </div>
                )}

                <form onSubmit={handleSaveCashierPin} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div className="flex-1 space-y-1 text-right">
                    <label className="text-xs font-black text-gray-600 block">
                      رمز PIN الخاص بالكاشير:
                    </label>
                    <div className="relative">
                      <input
                        type={showCashierPin ? "text" : "password"}
                        value={cashierPinInput}
                        onChange={e => setCashierPinInput(e.target.value)}
                        placeholder="مثال: 5678"
                        className="w-full bg-white border border-gray-200 focus:border-amber-500 rounded-xl px-4 py-3 font-mono font-bold text-base text-gray-900 outline-none shadow-sm"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowCashierPin(!showCashierPin)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                      >
                        {showCashierPin ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-end gap-2 pt-2 sm:pt-0">
                    <button
                      type="submit"
                      className="px-6 py-3.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded-xl shadow-md shadow-amber-500/20 transition-all cursor-pointer active:scale-95 flex items-center gap-2 whitespace-nowrap"
                    >
                      <Save size={16} />
                      <span>حفظ الرمز</span>
                    </button>

                    <a
                      href={restaurant?.id ? `/pos?restaurant_id=${restaurant.id}&restaurant_slug=${restaurant.slug || ''}` : '/pos'}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-3.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <ExternalLink size={15} />
                      <span>شاشة POS</span>
                    </a>
                  </div>
                </form>
              </div>

              {/* 1. Subdomain & Links Card */}
              <div className="bg-white p-6 md:p-8 rounded-[36px] border border-gray-100 shadow-xl shadow-gray-200/50 space-y-6">
                <div className="flex items-center justify-between border-b pb-4">
                  <h3 className="text-xl font-black text-gray-900">{isRTL ? 'رابط المنيو والدومين الفرعي' : 'Menu URL & Subdomain'}</h3>
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                    <Globe size={20} />
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-xs text-gray-500 font-bold leading-relaxed">
                    {isRTL 
                      ? 'يمكنك مشاركة الرابط المباشر للمنيو في إعلانات السوشيال ميديا أو بايو الإنستجرام والفيسبوك:'
                      : 'Share your direct menu link on social media or bio:'}
                  </p>

                  {/* Primary Subdomain URL */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-blue-50/60 rounded-2xl border border-blue-100">
                    <div className="font-mono font-black text-blue-900 text-sm md:text-base text-left w-full sm:w-auto truncate" dir="ltr">
                      https://{restaurant.slug}.qrieta.com
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`https://${restaurant.slug}.qrieta.com`);
                          alert(isRTL ? 'تم نسخ الرابط بنجاح!' : 'Link copied to clipboard!');
                        }}
                        className="px-4 py-2 bg-white text-blue-700 font-bold text-xs rounded-xl border border-blue-200 hover:bg-blue-100/50 transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <Copy size={14} />
                        <span>{isRTL ? 'نسخ الرابط' : 'Copy'}</span>
                      </button>
                      <a
                        href={`/r/${restaurant.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700 transition-all flex items-center gap-1.5 shadow-sm shadow-blue-500/20"
                      >
                        <ExternalLink size={14} />
                        <span>{isRTL ? 'معاينة المنيو' : 'Preview'}</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Brand Identity */}
              <div className="bg-white p-6 md:p-8 rounded-[36px] border border-gray-100 shadow-xl shadow-gray-200/50 space-y-8">
                <div className="flex items-center justify-between border-b pb-4">
                   <h3 className="text-xl font-black text-gray-900">{isRTL ? 'الهوية البصرية' : 'Brand Identity'}</h3>
                   <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-500">
                      <Palette size={20} />
                   </div>
                </div>

                <div className="space-y-6">
                  {/* Restaurant Name */}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-wider block text-right">
                      {isRTL ? 'اسم المطعم' : 'Restaurant Name'}
                    </label>
                    <input 
                      type="text"
                      value={restaurant.name}
                      onChange={(e) => setRestaurant({ ...restaurant, name: e.target.value })}
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-orange-500 focus:bg-white rounded-2xl px-5 py-3.5 outline-none transition-all font-bold text-base text-right shadow-inner"
                      placeholder={isRTL ? 'أدخل اسم المطعم' : 'Enter restaurant name'}
                    />
                  </div>

                  {/* Color Section */}
                  <div className="space-y-3">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-wider block text-right">
                       {isRTL ? 'لون التطبيق الأساسي' : 'Theme Color'}
                    </label>
                    
                    <div className="flex flex-col md:flex-row-reverse items-center justify-between gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      <div className="flex items-center gap-3 w-full md:w-auto">
                         <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border shadow-sm">
                           <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: restaurant.primary_color || '#f97316' }} />
                           <input 
                             type="text"
                             value={restaurant.primary_color || '#f97316'}
                             onChange={(e) => setRestaurant({ ...restaurant, primary_color: e.target.value })}
                             className="w-20 border-none bg-transparent outline-none font-mono text-xs font-bold text-gray-600 uppercase"
                           />
                         </div>
                         <div className="relative group/picker">
                           <input 
                              type="color"
                              value={restaurant.primary_color || '#f97316'}
                              onChange={(e) => setRestaurant({ ...restaurant, primary_color: e.target.value })}
                              className="w-10 h-10 rounded-xl cursor-pointer border-none p-0 bg-transparent"
                           />
                         </div>
                      </div>
                      <div className="text-right">
                         <h4 className="font-black text-sm text-gray-800">{isRTL ? 'اللون الأساسي' : 'Primary Color'}</h4>
                         <p className="text-xs text-gray-400 font-medium">{isRTL ? 'يستخدم للأزرار والعناوين في واجهة العميل' : 'Used for buttons and headers'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Marketing & Facebook Pixel Card */}
              <div className="bg-white p-6 md:p-8 rounded-[36px] border border-gray-100 shadow-xl shadow-gray-200/50 space-y-6">
                <div className="flex items-center justify-between border-b pb-4">
                  <h3 className="text-xl font-black text-gray-900">{isRTL ? 'التسويق و Meta / Facebook Pixel' : 'Marketing & Meta Pixel'}</h3>
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                    <Target size={20} />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-600 block text-right">
                      {isRTL ? 'معرّف بكسل فيسبوك (Facebook Pixel ID)' : 'Facebook Pixel ID'}
                    </label>
                    <input 
                      type="text"
                      value={restaurant.fb_pixel_id || ''}
                      onChange={(e) => setRestaurant({ ...restaurant, fb_pixel_id: e.target.value })}
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl px-5 py-3.5 outline-none transition-all font-mono text-sm text-left shadow-inner"
                      placeholder="مثال: 123456789012345"
                      dir="ltr"
                    />
                    <p className="text-[11px] text-gray-500 leading-relaxed text-right">
                      {isRTL 
                        ? 'عند إضافة Pixel ID، سيقوم النظام تلقائياً بتتبع تفاعل الزوار ومشترياتهم لتحسين نتائج إعلاناتك الممولة على فيسبوك وإنستجرام.'
                        : 'Adding your Pixel ID enables automatic tracking of visitors and orders for your Meta ad campaigns.'}
                    </p>
                  </div>

                  {/* Automated Events Summary */}
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2 text-right">
                    <h5 className="font-bold text-xs text-gray-800 flex items-center gap-1.5 justify-end">
                      <span>الأحداث التي يتم إرسالها للبكسل تلقائياً:</span>
                      <CheckCircle2 size={14} className="text-emerald-500" />
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px] text-gray-600 font-medium">
                      <div className="bg-white p-2.5 rounded-xl border border-gray-100 flex items-center justify-between">
                        <span className="font-mono text-indigo-600 font-bold">PageView</span>
                        <span>فتح قائمة الطعام</span>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-gray-100 flex items-center justify-between">
                        <span className="font-mono text-indigo-600 font-bold">ViewContent</span>
                        <span>استعراض وجبة وتفاصيلها</span>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-gray-100 flex items-center justify-between">
                        <span className="font-mono text-indigo-600 font-bold">AddToCart</span>
                        <span>إضافة وجبة لسلة الشراء</span>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-gray-100 flex items-center justify-between">
                        <span className="font-mono text-emerald-600 font-bold">Purchase</span>
                        <span>إرسال الطلب والمبلغ الإجمالي</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Delivery Zones & Fees Management Card */}
              <div className="bg-white p-6 md:p-8 rounded-[36px] border border-gray-100 shadow-xl shadow-gray-200/50 space-y-6">
                <div className="flex items-center justify-between border-b pb-4">
                  <div>
                    <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                      <span>إدارة مناطق وأسعار توصيل الدليفري</span>
                    </h3>
                    <p className="text-xs text-gray-500 font-medium mt-1">
                      حدد الأماكن والمناطق المتاحة وأسعار التوصيل الخاصة بكل منطقة لتظهر للعميل كخيارات عند مسح كود الدليفري
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 shrink-0">
                    <Bike size={24} />
                  </div>
                </div>

                {deliveryToast && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl font-bold text-xs flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>{deliveryToast}</span>
                  </div>
                )}

                {/* Quick Presets */}
                <div className="bg-purple-50/60 p-4 rounded-2xl border border-purple-100 space-y-2.5">
                  <span className="text-[11px] font-black text-purple-900 block text-right">
                    إضافة سريعة لمناطق شائعة (بضغطة واحدة):
                  </span>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => handleAddPresetZone('بورسعيد', 30, '30-45 دقيقة')}
                      className="px-3.5 py-1.5 bg-white hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-xl text-xs font-black transition-all active:scale-95 shadow-sm"
                    >
                      + بورسعيد (30 جـ)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddPresetZone('بورفؤاد', 40, '40-50 دقيقة')}
                      className="px-3.5 py-1.5 bg-white hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-xl text-xs font-black transition-all active:scale-95 shadow-sm"
                    >
                      + بورفؤاد (40 جـ)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddPresetZone('الفيروز', 50, '45-60 دقيقة')}
                      className="px-3.5 py-1.5 bg-white hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-xl text-xs font-black transition-all active:scale-95 shadow-sm"
                    >
                      + الفيروز (50 جـ)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddPresetZone('الحي الاماراتي', 50, '45-60 دقيقة')}
                      className="px-3.5 py-1.5 bg-white hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-xl text-xs font-black transition-all active:scale-95 shadow-sm"
                    >
                      + الحي الاماراتي (50 جـ)
                    </button>
                  </div>
                </div>

                {/* Add New Custom Zone Form */}
                <form onSubmit={handleAddDeliveryZone} className="bg-gray-50/80 p-4 sm:p-5 rounded-2xl border border-gray-200/80 space-y-3">
                  <h4 className="text-xs font-black text-gray-800 flex items-center gap-1.5 justify-end">
                    <span>إضافة منطقة أو مكان مخصص</span>
                    <Plus size={15} className="text-purple-600" />
                  </h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-[11px] font-bold text-gray-600 mb-1 text-right">اسم المكان / المنطقة *</label>
                      <input
                        type="text"
                        value={newZoneName}
                        onChange={(e) => setNewZoneName(e.target.value)}
                        placeholder="مثال: بورسعيد / بورفؤاد"
                        className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-900 focus:ring-2 ring-purple-500 outline-none text-right shadow-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1 text-right">سعر التوصيل (جنيه) *</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={newZoneFee}
                        onChange={(e) => setNewZoneFee(e.target.value)}
                        placeholder="مثال: 30"
                        className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-900 focus:ring-2 ring-purple-500 outline-none text-right shadow-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1 text-right">وقت التوصيل التقديري (اختياري)</label>
                      <input
                        type="text"
                        value={newZoneTime}
                        onChange={(e) => setNewZoneTime(e.target.value)}
                        placeholder="مثال: 30-45 دقيقة"
                        className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-900 focus:ring-2 ring-purple-500 outline-none text-right shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                    >
                      <Plus size={15} />
                      <span>إضافة المنطقة للقائمة</span>
                    </button>
                  </div>
                </form>

                {/* List of Configured Zones */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-gray-700">
                      قائمة المناطق والأسعار المعتمدة ({deliveryZones.length})
                    </span>
                    <span className="text-[11px] font-bold text-gray-400">
                      تظهر للعميل في شاشة الدليفري
                    </span>
                  </div>

                  {deliveryZones.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50/60 rounded-2xl border border-dashed border-gray-200 text-gray-400 font-bold text-xs">
                      لا توجد مناطق توصيل مضافة حتى الآن. يمكنك استخدام الإضافة السريعة أعلاه أو كتابة منطقة مخصصة.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {deliveryZones.map((zone) => (
                        <div
                          key={zone.id}
                          className={cn(
                            "p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 shadow-sm",
                            zone.is_active !== false 
                              ? "bg-white border-purple-100 hover:border-purple-300" 
                              : "bg-gray-50 border-gray-200 opacity-60"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleRemoveDeliveryZone(zone.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="حذف المنطقة"
                            >
                              <Trash2 size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleDeliveryZone(zone.id)}
                              className={cn(
                                "px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer",
                                zone.is_active !== false 
                                  ? "bg-emerald-100 text-emerald-800" 
                                  : "bg-gray-200 text-gray-600"
                              )}
                            >
                              {zone.is_active !== false ? 'مفعلة' : 'معطلة'}
                            </button>
                          </div>

                          <div className="flex items-center gap-2 text-right">
                            <div className="flex flex-col items-end">
                              <span className="font-black text-xs text-gray-900">{zone.name}</span>
                              {zone.estimated_time && (
                                <span className="text-[10px] font-medium text-gray-400">{zone.estimated_time}</span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 bg-purple-50 px-2.5 py-1 rounded-xl border border-purple-100">
                              <input
                                type="number"
                                min="0"
                                value={zone.fee}
                                onChange={(e) => handleUpdateDeliveryZoneFee(zone.id, e.target.value)}
                                className="w-12 bg-transparent text-center font-black text-xs text-purple-900 outline-none border-b border-purple-300 focus:border-purple-600"
                              />
                              <span className="text-[11px] font-black text-purple-700">جـ</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleSaveDeliveryZones}
                      disabled={isSavingDeliveryZones}
                      className="w-full bg-purple-700 hover:bg-purple-800 text-white py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20 active:scale-98 transition-all disabled:opacity-60 cursor-pointer"
                    >
                      {isSavingDeliveryZones ? (
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <Save size={16} />
                          <span>حفظ وتطبيق أسعار ومناطق التوصيل</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* 5. Save Button */}
              <div className="pt-2">
                <button
                  onClick={updateRestaurantColors}
                  disabled={isSavingColors}
                  className="w-full bg-gray-900 text-white py-4 md:py-5 rounded-[24px] font-black text-base md:text-lg shadow-xl hover:bg-black hover:-translate-y-0.5 transition-all active:translate-y-0 flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSavingColors ? (
                    <div className="w-5 h-5 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>{isRTL ? 'حفظ جميع الإعدادات' : 'Save All Settings'}</span>
                      <Save size={20} />
                    </>
                  )}
                </button>
                <p className="text-center text-[11px] font-bold text-gray-400 mt-3">
                  {isRTL ? 'سيتم تفعيل التغييرات فوراً للعملاء والروابط' : 'Changes take effect immediately'}
                </p>
              </div>
            </div>
          )}

          {/* Support / System Issues View */}
          {activeTab === 'support' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="bg-white rounded-[32px] p-8 md:p-10 border border-gray-100 shadow-xl text-right">
                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
                  <div className="w-16 h-16 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0 shadow-sm">
                    <Headphones size={32} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-gray-900">مشاكل متعلقة بالسيستم والدعم الفني</h3>
                    <p className="text-sm font-medium text-gray-500 mt-1">تواصل مباشر لحل أي مشاكل تقنية، استفسارات أو تعديلات برمجية</p>
                  </div>
                </div>

                {/* Engineer Contact Box */}
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-[28px] p-6 md:p-8 shadow-2xl relative overflow-hidden mb-6">
                  <div className="absolute top-0 left-0 -mt-8 -ml-8 w-40 h-40 bg-orange-500/10 rounded-full blur-2xl pointer-events-none" />
                  
                  <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div>
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-xs font-bold text-orange-400 mb-3">
                        <ShieldCheck size={14} />
                        <span>الدعم الفني المباشر لـ Qrieta</span>
                      </div>
                      <h4 className="text-2xl md:text-3xl font-black tracking-tight text-white mb-2">
                        م/ محمد عبدالحليم
                      </h4>
                      <p className="text-xl md:text-2xl font-bold font-mono text-orange-400" dir="ltr">
                        01019077727
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2.5 w-full md:w-auto">
                      <a
                        href="tel:01019077727"
                        className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-orange-500/30 transition-all active:scale-95"
                      >
                        <Phone size={18} />
                        <span>اتصال مباشر</span>
                      </a>
                      <a
                        href="https://wa.me/201019077727"
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-600/30 transition-all active:scale-95"
                      >
                        <MessageSquare size={18} />
                        <span>واتساب</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText('01019077727');
                          setPhoneCopied(true);
                          setTimeout(() => setPhoneCopied(false), 2000);
                        }}
                        className="px-4 py-3.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
                      >
                        {phoneCopied ? (
                          <>
                            <Check size={18} className="text-emerald-400" />
                            <span className="text-emerald-400">تم النسخ</span>
                          </>
                        ) : (
                          <>
                            <Copy size={18} />
                            <span>نسخ</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Additional Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex items-start gap-3">
                    <div className="p-2.5 bg-orange-100 text-orange-600 rounded-xl shrink-0">
                      <Clock size={20} />
                    </div>
                    <div>
                      <h5 className="font-bold text-gray-900 text-sm">استجابة سريعة</h5>
                      <p className="text-xs text-gray-500 mt-0.5">جاهزون للمساعدة في حالات الطوارئ وتوقف السيستم أو مشاكل الطلبات على مدار الساعة.</p>
                    </div>
                  </div>

                  <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex items-start gap-3">
                    <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl shrink-0">
                      <LifeBuoy size={20} />
                    </div>
                    <div>
                      <h5 className="font-bold text-gray-900 text-sm">تطوير وتحديثات</h5>
                      <p className="text-xs text-gray-500 mt-0.5">طلب إضافة ميزات جديدة، تعديل قوائم الأسعار المتقدمة، أو ربط حسابات إضافية.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Inventory & Stock Management View */}
          {activeTab === 'inventory' && restaurant && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <InventoryAuditTab 
                restaurantId={restaurant.id}
                restaurantName={restaurant.name}
                products={products}
                categories={categories}
              />
            </div>
          )}
        </div>
      </main>

      {/* Product Modal */}
      <AnimatePresence>
        {isProductModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto">
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setIsProductModalOpen(false)}
               className="fixed inset-0 bg-black/60 backdrop-blur-sm"
             />
             <motion.div 
               initial={{ scale: 0.95, opacity: 0, y: 10 }} 
               animate={{ scale: 1, opacity: 1, y: 0 }} 
               exit={{ scale: 0.95, opacity: 0, y: 10 }}
               className="relative bg-white w-full max-w-2xl rounded-3xl shadow-2xl my-auto max-h-[92vh] flex flex-col border border-gray-100 overflow-hidden"
             >
                {/* Modal Header */}
                <div className="flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5 border-b border-gray-100 bg-white sticky top-0 z-10 shrink-0">
                  <h3 className="text-xl sm:text-2xl font-black italic">{editingProduct?.id ? 'تعديل المنتج' : 'منتج جديد'}</h3>
                  <button 
                    type="button"
                    onClick={() => setIsProductModalOpen(false)}
                    className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
                  >
                    <X size={20}/>
                  </button>
                </div>

                {/* Modal Scrollable Content */}
                <div className="overflow-y-auto p-4 sm:p-6 md:p-8 flex-1 overscroll-contain">
                  <form id="product-edit-form" onSubmit={handleProductSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 text-right">
                    <div className="col-span-1 sm:col-span-2">
                      <label className="block text-xs font-black uppercase text-gray-400 mb-2">الاسم بالعربي *</label>
                      <input 
                        required className="w-full bg-gray-50 border border-gray-200 focus:bg-white rounded-xl px-4 py-3 outline-none focus:ring-2 ring-orange-500 text-right font-bold text-sm"
                        value={editingProduct?.name_ar || ''}
                        onChange={e => setEditingProduct({...editingProduct, name_ar: e.target.value})}
                      />
                    </div>
                    <div className="col-span-1 sm:col-span-2">
                      <label className="block text-xs font-black uppercase text-gray-400 mb-2">Name (English) *</label>
                      <input 
                        required className="w-full bg-gray-50 border border-gray-200 focus:bg-white rounded-xl px-4 py-3 outline-none focus:ring-2 ring-orange-500 text-left font-bold text-sm"
                        value={editingProduct?.name_en || ''}
                        onChange={e => setEditingProduct({...editingProduct, name_en: e.target.value})}
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs font-black uppercase text-gray-400 mb-2">السعر الأساسي (جـ) *</label>
                      <input 
                        required type="number" step="0.01" className="w-full bg-gray-50 border border-gray-200 focus:bg-white rounded-xl px-4 py-3 outline-none focus:ring-2 ring-orange-500 text-right font-bold text-sm"
                        value={editingProduct?.price !== undefined && editingProduct?.price !== null ? editingProduct.price : ''}
                        onChange={e => setEditingProduct({...editingProduct, price: parseFloat(e.target.value) || 0})}
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs font-black uppercase text-gray-400 mb-2">التصنيف *</label>
                      <select 
                        className="w-full bg-gray-50 border border-gray-200 focus:bg-white rounded-xl px-4 py-3 outline-none focus:ring-2 ring-orange-500 text-right font-bold text-sm"
                        value={editingProduct?.category_id || ''}
                        onChange={e => {
                          const newCatId = e.target.value;
                          setEditingProduct({...editingProduct, category_id: newCatId});
                          const targetCat = categories.find(c => c.id === newCatId);
                          const catOpts = targetCat?.options || (targetCat?.id ? getLocalCategoryOptions(targetCat.id, targetCat?.name_ar, targetCat?.name_en) : []);
                          if (catOpts && catOpts.length > 0) {
                            setEditingProductOptions(JSON.parse(JSON.stringify(catOpts)));
                          } else if (!editingProduct?.id) {
                            setEditingProductOptions([]);
                          }
                        }}
                      >
                        <option value="">اختر التصنيف</option>
                        {categories.length === 0 ? (
                          <option value="" disabled>لا توجد تصنيفات مضافة حتى الآن</option>
                        ) : (
                          categories.map(c => <option key={c.id} value={c.id}>{c.name_ar} ({c.name_en})</option>)
                        )}
                      </select>
                    </div>

                    {/* Options & Size Pricing Configurator */}
                    <div className="col-span-1 sm:col-span-2">
                      {(() => {
                        const selectedCat = categories.find(c => c.id === editingProduct?.category_id);
                        const selectedCatOpts = selectedCat?.options || (selectedCat?.id ? getLocalCategoryOptions(selectedCat.id, selectedCat?.name_ar, selectedCat?.name_en) : []);

                        return (
                          <ProductOptionsPricingEditor
                            options={editingProductOptions}
                            onChange={setEditingProductOptions}
                            basePrice={editingProduct?.price || 0}
                            onBasePriceChange={(newBase) => setEditingProduct(prev => ({ ...prev, price: newBase }))}
                            categoryName={selectedCat?.name_ar || selectedCat?.name_en}
                            categoryOptions={selectedCatOpts}
                            isRTL={isRTL}
                          />
                        );
                      })()}
                    </div>
                  </form>
                </div>

                {/* Modal Footer Actions */}
                <div className="px-5 py-4 sm:px-8 sm:py-4 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2 sm:gap-3 order-1 sm:order-none">
                    <button 
                      type="submit" 
                      form="product-edit-form"
                      className="flex-1 sm:flex-none bg-gray-900 text-white px-6 sm:px-8 py-3 rounded-2xl font-bold shadow-lg hover:bg-gray-800 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 text-sm sm:text-base"
                    >
                       <Save size={18}/>
                       <span>حفظ التغييرات</span>
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setIsProductModalOpen(false)} 
                      className="px-4 sm:px-6 py-3 font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-200/50 rounded-xl cursor-pointer text-sm"
                    >
                      إلغاء
                    </button>
                  </div>

                  {editingProduct?.id && (
                    <button
                      type="button"
                      onClick={() => {
                        const pid = editingProduct.id!;
                        const pname = editingProduct.name_ar || editingProduct.name_en || 'هذا المنتج';
                        setIsProductModalOpen(false);
                        setDeleteModalItem({
                          type: 'product',
                          id: pid,
                          name: pname
                        });
                      }}
                      className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white px-4 py-2.5 sm:py-3 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 border border-red-200 cursor-pointer text-sm"
                    >
                      <Trash2 size={16} />
                      <span>حذف المنتج</span>
                    </button>
                  )}
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dedicated Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteModalItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white w-full max-w-md rounded-3xl p-6 md:p-8 shadow-2xl border border-gray-100 text-center"
              dir="rtl"
            >
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-inner">
                <Trash2 size={32} />
              </div>

              <h3 className="text-xl font-black text-gray-900 mb-2">
                {deleteModalItem.type === 'product' ? 'حذف المنتج نهائياً؟' : 'حذف التصنيف نهائياً؟'}
              </h3>

              <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                هل أنت متأكد من رغبتك في حذف <strong className="text-gray-800 underline decoration-red-400">"{deleteModalItem.name}"</strong>؟
                {deleteModalItem.type === 'category' ? ' (ستتحول المنتجات المرتبطة به إلى غير مصنفة دون حذفها)' : ''}
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={executeDelete}
                  className="flex-1 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black py-3.5 px-6 rounded-2xl shadow-lg shadow-red-200 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>جاري الحذف...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={18} />
                      <span>نعم، احذف نهائياً</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeleteModalItem(null)}
                  className="px-6 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-all cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Toast Notification */}
      <AnimatePresence>
        {deleteToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-gray-700 text-sm font-bold"
            dir="rtl"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <span>{deleteToast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
