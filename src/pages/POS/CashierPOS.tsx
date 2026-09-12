import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate, Link, useParams } from 'react-router-dom';
import { 
  supabase, 
  Restaurant, 
  Category, 
  Product, 
  Table, 
  Order, 
  resolveRestaurantServices, 
  RESTAURANT_SERVICE_PRESETS, 
  RestaurantServicePreset,
  getRestaurantPresetDef 
} from '../../lib/supabase';
import { fetchAllServerGeofences, RestaurantGeofence } from '../../lib/geoHelper';
import { TaxReceiptModal } from '../../components/TaxReceiptModal';
import { TaxReceiptData, generateInvoiceNumber } from '../../lib/taxReceiptHelper';
import { formatCurrency, cn } from '../../lib/utils';
import { 
  POSCartItem, 
  HeldBill, 
  ShiftRecord, 
  WasteRecord, 
  POSAuditLog, 
  DEFAULT_MANAGER_PIN,
  DEFAULT_CASHIER_PIN,
  getStationForCategory,
  CartItemOption
} from '../../lib/posStore';
import { 
  getProductOptionGroups, 
  POSOptionGroup, 
  POSOptionChoice 
} from '../../lib/posOptionsHelper';
import {
  getLockedRestaurantId,
  setLockedRestaurantId,
  clearLockedRestaurantId,
  verifyCashierOrManagerPin,
  saveCachedRestaurantData,
  getCachedRestaurantData,
  getNextOfflineOrderSequence,
  queueOfflineOrder,
  getOfflineOrdersQueue,
  clearSyncedOfflineOrders,
  getInitialOfflineFallbackData
} from '../../lib/posOfflineStore';
import { printThermalElement, printKitchenTicket } from '../../lib/printHelper';
import { KOTModal } from '../../components/POS/KOTModal';
import { ShiftReportModal } from '../../components/POS/ShiftReportModal';
import { SplitBillModal } from '../../components/POS/SplitBillModal';
import { SplitPaymentModal } from '../../components/POS/SplitPaymentModal';
import { ManagerPinModal } from '../../components/POS/ManagerPinModal';
import { WasteModal } from '../../components/POS/WasteModal';
import { HeldBillsDrawer } from '../../components/POS/HeldBillsDrawer';
import { OrdersHistoryModal } from '../../components/POS/OrdersHistoryModal';
import { TableSettleModal } from '../../components/POS/TableSettleModal';
import { 
  getCashierShiftConfigs, 
  CashierShiftConfig, 
  saveStoredActiveShift, 
  getStoredActiveShift,
  saveStoredShiftReport 
} from '../../lib/shiftsStore';
import { 
  Search, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  Receipt, 
  Printer, 
  CreditCard, 
  DollarSign, 
  Smartphone, 
  UtensilsCrossed, 
  Bike, 
  ShoppingBag, 
  User, 
  Phone, 
  MapPin, 
  Clock, 
  ChevronRight, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  RefreshCw, 
  LogOut, 
  Settings, 
  Maximize, 
  Coffee, 
  ArrowRight,
  TrendingUp,
  Tag,
  Percent,
  Sliders,
  Sparkles,
  PauseCircle,
  Split,
  ChefHat,
  Lock,
  FileText,
  Barcode,
  Package,
  RotateCcw,
  Check,
  Eye,
  AlertTriangle,
  Bell,
  Volume2,
  VolumeX,
  ChevronLeft,
  Boxes,
  Zap,
  MonitorCheck,
  Building2
} from 'lucide-react';
import { 
  getNextDailyOrderNumber, 
  syncDailyOrderSequence, 
  registerLiveOrder, 
  fetchLiveOrders, 
  updateLiveOrderStatus, 
  playNewOrderAlertSound, 
  LiveOrder,
  getDisplayOrderNumber
} from '../../lib/ordersService';
import { 
  fetchRestaurantInventory, 
  updateProductStock, 
  logShiftAuditRecord 
} from '../../lib/inventoryService';
import { deductOrderRecipeStock, restoreOrderRecipeStock } from '../../lib/recipeService';

export const CashierPOS: React.FC = () => {
  const [searchParams] = useSearchParams();
  const params = useParams<{ restaurantSlug?: string }>();
  const navigate = useNavigate();

  // Selected Restaurant & Settings
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [restaurantGeofence, setRestaurantGeofence] = useState<RestaurantGeofence | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Menu, Tables & Orders Data
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);

  // Real-time Stock Inventory Store
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  // Navigation Tabs (Including Customer Orders workspace)
  const [activeTab, setActiveTab] = useState<'pos' | 'orders' | 'shift' | 'tables' | 'inventory' | 'customer_orders'>('pos');
  const [customerLiveOrders, setCustomerLiveOrders] = useState<LiveOrder[]>([]);
  const [customerFilter, setCustomerFilter] = useState<'all' | 'new' | 'dine_in' | 'delivery' | 'completed'>('all');
  const [sidebarView, setSidebarView] = useState<'customer_orders' | 'cart'>('customer_orders');
  const [groupByCategory, setGroupByCategory] = useState<boolean>(true);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const [hasUnviewedCustomerAlert, setHasUnviewedCustomerAlert] = useState<boolean>(false);
  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(false);
  const lastAlertedOrderIdRef = useRef<string | number | null>(null);

  const scrollCategories = (direction: 'left' | 'right') => {
    if (categoryScrollRef.current) {
      categoryScrollRef.current.scrollBy({
        left: direction === 'left' ? -200 : 200,
        behavior: 'smooth'
      });
    }
  };

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Order Details
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('takeaway');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);

  // Modular Services Configuration per Restaurant
  const restaurantServices = useMemo(() => {
    return resolveRestaurantServices(selectedRestaurant, restaurantGeofence);
  }, [selectedRestaurant, restaurantGeofence]);

  // Auto-adjust orderType when restaurant services forbid dine-in or delivery
  useEffect(() => {
    if (!restaurantServices.tables_enabled && orderType === 'dine_in') {
      setOrderType('takeaway');
    }
    if (!restaurantServices.delivery_enabled && orderType === 'delivery') {
      setOrderType('takeaway');
    }
  }, [restaurantServices.tables_enabled, restaurantServices.delivery_enabled, orderType]);
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');
  const [customOrderNumber, setCustomOrderNumber] = useState<string>('');
  const [orderNotes, setOrderNotes] = useState<string>('');

  // Cart State
  const [cart, setCart] = useState<POSCartItem[]>([]);
  const [loadedOrderIds, setLoadedOrderIds] = useState<string[]>([]);
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('percentage');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [tipsAmount, setTipsAmount] = useState<number>(0);
  const [assignedWaiter, setAssignedWaiter] = useState<string>('');

  // Customizing Product Modal (Modifiers / Options / Notes / Sugar & Classifications)
  const [customizingItem, setCustomizingItem] = useState<Product | null>(null);
  const [customizingGroups, setCustomizingGroups] = useState<POSOptionGroup[]>([]);
  const [customizingSelections, setCustomizingSelections] = useState<Record<string, POSOptionChoice[]>>({});
  const [selectedItemOptions, setSelectedItemOptions] = useState<CartItemOption[]>([]);
  const [itemNoteInput, setItemNoteInput] = useState<string>('');

  // Payment Method & Cash Details
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'wallet' | 'split'>('cash');
  const [cashTendered, setCashTendered] = useState<string>('');

  // Shift & Cash Drawer State
  const [shift, setShift] = useState<ShiftRecord>({
    id: `shift-${Date.now()}`,
    restaurantId: '',
    cashierName: 'كاشير الفرع الرئيسي',
    cashierPin: DEFAULT_CASHIER_PIN,
    role: 'cashier',
    openedAt: new Date().toISOString(),
    isOpen: true,
    startingCash: 500,
    cashSales: 0,
    cardSales: 0,
    walletSales: 0,
    totalDiscounts: 0,
    totalTax: 0,
    totalServiceFee: 0,
    totalRefunds: 0,
    totalTips: 0,
    ordersCount: 0,
    transactions: [],
  });

  // Calculate order counts for each payment method in the active shift (without exposing monetary figures)
  const shiftPaymentCounts = useMemo(() => {
    let cash = 0;
    let card = 0;
    let wallet = 0;
    const list = Array.isArray(shift.orders) && shift.orders.length > 0 
      ? shift.orders 
      : activeOrders;

    list.forEach((ord: any) => {
      const pm = ord.payment_method || 'cash';
      if (pm === 'cash') cash++;
      else if (pm === 'card') card++;
      else if (pm === 'wallet') wallet++;
    });

    return {
      cash,
      card,
      wallet,
      total: (cash + card + wallet) || shift.ordersCount || 0
    };
  }, [shift.orders, activeOrders, shift.ordersCount]);

  // Held Bills (Parked Orders) with Persistent LocalStorage
  const [heldBills, setHeldBills] = useState<HeldBill[]>(() => {
    try {
      const stored = localStorage.getItem('qrieta_pos_held_bills');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('qrieta_pos_held_bills', JSON.stringify(heldBills));
    } catch (e) {}
  }, [heldBills]);

  const [isHeldDrawerOpen, setIsHeldDrawerOpen] = useState<boolean>(false);
  const [settleModalTable, setSettleModalTable] = useState<any | null>(null);

  // Waste Records
  const [wasteLogs, setWasteLogs] = useState<WasteRecord[]>([]);
  const [isWasteModalOpen, setIsWasteModalOpen] = useState<boolean>(false);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<POSAuditLog[]>([]);

  // Sub-Modals
  const [isKOTModalOpen, setIsKOTModalOpen] = useState<boolean>(false);
  const [isSplitBillModalOpen, setIsSplitBillModalOpen] = useState<boolean>(false);
  const [isSplitPaymentModalOpen, setIsSplitPaymentModalOpen] = useState<boolean>(false);
  const [shiftReportType, setShiftReportType] = useState<'X' | 'Z' | null>(null);
  const [taxReceiptData, setTaxReceiptData] = useState<TaxReceiptData | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);
  const [isOrdersHistoryModalOpen, setIsOrdersHistoryModalOpen] = useState<boolean>(false);

  // Cash In / Cash Out Modal
  const [isCashDrawerModalOpen, setIsCashDrawerModalOpen] = useState<boolean>(false);
  const [drawerTransType, setDrawerTransType] = useState<'cash_in' | 'cash_out'>('cash_out');
  const [drawerTransAmount, setDrawerTransAmount] = useState<string>('');
  const [drawerTransReason, setDrawerTransReason] = useState<string>('');

  // Manager PIN Authorization Modal
  const [managerAuthReq, setManagerAuthReq] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    action: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    action: () => {},
  });

  // Offline & Network State
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [offlineQueue, setOfflineQueue] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [cashierInputName, setCashierInputName] = useState<string>('كاشير الفرع');
  const [availableShifts, setAvailableShifts] = useState<CashierShiftConfig[]>([]);
  const [selectedShiftConfig, setSelectedShiftConfig] = useState<CashierShiftConfig | null>(null);

  // Screen Lock PIN (Default: UNLOCKED so cashier opens immediately, lockable via button)
  const [isScreenLocked, setIsScreenLocked] = useState<boolean>(false);
  const [lockPinInput, setLockPinInput] = useState<string>('');
  const [lockPinError, setLockPinError] = useState<string>('');

  // Search / Barcode Input Ref
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Network Online/Offline Listener & Auto-sync
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      const lockedId = getLockedRestaurantId();
      if (lockedId) syncPendingOrders(lockedId);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Keyboard shortcut listener for PIN lock screen
  useEffect(() => {
    if (!isScreenLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
        if (lockPinInput.length < 4) {
          setLockPinInput(prev => prev + e.key);
        }
      } else if (e.key === 'Backspace') {
        setLockPinInput(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        handleUnlockScreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isScreenLocked, lockPinInput]);

  // 1. Initial Load: Priority for Explicit URL Restaurant Target, with Offline Cache & Locked Fallback
  useEffect(() => {
    loadInitialData();
  }, [
    searchParams.get('restaurant_id'),
    searchParams.get('restaurantId'),
    searchParams.get('restaurant'),
    searchParams.get('id'),
    searchParams.get('restaurant_slug'),
    searchParams.get('slug'),
    params.restaurantSlug
  ]);

  const handleSwitchRestaurant = async (newRestaurant: Restaurant) => {
    if (newRestaurant.id === selectedRestaurant?.id) return;
    setLockedRestaurantId(newRestaurant.id);
    setSelectedRestaurant(newRestaurant);
    setCart([]);
    setSelectedTable(null);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setOrderNotes('');
    setCustomerLiveOrders([]);
    setActiveTab('pos');

    navigate(`/pos?restaurant_id=${newRestaurant.id}&restaurant_slug=${newRestaurant.slug || ''}`, { replace: true });
    await loadRestaurantDetails(newRestaurant.id, restaurantGeofence, newRestaurant);
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // 0. Extract explicit target restaurant from URL parameters (HIGHEST PRIORITY)
      const targetParamId = searchParams.get('restaurant_id') || searchParams.get('restaurantId') || searchParams.get('restaurant') || searchParams.get('id');
      const targetParamSlug = params.restaurantSlug || searchParams.get('restaurant_slug') || searchParams.get('slug');
      const storedLockedId = getLockedRestaurantId();

      // If URL explicitly requested a restaurant, that is our primary target. Otherwise use stored locked ID.
      const initialCandidateId = targetParamId || storedLockedId || 'qrieta-pos-offline';
      
      // 1. Immediate Load: Render cache or seed data instantly so UI is never blank
      const cached = getCachedRestaurantData(initialCandidateId);
      if (cached && cached.restaurant) {
        setSelectedRestaurant(cached.restaurant);
        setRestaurantGeofence(cached.geofence);
        if (cached.categories?.length) setCategories(cached.categories);
        if (cached.products?.length) {
          setProducts(cached.products);
          const initialStock: Record<string, number> = {};
          cached.products.forEach((p, idx) => {
            initialStock[p.id] = (idx % 4 === 0) ? 6 : (idx % 7 === 0) ? 2 : 30;
          });
          setStockMap(initialStock);
        }
        if (cached.tables?.length) setTables(cached.tables);
        setOfflineQueue(getOfflineOrdersQueue(initialCandidateId));
      } else {
        const fallback = getInitialOfflineFallbackData(initialCandidateId);
        setSelectedRestaurant(fallback.restaurant);
        setCategories(fallback.categories);
        setProducts(fallback.products);
        setTables(fallback.tables);
        const initialStock: Record<string, number> = {};
        fallback.products.forEach((p, idx) => {
          initialStock[p.id] = (idx % 4 === 0) ? 6 : (idx % 7 === 0) ? 2 : 30;
        });
        setStockMap(initialStock);
        setLockedRestaurantId(initialCandidateId);
      }

      // 2. Fetch Latest from Server if Online
      if (navigator.onLine) {
        try {
          const [restRes, geofences] = await Promise.all([
            supabase.from('restaurants').select('*').order('name'),
            fetchAllServerGeofences()
          ]);

          const loadedRestaurants = restRes.data || [];
          if (loadedRestaurants.length > 0) {
            setRestaurants(loadedRestaurants);
          }

          let targetRest: Restaurant | null = null;

          // Priority 1: Match by explicit URL restaurant ID
          if (targetParamId) {
            targetRest = loadedRestaurants.find(r => r.id === targetParamId) || null;
          }
          // Priority 2: Match by explicit URL slug
          if (!targetRest && targetParamSlug) {
            targetRest = loadedRestaurants.find(r => r.slug === targetParamSlug) || null;
          }
          // Priority 3: Fallback to previously locked restaurant on this device
          if (!targetRest && storedLockedId) {
            targetRest = loadedRestaurants.find(r => r.id === storedLockedId) || null;
          }
          // Priority 4: Fallback to the first available restaurant
          if (!targetRest && loadedRestaurants.length > 0) {
            targetRest = loadedRestaurants[0];
          }

          if (targetRest) {
            // Strictly scope available restaurants to this single branch only
            setRestaurants([targetRest]);

            // If switching from another restaurant, reset cart & current inputs
            if (selectedRestaurant && selectedRestaurant.id !== targetRest.id) {
              setCart([]);
              setSelectedTable(null);
              setCustomerName('');
              setCustomerPhone('');
              setCustomerAddress('');
              setOrderNotes('');
              setCustomerLiveOrders([]);
            }

            setLockedRestaurantId(targetRest.id);
            setSelectedRestaurant(targetRest);
            const geo = geofences[targetRest.id] || null;
            setRestaurantGeofence(geo);
            await loadRestaurantDetails(targetRest.id, geo, targetRest);
          } else {
            // If candidate exists, ensure details are loaded
            await loadRestaurantDetails(initialCandidateId, null, null);
          }
        } catch (netErr) {
          console.warn('Network load failed, keeping cache/fallback:', netErr);
        }
      }
    } catch (err) {
      console.error('Error loading POS data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRestaurantDetails = async (restaurantId: string, geo?: RestaurantGeofence | null, restObj?: Restaurant | null) => {
    try {
      if (navigator.onLine) {
        let loadedCats: Category[] = [];
        let loadedItems: Product[] = [];
        let loadedTables: Table[] = [];
        let loadedOrders: any[] = [];

        try {
          const catsRes = await supabase.from('categories').select('*').eq('restaurant_id', restaurantId).order('sort_order');
          if (catsRes.data && catsRes.data.length > 0) {
            loadedCats = catsRes.data;
          }
        } catch (e) {
          console.warn('Categories query error:', e);
        }

        try {
          const itemsRes = await supabase.from('products').select('*').eq('restaurant_id', restaurantId);
          if (itemsRes.data && itemsRes.data.length > 0) {
            loadedItems = itemsRes.data;
          }
        } catch (e) {
          console.warn('Products query error:', e);
        }

        try {
          const tablesRes = await supabase.from('tables').select('*').eq('restaurant_id', restaurantId).order('table_number');
          if (tablesRes.data && tablesRes.data.length > 0) {
            loadedTables = tablesRes.data;
          }
        } catch (e) {
          console.warn('Tables query error:', e);
        }

        try {
          const ordersRes = await supabase.from('orders').select('*, order_items(*), tables(table_number)').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(60);
          if (ordersRes.data) {
            loadedOrders = ordersRes.data;
          }
        } catch (e) {
          console.warn('Orders query error:', e);
        }

        // Guarantee fallback data if server returns 0 categories or products
        const fallback = getInitialOfflineFallbackData(restaurantId);
        const finalCats = loadedCats.length > 0 ? loadedCats : fallback.categories;
        const finalItems = loadedItems.length > 0 ? loadedItems : fallback.products;
        const finalTables = loadedTables.length > 0 ? loadedTables : fallback.tables;

        setCategories(finalCats);
        setProducts(finalItems);
        const initialStock: Record<string, number> = {};
        finalItems.forEach((p, idx) => {
          initialStock[p.id] = (idx % 4 === 0) ? 6 : (idx % 7 === 0) ? 2 : 30;
        });
        setStockMap(initialStock);
        setTables(finalTables);

        if (loadedOrders.length > 0) {
          const formattedOrders = loadedOrders.map((ord: any) => {
            const dailyNum = getDisplayOrderNumber(ord);
            const firstNote = ord.order_items?.[0]?.notes || '';
            let orderType = ord.order_type || 'dine_in';
            if (firstNote.includes('دليفري')) orderType = 'delivery';
            else if (firstNote.includes('سفري')) orderType = 'takeaway';

            const tableNum = ord.tables?.table_number || ord.table_number || (firstNote.match(/طاولة\s*([^|\]]+)/)?.[1]?.trim()) || null;

            return {
              ...ord,
              order_type: orderType,
              daily_order_number: dailyNum,
              table_number: tableNum,
              items: Array.isArray(ord.order_items) && ord.order_items.length > 0
                ? ord.order_items.map((it: any) => ({
                    name: it.products?.name_ar || it.products?.name_en || 'صنف',
                    quantity: it.quantity,
                    price: Number(it.price_at_order || 0),
                    notes: it.notes,
                  }))
                : (ord.items || [])
            };
          });
          setActiveOrders(formattedOrders);

          // Immediately sync customer app orders to customerLiveOrders so they never miss showing in طلبات الزبائن
          const customerOrdersFromDb: LiveOrder[] = formattedOrders
            .filter((ord: any) => {
              const firstNote = ord.order_items?.[0]?.notes || ord.notes || '';
              return firstNote.includes('[طلب زبون') || (!ord.waiter_id && (ord.status === 'new' || ord.status === 'preparing'));
            })
            .map((ord: any) => {
              const firstNote = ord.order_items?.[0]?.notes || ord.notes || '';
              const nameMatch = firstNote.match(/الاسم:\s*([^|\]]+)/);
              const phoneMatch = firstNote.match(/هاتف:\s*([^|\]]+)/);
              const addrMatch = firstNote.match(/العنوان:\s*([^|\]]+)/);
              return {
                id: ord.id,
                daily_order_number: ord.daily_order_number || getDisplayOrderNumber(ord),
                restaurant_id: ord.restaurant_id,
                source: 'customer_app' as const,
                order_type: (ord.order_type as any) || 'dine_in',
                table_id: ord.table_id,
                table_number: ord.table_number,
                customer_name: nameMatch ? nameMatch[1].trim() : undefined,
                customer_phone: phoneMatch ? phoneMatch[1].trim() : undefined,
                delivery_address: addrMatch ? addrMatch[1].trim() : undefined,
                notes: firstNote,
                total_price: Number(ord.total_price || 0),
                status: ord.status || 'new',
                payment_status: ord.payment_status || 'unpaid',
                items: ord.items || [],
                created_at: ord.created_at
              };
            });

          setCustomerLiveOrders(customerOrdersFromDb);
        } else {
          setActiveOrders([]);
          setCustomerLiveOrders([]);
        }

        // Save fresh snapshot to offline cache
        saveCachedRestaurantData(restaurantId, {
          restaurant: restObj || selectedRestaurant || fallback.restaurant,
          geofence: geo !== undefined ? geo : restaurantGeofence,
          categories: finalCats,
          products: finalItems,
          tables: finalTables,
        });
      } else {
        // Load from local storage cache
        const cached = getCachedRestaurantData(restaurantId);
        if (cached) {
          setCategories(cached.categories);
          setProducts(cached.products);
          setTables(cached.tables);
          if (cached.restaurant) setSelectedRestaurant(cached.restaurant);
          if (cached.geofence) setRestaurantGeofence(cached.geofence);
        } else {
          const fallback = getInitialOfflineFallbackData(restaurantId);
          setSelectedRestaurant(fallback.restaurant);
          setCategories(fallback.categories);
          setProducts(fallback.products);
          setTables(fallback.tables);
        }
      }

      setOfflineQueue(getOfflineOrdersQueue(restaurantId));
      const loadedShifts = getCashierShiftConfigs(restaurantId);
      setAvailableShifts(loadedShifts);
      const storedActive = getStoredActiveShift(restaurantId);
      if (storedActive) {
        setShift(storedActive);
        setCashierInputName(storedActive.cashierName || 'كاشير الفرع');
        const matchedConfig = loadedShifts.find(s => s.cashierName === storedActive.cashierName);
        if (matchedConfig) setSelectedShiftConfig(matchedConfig);
        else if (loadedShifts.length > 0) setSelectedShiftConfig(loadedShifts[0]);
      } else {
        const firstShift = loadedShifts[0];
        if (firstShift) {
          setSelectedShiftConfig(firstShift);
          setCashierInputName(firstShift.cashierName);
        }
        setShift(prev => ({
          ...prev,
          restaurantId: restaurantId,
          cashierName: firstShift ? firstShift.cashierName : prev.cashierName,
          startingCash: firstShift ? firstShift.startingCash : prev.startingCash,
        }));
      }
    } catch (err) {
      console.error('Error loading restaurant details, checking cache:', err);
      const cached = getCachedRestaurantData(restaurantId);
      if (cached) {
        setCategories(cached.categories);
        setProducts(cached.products);
        setTables(cached.tables);
      }
    }
  };

  // Sync Offline Queue to Supabase when network is back
  const syncPendingOrders = async (restaurantId: string) => {
    const queue = getOfflineOrdersQueue(restaurantId);
    if (queue.length === 0) return;
    setIsSyncing(true);
    const syncedIds: string[] = [];

    for (const item of queue) {
      try {
        const { error } = await supabase.from('orders').insert(item.orderPayload);
        if (!error) {
          syncedIds.push(item.localId);
        }
      } catch (e) {
        console.warn('Sync failed for order:', item.localId, e);
      }
    }

    if (syncedIds.length > 0) {
      clearSyncedOfflineOrders(restaurantId, syncedIds);
      setOfflineQueue(getOfflineOrdersQueue(restaurantId));
    }
    setIsSyncing(false);
  };

  // Customer Live Orders Polling & Real-time Alerts
  useEffect(() => {
    if (!selectedRestaurant?.id) return;
    let isMounted = true;

    const pollOrders = async () => {
      try {
        const list = await fetchLiveOrders(selectedRestaurant.id);
        if (!isMounted) return;
        const customerOnly = list.filter(o => 
          o.source === 'customer_app' || 
          (typeof o.notes === 'string' && o.notes.includes('[طلب زبون')) ||
          (typeof o.delivery_notes === 'string' && o.delivery_notes.includes('[طلب زبون'))
        );
        setCustomerLiveOrders(customerOnly);

        // Keep activeOrders synchronized with all live orders across POS, customer app, and waiter
        setActiveOrders(prev => {
          const map = new Map<string, any>();
          prev.forEach(o => map.set(String(o.id), o));

          list.forEach(ord => {
            const key = String(ord.id);
            const existing = map.get(key);
            const ordAny = ord as any;
            if (!existing) {
              map.set(key, {
                ...ord,
                total_amount: ord.total_price || ordAny.total_amount,
                table_number: ord.table_number,
                daily_order_number: ord.daily_order_number
              });
            } else {
              map.set(key, {
                ...existing,
                status: ord.status,
                payment_status: ord.payment_status,
                payment_method: ord.payment_method || existing.payment_method,
                total_amount: ord.total_price || ordAny.total_amount || existing.total_amount,
                table_number: ord.table_number || existing.table_number
              });
            }
          });

          return Array.from(map.values()).sort(
            (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
          );
        });

        const unhandledNew = customerOnly.filter(o => o.status === 'new');
        if (unhandledNew.length > 0) {
          const newest = unhandledNew[0];
          if (lastAlertedOrderIdRef.current !== newest.id) {
            lastAlertedOrderIdRef.current = newest.id;
            setHasUnviewedCustomerAlert(true);
            if (!isSoundMuted) {
              playNewOrderAlertSound();
            }
          }
        }
      } catch (e) {
        console.warn('Customer orders polling error:', e);
      }
    };

    pollOrders();
    const interval = setInterval(pollOrders, 3000);

    // Instant real-time listener via Supabase
    const channel = supabase
      .channel(`cashier-orders-${selectedRestaurant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${selectedRestaurant.id}`,
        },
        () => {
          pollOrders();
          loadRestaurantDetails(selectedRestaurant.id, restaurantGeofence, selectedRestaurant);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [selectedRestaurant?.id, isSoundMuted]);

  // Derived unhandled customer orders count
  const unhandledCustomerOrdersCount = useMemo(() => {
    return customerLiveOrders.filter(o => o.status === 'new').length;
  }, [customerLiveOrders]);

  const latestCustomerOrder = useMemo(() => {
    return customerLiveOrders.find(o => o.status === 'new') || customerLiveOrders[0] || null;
  }, [customerLiveOrders]);

  const filteredCustomerOrders = useMemo(() => {
    return customerLiveOrders.filter(ord => {
      if (customerFilter === 'new') return ord.status === 'new';
      if (customerFilter === 'dine_in') return ord.order_type === 'dine_in';
      if (customerFilter === 'delivery') return ord.order_type === 'delivery';
      if (customerFilter === 'completed') return ord.status === 'completed' || ord.status === 'delivered';
      return true;
    });
  }, [customerLiveOrders, customerFilter]);

  // Customer Order Handlers
  const handleSendCustomerOrderToKitchen = async (order: LiveOrder) => {
    if (!selectedRestaurant) return;
    
    // 1. Direct KOT print/ticket
    try {
      printKitchenTicket({
        restaurantName: selectedRestaurant?.name || 'مطعم وكافيه كريتا',
        orderNumber: order.daily_order_number || getDisplayOrderNumber(order),
        orderType: order.order_type || 'dine_in',
        tableNumber: order.table_number,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        deliveryAddress: order.delivery_address,
        cashierName: shift.cashierName || 'الرئيسي',
        items: (order.items || []).map(it => ({
          name: it.name,
          quantity: it.quantity,
          notes: it.notes,
          options: it.options
        })),
        orderNotes: order.notes
      });
    } catch (printErr) {
      console.warn('Direct KOT ticket warning:', printErr);
    }

    // 2. Update status to 'preparing'
    await updateLiveOrderStatus(order.id, selectedRestaurant.id, 'preparing');
    setCustomerLiveOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'preparing' } : o));
    setActiveOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'preparing' } : o));
  };

  const handleAcceptCustomerOrder = handleSendCustomerOrderToKitchen;

  const handleSetOrderReady = async (order: LiveOrder) => {
    if (!selectedRestaurant) return;
    try {
      await updateLiveOrderStatus(order.id, selectedRestaurant.id, 'ready');
      setCustomerLiveOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'ready' } : o));
    } catch (err: any) {
      console.warn('Error marking order ready:', err);
    }
  };

  const handlePrintCustomerKOT = (order: LiveOrder) => {
    handleLoadCustomerOrderToCart(order);
    setIsKOTModalOpen(true);
  };

  const handleLoadCustomerOrderToCart = (order: LiveOrder) => {
    const loadedCartItems: POSCartItem[] = order.items.map(it => {
      const matchedProduct = products.find(p => p.id === it.id);
      const matchedCat = categories.find(c => c.id === matchedProduct?.category_id);
      const station = getStationForCategory(matchedCat?.name_ar || matchedCat?.name_en);

      return {
        id: `cust-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        menuItemId: it.id || '',
        name: it.name,
        price: it.price,
        quantity: it.quantity,
        notes: it.notes || '',
        options: (it.options as any) || [],
        station
      };
    });

    setCart(loadedCartItems);
    setCustomOrderNumber(String(order.daily_order_number));

    if (order.order_type === 'dine_in') {
      setOrderType('dine_in');
      if (order.table_id) {
        const t = tables.find(tbl => tbl.id === order.table_id);
        if (t) setSelectedTable(t);
      } else if (order.table_number) {
        const t = tables.find(tbl => String(tbl.table_number) === String(order.table_number));
        if (t) setSelectedTable(t);
      }
    } else if (order.order_type === 'delivery') {
      setOrderType('delivery');
      if (order.customer_name) setCustomerName(order.customer_name);
      if (order.customer_phone) setCustomerPhone(order.customer_phone);
      if (order.delivery_address) setCustomerAddress(order.delivery_address);
    }
    if (order.notes) {
      setOrderNotes(order.notes);
    }

    setSidebarView('cart');
    setActiveTab('pos');
  };

  const handleCompleteCustomerOrder = async (order: LiveOrder) => {
    if (!selectedRestaurant) return;

    try {
      // 1. Update status in live service, Supabase, and Server API
      await updateLiveOrderStatus(order.id, selectedRestaurant.id, 'completed', 'paid');

      // 2. Update local customer live orders state
      setCustomerLiveOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'completed', payment_status: 'paid' } : o));

      // 3. Remove any corresponding held bill (from kitchen KOT sending)
      const orderNumStr = String(order.daily_order_number || '');
      setHeldBills(prev => prev.filter(b => {
        if (orderNumStr && b.title.includes(`#${orderNumStr}`)) return false;
        if (order.table_number && b.title.includes(`طاولة #${order.table_number}`)) return false;
        return true;
      }));

      // 4. If this order was currently loaded in active cart, clear it
      if (customOrderNumber === orderNumStr || (order.table_number && selectedTable?.table_number === order.table_number)) {
        setCart([]);
        setCustomOrderNumber('');
        setOrderNotes('');
        setSelectedTable(null);
      }

      // 5. Add to active orders (completed invoices)
      const displayNum = getDisplayOrderNumber(order);
      const invoiceNum = generateInvoiceNumber(
        restaurantGeofence?.invoice_prefix || 'INV',
        order.daily_order_number || activeOrders.length + 1
      );

      const completedInvoice: any = {
        id: `ord-${order.id}`,
        invoice_number: invoiceNum,
        daily_order_number: order.daily_order_number || activeOrders.length + 1,
        order_type: order.order_type,
        table_number: order.table_number,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        delivery_address: order.delivery_address,
        total_amount: order.total_price,
        payment_method: order.payment_status === 'paid' ? 'card' : 'cash',
        payment_status: 'paid',
        status: 'delivered',
        items: order.items.map(it => ({
          id: it.id,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          notes: it.notes,
          options: it.options
        })),
        created_at: new Date().toISOString()
      };

      setActiveOrders(prev => {
        const filtered = prev.filter(o => String(o.daily_order_number) !== orderNumStr && String(o.id) !== String(order.id));
        return [completedInvoice, ...filtered];
      });

      // 6. Update Shift sales & order count
      setShift(prev => ({
        ...prev,
        ordersCount: prev.ordersCount + 1,
        totalSales: prev.totalSales + order.total_price,
        cashSales: prev.cashSales + (order.payment_status === 'paid' ? 0 : order.total_price),
        cardSales: prev.cardSales + (order.payment_status === 'paid' ? order.total_price : 0)
      }));

      // 7. Deduct inventory if not already deducted by customer app
      if (order.source !== 'customer_app') {
        order.items.forEach(it => {
          if (it.id) {
            updateProductStock(selectedRestaurant.id, {
              productId: it.id,
              productName: it.name,
              delta: -it.quantity,
              type: 'sale',
              reason: `تسليم طلب #${displayNum}`,
              performedBy: shift.cashierName || 'كاشير'
            }).catch(() => {});
          }
        });

        deductOrderRecipeStock(
          selectedRestaurant.id,
          order.items.map(it => ({
            id: it.id,
            name: it.name,
            quantity: it.quantity,
            options: (it as any).options,
            notes: (it as any).notes,
            sugar_level: (it as any).sugar_level,
            selectedOptions: (it as any).selectedOptions
          })),
          String(displayNum),
          shift.cashierName || 'كاشير'
        ).catch(() => {});
      }

      // 8. Log shift audit
      logShiftAuditRecord(selectedRestaurant.id, {
        ...shift,
        ordersCount: shift.ordersCount + 1,
        totalSales: shift.totalSales + order.total_price,
        cashSales: shift.cashSales + (order.payment_status === 'paid' ? 0 : order.total_price),
        cardSales: shift.cardSales + (order.payment_status === 'paid' ? order.total_price : 0)
      }).catch(() => {});

      // 9. Alert confirmation
      alert(`✅ تم إنهاء وتسليم الطلب #${displayNum} بنجاح!\nتم تحصيل المبلغ (${order.total_price.toFixed(2)} ج.م) وتسجيل الفاتورة في الوردية.`);
    } catch (err: any) {
      console.error('Error completing customer order:', err);
      alert('حدث خطأ أثناء إنهاء الطلب: ' + (err?.message || 'يرجى المحاولة مرة أخرى'));
    }
  };

  const handleCancelCustomerOrder = async (order: LiveOrder) => {
    if (!selectedRestaurant) return;
    if (!confirm(`هل أنت متأكد من إلغاء طلب الزبون #${order.daily_order_number}؟`)) return;

    await updateLiveOrderStatus(order.id, selectedRestaurant.id, 'cancelled');
    setCustomerLiveOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'cancelled' } : o));

    // Restore stock for cancelled items
    order.items.forEach(it => {
      if (it.id) {
        updateProductStock(selectedRestaurant.id, {
          productId: it.id,
          productName: it.name,
          delta: it.quantity,
          type: 'adjustment',
          reason: `إلغاء طلب زبون #${order.daily_order_number}`,
          performedBy: shift.cashierName || 'كاشير'
        }).catch(() => {});
      }
    });

    // Restore recipe raw materials
    restoreOrderRecipeStock(
      selectedRestaurant.id,
      order.items.map(it => ({
        id: it.id,
        name: it.name,
        quantity: it.quantity
      })),
      String(order.daily_order_number),
      shift.cashierName || 'كاشير'
    ).catch(() => {});
  };

  // Barcode Scanner Listener
  const handleBarcodeSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return;

      const exactMatch = products.find(p => 
        p.id.toLowerCase() === query || 
        p.name_ar?.toLowerCase() === query || 
        p.name_en?.toLowerCase() === query
      );

      if (exactMatch) {
        handleProductClick(exactMatch);
        setSearchQuery('');
      }
    }
  };

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCat = selectedCategory === 'all' || p.category_id === selectedCategory;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch = !query || 
        p.name_ar?.toLowerCase().includes(query) || 
        p.name_en?.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query);
      return matchesCat && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Cart Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [cart]);

  const discountAmount = useMemo(() => {
    if (discountType === 'percentage') {
      return (subtotal * discountValue) / 100;
    }
    return Math.min(discountValue, subtotal);
  }, [subtotal, discountType, discountValue]);

  const discountedSubtotal = Math.max(0, subtotal - discountAmount);

  // Tax and Service Charge calculations
  const taxRate = restaurantGeofence?.tax_rate || 14;
  const isTaxInclusive = restaurantGeofence?.is_tax_inclusive || false;
  const serviceFeeRate = orderType === 'dine_in' ? (restaurantGeofence?.service_fee_rate || 12) : 0;

  const serviceFeeAmount = (discountedSubtotal * serviceFeeRate) / 100;
  const taxAmount = isTaxInclusive 
    ? (discountedSubtotal - (discountedSubtotal / (1 + (taxRate / 100))))
    : ((discountedSubtotal + serviceFeeAmount) * taxRate) / 100;

  const deliveryFee = orderType === 'delivery' ? (restaurantGeofence?.delivery_fee || 25) : 0;
  const finalTotal = (isTaxInclusive ? discountedSubtotal + serviceFeeAmount : discountedSubtotal + taxAmount + serviceFeeAmount) + deliveryFee + tipsAmount;

  // Change Calculation
  const cashNum = parseFloat(cashTendered) || 0;
  const changeDue = Math.max(0, cashNum - finalTotal);

  // Real-time table due amounts & financials (معروضة قدام عين الكاشير وإجمالي مبيع الطاولات)
  const tablesFinancials = useMemo(() => {
    // Combine active orders and customer live orders without duplicates
    const combinedCandidates: any[] = [];
    const seenIds = new Set<string>();

    [...activeOrders, ...customerLiveOrders].forEach(ord => {
      const idKey = String(ord.id);
      if (!seenIds.has(idKey)) {
        seenIds.add(idKey);
        combinedCandidates.push(ord);
      }
    });

    return tables.map(table => {
      const tableNum = String(table.table_number || '').trim();
      const tableId = String(table.id || '').trim();

      // Find active orders for this table (not cancelled, not completed, not paid)
      const matchedOrders = combinedCandidates.filter(ord => {
        if (ord.status === 'cancelled' || ord.status === 'completed' || ord.payment_status === 'paid') return false;
        const ordTableNum = String(ord.table_number || '').trim();
        const ordTableId = String(ord.table_id || '').trim();
        const firstNote = ord.order_items?.[0]?.notes || ord.notes || '';
        const numInNotes = firstNote.match(/طاولة\s*([^|\]]+)/)?.[1]?.trim();

        const match = ordTableNum === tableNum || ordTableId === tableId || numInNotes === tableNum;
        return match && (ord.order_type === 'dine_in' || !ord.order_type || firstNote.includes('صالة'));
      });

      // Find held/parked bills for this table (strictly exclude any that share an ID with an active order)
      const matchedOrderIds = new Set(matchedOrders.map(o => String(o.id)));
      const matchedHeld = heldBills.filter(h => {
        const hTableNum = String(h.tableNumber || '').trim();
        const hTableId = String(h.tableId || '').trim();
        const matchesTable = (hTableNum && hTableNum === tableNum) || (hTableId && hTableId === tableId);
        return matchesTable && !matchedOrderIds.has(String(h.id));
      });

      const ordersSum = matchedOrders.reduce((sum, o) => sum + (Number(o.total_price || o.total_amount) || 0), 0);
      const heldSum = matchedHeld.reduce((sum, h) => sum + (Number(h.total) || 0), 0);
      const totalDue = ordersSum + heldSum;
      const isOccupied = table.is_occupied || matchedOrders.length > 0 || matchedHeld.length > 0 || totalDue > 0;

      return {
        ...table,
        totalDue,
        ordersCount: matchedOrders.length + matchedHeld.length,
        isOccupied,
        activeOrders: matchedOrders,
        heldBills: matchedHeld
      };
    });
  }, [tables, activeOrders, customerLiveOrders, heldBills]);

  const allTablesTotalDue = useMemo(() => {
    return tablesFinancials.reduce((sum, t) => sum + t.totalDue, 0);
  }, [tablesFinancials]);

  const occupiedTablesCount = useMemo(() => {
    return tablesFinancials.filter(t => t.isOccupied || t.totalDue > 0).length;
  }, [tablesFinancials]);

  // Render Product Card
  const renderProductCard = (item: Product) => {
    const currentStock = stockMap[item.id] ?? 20;
    const isOutOfStock = currentStock <= 0;
    const isLowStock = currentStock > 0 && currentStock <= 5;
    const optionGroups = getProductOptionGroups(item, categories, selectedRestaurant?.id || '');
    const hasOptions = optionGroups.length > 0;
    const hasSugarOption = optionGroups.some(g => g.id.includes('sugar') || g.name.includes('سكر'));

    return (
      <button
        key={item.id}
        onClick={() => handleProductClick(item)}
        disabled={isOutOfStock}
        className={`relative bg-white border rounded-2xl p-2.5 text-right flex flex-col justify-between transition-all group overflow-hidden ${
          isOutOfStock 
            ? 'opacity-40 border-slate-200 cursor-not-allowed bg-slate-50' 
            : 'border-slate-200 hover:border-amber-400 hover:shadow-md active:scale-98 cursor-pointer shadow-xs'
        }`}
      >
        {/* Image or placeholder */}
        <div className="relative w-full h-24 bg-slate-100 rounded-xl overflow-hidden mb-2">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.name_ar || item.name_en || ''}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              <Coffee size={30} />
            </div>
          )}

          {/* Stock Badge */}
          <div className="absolute top-1.5 left-1.5">
            {isOutOfStock ? (
              <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow">
                نفذ
              </span>
            ) : isLowStock ? (
              <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow">
                باقي {currentStock}
              </span>
            ) : null}
          </div>

          {/* Options / Sugar levels Indicator */}
          {hasOptions && (
            <div className="absolute bottom-1.5 right-1.5 bg-slate-900/80 backdrop-blur-sm text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 shadow">
              <Sparkles size={10} />
              <span>{hasSugarOption ? 'درجات سكر' : 'خيارات'}</span>
            </div>
          )}
        </div>

        <div>
          <h4 className="font-bold text-xs text-slate-800 leading-tight line-clamp-1 group-hover:text-amber-600 transition-colors">
            {item.name_ar || item.name_en || (item as any).name}
          </h4>
          <div className="flex items-center justify-between mt-1.5">
            <span className="font-mono font-bold text-emerald-600 text-xs">
              {item.price.toFixed(2)} <span className="text-[10px] font-sans">ج.م</span>
            </span>
            <span className="w-5 h-5 rounded-lg bg-slate-100 group-hover:bg-amber-500 group-hover:text-white text-slate-600 flex items-center justify-center text-xs font-bold transition-colors">
              +
            </span>
          </div>
        </div>
      </button>
    );
  };

  // Click Product: If has options or classifications (like sugar levels, sizes, recipes), open customization modal
  const handleProductClick = (item: Product) => {
    const currentStock = stockMap[item.id] ?? 20;
    if (currentStock <= 0) {
      alert(`عذراً، الصنف "${item.name_ar || item.name_en}" غير متاح حالياً ونفذ من المخزون!`);
      return;
    }

    setSidebarView('cart');

    const groups = getProductOptionGroups(item, categories, selectedRestaurant?.id || '');
    if (groups && groups.length > 0) {
      setCustomizingItem(item);
      setCustomizingGroups(groups);

      // Pre-select default options for single-select groups (e.g. مظبوط for sugar)
      const initialSelections: Record<string, POSOptionChoice[]> = {};
      groups.forEach(g => {
        if (g.type === 'single' && g.choices.length > 0) {
          if (g.id.includes('sugar') || g.name.includes('سكر')) {
            const med = g.choices.find(c => c.id === 'medium' || c.name.includes('مظبوط') || c.name.includes('مضبوط'));
            if (med) initialSelections[g.id] = [med];
          }
        }
      });

      setCustomizingSelections(initialSelections);
      setItemNoteInput('');
      return;
    }

    addToCart(item, [], '');
  };

  const handleToggleChoice = (group: POSOptionGroup, choice: POSOptionChoice) => {
    setCustomizingSelections(prev => {
      const currentList = prev[group.id] || [];
      const isAlreadySelected = currentList.some(c => c.id === choice.id);

      if (group.type === 'single') {
        if (isAlreadySelected) {
          return { ...prev, [group.id]: [] };
        } else {
          return { ...prev, [group.id]: [choice] };
        }
      } else {
        if (isAlreadySelected) {
          return { ...prev, [group.id]: currentList.filter(c => c.id !== choice.id) };
        } else {
          return { ...prev, [group.id]: [...currentList, choice] };
        }
      }
    });
  };

  const handleConfirmCustomization = () => {
    if (!customizingItem) return;

    const allSelectedChoices: POSOptionChoice[] = (Object.values(customizingSelections) as POSOptionChoice[][]).flat();
    const cartOptions: CartItemOption[] = allSelectedChoices.map(c => ({
      name: c.name,
      price: c.priceDelta
    }));

    // Detect sugar level for recipe deduction and kitchen tickets
    let sugarLevel: string | undefined = undefined;
    const sugarChoices: POSOptionChoice[] = customizingSelections['sugar_level'] || [];
    if (sugarChoices.length > 0) {
      sugarLevel = sugarChoices[0].id;
    } else {
      const sugarMatch = allSelectedChoices.find(c => 
        c.id === 'none' || c.id === 'low' || c.id === 'medium' || c.id === 'high' ||
        c.name.includes('بدون سكر') || c.name.includes('سادة') || c.name.includes('زيادة') || c.name.includes('مظبوط')
      );
      if (sugarMatch) {
        if (sugarMatch.id === 'none' || sugarMatch.name.includes('بدون') || sugarMatch.name.includes('سادة')) sugarLevel = 'none';
        else if (sugarMatch.id === 'low' || sugarMatch.name.includes('خفيف')) sugarLevel = 'low';
        else if (sugarMatch.id === 'high' || sugarMatch.name.includes('زيادة')) sugarLevel = 'high';
        else if (sugarMatch.id === 'medium' || sugarMatch.name.includes('مظبوط') || sugarMatch.name.includes('مضبوط')) sugarLevel = 'medium';
      }
    }

    const selectedOptionsMap: Record<string, string> = {};
    (Object.entries(customizingSelections) as [string, POSOptionChoice[]][]).forEach(([gId, list]) => {
      if (list && list.length > 0) {
        selectedOptionsMap[gId] = list.map(c => c.id).join(',');
      }
    });

    addToCart(customizingItem, cartOptions, itemNoteInput, sugarLevel, selectedOptionsMap);
    setCustomizingItem(null);
  };

  const addToCart = (
    item: Product, 
    options: CartItemOption[] = [], 
    notes: string = '',
    sugarLevel?: string,
    selectedOptionsMap?: Record<string, string>
  ) => {
    const optionsPrice = options.reduce((sum, opt) => sum + (opt.price || 0), 0);
    const unitPrice = item.price + optionsPrice;
    const itemName = item.name_ar || item.name_en || (item as any).name || 'صنف';
    const cartItemId = `${item.id}-${options.map(o => o.name).sort().join('_')}-${notes.trim()}-${sugarLevel || ''}`;

    const catObj = categories.find(c => c.id === item.category_id);
    const station = getStationForCategory(catObj?.name_ar || catObj?.name_en || (catObj as any)?.name);

    setCart(prev => {
      const existingIndex = prev.findIndex(ci => ci.id === cartItemId);
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex].quantity += 1;
        return updated;
      }
      return [
        ...prev,
        {
          id: cartItemId,
          menuItemId: item.id,
          name: itemName,
          price: unitPrice,
          quantity: 1,
          notes: notes.trim() || undefined,
          options: options.length > 0 ? options : undefined,
          station: station,
          stockQty: stockMap[item.id] ?? 20,
          sugar_level: sugarLevel,
          selectedOptions: selectedOptionsMap
        }
      ];
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.id === itemId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      }).filter(Boolean) as POSCartItem[];
    });
  };

  const handleRemoveCartItem = (item: POSCartItem) => {
    setCart(prev => prev.filter(ci => ci.id !== item.id));
  };

  const handleClearCart = () => {
    if (cart.length === 0) return;
    if (cart.length > 2) {
      if (confirm('هل تريد مسح جميع الأصناف من الفاتورة؟')) {
        setCart([]);
        setLoadedOrderIds([]);
        setDiscountValue(0);
        setTipsAmount(0);
        setOrderNotes('');
      }
    } else {
      setCart([]);
      setLoadedOrderIds([]);
      setDiscountValue(0);
      setTipsAmount(0);
      setOrderNotes('');
    }
  };

  // Hold Current Bill (تعليق الفاتورة محلياً على جهاز الكاشير بدون إرسالها للمطبخ وبدون تكرار)
  const handleHoldBill = async () => {
    if (cart.length === 0) {
      alert('لا توجد أصناف لتعليق الفاتورة!');
      return;
    }

    const title = orderType === 'dine_in' 
      ? `صالة - طاولة #${selectedTable?.table_number || 'بدون'}`
      : orderType === 'takeaway'
      ? `سفري - ${customerName || 'عميل كاشير'}`
      : `دليفري - ${customerName || 'طلب خارجي'}`;

    const newOrderId = `pos-hold-${Date.now()}`;

    const newHeldBill: HeldBill = {
      id: newOrderId,
      heldAt: new Date().toISOString(),
      title,
      customerName,
      customerPhone,
      customerAddress,
      orderType,
      tableId: selectedTable?.id,
      tableNumber: selectedTable?.table_number,
      cart: [...cart],
      discountType,
      discountValue,
      notes: orderNotes,
      total: finalTotal,
    };

    setHeldBills(prev => [newHeldBill, ...prev]);

    // If table order, mark table as occupied
    if (selectedTable?.id) {
      setTables(prev => prev.map(t => t.id === selectedTable.id ? { ...t, is_occupied: true } : t));
      supabase.from('tables').update({ is_occupied: true }).eq('id', selectedTable.id).then(() => {}, () => {});
    }

    setCart([]);
    setLoadedOrderIds([]);
    setDiscountValue(0);
    setTipsAmount(0);
    setOrderNotes('');
    setCustomerName('');
    setCustomerPhone('');
    setSelectedTable(null);

    addAuditLog('void_item', `تم تعليق الفاتورة (${title}) بإجمالي ${finalTotal.toFixed(2)} ج.م`);
  };

  // إرسال الطلب للمطبخ مع طباعة بون المطبخ الموحد تلقائياً وبشكل فوري (طلب واحد غير مكرر)
  const handleSendOrderToKitchenAndPrint = async () => {
    if (cart.length === 0) {
      alert('السلة فارغة! يرجى إضافة أصناف أولاً قبل الإرسال للمطبخ.');
      return;
    }

    let dailyOrderNum = parseInt(customOrderNumber) || 0;
    if (!dailyOrderNum && loadedOrderIds.length > 0) {
      const alreadyNumberedOrder = activeOrders.find(o => loadedOrderIds.includes(String(o.id)) && o.daily_order_number);
      if (alreadyNumberedOrder && alreadyNumberedOrder.daily_order_number) {
        dailyOrderNum = Number(alreadyNumberedOrder.daily_order_number);
      }
    }
    if (!dailyOrderNum && selectedRestaurant) {
      dailyOrderNum = await getNextDailyOrderNumber(selectedRestaurant.id);
    }
    if (!dailyOrderNum) dailyOrderNum = activeOrders.length + 1;

    // 1. طباعة البون الموحد للمطبخ تلقائياً وفوراً
    printKitchenTicket({
      restaurantName: selectedRestaurant?.name || 'مطعم وكافيه كريتا',
      orderNumber: dailyOrderNum,
      orderType,
      tableNumber: selectedTable?.table_number,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      deliveryAddress: customerAddress.trim() || undefined,
      cashierName: shift.cashierName || 'الرئيسي',
      items: cart.map(it => ({
        name: it.name,
        quantity: it.quantity,
        notes: it.notes,
        options: it.options
      })),
      orderNotes: orderNotes.trim() || undefined
    });

    // 2. إنشاء / تحديث طلب المطبخ النشط كطلب وحيد مباشر
    const targetOrderId = (loadedOrderIds.length > 0 ? loadedOrderIds[0] : null) || `pos-kot-${Date.now()}`;

    const title = orderType === 'dine_in' 
      ? `صالة - طاولة #${selectedTable?.table_number || 'بدون'}`
      : orderType === 'takeaway'
      ? `سفري - ${customerName || 'عميل كاشير'}`
      : `دليفري - ${customerName || 'طلب خارجي'}`;

    if (selectedRestaurant) {
      const liveOrderData: any = {
        id: targetOrderId,
        daily_order_number: dailyOrderNum,
        restaurant_id: selectedRestaurant.id,
        source: 'cashier_pos',
        order_type: orderType,
        table_id: selectedTable?.id || null,
        table_number: selectedTable?.table_number || null,
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        delivery_address: customerAddress.trim() || undefined,
        notes: orderNotes.trim() || undefined,
        total_price: finalTotal,
        total_amount: finalTotal,
        status: 'preparing',
        payment_status: 'unpaid',
        items: cart.map(it => ({
          id: it.menuItemId,
          name: it.name,
          quantity: it.quantity,
          price: it.price,
          notes: it.notes,
          options: it.options
        })),
        created_at: new Date().toISOString()
      };

      // تسجيل في خادم الطلبات المباشرة
      registerLiveOrder(liveOrderData).catch(() => {});

      // خصم مكونات الوصفات من المخزون بمجرد الإرسال للمطبخ للتحضير
      deductOrderRecipeStock(
        selectedRestaurant.id,
        cart.map(it => ({
          id: it.menuItemId,
          name: it.name,
          quantity: it.quantity,
          options: it.options,
          notes: (it as any).notes,
          sugar_level: (it as any).sugar_level || (it as any).sugar,
          selectedOptions: (it as any).selectedOptions
        })),
        String(dailyOrderNum),
        shift.cashierName || 'كاشير'
      ).catch(() => {});

      // تحديث قائمة الطلبات النشطة محلياً وتجنب التكرار
      const existingIds = new Set(loadedOrderIds.map(String));
      setActiveOrders(prev => [
        liveOrderData,
        ...prev.filter(o => String(o.id) !== String(targetOrderId) && !existingIds.has(String(o.id)))
      ]);

      // إشغال الطاولة في حال كان طلب صالة
      if (selectedTable?.id) {
        setTables(prev => prev.map(t => t.id === selectedTable.id ? { ...t, is_occupied: true } : t));
        supabase.from('tables').update({ is_occupied: true }).eq('id', selectedTable.id).then(() => {}, () => {});
      }

      // إذا كان هذا الطلب تم استرجاعه من المعلقات، يتم حذفه من المعلقات حتى لا يتكرر
      if (loadedOrderIds.length > 0) {
        setHeldBills(prev => prev.filter(b => !existingIds.has(String(b.id))));
      }
    }

    setCart([]);
    setLoadedOrderIds([]);
    setDiscountValue(0);
    setTipsAmount(0);
    setOrderNotes('');
    setCustomerName('');
    setCustomerPhone('');
    setSelectedTable(null);
    setCustomOrderNumber('');

    addAuditLog('create_order', `تم إرسال الطلب للمطبخ (${title}) برقم #${dailyOrderNum} وإجمالي ${finalTotal.toFixed(2)} ج.م`);
  };

  // Settle Table Account (تحصيل وسداد حساب الطاولة وإخلاءها)
  const handleSettleTable = async (tableData: any, chosenPaymentMethod: 'cash' | 'card' | 'wallet' = 'cash') => {
    if (!selectedRestaurant || !tableData) return;

    try {
      const tableNum = String(tableData.table_number || '').trim();
      const tableId = String(tableData.id || '').trim();
      const amountToCollect = Number(tableData.totalDue || 0);

      const matchedOrders = tableData.activeOrders || [];
      const matchedHeld = tableData.heldBills || [];
      const allItems: any[] = [];

      // 1. Mark each matched live order as completed and paid
      for (const ord of matchedOrders) {
        await updateLiveOrderStatus(ord.id, selectedRestaurant.id, 'completed', 'paid');
        const items = ord.order_items || ord.items || [];
        if (Array.isArray(items)) {
          allItems.push(...items);
        }
      }

      // Also mark in Supabase
      try {
        if (tableData.id) {
          await supabase
            .from('orders')
            .update({ status: 'delivered', payment_status: 'paid' })
            .eq('restaurant_id', selectedRestaurant.id)
            .eq('table_id', tableData.id)
            .neq('status', 'cancelled');
        }
        await supabase
          .from('tables')
          .update({ is_occupied: false })
          .eq('id', tableData.id);
      } catch (e) {
        console.warn('DB table update error:', e);
      }

      // 2. Remove held bills for this table
      if (matchedHeld.length > 0) {
        matchedHeld.forEach((h: any) => {
          if (Array.isArray(h.cart)) {
            allItems.push(...h.cart);
          }
        });
        setHeldBills(prev => prev.filter(h => {
          const hNum = String(h.tableNumber || '').trim();
          const hId = String(h.tableId || '').trim();
          return hNum !== tableNum && hId !== tableId;
        }));
      }

      // 3. Update local activeOrders and customerLiveOrders
      const matchedOrderIds = new Set(matchedOrders.map((o: any) => String(o.id)));
      setActiveOrders(prev => prev.map(o => {
        if (matchedOrderIds.has(String(o.id))) {
          return { ...o, status: 'completed', payment_status: 'paid', payment_method: chosenPaymentMethod };
        }
        const oNum = String(o.table_number || '').trim();
        const oId = String(o.table_id || '').trim();
        if ((oNum === tableNum || oId === tableId) && o.payment_status !== 'paid') {
          return { ...o, status: 'completed', payment_status: 'paid', payment_method: chosenPaymentMethod };
        }
        return o;
      }));

      setCustomerLiveOrders(prev => prev.map(o => {
        if (matchedOrderIds.has(String(o.id))) {
          return { ...o, status: 'completed', payment_status: 'paid' };
        }
        const oNum = String(o.table_number || '').trim();
        const oId = String(o.table_id || '').trim();
        if ((oNum === tableNum || oId === tableId) && o.payment_status !== 'paid') {
          return { ...o, status: 'completed', payment_status: 'paid' };
        }
        return o;
      }));

      // 4. Update local tables state
      setTables(prev => prev.map(t => t.id === tableData.id ? { ...t, is_occupied: false } : t));

      // 5. Update Shift sales & order count
      if (amountToCollect > 0) {
        const cashAdd = chosenPaymentMethod === 'cash' ? amountToCollect : 0;
        const cardAdd = chosenPaymentMethod === 'card' ? amountToCollect : 0;
        const walletAdd = chosenPaymentMethod === 'wallet' ? amountToCollect : 0;

        const settledCount = matchedOrders.length > 0 ? matchedOrders.length : Math.max(1, matchedHeld.length);

        setShift(prev => ({
          ...prev,
          ordersCount: prev.ordersCount + settledCount,
          totalSales: prev.totalSales + amountToCollect,
          cashSales: prev.cashSales + cashAdd,
          cardSales: prev.cardSales + cardAdd,
          walletSales: prev.walletSales + walletAdd,
        }));

        logShiftAuditRecord(selectedRestaurant.id, {
          ...shift,
          ordersCount: shift.ordersCount + settledCount,
          totalSales: shift.totalSales + amountToCollect,
          cashSales: shift.cashSales + cashAdd,
          cardSales: shift.cardSales + cardAdd,
          walletSales: shift.walletSales + walletAdd,
        }).catch(() => {});
      }

      // 6. Clear cart if it had this table's items
      if (selectedTable?.id === tableData.id) {
        setCart([]);
        setSelectedTable(null);
      }

      // 7. Prepare thermal receipt
      if (amountToCollect > 0) {
        const dailyNum = await getNextDailyOrderNumber(selectedRestaurant.id);
        const receiptData: TaxReceiptData = {
          restaurantName: selectedRestaurant?.name || 'مطعم وكافيه كريتا',
          restaurantLogo: selectedRestaurant?.logo_url,
          taxNumber: restaurantGeofence?.tax_number || '100-245-890',
          commercialRegistration: restaurantGeofence?.commercial_registration || '45892',
          branchAddress: restaurantGeofence?.address || 'بورسعيد - حي الشرق',
          branchPhone: restaurantGeofence?.phone || '01000000000',
          invoiceNumber: `INV-${dailyNum}`,
          dailyOrderNumber: dailyNum,
          orderType: 'dine_in',
          tableNumber: tableData.table_number,
          cashierName: shift.cashierName,
          dateTime: new Date(),
          items: allItems.length > 0 ? allItems.map((it: any) => ({
            name: it.name || it.product_name || (it.products && it.products.name_ar) || 'صنف طاولة',
            quantity: it.quantity || 1,
            unitPrice: Number(it.price || it.price_at_order || 0),
            totalPrice: Number((it.price || it.price_at_order || 0) * (it.quantity || 1)),
            notes: it.notes,
            options: it.options
          })) : [
            {
              name: `حساب طاولة #${tableData.table_number}`,
              quantity: 1,
              unitPrice: amountToCollect,
              totalPrice: amountToCollect
            }
          ],
          subtotal: amountToCollect,
          taxRate: 0,
          taxAmount: 0,
          serviceFeeRate: 0,
          serviceFeeAmount: 0,
          deliveryFee: 0,
          discountAmount: 0,
          finalTotal: amountToCollect,
          paymentMethod: chosenPaymentMethod,
          amountPaid: amountToCollect,
          changeDue: 0
        };
        setTaxReceiptData(receiptData);
        setIsReceiptModalOpen(true);
      }

      // 8. Close settle modal
      setSettleModalTable(null);
    } catch (err: any) {
      console.error('Error settling table:', err);
      alert('حدث خطأ أثناء تحصيل حساب الطاولة: ' + (err?.message || 'يرجى المحاولة مرة أخرى'));
    }
  };

  // Clear Table Without Payment (مسح الحساب وتصفير الطاولة بدون تحصيل / إلغاء)
  const handleClearTableWithoutPayment = async (tableData: any) => {
    if (!selectedRestaurant || !tableData) return;
    if (!confirm(`هل أنت متأكد من مسح الحساب وتصفير وإخلاء طاولة #${tableData.table_number} بدون تحصيل؟`)) {
      return;
    }

    try {
      const tableNum = String(tableData.table_number || '').trim();
      const tableId = String(tableData.id || '').trim();

      const matchedOrders = tableData.activeOrders || [];

      for (const ord of matchedOrders) {
        await updateLiveOrderStatus(ord.id, selectedRestaurant.id, 'cancelled');
      }

      try {
        if (tableData.id) {
          await supabase
            .from('orders')
            .update({ status: 'cancelled' })
            .eq('restaurant_id', selectedRestaurant.id)
            .eq('table_id', tableData.id)
            .neq('status', 'cancelled');
        }
        await supabase
          .from('tables')
          .update({ is_occupied: false })
          .eq('id', tableData.id);
      } catch (e) {}

      setHeldBills(prev => prev.filter(h => {
        const hNum = String(h.tableNumber || '').trim();
        const hId = String(h.tableId || '').trim();
        return hNum !== tableNum && hId !== tableId;
      }));

      const matchedOrderIds = new Set(matchedOrders.map((o: any) => String(o.id)));
      setActiveOrders(prev => prev.map(o => {
        if (matchedOrderIds.has(String(o.id))) {
          return { ...o, status: 'cancelled' };
        }
        const oNum = String(o.table_number || '').trim();
        const oId = String(o.table_id || '').trim();
        if (oNum === tableNum || oId === tableId) {
          return { ...o, status: 'cancelled' };
        }
        return o;
      }));

      setCustomerLiveOrders(prev => prev.map(o => {
        if (matchedOrderIds.has(String(o.id))) {
          return { ...o, status: 'cancelled' };
        }
        const oNum = String(o.table_number || '').trim();
        const oId = String(o.table_id || '').trim();
        if (oNum === tableNum || oId === tableId) {
          return { ...o, status: 'cancelled' };
        }
        return o;
      }));

      setTables(prev => prev.map(t => t.id === tableData.id ? { ...t, is_occupied: false } : t));

      if (selectedTable?.id === tableData.id) {
        setCart([]);
        setSelectedTable(null);
      }

      setSettleModalTable(null);
    } catch (err: any) {
      console.error('Clear table error:', err);
      alert('حدث خطأ أثناء إخلاء الطاولة: ' + (err?.message || 'يرجى المحاولة'));
    }
  };

  // Load Table Items into POS Cart for editing or payment
  const handleLoadTableToCart = (tableData: any) => {
    const matchedOrders = tableData.activeOrders || [];
    const matchedOrderIds = new Set(matchedOrders.map((o: any) => String(o.id)));
    const matchedHeld = (tableData.heldBills || []).filter((h: any) => !matchedOrderIds.has(String(h.id)));

    const newCartItems: POSCartItem[] = [];
    const loadedIds: string[] = [];

    // From active orders
    matchedOrders.forEach((ord: any) => {
      loadedIds.push(String(ord.id));
      const items = ord.order_items || ord.items || [];
      if (Array.isArray(items)) {
        items.forEach((it: any) => {
          newCartItems.push({
            id: `ci-${Date.now()}-${Math.random()}`,
            menuItemId: it.id || it.product_id || `prod-${Math.random()}`,
            name: it.name || it.product_name || (it.products && it.products.name_ar) || 'صنف',
            price: Number(it.price || it.price_at_order || 0),
            quantity: Number(it.quantity || 1),
            notes: it.notes,
            options: it.options
          });
        });
      }
    });

    // From held bills (if any and not already in active orders)
    matchedHeld.forEach((h: any) => {
      loadedIds.push(String(h.id));
      if (Array.isArray(h.cart)) {
        newCartItems.push(...h.cart);
      }
    });

    if (newCartItems.length > 0) {
      setCart(newCartItems);
    }
    setLoadedOrderIds(loadedIds);
    setSelectedTable(tableData);
    setOrderType('dine_in');
    setSettleModalTable(null);
    setActiveTab('pos');
  };

  // Recall Held Bill
  const handleRecallBill = (bill: HeldBill) => {
    setCart([...bill.cart]);
    setLoadedOrderIds([bill.id]);
    setOrderType(bill.orderType);
    if (bill.tableId && tables.length > 0) {
      const tb = tables.find(t => t.id === bill.tableId);
      if (tb) setSelectedTable(tb);
    }
    setCustomerName(bill.customerName || '');
    setCustomerPhone(bill.customerPhone || '');
    setCustomerAddress(bill.customerAddress || '');
    setDiscountType(bill.discountType);
    setDiscountValue(bill.discountValue);
    setOrderNotes(bill.notes || '');

    setHeldBills(prev => prev.filter(b => b.id !== bill.id));
  };

  const handleDeleteHeldBill = (billId: string) => {
    setHeldBills(prev => prev.filter(b => b.id !== billId));
  };

  // Discount with Manager PIN check for large discounts (> 20%)
  const handleApplyDiscount = (val: number, type: 'fixed' | 'percentage') => {
    if (type === 'percentage' && val > 20) {
      setManagerAuthReq({
        isOpen: true,
        title: 'موافقة المدير على الخصم الخاص',
        description: `الخصم المطلوب (${val}%) يتجاوز الحد المسموح للكاشير (20%). يلزم إدخال PIN المدير للموافقة.`,
        action: () => {
          setDiscountType(type);
          setDiscountValue(val);
          addAuditLog('apply_large_discount', `تمت الموافقة على خصم ${val}% بواسطة المدير`);
        }
      });
      return;
    }

    setDiscountType(type);
    setDiscountValue(val);
  };

  // Record Waste / Damaged Stock
  const handleRecordWaste = (wasteData: Omit<WasteRecord, 'id' | 'recordedAt'>) => {
    const newRecord: WasteRecord = {
      ...wasteData,
      id: `waste-${Date.now()}`,
      recordedAt: new Date().toISOString(),
    };

    setWasteLogs(prev => [newRecord, ...prev]);

    setStockMap(prev => {
      const current = prev[wasteData.productId] ?? 20;
      return {
        ...prev,
        [wasteData.productId]: Math.max(0, current - wasteData.quantity),
      };
    });

    addAuditLog('override_stock', `تم تسجيل هالك للصنف ${wasteData.productName} بكمية ${wasteData.quantity}`);
  };

  // Cash Drawer In / Out
  const handleDrawerTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(drawerTransAmount) || 0;
    if (amount <= 0 || !drawerTransReason.trim()) return;

    if (drawerTransType === 'cash_out' && amount > 500) {
      setManagerAuthReq({
        isOpen: true,
        title: 'موافقة المدير على سحب نقدي كبير',
        description: `المبلغ المطلوب سحبه (${amount} ج.م) يتجاوز الحد المسموح للكاشير. يلزم موافقة المدير.`,
        action: () => {
          commitDrawerTransaction(amount);
        }
      });
      return;
    }

    commitDrawerTransaction(amount);
  };

  const commitDrawerTransaction = (amount: number) => {
    const trans = {
      id: `trans-${Date.now()}`,
      type: drawerTransType,
      amount,
      reason: drawerTransReason,
      performedBy: shift.cashierName,
      timestamp: new Date().toISOString(),
    };

    setShift(prev => ({
      ...prev,
      transactions: [...prev.transactions, trans],
    }));

    addAuditLog('cash_out', `حركة درج (${drawerTransType === 'cash_in' ? 'إيداع' : 'سحب'}): ${amount} ج.م - السبب: ${drawerTransReason}`);

    setDrawerTransAmount('');
    setDrawerTransReason('');
    setIsCashDrawerModalOpen(false);
  };

  // Complete Order & Payment
  const handleProcessPayment = async (overridePaymentMethod?: 'cash' | 'card' | 'wallet' | 'split', splitData?: any) => {
    if (cart.length === 0) {
      alert('السلة فارغة! يرجى إضافة أصناف أولاً.');
      return;
    }

    const currentPayMethod = overridePaymentMethod || paymentMethod;

    try {
      let dailyOrderNum = parseInt(customOrderNumber) || 0;
      if (!dailyOrderNum && loadedOrderIds.length > 0) {
        const alreadyNumberedOrder = activeOrders.find(o => loadedOrderIds.includes(String(o.id)) && o.daily_order_number);
        if (alreadyNumberedOrder && alreadyNumberedOrder.daily_order_number) {
          dailyOrderNum = Number(alreadyNumberedOrder.daily_order_number);
        }
      }
      if (!dailyOrderNum && selectedRestaurant) {
        dailyOrderNum = await getNextDailyOrderNumber(selectedRestaurant.id);
      } else if (dailyOrderNum && selectedRestaurant) {
        await syncDailyOrderSequence(selectedRestaurant.id, dailyOrderNum);
      }
      if (!dailyOrderNum) {
        dailyOrderNum = activeOrders.length + 1;
      }

      const invNumber = generateInvoiceNumber(
        restaurantGeofence?.invoice_prefix || 'INV',
        dailyOrderNum
      );

      const orderPayload: any = {
        restaurant_id: selectedRestaurant?.id,
        table_id: selectedTable?.id || null,
        status: 'completed',
        total_amount: finalTotal,
        payment_status: 'paid',
        payment_method: currentPayMethod,
        order_type: orderType,
        source: 'cashier_pos',
        cashier_name: shift.cashierName || 'كاشير الفرع',
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        delivery_address: customerAddress.trim() || undefined,
        daily_order_number: dailyOrderNum,
        items: cart.map(it => ({
          id: it.menuItemId,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          notes: it.notes,
          options: it.options,
          station: it.station
        })),
        discount_amount: discountAmount,
        tax_amount: taxAmount,
        service_fee: serviceFeeAmount,
        delivery_fee: deliveryFee,
        tip_amount: splitData?.tipAmount || tipsAmount,
        created_at: new Date().toISOString()
      };

      let createdOrder: any = null;
      let shouldQueueOffline = false;

      if (navigator.onLine) {
        try {
          let validTableId = null;
          if (selectedTable?.id) {
            const sId = String(selectedTable.id);
            if (sId.length > 20 || (!isNaN(parseInt(sId, 10)) && !sId.includes('table-') && !sId.includes('tb-'))) {
              validTableId = selectedTable.id;
            }
          }

          const { data, error } = await supabase
            .from('orders')
            .insert({
              restaurant_id: selectedRestaurant?.id,
              table_id: validTableId,
              status: 'delivered',
              total_price: parseFloat(finalTotal.toFixed(2))
            })
            .select('id')
            .single();

          if (!error && data) {
            createdOrder = { ...orderPayload, id: data.id };
            try {
              const cashierTag = shift.cashierName || 'كاشير 1';
              const payTag = currentPayMethod;
              const typeTag = orderType === 'dine_in' ? `طاولة ${selectedTable?.table_number || ''}` : orderType === 'takeaway' ? 'سفري' : 'دليفري';
              const itemsPayload = cart.map((it, idx) => {
                const isUuid = typeof it.menuItemId === 'string' && it.menuItemId.length > 20 && it.menuItemId.includes('-');
                return {
                  order_id: data.id,
                  product_id: isUuid ? it.menuItemId : null,
                  quantity: it.quantity,
                  notes: idx === 0 
                    ? `[طلب كاشير POS #${dailyOrderNum} | ${typeTag} | كاشير: ${cashierTag} | دفع: ${payTag}${customerName ? ` | العميل: ${customerName}` : ''}]` 
                    : (it.notes || null),
                  price_at_order: it.price
                };
              });
              await supabase.from('order_items').insert(itemsPayload);
            } catch (itemInsertErr) {
              console.warn('order_items partial insert warning:', itemInsertErr);
            }
          } else {
            console.warn('Supabase insert warning, queueing order locally:', error?.message);
            shouldQueueOffline = true;
          }
        } catch (netErr) {
          console.warn('Network error inserting order, queueing locally:', netErr);
          shouldQueueOffline = true;
        }
      } else {
        shouldQueueOffline = true;
      }

      if (shouldQueueOffline && selectedRestaurant) {
        const queued = queueOfflineOrder(selectedRestaurant.id, orderPayload);
        setOfflineQueue(getOfflineOrdersQueue(selectedRestaurant.id));
        createdOrder = {
          ...orderPayload,
          id: queued.localId,
          is_offline: true,
          table_number: selectedTable?.table_number,
        };
      }

      // Register live order to server & local storage for unified tracking
      if (selectedRestaurant) {
        registerLiveOrder({
          id: createdOrder?.id || `pos-${Date.now()}`,
          daily_order_number: dailyOrderNum,
          restaurant_id: selectedRestaurant.id,
          source: 'cashier_pos',
          cashier_name: shift.cashierName || 'كاشير الفرع',
          order_type: orderType,
          table_id: selectedTable?.id || null,
          table_number: selectedTable?.table_number || null,
          customer_name: customerName.trim() || undefined,
          customer_phone: customerPhone.trim() || undefined,
          delivery_address: customerAddress.trim() || undefined,
          notes: orderNotes.trim() || undefined,
          total_price: finalTotal,
          status: 'completed',
          payment_status: 'paid',
          payment_method: currentPayMethod,
          items: cart.map(it => ({
            id: it.menuItemId,
            name: it.name,
            quantity: it.quantity,
            price: it.price,
            notes: it.notes,
            options: it.options
          })),
          created_at: new Date().toISOString()
        }).catch(() => {});

        // Update inventory store & Auto-deduct recipes raw materials (only if not already deducted when sent to kitchen)
        if (loadedOrderIds.length === 0) {
          deductOrderRecipeStock(
            selectedRestaurant.id,
            cart.map(it => ({
              id: it.menuItemId,
              name: it.name,
              quantity: it.quantity,
              options: it.options,
              notes: (it as any).notes,
              sugar_level: (it as any).sugar_level || (it as any).sugar,
              selectedOptions: (it as any).selectedOptions
            })),
            String(dailyOrderNum),
            shift.cashierName || 'كاشير'
          ).catch(() => {});
        }

        cart.forEach(it => {
          updateProductStock(selectedRestaurant.id, {
            productId: it.menuItemId,
            productName: it.name,
            delta: -it.quantity,
            type: 'sale',
            reason: `مبيعات كاشير - فاتورة #${dailyOrderNum}`,
            performedBy: shift.cashierName || 'كاشير'
          }).catch(() => {});
        });

        // Log shift audit
        logShiftAuditRecord(selectedRestaurant.id, {
          ...shift,
          ordersCount: shift.ordersCount + 1,
          totalSales: shift.totalSales + finalTotal,
          cashSales: shift.cashSales + (currentPayMethod === 'cash' ? finalTotal : 0),
          cardSales: shift.cardSales + (currentPayMethod === 'card' ? finalTotal : 0),
          walletSales: shift.walletSales + (currentPayMethod === 'wallet' ? finalTotal : 0),
        }).catch(() => {});
      }

      // Update local activeOrders list immediately (filter out any old loaded order IDs so it never duplicates)
      const loadedIdsSet = new Set(loadedOrderIds.map(String));
      const newSavedOrder: any = {
        ...(createdOrder || orderPayload),
        id: createdOrder?.id || `pos-${Date.now()}`,
        source: 'cashier_pos',
        cashier_name: shift.cashierName || 'كاشير الفرع',
        payment_method: currentPayMethod,
        table_number: selectedTable?.table_number,
      };
      setActiveOrders(prev => [
        newSavedOrder,
        ...prev.filter(o => String(o.id) !== String(newSavedOrder.id) && !loadedIdsSet.has(String(o.id)))
      ]);

      // If this payment settled one or more loaded orders (from kitchen or table), mark them completed & paid
      if (loadedOrderIds.length > 0 && selectedRestaurant) {
        for (const oldId of loadedOrderIds) {
          updateLiveOrderStatus(oldId, selectedRestaurant.id, 'completed', 'paid', shift.cashierName).catch(() => {});
        }
        setHeldBills(prev => prev.filter(b => !loadedIdsSet.has(String(b.id))));
      }

      // Deduct Inventory Stock
      setStockMap(prev => {
        const next = { ...prev };
        cart.forEach(item => {
          const current = next[item.menuItemId] ?? 20;
          next[item.menuItemId] = Math.max(0, current - item.quantity);
        });
        return next;
      });

      // Update Shift Record with new order breakdown
      const newShiftOrderSummary = {
        id: newSavedOrder.id,
        daily_order_number: dailyOrderNum,
        order_type: orderType,
        table_number: selectedTable?.table_number || null,
        customer_name: customerName.trim() || undefined,
        total_price: finalTotal,
        total: finalTotal,
        total_amount: finalTotal,
        payment_method: currentPayMethod,
        cashier_name: shift.cashierName || 'كاشير الفرع',
        status: 'completed',
        created_at: new Date().toISOString()
      };

      setShift(prev => {
        const cashAdd = currentPayMethod === 'cash' ? finalTotal : (splitData?.cash || 0);
        const cardAdd = currentPayMethod === 'card' ? finalTotal : (splitData?.card || 0);
        const walletAdd = currentPayMethod === 'wallet' ? finalTotal : (splitData?.wallet || 0);

        const updatedShift: ShiftRecord = {
          ...prev,
          ordersCount: prev.ordersCount + 1,
          totalSales: prev.totalSales + finalTotal,
          cashSales: prev.cashSales + cashAdd,
          cardSales: prev.cardSales + cardAdd,
          walletSales: prev.walletSales + walletAdd,
          totalTax: prev.totalTax + taxAmount,
          totalServiceFee: prev.totalServiceFee + serviceFeeAmount,
          totalDiscounts: prev.totalDiscounts + discountAmount,
          totalTips: prev.totalTips + (splitData?.tipAmount || tipsAmount),
          orders: [newShiftOrderSummary, ...(prev.orders || [])],
        };

        if (selectedRestaurant?.id) {
          saveStoredActiveShift(selectedRestaurant.id, updatedShift);
        }

        return updatedShift;
      });

      // Prepare Thermal Tax Receipt
      const receiptData: TaxReceiptData = {
        restaurantName: selectedRestaurant?.name || 'مطعم كريتا',
        restaurantLogo: selectedRestaurant?.logo_url,
        taxNumber: restaurantGeofence?.tax_number || '100-245-890',
        commercialRegistration: restaurantGeofence?.commercial_registration || '45892',
        branchAddress: restaurantGeofence?.address || 'بورسعيد - حي الشرق',
        branchPhone: restaurantGeofence?.phone || '01000000000',
        invoiceNumber: invNumber,
        dailyOrderNumber: dailyOrderNum,
        orderType: orderType,
        tableNumber: selectedTable?.table_number,
        cashierName: shift.cashierName,
        dateTime: new Date(),
        items: cart.map(it => ({
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.price,
          totalPrice: it.price * it.quantity,
          notes: it.notes,
          options: it.options,
        })),
        subtotal: subtotal,
        taxRate: taxRate,
        taxAmount: taxAmount,
        serviceFeeRate: serviceFeeRate,
        serviceFeeAmount: serviceFeeAmount,
        deliveryFee: deliveryFee,
        discountAmount: discountAmount,
        finalTotal: finalTotal,
        paymentMethod: currentPayMethod === 'split' ? 'cash' : currentPayMethod,
        amountPaid: currentPayMethod === 'cash' ? cashNum : finalTotal,
        changeDue: currentPayMethod === 'cash' ? changeDue : 0,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerAddress: customerAddress || undefined,
      };

      setTaxReceiptData(receiptData);
      setIsReceiptModalOpen(true);

      // Reset Cart State
      setCart([]);
      setLoadedOrderIds([]);
      setDiscountValue(0);
      setTipsAmount(0);
      setCashTendered('');
      setCustomOrderNumber('');
      setOrderNotes('');
      if (orderType !== 'dine_in') {
        setCustomerName('');
        setCustomerPhone('');
        setCustomerAddress('');
      } else if (selectedTable) {
        // Clear table state, held bills, and mark table as unoccupied
        const sNum = String(selectedTable.table_number || '').trim();
        const sId = String(selectedTable.id || '').trim();
        setHeldBills(prev => prev.filter(h => {
          const hNum = String(h.tableNumber || '').trim();
          const hId = String(h.tableId || '').trim();
          return hNum !== sNum && hId !== sId;
        }));
        setTables(prev => prev.map(t => t.id === selectedTable.id ? { ...t, is_occupied: false } : t));
        supabase.from('tables').update({ is_occupied: false }).eq('id', selectedTable.id).then(() => {}, () => {});
        setSelectedTable(null);
      }

    } catch (err: any) {
      console.error('Payment execution error:', err);
      alert('حدث خطأ أثناء إتمام العملية: ' + err.message);
    }
  };

  // Refund / Void Completed Order
  const handleRefundOrder = (order: Order) => {
    const anyOrder = order as any;
    const orderTotal = anyOrder.total_amount || anyOrder.total_price || 0;

    setManagerAuthReq({
      isOpen: true,
      title: 'إلغاء ومرتجع فاتورة مدفوعة (Refund)',
      description: `سيتم إرجاع قيمة الفاتورة (${orderTotal} ج.م) للعميل وإلغاء تسجيلها من مبيعات الوردية. يلزم موافقة المدير.`,
      action: async () => {
        try {
          await supabase
            .from('orders')
            .update({ status: 'cancelled', payment_status: 'refunded' })
            .eq('id', order.id);

          setShift(prev => ({
            ...prev,
            totalRefunds: prev.totalRefunds + orderTotal,
          }));

          // Restore product stock and recipe raw materials
          if (anyOrder.items && Array.isArray(anyOrder.items)) {
            anyOrder.items.forEach((it: any) => {
              const pid = it.menuItemId || it.id || it.product_id;
              if (pid) {
                updateProductStock(selectedRestaurant.id, {
                  productId: pid,
                  productName: it.name,
                  delta: it.quantity || 1,
                  type: 'adjustment',
                  reason: `مرتجع فاتورة كاشير #${order.id}`,
                  performedBy: shift.cashierName || 'كاشير'
                }).catch(() => {});
              }
            });

            restoreOrderRecipeStock(
              selectedRestaurant.id,
              anyOrder.items.map((it: any) => ({
                id: it.menuItemId || it.id || it.product_id,
                name: it.name,
                quantity: it.quantity || 1
              })),
              String(order.id),
              shift.cashierName || 'كاشير'
            ).catch(() => {});
          }

          setActiveOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'cancelled', payment_status: 'refunded' } : o));
          addAuditLog('refund_order', `تم استرجاع وإلغاء الفاتورة #${order.id} بقيمة ${orderTotal} ج.م`);
          alert('تم إلغاء واسترجاع الفاتورة بنجاح!');
        } catch (e: any) {
          alert('فشل في إتمام المرتجع: ' + e.message);
        }
      }
    });
  };

  // Shift Closing
  const handleCloseShiftConfirm = (actualCash: number, notes: string) => {
    const totalCashIn = shift.transactions.filter(t => t.type === 'cash_in').reduce((s, t) => s + t.amount, 0);
    const totalCashOut = shift.transactions.filter(t => t.type === 'cash_out').reduce((s, t) => s + t.amount, 0);
    const expected = shift.startingCash + shift.cashSales + totalCashIn - totalCashOut;
    const diff = actualCash - expected;

    const shiftOrdersList = Array.isArray(shift.orders) && shift.orders.length > 0
      ? shift.orders
      : activeOrders;

    const closedShift: ShiftRecord = {
      ...shift,
      isOpen: false,
      closedAt: new Date().toISOString(),
      closingCashActual: actualCash,
      closingCashExpected: expected,
      difference: diff,
      notes: notes,
      orders: shiftOrdersList,
    };

    setShift(closedShift);

    if (selectedRestaurant?.id) {
      saveStoredActiveShift(selectedRestaurant.id, closedShift);
      saveStoredShiftReport(selectedRestaurant.id, 'Z', closedShift, 'وردية الكاشير الرئيسية');
    }

    addAuditLog('close_shift', `تم إغلاق الوردية. النقدية الفعلية: ${actualCash} ج.م، الفارق: ${diff.toFixed(2)} ج.م`);
    alert(`تم إغلاق وردية الكاشير بنجاح! تم حفظ تقرير الـ Z-Report مع سجل كافة فواتير الوردية.`);
  };

  const addAuditLog = (action: POSAuditLog['action'], description: string) => {
    const log: POSAuditLog = {
      id: `log-${Date.now()}`,
      action,
      description,
      performedBy: shift.cashierName,
      timestamp: new Date().toISOString(),
    };
    setAuditLogs(prev => [log, ...prev]);
  };

  const handleUnlockScreen = (customPin?: string) => {
    const restId = selectedRestaurant?.id || '';
    const pinToVerify = (typeof customPin === 'string' ? customPin : lockPinInput).trim();
    const expectedPin = selectedShiftConfig?.pin;

    if (verifyCashierOrManagerPin(restId, pinToVerify, expectedPin)) {
      const chosenName = selectedShiftConfig ? selectedShiftConfig.cashierName : (cashierInputName.trim() || 'كاشير الفرع');
      const updatedShift: ShiftRecord = {
        ...shift,
        cashierName: chosenName,
        startingCash: selectedShiftConfig?.startingCash || shift.startingCash,
      };
      setShift(updatedShift);
      if (restId) {
        saveStoredActiveShift(restId, updatedShift);
      }
      setIsScreenLocked(false);
      setLockPinInput('');
      setLockPinError('');
    } else {
      setLockPinError('رمز PIN غير صحيح! يرجى إدخال الرمز الخاص بك أو مراجعة الإدارة');
      setLockPinInput('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center text-slate-800" dir="rtl">
        <div className="w-14 h-14 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-bold text-slate-700">جاري تحميل نظام الكاشير ونقاط البيع...</p>
        <p className="text-xs text-slate-400 mt-1 font-mono">وضع العمل دون اتصال جاهز 100%</p>
      </div>
    );
  }

  // 🔒 STANDALONE CASHIER LOGIN & LOCK SCREEN (Works 100% Offline with PIN)
  if (isScreenLocked) {
    return (
      <div className="min-h-screen bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4 text-slate-800 select-none" dir="rtl">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl text-center space-y-5 animate-scale-in">
          
          {/* Brand Logo & Restaurant Info */}
          <div className="space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-amber-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-amber-500/25">
              <Lock size={30} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                {selectedRestaurant?.name || 'محطة كاشير كريتا'}
              </h2>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 mt-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>تسجيل دخول واستلام الوردية</span>
              </div>
            </div>
          </div>

          {/* Cashier Name / Operator Shift Selector */}
          <div className="text-right space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-700">اختر اسمك والوردية المسندة لك:</label>
              {selectedShiftConfig && (
                <span className="text-[10px] text-amber-600 font-bold font-mono">
                  {selectedShiftConfig.startTime} - {selectedShiftConfig.endTime}
                </span>
              )}
            </div>

            {availableShifts.length > 0 ? (
              <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto p-1 bg-slate-50 rounded-2xl border border-slate-200">
                {availableShifts.filter(s => s.isActive).map(s => {
                  const isChosen = selectedShiftConfig?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedShiftConfig(s);
                        setCashierInputName(s.cashierName);
                        setLockPinError('');
                        setLockPinInput('');
                      }}
                      className={cn(
                        "p-2.5 rounded-xl text-right text-xs font-bold transition-all flex items-center justify-between border cursor-pointer",
                        isChosen
                          ? "bg-amber-500 text-slate-950 border-amber-600 shadow-sm"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">👤</span>
                        <div>
                          <p className="font-black leading-tight">{s.cashierName}</p>
                          <p className={cn("text-[10px]", isChosen ? "text-slate-900" : "text-slate-400")}>
                            {s.shiftName}
                          </p>
                        </div>
                      </div>
                      <div className="text-left font-mono text-[10px]">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded",
                          isChosen ? "bg-black/15 text-slate-950 font-bold" : "bg-slate-100 text-slate-500"
                        )}>
                          عهدة: {s.startingCash} ج.م
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                type="text"
                value={cashierInputName}
                onChange={e => setCashierInputName(e.target.value)}
                placeholder="مثال: أحمد، كاشير 1..."
                className="w-full bg-slate-50 border border-slate-300 focus:border-amber-500 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none text-center shadow-inner"
              />
            )}
          </div>

          {/* PIN Indicators */}
          <div className="space-y-1">
            <div className="flex justify-center gap-3 py-1">
              {[0, 1, 2, 3].map(idx => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                    lockPinInput.length > idx 
                      ? 'bg-amber-500 border-amber-500 scale-110 shadow-sm' 
                      : 'border-slate-300 bg-slate-100'
                  }`}
                />
              ))}
            </div>
            {lockPinError ? (
              <p className="text-xs text-rose-600 font-bold animate-shake">{lockPinError}</p>
            ) : (
              <p className="text-[11px] text-slate-400 font-medium">أدخل رمز PIN الخاص بالكاشير المحدد لبدء العمل</p>
            )}
          </div>

          {/* Numeric Touch Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
              <button
                key={digit}
                type="button"
                onClick={() => {
                  if (lockPinInput.length < 4) {
                    const next = lockPinInput + digit;
                    setLockPinInput(next);
                    if (next.length === 4) {
                      handleUnlockScreen(next);
                    }
                  }
                }}
                className="h-13 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-800 font-mono font-bold text-xl rounded-2xl border border-slate-200 transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-sm"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setLockPinInput('');
                setLockPinError('');
              }}
              className="h-13 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-2xl border border-slate-200 flex items-center justify-center transition-colors cursor-pointer"
            >
              مسح
            </button>
            <button
              type="button"
              onClick={() => {
                if (lockPinInput.length < 4) {
                  const next = lockPinInput + '0';
                  setLockPinInput(next);
                  if (next.length === 4) {
                    handleUnlockScreen(next);
                  }
                }
              }}
              className="h-13 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-800 font-mono font-bold text-xl rounded-2xl border border-slate-200 flex items-center justify-center shadow-sm"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => handleUnlockScreen()}
              className="h-13 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold text-xs rounded-2xl flex items-center justify-center shadow-md shadow-amber-500/20 transition-all cursor-pointer"
            >
              دخول
            </button>
          </div>

          {/* Bottom Security Information */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-center text-[11px] text-slate-400 gap-1.5 font-medium">
            <Lock size={12} className="text-amber-500" />
            <span>نظام كاشير مستقل ومقيد بهذا الفرع فقط</span>
          </div>

        </div>
      </div>
    );
  }

  const effectivePreset = selectedRestaurant?.business_type_preset || (
    restaurantServices.pos_enabled && restaurantServices.kitchen_enabled && !restaurantServices.tables_enabled ? 'cloud_kitchen' :
    restaurantServices.pos_enabled && !restaurantServices.kitchen_enabled && !restaurantServices.tables_enabled ? 'fast_counter' :
    restaurantServices.pos_enabled && !restaurantServices.delivery_enabled && !restaurantServices.tables_enabled ? 'pos_only' :
    !restaurantServices.pos_enabled && restaurantServices.delivery_enabled ? 'delivery_only' :
    'full_system'
  );
  const currentPresetInfo = getRestaurantPresetDef(effectivePreset);

  return (
    <div className="h-screen w-full bg-slate-100 text-slate-800 flex flex-col overflow-hidden font-sans select-none" dir="rtl">
      
      {/* 🟢 TOP BAR: Brand, Locked Restaurant Info, Shift Status & Fast Actions */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-white font-bold shadow-md shadow-amber-500/20">
              <Sparkles size={18} />
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-sm text-slate-800 tracking-tight">Qrieta POS</span>
              <span className="text-[10px] text-amber-600 block font-mono leading-none font-bold">
                {selectedRestaurant?.name ? selectedRestaurant.name : 'نظام الكاشير المكتبي'}
              </span>
            </div>
          </div>

          {/* 📶 Network & Offline Sync Status Indicator */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border shadow-sm ${
            isOnline 
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
              : 'bg-amber-50 text-amber-800 border-amber-300'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span>{isOnline ? 'متصل بالشبكة' : 'أوفلاين (بدون نت)'}</span>
            {offlineQueue.length > 0 && (
              <button
                type="button"
                onClick={() => selectedRestaurant && syncPendingOrders(selectedRestaurant.id)}
                disabled={!isOnline || isSyncing}
                className="ml-1 px-1.5 py-0.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-[10px] rounded-md transition-colors cursor-pointer"
                title="مزامنة الفواتير غير المرفوعة"
              >
                {isSyncing ? 'جاري المزامنة...' : `مزامنة (${offlineQueue.length})`}
              </button>
            )}
          </div>

          {/* Shift Live Counter Badge - Showing only order counts per payment method, money amounts hidden */}
          <div className="hidden lg:flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs shadow-xs">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-600 font-bold">الطلبات المسددة:</span>
            <span className="inline-flex items-center gap-1 font-bold text-slate-800 bg-white px-2 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
              <span>💵 كاش:</span>
              <span className="font-mono font-black text-emerald-700">{shiftPaymentCounts.cash}</span>
            </span>
            <span className="inline-flex items-center gap-1 font-bold text-blue-800 bg-blue-50/70 px-2 py-0.5 rounded-lg border border-blue-200 shadow-2xs">
              <span>💳 فيزا:</span>
              <span className="font-mono font-black text-blue-700">{shiftPaymentCounts.card}</span>
            </span>
            <span className="inline-flex items-center gap-1 font-bold text-purple-800 bg-purple-50/70 px-2 py-0.5 rounded-lg border border-purple-200 shadow-2xs">
              <span>📱 إنستاباي:</span>
              <span className="font-mono font-black text-purple-700">{shiftPaymentCounts.wallet}</span>
            </span>
            <span className="text-slate-300">|</span>
            <span className="font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
              إجمالي: {shiftPaymentCounts.total} طلب
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Active Cashier Name Badge */}
          <div className="flex items-center gap-1.5 bg-slate-100/90 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-800 shadow-xs">
            <span className="text-amber-600">👤</span>
            <span className="text-xs font-black truncate max-w-[120px]">{shift.cashierName || 'كاشير الفرع'}</span>
            <button
              type="button"
              onClick={() => setIsScreenLocked(true)}
              className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline mr-0.5 font-bold cursor-pointer"
              title="تبديل الوردية أو تسليم كاشير آخر"
            >
              (تبديل)
            </button>
          </div>

          {/* Orders History Modal Shortcut Button */}
          <button
            onClick={() => setIsOrdersHistoryModalOpen(true)}
            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-amber-200 transition-all cursor-pointer shadow-sm"
            title="عرض جميع فواتير اليوم والشيفت"
          >
            <Receipt size={15} className="text-amber-600" />
            <span>الفواتير</span>
            <span className="w-5 h-5 rounded-full bg-amber-500 text-white font-mono font-bold text-[11px] flex items-center justify-center">
              {activeOrders.length}
            </span>
          </button>

          {/* Held Bills Button */}
          <button
            onClick={() => setIsHeldDrawerOpen(true)}
            className="relative px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-slate-200 transition-all cursor-pointer shadow-sm"
          >
            <PauseCircle size={15} className="text-amber-500" />
            <span>معلقة</span>
            {heldBills.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white font-mono font-bold text-[11px] flex items-center justify-center">
                {heldBills.length}
              </span>
            )}
          </button>

          {/* Cash In / Out */}
          <button
            onClick={() => setIsCashDrawerModalOpen(true)}
            className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-slate-200 transition-all cursor-pointer"
            title="تسجيل حركة درج (Cash In / Out)"
          >
            <DollarSign size={14} className="text-emerald-600" />
            <span className="hidden sm:inline">حركة الدرج</span>
          </button>

          {/* Record Waste */}
          <button
            onClick={() => setIsWasteModalOpen(true)}
            className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-slate-200 transition-all cursor-pointer"
            title="تسجيل هالك وتوالف المخزون"
          >
            <Trash2 size={14} className="text-rose-600" />
            <span className="hidden sm:inline">هالك</span>
          </button>

          {/* Lock Screen */}
          <button
            onClick={() => setIsScreenLocked(true)}
            className="p-2 bg-slate-50 hover:bg-amber-50 text-slate-600 hover:text-amber-700 rounded-xl border border-slate-200 transition-all cursor-pointer"
            title="قفل الشاشة مؤقتاً"
          >
            <Lock size={16} />
          </button>
        </div>
      </header>

      {/* Notice if POS preset was marked disabled */}
      {restaurantServices && restaurantServices.pos_enabled === false && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs font-bold flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-amber-600 shrink-0" />
            <span>تنبيه: باقة هذا المتجر مضبوطة على خدمة محددة. شاشة الكاشير متاحة لك كمسؤول/كاشير بكامل ميزاتها.</span>
          </div>
          {selectedRestaurant?.slug && (
            <a 
              href={`/r/${selectedRestaurant.slug}`} 
              target="_blank" 
              rel="noreferrer" 
              className="underline hover:text-amber-950 text-[11px] font-bold"
            >
              فتح تطبيق الطلبات للزبائن
            </a>
          )}
        </div>
      )}

      {/* 📱 MAIN WORKSPACE: Grid Layout (Products 65% | Cart & Settlement 35%) */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* 🍔 LEFT/CENTER AREA: Categories, Search, Products Grid */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-100 border-l border-slate-200">
          
          {/* Search & Category Filter Bar */}
          <div className="bg-white border-b border-slate-200 shrink-0 shadow-xs">
            {/* Row 1: Search Box & Mode Tabs & Group Toggle */}
            <div className="p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100">
              {/* Barcode Search Box */}
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="absolute right-3 top-2.5 text-slate-400" size={16} />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="بحث باسم الصنف أو مسح الباركود..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={handleBarcodeSearch}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-amber-500 rounded-xl pr-9 pl-8 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none font-medium shadow-inner"
                />
                {searchQuery ? (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                ) : (
                  <Barcode className="absolute left-2.5 top-2.5 text-slate-400" size={16} />
                )}
              </div>

              {/* Layout Mode & Tab Controls */}
              <div className="flex items-center gap-1.5">
                {/* Mode Tabs */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setActiveTab('pos')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeTab === 'pos' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    قائمة الأصناف
                  </button>
                  <button
                    onClick={() => setActiveTab('orders')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeTab === 'orders' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    الفواتير ({activeOrders.length})
                  </button>
                  {restaurantServices.tables_enabled && (
                    <button
                      onClick={() => setActiveTab('tables')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeTab === 'tables' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      الطاولات ({tables.length})
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Row 2: Categories Bar with Left & Right Scroll Buttons for Easy Flipping */}
            {activeTab === 'pos' && (
              <div className="px-2 py-1.5 bg-slate-50/80 flex items-center gap-1.5">
                {/* Scroll Right Button (in RTL, Right = Previous) */}
                <button
                  type="button"
                  onClick={() => scrollCategories('right')}
                  className="w-7 h-7 rounded-lg bg-white hover:bg-amber-50 text-slate-600 hover:text-amber-700 border border-slate-200 flex items-center justify-center shrink-0 shadow-xs transition-colors cursor-pointer"
                  title="الأقسام السابقة"
                >
                  <ChevronRight size={15} />
                </button>

                {/* Categories Chips Container */}
                <div 
                  ref={categoryScrollRef}
                  className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 scroll-smooth"
                >
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                      selectedCategory === 'all'
                        ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/20'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    الكل ({products.length})
                  </button>
                  {categories.map(cat => {
                    const catCount = products.filter(p => p.category_id === cat.id).length;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setSelectedCategory(cat.id);
                          if (groupByCategory) {
                            const elem = document.getElementById(`category-sec-${cat.id}`);
                            if (elem) {
                              elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
                          selectedCategory === cat.id
                            ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/20'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span>{cat.name_ar || cat.name_en || (cat as any).name}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                          selectedCategory === cat.id ? 'bg-amber-600/60 text-white' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {catCount}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Scroll Left Button (in RTL, Left = Next) */}
                <button
                  type="button"
                  onClick={() => scrollCategories('left')}
                  className="w-7 h-7 rounded-lg bg-white hover:bg-amber-50 text-slate-600 hover:text-amber-700 border border-slate-200 flex items-center justify-center shrink-0 shadow-xs transition-colors cursor-pointer"
                  title="الأقسام التالية"
                >
                  <ChevronLeft size={15} />
                </button>
              </div>
            )}
          </div>

          {/* 🔔 Clean Banner Alert if new customer orders arrived while viewing Cart */}
          {unhandledCustomerOrdersCount > 0 && sidebarView !== 'customer_orders' && (
            <div 
              onClick={() => setSidebarView('customer_orders')}
              className="bg-gradient-to-r from-red-600 via-orange-600 to-amber-600 text-white px-4 py-2.5 mx-3 my-2 rounded-2xl flex items-center justify-between gap-3 shadow-lg border border-red-400 animate-pulse cursor-pointer shrink-0"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-white text-red-600 flex items-center justify-center font-bold text-base">
                  🔔
                </span>
                <div>
                  <p className="font-black text-xs sm:text-sm text-white flex items-center gap-1.5">
                    <span>يوجد {unhandledCustomerOrdersCount} طلب زبائن جديد بالانتظار!</span>
                    <span className="bg-slate-900 text-white font-mono text-[11px] px-2 py-0.2 rounded-md">
                      #{getDisplayOrderNumber(latestCustomerOrder)}
                    </span>
                  </p>
                  <p className="text-[11px] text-orange-100">
                    {latestCustomerOrder?.order_type === 'delivery' ? '🛵 دليفري خارجي' : `🍽️ صالة - طاولة #${latestCustomerOrder?.table_number}`}
                    {' • '}انقر هنا للتبديل لشاشة طلبات الزبائن فوراً
                  </p>
                </div>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setSidebarView('customer_orders');
                }}
                className="bg-white text-red-600 hover:bg-orange-50 font-black text-xs px-3 py-1.5 rounded-xl shadow cursor-pointer"
              >
                عرض طلبات الزبائن
              </button>
            </div>
          )}

          {/* Tab 1: Product Grid View (Items side-by-side) */}
          {activeTab === 'pos' && (
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
              {/* 🍽️ LIVE DINING TABLES & FINANCIALS STRIP (معروضة في الشاشة الرئيسية قدام عين الكاشير) */}
              {tablesFinancials.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-3.5 space-y-3">
                  {/* Tables Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm shadow-amber-500/20">
                        <UtensilsCrossed size={16} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-black text-sm text-slate-800">
                            طاولات الصالة والحسابات المفتوحة
                          </h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {occupiedTablesCount} مشغولة من أصل {tablesFinancials.length}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          معاينة لحظية لكل طاولة والمبلغ المطلوب تحصيله منها فوراً
                        </p>
                      </div>
                    </div>

                    {/* Top Highlight Badge for Grand Total */}
                    <div className="flex items-center gap-2">
                      <div className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm flex items-center gap-2 font-black text-xs">
                        <span>إجمالي مستحقات الطاولات:</span>
                        <span className="font-mono text-sm bg-black/20 px-2 py-0.5 rounded-lg">
                          {allTablesTotalDue.toFixed(2)} ج.م
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tables Ribbon / Horizontal Scrollable Grid */}
                  <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar py-1">
                    {tablesFinancials.map(t => {
                      const isSelected = selectedTable?.id === t.id;
                      const hasDue = t.totalDue > 0;

                      return (
                        <div
                          key={t.id}
                          className={cn(
                            "shrink-0 min-w-[130px] p-2 rounded-2xl border text-center transition-all flex flex-col justify-between gap-1.5 select-none",
                            isSelected
                              ? "bg-amber-500/10 border-amber-500 shadow-md ring-2 ring-amber-300"
                              : hasDue
                              ? "bg-rose-50/95 border-rose-300 text-rose-900 shadow-xs"
                              : t.isOccupied
                              ? "bg-amber-50 border-amber-200 text-amber-900"
                              : "bg-slate-50 border-slate-200 text-slate-700"
                          )}
                        >
                          <div 
                            onClick={() => {
                              if (hasDue) {
                                setSettleModalTable(t);
                              } else {
                                setSelectedTable(t);
                                setOrderType('dine_in');
                              }
                            }}
                            className="flex items-center justify-between w-full cursor-pointer"
                          >
                            <span className="font-black text-xs">طاولة #{t.table_number}</span>
                            <span className={cn(
                              "w-2.5 h-2.5 rounded-full",
                              hasDue ? "bg-rose-500 animate-pulse" : t.isOccupied ? "bg-amber-500" : "bg-emerald-400"
                            )} />
                          </div>

                          {/* Money to be collected under each table */}
                          <div 
                            onClick={() => {
                              if (hasDue) {
                                setSettleModalTable(t);
                              } else {
                                setSelectedTable(t);
                                setOrderType('dine_in');
                              }
                            }}
                            className="w-full bg-white/95 rounded-xl py-1 px-1 text-center border border-black/5 shadow-2xs cursor-pointer"
                          >
                            <span className="text-[10px] text-slate-400 font-bold block leading-none mb-0.5">
                              {hasDue ? 'مطلوب تحصيله:' : 'الحالة:'}
                            </span>
                            <span className={cn(
                              "font-mono font-black text-xs block leading-tight",
                              hasDue ? "text-rose-700 font-black text-sm" : "text-emerald-600"
                            )}>
                              {hasDue ? `${t.totalDue.toFixed(0)} ج.م` : 'متاحة (0 ج.م)'}
                            </span>
                          </div>

                          {/* Quick Action Button: Settle/Clear if hasDue, or Select if empty */}
                          {hasDue ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSettleModalTable(t);
                              }}
                              className="w-full py-1 px-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-[10px] flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
                              title="تحصيل وسداد حساب الطاولة أو تصفيره وإخلاء الطاولة"
                            >
                              <DollarSign size={11} />
                              <span>سداد وتحصيل</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTable(t);
                                setOrderType('dine_in');
                              }}
                              className={cn(
                                "w-full py-1 px-1.5 rounded-xl font-bold text-[10px] flex items-center justify-center gap-1 transition-all cursor-pointer",
                                isSelected ? "bg-amber-500 text-white" : "bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
                              )}
                            >
                              <span>{isSelected ? 'طاولة محددة' : 'فتح طلب'}</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Grand Total Summary Box under all tables */}
                  <div className="bg-slate-50 rounded-xl p-2.5 px-3 border border-slate-200/70 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-700 gap-2">
                    <div className="flex items-center gap-2 font-bold flex-wrap">
                      <span className="text-base">💵</span>
                      <span>إجمالي المبيع المطلوب تحصيله من كل الطاولات:</span>
                      <span className="font-mono font-black text-slate-950 bg-white px-2.5 py-0.5 rounded-lg border border-slate-300 text-sm shadow-2xs">
                        {allTablesTotalDue.toFixed(2)} جنيه
                      </span>
                      <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 text-[11px] font-bold">
                        (كل الترابيزات مفروض تدفع {allTablesTotalDue.toFixed(0)} جنيه)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">
                        {selectedTable ? `المحددة حالياً: طاولة #${selectedTable.table_number}` : 'اختر طاولة لتسجيل طلب'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('tables')}
                        className="text-xs font-bold text-amber-600 hover:text-amber-800 hover:underline cursor-pointer"
                      >
                        عرض المخطط الشامل
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Category Filter Active Indicator if filtered */}
              {selectedCategory !== 'all' && (
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <h3 className="font-black text-sm text-slate-800">
                      {categories.find(c => c.id === selectedCategory)?.name_ar || 
                       categories.find(c => c.id === selectedCategory)?.name_en || 'القسم المختار'}
                    </h3>
                    <span className="text-[11px] font-mono font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                      {filteredProducts.length} صنف
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className="text-xs text-amber-600 hover:text-amber-700 font-bold hover:underline cursor-pointer"
                  >
                    عرض جميع الأصناف
                  </button>
                </div>
              )}

              {/* Side-by-Side Products Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                {filteredProducts.map(renderProductCard)}
              </div>

              {filteredProducts.length === 0 && (
                <div className="text-center py-16 text-slate-400">
                  <Package size={44} className="mx-auto text-slate-300 mb-2" />
                  <p className="font-bold text-sm text-slate-600">لا توجد أصناف مطابقة للبحث أو القسم المختار</p>
                  <button
                    onClick={() => { setSelectedCategory('all'); setSearchQuery(''); }}
                    className="mt-3 px-3 py-1.5 bg-amber-500 text-white rounded-xl text-xs font-bold shadow cursor-pointer hover:bg-amber-600"
                  >
                    عرض جميع الأصناف
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Orders History & Refunds */}
          {activeTab === 'orders' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div>
                  <h3 className="font-bold text-sm text-slate-800">سجل فواتير اليوم والشيفت الحالي</h3>
                  <p className="text-xs text-slate-500">معاينة الطلبات والتحصيل أو إلغاء ومرتجع الفاتورة</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full border border-amber-200">
                    ({activeOrders.length}) طلبات
                  </span>
                  <button
                    onClick={() => setIsOrdersHistoryModalOpen(true)}
                    className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 flex items-center gap-1 shadow-sm"
                  >
                    <Maximize size={12} />
                    <span>شاشة الفواتير الكاملة</span>
                  </button>
                </div>
              </div>

              {activeOrders.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-2">
                  <Receipt size={40} className="text-slate-300" />
                  <p className="font-bold text-sm text-slate-600">لا توجد فواتير منشأة حتى الآن</p>
                  <p className="text-xs text-slate-400">ستظهر الفواتير هنا فور إتمام عمليات البيع من شاشة الكاشير</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {activeOrders.map((ord: any) => {
                    const total = ord.total_amount || ord.total_price || 0;
                    return (
                      <div key={ord.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm hover:border-slate-300 transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center font-bold font-mono text-xs">
                              #{getDisplayOrderNumber(ord)}
                            </span>
                            <span className="font-bold text-slate-800 text-xs">
                              {ord.order_type === 'dine_in' ? 'صالة' : ord.order_type === 'takeaway' ? 'سفري' : 'دليفري'}
                            </span>
                            {ord.table_number && (
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                                ط #{ord.table_number}
                              </span>
                            )}
                            {ord.payment_status === 'unpaid' && (
                              <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-bold">
                                غير مسدد
                              </span>
                            )}
                          </div>
                          <span className="font-mono font-bold text-emerald-600 text-sm">
                            {total.toFixed(2)} ج.م
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1">
                          {Array.isArray(ord.items) && ord.items.map((it: any, idx: number) => (
                            <div key={idx} className="flex justify-between">
                              <span>{it.quantity}x {it.name}</span>
                              <span className="font-mono text-slate-500">{((it.price || 0) * (it.quantity || 1)).toFixed(2)} ج.م</span>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between pt-1 text-xs border-t border-slate-100">
                          <span className="text-slate-400 font-mono">
                            {new Date(ord.created_at || Date.now()).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                          </span>

                          <div className="flex items-center gap-1.5">
                            {ord.payment_status === 'unpaid' && (
                              <button
                                onClick={() => {
                                  const newCart: POSCartItem[] = Array.isArray(ord.items) ? ord.items.map((it: any) => ({
                                    id: `ci-${Date.now()}-${Math.random()}`,
                                    menuItemId: it.id || `prod-${Math.random()}`,
                                    name: it.name,
                                    price: Number(it.price || 0),
                                    quantity: Number(it.quantity || 1),
                                    notes: it.notes,
                                    options: it.options
                                  })) : [];
                                  setCart(newCart);
                                  setLoadedOrderIds([String(ord.id)]);
                                  setOrderType(ord.order_type || 'takeaway');
                                  setCustomerName(ord.customer_name || '');
                                  setCustomerPhone(ord.customer_phone || '');
                                  setCustomerAddress(ord.delivery_address || '');
                                  setOrderNotes(ord.notes || '');
                                  setCustomOrderNumber(String(getDisplayOrderNumber(ord)));
                                  if (ord.table_number) {
                                    const found = tables.find(t => String(t.table_number) === String(ord.table_number));
                                    if (found) setSelectedTable(found);
                                  }
                                  setActiveTab('pos');
                                  setSidebarView('cart');
                                }}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                                title="تحصيل الفاتورة الآن"
                              >
                                <DollarSign size={12} />
                                <span>تحصيل</span>
                              </button>
                            )}

                            <button
                              onClick={() => {
                                const receiptData: TaxReceiptData = {
                                  restaurantName: selectedRestaurant?.name || 'مطعم كريتا',
                                  taxNumber: restaurantGeofence?.tax_number || '100-245-890',
                                  commercialRegistration: restaurantGeofence?.commercial_registration || '45892',
                                  branchAddress: restaurantGeofence?.address || 'بورسعيد - حي الشرق',
                                  branchPhone: restaurantGeofence?.phone || '01000000000',
                                  invoiceNumber: `INV-${getDisplayOrderNumber(ord)}`,
                                  dailyOrderNumber: getDisplayOrderNumber(ord),
                                  orderType: ord.order_type || 'dine_in',
                                  tableNumber: ord.table_number,
                                  cashierName: shift.cashierName,
                                  dateTime: new Date(ord.created_at || Date.now()),
                                  items: Array.isArray(ord.items) ? ord.items.map((it: any) => ({
                                    name: it.name,
                                    quantity: it.quantity,
                                    unitPrice: it.price,
                                    totalPrice: (it.price || 0) * (it.quantity || 1),
                                    notes: it.notes,
                                    options: it.options,
                                  })) : [],
                                  subtotal: total - (ord.tax_amount || 0) - (ord.service_fee || 0),
                                  taxRate: 14,
                                  taxAmount: ord.tax_amount || 0,
                                  serviceFeeRate: 12,
                                  serviceFeeAmount: ord.service_fee || 0,
                                  deliveryFee: ord.delivery_fee || 0,
                                  discountAmount: ord.discount_amount || 0,
                                  finalTotal: total,
                                  paymentMethod: ord.payment_method || 'cash',
                                  amountPaid: total,
                                  changeDue: 0,
                                  customerName: ord.customer_name,
                                  customerPhone: ord.customer_phone,
                                  customerAddress: ord.delivery_address,
                                };
                                setTaxReceiptData(receiptData);
                                setIsReceiptModalOpen(true);
                              }}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                              title="طباعة الإيصال"
                            >
                              <Printer size={12} />
                              <span>فاتورة</span>
                            </button>

                            <button
                              onClick={() => {
                                printKitchenTicket({
                                  restaurantName: selectedRestaurant?.name || 'مطعم وكافيه كريتا',
                                  orderNumber: getDisplayOrderNumber(ord),
                                  orderType: ord.order_type || 'dine_in',
                                  tableNumber: ord.table_number,
                                  customerName: ord.customer_name,
                                  customerPhone: ord.customer_phone,
                                  deliveryAddress: ord.delivery_address,
                                  cashierName: shift.cashierName || 'الرئيسي',
                                  items: Array.isArray(ord.items) ? ord.items.map((it: any) => ({
                                    name: it.name,
                                    quantity: it.quantity,
                                    notes: it.notes,
                                    options: it.options,
                                  })) : [],
                                  orderNotes: ord.notes,
                                });
                              }}
                              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                              title="طباعة بون المطبخ الموحد"
                            >
                              <ChefHat size={12} />
                              <span>بون مطبخ</span>
                            </button>

                            {ord.status !== 'cancelled' && (
                              <button
                                onClick={() => handleRefundOrder(ord)}
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                              >
                                <RotateCcw size={12} />
                                <span>مرتجع</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Tables Floor Map */}
          {activeTab === 'tables' && (
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-4">
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
                    <UtensilsCrossed size={18} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 text-sm">مخطط صالة المطعم والطاولات</h3>
                    <p className="text-[11px] text-slate-400">اختر أي طاولة لبدء تسجيل طلب صالة أو تحصيل حسابها</p>
                  </div>
                </div>

                <div className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center gap-2 shadow-sm">
                  <span className="text-amber-400">إجمالي المطلوب تحصيله:</span>
                  <span className="font-mono text-sm text-emerald-400 font-black">{allTablesTotalDue.toFixed(2)} ج.م</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {tablesFinancials.map(table => {
                  const isSelected = selectedTable?.id === table.id;
                  const hasDue = table.totalDue > 0;

                  return (
                    <div
                      key={table.id}
                      className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-between gap-2 shadow-sm select-none ${
                        isSelected 
                          ? 'bg-amber-500/10 border-amber-400 ring-2 ring-amber-300'
                          : hasDue
                          ? 'bg-rose-50/90 border-rose-300 text-rose-900 shadow-xs'
                          : table.isOccupied
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-white border-slate-200 text-slate-800'
                      }`}
                    >
                      <div 
                        onClick={() => {
                          if (hasDue) {
                            setSettleModalTable(table);
                          } else {
                            setSelectedTable(table);
                            setOrderType('dine_in');
                            setActiveTab('pos');
                          }
                        }}
                        className="flex items-center justify-between w-full cursor-pointer"
                      >
                        <span className="font-black text-xs">طاولة #{table.table_number}</span>
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          hasDue ? 'bg-rose-500 animate-pulse' : table.isOccupied ? 'bg-amber-500' : 'bg-emerald-400'
                        }`} />
                      </div>

                      <div 
                        onClick={() => {
                          if (hasDue) {
                            setSettleModalTable(table);
                          } else {
                            setSelectedTable(table);
                            setOrderType('dine_in');
                            setActiveTab('pos');
                          }
                        }}
                        className="w-full flex flex-col items-center cursor-pointer"
                      >
                        <UtensilsCrossed size={22} className={isSelected ? 'text-amber-600' : 'text-slate-500'} />

                        <div className="w-full bg-white/95 rounded-xl py-1 px-1.5 text-center border border-black/5 shadow-2xs mt-2">
                          <span className="text-[10px] text-slate-400 font-bold block leading-none mb-0.5">
                            {hasDue ? 'مطلوب تحصيله:' : 'الحالة:'}
                          </span>
                          <span className={`font-mono font-black text-xs block leading-tight ${
                            hasDue ? 'text-rose-700 font-black text-sm' : 'text-emerald-600'
                          }`}>
                            {hasDue ? `${table.totalDue.toFixed(0)} ج.م` : 'متاحة (0 ج.م)'}
                          </span>
                        </div>
                      </div>

                      {/* Action Button */}
                      {hasDue ? (
                        <button
                          type="button"
                          onClick={() => setSettleModalTable(table)}
                          className="w-full py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
                          title="تحصيل وسداد حساب الطاولة أو تصفيره وإخلاء الطاولة"
                        >
                          <DollarSign size={13} />
                          <span>سداد وتحصيل</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTable(table);
                            setOrderType('dine_in');
                            setActiveTab('pos');
                          }}
                          className={`w-full py-1.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer ${
                            isSelected ? 'bg-amber-500 text-white' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          <span>{isSelected ? 'طاولة محددة' : 'بدء طلب'}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Grand Total Footer Banner */}
              <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-bold text-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-base">💰</span>
                  <span>إجمالي المبيع المطلوب تحصيله من كل الطاولات:</span>
                  <span className="font-mono text-base font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
                    {allTablesTotalDue.toFixed(2)} جنيه
                  </span>
                </div>
                <div className="text-slate-500 text-[11px]">
                  (كل الترابيزات مفروض تدفع <span className="font-bold text-slate-800">{allTablesTotalDue.toFixed(0)} جنيه</span>)
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Customer App Live Orders Workspace */}
          {activeTab === 'customer_orders' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-100">
              {/* Workspace Header & Action Controls */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
                    <Bell size={20} className={unhandledCustomerOrdersCount > 0 ? "animate-bounce" : ""} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                      <span>شاشة طلبات تطبيق الزبائن الحية</span>
                      {unhandledCustomerOrdersCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-black animate-pulse">
                          {unhandledCustomerOrdersCount} بانتظار الاستلام
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      تتلقى هذه الشاشة كافة طلبات الزبائن (سواء من الطاولات عبر QR أو طلبات الدليفري) برقم متسلسل موحد مع الكاشير
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsSoundMuted(!isSoundMuted)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      isSoundMuted 
                        ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    {isSoundMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                    <span>{isSoundMuted ? 'تنبيه الصوت: مكتوم' : 'تنبيه الصوت: مفعّل'}</span>
                  </button>

                  <button
                    onClick={async () => {
                      if (!selectedRestaurant) return;
                      const list = await fetchLiveOrders(selectedRestaurant.id);
                      setCustomerLiveOrders(list.filter(o => o.source === 'customer_app'));
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-200 transition-all cursor-pointer shadow-sm"
                  >
                    <RefreshCw size={13} />
                    <span>تحديث الآن</span>
                  </button>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <button
                  onClick={() => setCustomerFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                    customerFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  جميع طلبات الزبائن ({customerLiveOrders.length})
                </button>
                <button
                  onClick={() => setCustomerFilter('new')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                    customerFilter === 'new'
                      ? 'bg-red-600 text-white shadow-md shadow-red-500/20'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                  <span>طلبات جديدة غير مستلمة ({customerLiveOrders.filter(o => o.status === 'new').length})</span>
                </button>
                <button
                  onClick={() => setCustomerFilter('dine_in')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                    customerFilter === 'dine_in'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <UtensilsCrossed size={13} />
                  <span>طاولات الصالة QR ({customerLiveOrders.filter(o => o.order_type === 'dine_in').length})</span>
                </button>
                <button
                  onClick={() => setCustomerFilter('delivery')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                    customerFilter === 'delivery'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Bike size={13} />
                  <span>دليفري وتوصيل ({customerLiveOrders.filter(o => o.order_type === 'delivery').length})</span>
                </button>
                <button
                  onClick={() => setCustomerFilter('completed')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                    customerFilter === 'completed'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  مكتملة ومسلمة ({customerLiveOrders.filter(o => o.status === 'completed' || o.status === 'delivered').length})
                </button>
              </div>

              {/* Orders Grid */}
              {customerLiveOrders.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-orange-50 text-orange-500 mx-auto flex items-center justify-center">
                    <Smartphone size={32} />
                  </div>
                  <h4 className="font-black text-slate-800 text-base">لا توجد طلبات من تطبيق الزبائن حتى الآن</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    بمجرد قيام أي زبون بطلب أوردر عبر مسح باركود الطاولة أو طلب دليفري من تطبيق الزبائن، سيظهر هنا مباشرة مع تنبيه صوتي وطباعة فورية لبون المطبخ
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {customerLiveOrders
                    .filter(ord => {
                      if (customerFilter === 'new') return ord.status === 'new';
                      if (customerFilter === 'dine_in') return ord.order_type === 'dine_in';
                      if (customerFilter === 'delivery') return ord.order_type === 'delivery';
                      if (customerFilter === 'completed') return ord.status === 'completed' || ord.status === 'delivered';
                      return true;
                    })
                    .map(ord => {
                      const isNew = ord.status === 'new';
                      const isDelivery = ord.order_type === 'delivery';
                      const formattedDate = new Date(ord.created_at).toLocaleTimeString('ar-EG', {
                        hour: '2-digit',
                        minute: '2-digit'
                      });

                      return (
                        <div
                          key={ord.id}
                          className={`bg-white rounded-2xl p-4 space-y-3 shadow-md border-2 transition-all ${
                            isNew 
                              ? 'border-red-500 shadow-red-500/10 animate-in fade-in zoom-in-95' 
                              : ord.status === 'preparing'
                              ? 'border-blue-400'
                              : ord.status === 'ready'
                              ? 'border-amber-400 shadow-amber-500/10'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {/* Order Header */}
                          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 rounded-xl bg-slate-900 text-white font-mono font-black text-sm">
                                  #{getDisplayOrderNumber(ord)}
                                </span>
                                {isDelivery ? (
                                  <span className="px-2 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 rounded-lg text-xs font-black flex items-center gap-1">
                                    <Bike size={13} />
                                    <span>دليفري</span>
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-xs font-black flex items-center gap-1">
                                    <UtensilsCrossed size={13} />
                                    <span>طاولة #{ord.table_number || 'صالة'}</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 font-mono mt-1 flex items-center gap-1">
                                <Clock size={11} />
                                <span>{formattedDate}</span>
                                <span>• تطبيق الزبائن</span>
                              </p>
                            </div>

                            <div className="text-left">
                              {isNew ? (
                                <span className="px-2.5 py-1 bg-red-500 text-white rounded-xl text-[11px] font-black inline-block animate-pulse">
                                  🔴 جديد ينتظر
                                </span>
                              ) : ord.status === 'preparing' ? (
                                <span className="px-2.5 py-1 bg-blue-500 text-white rounded-xl text-[11px] font-black inline-block">
                                  🔵 قيد التحضير
                                </span>
                              ) : ord.status === 'ready' ? (
                                <span className="px-2.5 py-1 bg-amber-500 text-white rounded-xl text-[11px] font-black inline-block animate-pulse">
                                  🔔 جاهز للتسليم
                                </span>
                              ) : (ord.status === 'completed' || ord.status === 'delivered') ? (
                                <span className="px-2.5 py-1 bg-emerald-600 text-white rounded-xl text-[11px] font-black inline-block">
                                  🟢 مكتمل ومستلم
                                </span>
                              ) : ord.status === 'cancelled' ? (
                                <span className="px-2.5 py-1 bg-slate-600 text-white rounded-xl text-[11px] font-black inline-block">
                                  ⚫ ملغي
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 bg-slate-400 text-white rounded-xl text-[11px] font-black inline-block">
                                  {ord.status}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Customer Delivery Details if Delivery */}
                          {isDelivery && (
                            <div className="bg-purple-50/60 p-2.5 rounded-xl border border-purple-100 text-xs space-y-1 text-purple-950">
                              <p className="font-bold flex items-center gap-1.5">
                                <User size={12} className="text-purple-700" />
                                <span>العميل: {ord.customer_name || 'عميل دليفري'}</span>
                              </p>
                              {ord.customer_phone && (
                                <p className="font-mono text-purple-800 flex items-center gap-1.5">
                                  <Phone size={12} className="text-purple-700" />
                                  <a href={`tel:${ord.customer_phone}`} className="underline hover:text-purple-900">{ord.customer_phone}</a>
                                </p>
                              )}
                              {ord.delivery_address && (
                                <p className="text-[11px] text-purple-900 flex items-start gap-1.5 leading-snug">
                                  <MapPin size={12} className="text-purple-700 shrink-0 mt-0.5" />
                                  <span>{ord.delivery_address}</span>
                                </p>
                              )}
                              {ord.notes && (
                                <p className="text-[10px] text-purple-700 bg-white/60 p-1.5 rounded-lg border border-purple-200/60">
                                  ملاحظة: {ord.notes}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Order Items List */}
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs space-y-1.5 max-h-48 overflow-y-auto">
                            {ord.items.map((item, idx) => (
                              <div key={idx} className="flex items-start justify-between text-slate-800 border-b border-slate-100 pb-1 last:border-0 last:pb-0">
                                <div>
                                  <span className="font-bold">{item.quantity}x {item.name}</span>
                                  {item.options && item.options.length > 0 && (
                                    <div className="text-[10px] text-slate-500">
                                      {item.options.map((o: any, oi: number) => (
                                        <span key={oi} className="ml-1">+{o.name}</span>
                                      ))}
                                    </div>
                                  )}
                                  {item.notes && (
                                    <div className="text-[10px] text-amber-700 font-medium">
                                      ملاحظة: {item.notes}
                                    </div>
                                  )}
                                </div>
                                <span className="font-mono font-bold text-slate-600 shrink-0">
                                  {((item.price || 0) * (item.quantity || 1)).toFixed(2)} ج.م
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Total & Settlement Info */}
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <div>
                              <span className="text-[11px] text-slate-500 block">الإجمالي المطلوب:</span>
                              <span className="font-mono font-black text-emerald-600 text-base">
                                {ord.total_price.toFixed(2)} ج.م
                              </span>
                            </div>
                            <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-700">
                              {ord.payment_status === 'paid' ? 'مدفوع مسبقاً' : 'الدفع عند الاستلام'}
                            </span>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                            {isNew ? (
                              <button
                                onClick={() => handleSendCustomerOrderToKitchen(ord)}
                                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer transition-all"
                              >
                                <ChefHat size={15} />
                                <span>🍳 إرسال للمطبخ (KOT)</span>
                              </button>
                            ) : (ord.status === 'preparing' || ord.status === 'ready') ? (
                              <button
                                onClick={() => handleCompleteCustomerOrder(ord)}
                                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer transition-all"
                              >
                                <Check size={15} />
                                <span>✅ إنهاء وتسليم</span>
                              </button>
                            ) : (ord.status === 'completed' || ord.status === 'delivered') ? (
                              <div className="w-full py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold text-center">
                                🟢 تم إنهاء وتسليم الطلب
                              </div>
                            ) : null}

                            {/* Secondary Actions */}
                            <div className="grid grid-cols-3 gap-1.5">
                              <button
                                onClick={() => handlePrintCustomerKOT(ord)}
                                className="py-1.5 px-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all shadow-xs"
                                title="إعادة طباعة بون المطبخ"
                              >
                                <Printer size={12} />
                                <span>طباعة بون</span>
                              </button>

                              <button
                                onClick={() => handleLoadCustomerOrderToCart(ord)}
                                className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                                title="تحميل أصناف الطلب إلى سلة الكاشير"
                              >
                                <ShoppingCart size={12} />
                                <span>تحميل للسلة</span>
                              </button>

                              {ord.status !== 'cancelled' && (
                                <button
                                  onClick={() => handleCancelCustomerOrder(ord)}
                                  className="py-1.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                                  title="إلغاء الطلب"
                                >
                                  <X size={12} />
                                  <span>إلغاء الطلب</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 🧾 LEFT 1/3 SIDEBAR: Dedicated Live Customer Orders Stream or Direct Cashier Cart */}
        <div className="w-80 md:w-96 lg:w-[420px] xl:w-[460px] bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 shadow-lg h-full overflow-hidden">
          
          {/* Top Sidebar Switcher: Live Customer Orders Stream vs Direct Cashier Cart */}
          <div className="p-2 bg-slate-900 text-white flex items-center justify-between gap-1 shrink-0 border-b border-slate-800">
            <div className="grid grid-cols-2 gap-1.5 w-full">
              <button
                type="button"
                onClick={() => {
                  setSidebarView('customer_orders');
                  setHasUnviewedCustomerAlert(false);
                }}
                className={`py-2 px-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  sidebarView === 'customer_orders'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <div className="relative">
                  <Smartphone size={15} />
                  {unhandledCustomerOrdersCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  )}
                </div>
                <span>طلبات الزبائن</span>
                <span className={`px-1.5 py-0.2 rounded-md font-mono text-[10px] font-bold ${
                  unhandledCustomerOrdersCount > 0 ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-950 text-amber-400'
                }`}>
                  {unhandledCustomerOrdersCount > 0 ? `${unhandledCustomerOrdersCount} جديد` : customerLiveOrders.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSidebarView('cart')}
                className={`py-2 px-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  sidebarView === 'cart'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <ShoppingCart size={15} />
                <span>طلب البيع المباشر</span>
                {cart.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-md bg-emerald-500 text-white font-mono text-[10px] font-bold">
                    {cart.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* VIEW 1: LIVE CUSTOMER ORDERS STREAM (Delivery & Dine-In Tables) */}
          {sidebarView === 'customer_orders' ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
              {/* Live Stream Controls Header */}
              <div className="p-2.5 bg-white border-b border-slate-200 shrink-0 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-black text-slate-800">بث تلقائي لطلبات الزبائن</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setIsSoundMuted(!isSoundMuted)}
                      className={`p-1.5 rounded-lg border text-xs cursor-pointer ${
                        isSoundMuted ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                      title={isSoundMuted ? 'الصوت مكتوم' : 'الصوت مفعل عند وصول أوردر جديد'}
                    >
                      {isSoundMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                  </div>
                </div>

                {/* Filter Tabs: الكل, جديدة, صالة, دليفري, مكتملة */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                  <button
                    onClick={() => setCustomerFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                      customerFilter === 'all'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    الكل ({customerLiveOrders.length})
                  </button>
                  <button
                    onClick={() => setCustomerFilter('new')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1 ${
                      customerFilter === 'new'
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                    }`}
                  >
                    {unhandledCustomerOrdersCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />}
                    <span>جديدة ({unhandledCustomerOrdersCount})</span>
                  </button>
                  <button
                    onClick={() => setCustomerFilter('dine_in')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                      customerFilter === 'dine_in'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                    }`}
                  >
                    طاولات ({customerLiveOrders.filter(o => o.order_type === 'dine_in').length})
                  </button>
                  <button
                    onClick={() => setCustomerFilter('delivery')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                      customerFilter === 'delivery'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
                    }`}
                  >
                    دليفري ({customerLiveOrders.filter(o => o.order_type === 'delivery').length})
                  </button>
                  <button
                    onClick={() => setCustomerFilter('completed')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                      customerFilter === 'completed'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    مكتملة ({customerLiveOrders.filter(o => o.status === 'completed').length})
                  </button>
                </div>
              </div>

              {/* Live Orders List Stream */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
                {filteredCustomerOrders.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2 my-auto">
                    <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-500 mx-auto flex items-center justify-center">
                      <Smartphone size={24} />
                    </div>
                    <h4 className="font-bold text-slate-800 text-xs sm:text-sm">لا توجد طلبات في هذا القسم حالياً</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      ستظهر طلبات الدليفري وطلبات مسح باركود الطاولات هنا تلقائياً فور إرسالها من الزبائن مع تنبيه صوتي فوري
                    </p>
                  </div>
                ) : (
                  filteredCustomerOrders.map(ord => {
                    const isNew = ord.status === 'new';
                    const isDelivery = ord.order_type === 'delivery';
                    const formattedDate = new Date(ord.created_at).toLocaleTimeString('ar-EG', {
                      hour: '2-digit',
                      minute: '2-digit'
                    });

                    return (
                      <div
                        key={ord.id}
                        className={`bg-white rounded-2xl p-3 space-y-2.5 shadow-sm border-2 transition-all ${
                          isNew 
                            ? 'border-red-500 shadow-red-500/10 ring-1 ring-red-400 animate-pulse' 
                            : ord.status === 'preparing'
                            ? 'border-amber-400 bg-amber-50/20'
                            : ord.status === 'ready'
                            ? 'border-blue-400 bg-blue-50/20'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {/* Card Header */}
                        <div className="flex items-start justify-between gap-1.5 border-b border-slate-100 pb-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-lg bg-slate-900 text-white font-mono font-black text-xs">
                                #{getDisplayOrderNumber(ord)}
                              </span>
                              {isDelivery ? (
                                <span className="px-2 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 rounded-md text-[10px] font-black flex items-center gap-1">
                                  <Bike size={11} />
                                  <span>دليفري</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 border border-blue-200 rounded-md text-[10px] font-black flex items-center gap-1">
                                  <UtensilsCrossed size={11} />
                                  <span>طاولة #{ord.table_number || 'صالة'}</span>
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                              <Clock size={10} />
                              <span>{formattedDate}</span>
                              <span>• تطبيق الزبائن</span>
                            </p>
                          </div>

                          <div>
                            {isNew ? (
                              <span className="px-2 py-0.5 bg-red-500 text-white rounded-lg text-[10px] font-black inline-block animate-pulse">
                                🔴 جديد ينتظر
                              </span>
                            ) : ord.status === 'preparing' ? (
                              <span className="px-2 py-0.5 bg-amber-500 text-white rounded-lg text-[10px] font-black inline-block">
                                🍳 قيد التحضير
                              </span>
                            ) : ord.status === 'ready' ? (
                              <span className="px-2 py-0.5 bg-blue-600 text-white rounded-lg text-[10px] font-black inline-block animate-pulse">
                                🔔 جاهز للتسليم
                              </span>
                            ) : (ord.status === 'completed' || ord.status === 'delivered') ? (
                              <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-lg text-[10px] font-black inline-block">
                                🟢 مكتمل ومسلم
                              </span>
                            ) : ord.status === 'cancelled' ? (
                              <span className="px-2 py-0.5 bg-slate-600 text-white rounded-lg text-[10px] font-black inline-block">
                                ⚫ ملغي
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-500 text-white rounded-lg text-[10px] font-black inline-block">
                                {ord.status}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Delivery info if delivery */}
                        {isDelivery && (
                          <div className="bg-purple-50/70 p-2 rounded-xl border border-purple-100 text-[11px] space-y-1 text-purple-950">
                            <div className="flex items-center justify-between">
                              <p className="font-bold flex items-center gap-1">
                                <User size={11} className="text-purple-700" />
                                <span>{ord.customer_name || 'عميل دليفري'}</span>
                              </p>
                              {ord.customer_phone && (
                                <a href={`tel:${ord.customer_phone}`} className="font-mono text-purple-800 flex items-center gap-1 underline font-bold">
                                  <Phone size={11} className="text-purple-700" />
                                  <span>{ord.customer_phone}</span>
                                </a>
                              )}
                            </div>
                            {ord.delivery_address && (
                              <p className="text-[10px] text-purple-900 flex items-start gap-1 leading-tight">
                                <MapPin size={11} className="text-purple-700 shrink-0 mt-0.5" />
                                <span>{ord.delivery_address}</span>
                              </p>
                            )}
                            {ord.notes && (
                              <p className="text-[10px] text-purple-800 bg-white/70 p-1 rounded border border-purple-200/50">
                                ملاحظة: {ord.notes}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Items List - Spacious, clear and comfortable */}
                        <div className="bg-slate-100/80 p-2.5 rounded-xl border border-slate-200 space-y-1.5 max-h-72 overflow-y-auto">
                          <div className="flex items-center justify-between text-[11px] font-black text-slate-600 pb-1 border-b border-slate-200">
                            <span>الأصناف المطلوبة ({ord.items.reduce((acc, it) => acc + (it.quantity || 1), 0)}):</span>
                            <span className="text-[10px] text-slate-500 font-bold">السعر</span>
                          </div>
                          {ord.items.map((item, idx) => (
                            <div key={idx} className="bg-white p-2 rounded-xl border border-slate-200 flex items-start justify-between gap-2 shadow-xs">
                              <div className="flex items-start gap-2">
                                <span className="w-5 h-5 rounded-md bg-amber-500 text-white font-mono font-black text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                                  {item.quantity}
                                </span>
                                <div>
                                  <p className="font-bold text-xs text-slate-900 leading-snug">{item.name}</p>
                                  {item.options && item.options.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {item.options.map((o: any, oi: number) => (
                                        <span key={oi} className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.2 rounded font-medium">
                                          +{typeof o === 'string' ? o : (o.name || o.name_ar || o)}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {item.notes && (
                                    <p className="text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-1 font-medium">
                                      📝 {item.notes}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <span className="font-mono font-black text-slate-700 text-xs shrink-0 mt-0.5">
                                {((item.price || 0) * (item.quantity || 1)).toFixed(2)} ج.م
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Total Price & Payment Status */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                          <span className="text-[11px] text-slate-500">الإجمالي:</span>
                          <span className="font-mono font-black text-emerald-600 text-sm">
                            {ord.total_price.toFixed(2)} ج.م
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {ord.payment_status === 'paid' ? 'مدفوع مسبقاً' : 'دفع عند الاستلام'}
                          </span>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex flex-col gap-2 pt-1 border-t border-slate-100">
                          {isNew ? (
                            <button
                              onClick={() => handleSendCustomerOrderToKitchen(ord)}
                              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer transition-all"
                            >
                              <ChefHat size={15} />
                              <span>🍳 إرسال للمطبخ (KOT)</span>
                            </button>
                          ) : (ord.status === 'preparing' || ord.status === 'ready') ? (
                            <button
                              onClick={() => handleCompleteCustomerOrder(ord)}
                              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer transition-all"
                            >
                              <Check size={15} />
                              <span>✅ إنهاء وتسليم</span>
                            </button>
                          ) : (ord.status === 'completed' || ord.status === 'delivered') ? (
                            <div className="w-full py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold text-center">
                              🟢 تم إنهاء وتسليم الطلب
                            </div>
                          ) : null}

                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              onClick={() => handlePrintCustomerKOT(ord)}
                              className="py-1.5 px-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all shadow-xs"
                              title="إعادة طباعة بون المطبخ"
                            >
                              <Printer size={12} />
                              <span>طباعة بون</span>
                            </button>

                            <button
                              onClick={() => handleLoadCustomerOrderToCart(ord)}
                              className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                              title="تحميل أصناف الطلب إلى سلة الكاشير"
                            >
                              <ShoppingCart size={12} />
                              <span>تحميل للسلة</span>
                            </button>

                            {ord.status !== 'cancelled' && (
                              <button
                                onClick={() => handleCancelCustomerOrder(ord)}
                                className="py-1.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                                title="إلغاء الطلب"
                              >
                                <X size={12} />
                                <span>إلغاء الطلب</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* VIEW 2: DIRECT CASHIER CART & SETTLEMENT */
            <div className="flex-1 flex flex-col justify-between overflow-hidden">
              {/* Order Header / Configuration */}
              <div className="p-3 bg-white border-b border-slate-200 space-y-2">
                {/* Order Type Tabs (Dine-in & Delivery) */}
                <div className={`grid gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 ${
                  restaurantServices.delivery_enabled ? 'grid-cols-2' : 'grid-cols-1'
                }`}>
                  <button
                    type="button"
                    onClick={() => setOrderType('dine_in')}
                    className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      orderType === 'dine_in' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <UtensilsCrossed size={13} />
                    <span>صالة</span>
                  </button>
                  {restaurantServices.delivery_enabled && (
                    <button
                      type="button"
                      onClick={() => setOrderType('delivery')}
                      className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        orderType === 'delivery' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Bike size={13} />
                      <span>دليفري</span>
                    </button>
                  )}
                </div>

            {/* Conditional Sub-info: Table Picker / Customer Info */}
            {orderType === 'dine_in' ? (
              <div className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs">
                <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                  <UtensilsCrossed size={13} className="text-amber-600" />
                  <span>الطاولة (اختياري):</span>
                </div>
                <select
                  value={selectedTable?.id || ''}
                  onChange={e => {
                    const tb = tables.find(t => t.id === e.target.value);
                    setSelectedTable(tb || null);
                  }}
                  className="bg-white border border-slate-300 text-slate-800 rounded-lg px-2 py-1 outline-none font-bold text-xs shadow-xs"
                >
                  <option value="">بدون طاولة (طلب صالة عام)</option>
                  {tables.map(t => (
                    <option key={t.id} value={t.id}>طاولة #{t.table_number}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <input
                  type="text"
                  placeholder="اسم العميل (اختياري)..."
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-amber-500 shadow-inner"
                />
                {orderType === 'delivery' && (
                  <>
                    <input
                      type="tel"
                      placeholder="رقم الهاتف..."
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-amber-500 shadow-inner"
                    />
                    <input
                      type="text"
                      placeholder="عنوان التوصيل بالتفصيل..."
                      value={customerAddress}
                      onChange={e => setCustomerAddress(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-amber-500 shadow-inner"
                    />
                  </>
                )}
              </div>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 py-10">
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 shadow-sm">
                  <ShoppingCart size={24} />
                </div>
                <p className="text-xs font-bold text-slate-600">الفاتورة فارغة</p>
                <p className="text-[10px] text-slate-400">اضغط على الأصناف لإضافتها للفاتورة</p>
              </div>
            ) : (
              cart.map(item => (
                <div
                  key={item.id}
                  className="bg-white border border-slate-200 rounded-2xl p-2.5 space-y-1.5 hover:border-slate-300 transition-all shadow-sm"
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1">
                      <span className="font-bold text-xs text-slate-800 block leading-tight">{item.name}</span>
                      {item.options && item.options.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.options.map((o, idx) => (
                            <span 
                              key={idx} 
                              className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                                o.name.includes('سكر') || o.name.includes('سادة') || o.name.includes('مظبوط')
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200/80'
                                  : 'bg-blue-50 text-blue-700 border border-blue-200/80'
                              }`}
                            >
                              <span>{o.name}</span>
                              {o.price > 0 && <span className="text-[9px] font-mono opacity-80">(+{o.price})</span>}
                            </span>
                          ))}
                        </div>
                      )}
                      {item.notes && (
                        <span className="text-[10px] text-rose-600 font-bold block mt-0.5">
                          📝 {item.notes}
                        </span>
                      )}
                    </div>
                    <span className="font-mono font-bold text-emerald-600 text-xs shrink-0">
                      {(item.price * item.quantity).toFixed(2)} ج.م
                    </span>
                  </div>

                  {/* Quantity and Delete Controls */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-0.5 rounded-xl border border-slate-200">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-5 h-5 bg-white hover:bg-slate-200 text-slate-800 rounded-lg flex items-center justify-center font-bold text-xs cursor-pointer border border-slate-200"
                      >
                        -
                      </button>
                      <span className="w-6 text-center font-mono font-bold text-xs text-slate-800">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-5 h-5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg flex items-center justify-center font-bold text-xs cursor-pointer"
                      >
                        +
                      </button>
                    </div>

                    <button
                      onClick={() => handleRemoveCartItem(item)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                      title="حذف الصنف"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Quick Actions (Hold / Split Bill / Send to Kitchen) */}
          {cart.length > 0 && (
            <div className="p-2.5 bg-slate-100/90 border-t border-slate-200 grid grid-cols-3 gap-1.5 shrink-0">
              <button
                onClick={handleHoldBill}
                className="py-1.5 bg-white hover:bg-slate-50 text-amber-800 font-bold text-[11px] rounded-xl border border-slate-200 flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm"
                title="تعليق الفاتورة والعودة لها لاحقاً"
              >
                <PauseCircle size={13} className="text-amber-600" />
                <span>تعليق (Hold)</span>
              </button>

              <button
                onClick={() => setIsSplitBillModalOpen(true)}
                className="py-1.5 bg-white hover:bg-slate-50 text-indigo-800 font-bold text-[11px] rounded-xl border border-slate-200 flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm"
                title="تقسيم الفاتورة بالتساوي أو بالأصناف"
              >
                <Split size={13} className="text-indigo-600" />
                <span>تقسيم</span>
              </button>

              {restaurantServices.kitchen_enabled ? (
                <button
                  type="button"
                  onClick={handleSendOrderToKitchenAndPrint}
                  disabled={cart.length === 0}
                  className="py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[11px] rounded-xl border border-amber-200 flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm disabled:opacity-40"
                  title="إرسال الطلب للمطبخ وطباعة بون التشغيل تلقائياً"
                >
                  <ChefHat size={13} className="text-amber-600" />
                  <span>إرسال بون للمطبخ</span>
                </button>
              ) : (
                <div
                  className="py-1.5 px-2 bg-emerald-50 text-emerald-800 font-bold text-[11px] rounded-xl border border-emerald-200 flex items-center justify-center gap-1 shadow-sm select-none"
                  title="تسليم فوري ومباشر بدون شاشة مطبخ"
                >
                  <Zap size={13} className="text-emerald-600" />
                  <span>تسليم فوري</span>
                </div>
              )}
            </div>
          )}

          {/* Settlement / Financial Totals & Payment Section */}
          <div className="p-3 bg-white border-t border-slate-200 space-y-2 shrink-0">
            {/* Financial summary breakdown */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>المجموع الفرعي:</span>
                <span className="font-mono font-bold text-slate-800">{subtotal.toFixed(2)} ج.م</span>
              </div>

              {/* Discount Selector */}
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1">
                  <Tag size={12} className="text-amber-600" />
                  <span>الخصم:</span>
                </span>
                <div className="flex items-center gap-1">
                  {[0, 5, 10, 15, 25].map(val => (
                    <button
                      key={val}
                      onClick={() => handleApplyDiscount(val, 'percentage')}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer ${
                        discountValue === val ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {val}%
                    </button>
                  ))}
                  {discountAmount > 0 && (
                    <span className="font-mono text-amber-700 font-bold mr-1">
                      -{discountAmount.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              {serviceFeeAmount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>خدمة الصالة ({serviceFeeRate}%):</span>
                  <span className="font-mono text-slate-800">+{serviceFeeAmount.toFixed(2)} ج.م</span>
                </div>
              )}

              {taxAmount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>ضريبة القيمة المضافة ({taxRate}%):</span>
                  <span className="font-mono text-slate-800">+{taxAmount.toFixed(2)} ج.م</span>
                </div>
              )}

              {deliveryFee > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>رسوم التوصيل:</span>
                  <span className="font-mono text-slate-800">+{deliveryFee.toFixed(2)} ج.م</span>
                </div>
              )}

              {/* Grand Total */}
              <div className="flex justify-between items-center pt-1.5 border-t border-slate-200 text-sm font-bold">
                <span className="text-slate-800">الإجمالي المستحق:</span>
                <span className="font-mono text-xl text-emerald-600">
                  {finalTotal.toFixed(2)} <span className="text-xs font-sans">ج.م</span>
                </span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="grid grid-cols-4 gap-1 pt-1">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`py-2 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                  paymentMethod === 'cash' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200'
                }`}
              >
                <DollarSign size={14} />
                <span>كاش</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`py-2 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                  paymentMethod === 'card' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200'
                }`}
              >
                <CreditCard size={14} />
                <span>فيزا</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('wallet')}
                className={`py-2 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                  paymentMethod === 'wallet' ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20' : 'bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200'
                }`}
              >
                <Smartphone size={14} />
                <span>إنستاباي</span>
              </button>

              <button
                type="button"
                onClick={() => setIsSplitPaymentModalOpen(true)}
                className={`py-2 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                  paymentMethod === 'split' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200'
                }`}
              >
                <Split size={14} />
                <span>مقسم</span>
              </button>
            </div>

            {/* Quick Cash Tendered Buttons if Cash */}
            {paymentMethod === 'cash' && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>المبلغ المستلم:</span>
                  <div className="flex items-center gap-1">
                    {[50, 100, 200, 500].map(val => (
                      <button
                        key={val}
                        onClick={() => setCashTendered(val.toString())}
                        className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-slate-700 font-mono text-[10px] cursor-pointer"
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="المبلغ المدفوع..."
                    value={cashTendered}
                    onChange={e => setCashTendered(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800 outline-none focus:border-emerald-500 shadow-inner"
                  />
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-500 text-[10px]">الباقي:</span>
                    <span className="font-mono font-bold text-emerald-600">{changeDue.toFixed(2)} ج.م</span>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons: Large Send to Kitchen & Complete Payment side by side */}
            <div className="flex flex-col sm:flex-row items-stretch gap-2 pt-1">
              <div className="flex items-center gap-2 flex-1">
                <button
                  type="button"
                  onClick={handleClearCart}
                  disabled={cart.length === 0}
                  className="p-3 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-2xl border border-slate-200 transition-all cursor-pointer disabled:opacity-40 shrink-0"
                  title="إلغاء الفاتورة بالكامل"
                >
                  <Trash2 size={18} />
                </button>

                {/* زر إرسال للمطبخ كبير ومميز بجانب إتمام الدفع */}
                <button
                  type="button"
                  onClick={handleSendOrderToKitchenAndPrint}
                  disabled={cart.length === 0}
                  className="flex-1 py-3.5 px-3 bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:scale-98 disabled:opacity-50 text-white font-black text-xs md:text-sm rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all cursor-pointer border border-amber-400/30"
                  title="إرسال الطلب للمطبخ وطباعة بون التشغيل فوراً"
                >
                  <ChefHat size={20} className="shrink-0 animate-pulse" />
                  <span className="whitespace-nowrap">إرسال للمطبخ وطباعة البون</span>
                </button>
              </div>

              {/* زر إتمام الدفع والفاتورة */}
              <button
                type="button"
                onClick={() => handleProcessPayment()}
                disabled={cart.length === 0}
                className="flex-1 py-3.5 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-black text-xs md:text-sm rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 active:scale-98 transition-all cursor-pointer border border-emerald-500/30"
              >
                <CheckCircle2 size={20} className="shrink-0" />
                <span className="whitespace-nowrap">إتمام الدفع ({finalTotal.toFixed(2)} ج.م)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>

      {/* 🛠️ MODALS INTEGRATION */}

      {/* 1. Item Customization & Modifiers / Classifications Modal */}
      {customizingItem && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" 
          dir="rtl"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleConfirmCustomization();
            } else if (e.key === 'Escape') {
              setCustomizingItem(null);
            }
          }}
        >
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                {customizingItem.image_url ? (
                  <img 
                    src={customizingItem.image_url} 
                    alt="" 
                    className="w-12 h-12 rounded-xl object-cover border border-slate-700 shadow-sm shrink-0" 
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-lg border border-amber-500/30 shrink-0">
                    <Coffee size={22} />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base sm:text-lg text-white leading-tight">
                      {customizingItem.name_ar || customizingItem.name_en || (customizingItem as any).name}
                    </h3>
                    <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      تخصيص الطلب
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-slate-400 text-xs">السعر الأساسي:</span>
                    <span className="font-mono text-emerald-400 font-bold text-sm">
                      {customizingItem.price.toFixed(2)} ج.م
                    </span>
                  </div>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setCustomizingItem(null)} 
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-700/60 transition-colors cursor-pointer"
                title="إغلاق"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body with Option Groups */}
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
              {customizingGroups.length > 0 ? (
                customizingGroups.map((group) => {
                  const selectedInGroup = customizingSelections[group.id] || [];
                  const isSugarGroup = group.id.includes('sugar') || group.name.includes('سكر');

                  return (
                    <div key={group.id} className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isSugarGroup ? (
                            <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-xs">
                              ☕
                            </span>
                          ) : (
                            <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-xs">
                              <Sparkles size={12} />
                            </span>
                          )}
                          <label className="text-xs font-bold text-slate-800">
                            {group.name}
                          </label>
                        </div>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-500">
                          {group.type === 'single' ? 'اختر تصنيفاً واحداً' : 'اختيارات متعددة'}
                        </span>
                      </div>

                      {/* Choices Grid */}
                      <div className="grid grid-cols-2 gap-2">
                        {group.choices.map((choice) => {
                          const isSelected = selectedInGroup.some(c => c.id === choice.id);
                          return (
                            <button
                              key={choice.id}
                              type="button"
                              onClick={() => handleToggleChoice(group, choice)}
                              className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer select-none text-right ${
                                isSelected
                                  ? 'bg-amber-500 text-white border-amber-600 shadow-sm shadow-amber-500/30 scale-[1.01]'
                                  : 'bg-white border-slate-200 text-slate-700 hover:border-amber-300 hover:bg-amber-50/50'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] border ${
                                  isSelected 
                                    ? 'bg-white text-amber-600 border-white font-black' 
                                    : 'border-slate-300 text-transparent'
                                }`}>
                                  ✓
                                </span>
                                <span>{choice.name}</span>
                              </div>
                              <span className={`font-mono text-[11px] ${isSelected ? 'text-amber-100 font-bold' : 'text-slate-500'}`}>
                                {choice.priceDelta > 0 
                                  ? `+${choice.priceDelta} ج.م` 
                                  : choice.priceDelta < 0
                                    ? `${choice.priceDelta} ج.م`
                                    : (choice.price !== undefined && choice.price > 0)
                                      ? `${choice.price} ج.م`
                                      : 'مجاني'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-slate-400 text-xs">
                  لا توجد تصنيفات إضافية لهذا الصنف
                </div>
              )}

              {/* Kitchen Special Notes */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <FileText size={14} className="text-slate-400" />
                  <span>ملاحظات خاصة للتشغيل والمطبخ (اختياري):</span>
                </label>
                <input
                  type="text"
                  placeholder="مثال: بدون ثلج، في مج زجاج، تسوية خفيفة..."
                  value={itemNoteInput}
                  onChange={e => setItemNoteInput(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 shadow-xs"
                />
              </div>
            </div>

            {/* Modal Footer */}
            {(() => {
              const optionsDelta = (Object.values(customizingSelections) as POSOptionChoice[][]).flat().reduce((sum, c) => sum + (c.priceDelta || 0), 0);
              const calculatedTotal = customizingItem.price + optionsDelta;

              return (
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] text-slate-500 block">الإجمالي بعد الخيارات</span>
                    <span className="font-mono font-bold text-lg text-slate-900">
                      {calculatedTotal.toFixed(2)} <span className="text-xs font-sans text-slate-600">ج.م</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomizingItem(null)}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 font-bold text-xs cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmCustomization}
                      className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md shadow-amber-500/25 cursor-pointer transition-all"
                    >
                      <Plus size={16} />
                      <span>إضافة الصنف للطلب</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 2. KOT (Kitchen Order Ticket) Modal */}
      <KOTModal
        isOpen={isKOTModalOpen}
        onClose={() => setIsKOTModalOpen(false)}
        restaurantName={selectedRestaurant?.name || ''}
        dailyOrderNumber={customOrderNumber || activeOrders.length + 1}
        orderType={orderType}
        tableNumber={selectedTable?.table_number}
        customerName={customerName.trim() || undefined}
        customerPhone={customerPhone.trim() || undefined}
        deliveryAddress={customerAddress.trim() || undefined}
        cashierName={shift.cashierName}
        cart={cart}
        orderNotes={orderNotes}
        onConfirmSend={() => {
          handleSendOrderToKitchenAndPrint();
        }}
      />

      {/* 3. Shift Report Modal (X-Report & Z-Report) */}
      {shiftReportType && (
        <ShiftReportModal
          isOpen={!!shiftReportType}
          onClose={() => setShiftReportType(null)}
          reportType={shiftReportType}
          shift={shift}
          orders={Array.isArray(shift.orders) && shift.orders.length > 0 ? shift.orders : activeOrders}
          restaurantName={selectedRestaurant?.name || ''}
          onCloseShiftConfirm={handleCloseShiftConfirm}
        />
      )}

      {/* 4. Split Bill Modal */}
      <SplitBillModal
        isOpen={isSplitBillModalOpen}
        onClose={() => setIsSplitBillModalOpen(false)}
        cart={cart}
        subtotal={subtotal}
        taxAmount={taxAmount}
        finalTotal={finalTotal}
        onConfirmSplit={(tickets) => {
          alert(`تم تقسيم الفاتورة إلى (${tickets.length}) إيصالات بقيمة ${tickets[0]?.total.toFixed(2)} ج.م لكل إيصال.`);
        }}
      />

      {/* 5. Split Payment Modal */}
      <SplitPaymentModal
        isOpen={isSplitPaymentModalOpen}
        onClose={() => setIsSplitPaymentModalOpen(false)}
        totalAmount={finalTotal}
        onConfirmSplitPayment={(breakdown) => {
          handleProcessPayment('split', breakdown);
        }}
      />

      {/* 6. Manager PIN Security Approval Modal */}
      <ManagerPinModal
        isOpen={managerAuthReq.isOpen}
        onClose={() => setManagerAuthReq(prev => ({ ...prev, isOpen: false }))}
        title={managerAuthReq.title}
        description={managerAuthReq.description}
        onSuccess={managerAuthReq.action}
      />

      {/* 7. Waste / Damaged Stock Logger Modal */}
      <WasteModal
        isOpen={isWasteModalOpen}
        onClose={() => setIsWasteModalOpen(false)}
        products={products}
        onConfirmWaste={handleRecordWaste}
      />

      {/* 8. Parked / Held Bills Drawer */}
      <HeldBillsDrawer
        isOpen={isHeldDrawerOpen}
        onClose={() => setIsHeldDrawerOpen(false)}
        heldBills={heldBills}
        onRecallBill={handleRecallBill}
        onDeleteHeldBill={handleDeleteHeldBill}
      />

      {/* 9. Orders History Full Modal */}
      <OrdersHistoryModal
        isOpen={isOrdersHistoryModalOpen}
        onClose={() => setIsOrdersHistoryModalOpen(false)}
        orders={activeOrders}
        onRefundOrder={handleRefundOrder}
        restaurantName={selectedRestaurant?.name || 'مطعم كريتا'}
        restaurantGeofence={restaurantGeofence}
      />

      {/* 9.5. Table Settle & Clear Balance Modal */}
      <TableSettleModal
        isOpen={Boolean(settleModalTable)}
        onClose={() => setSettleModalTable(null)}
        table={settleModalTable}
        onSettle={handleSettleTable}
        onClearWithoutPayment={handleClearTableWithoutPayment}
        onLoadToCart={handleLoadTableToCart}
        onPrintBill={async (tableData) => {
          if (!tableData) return;
          const totalAmt = Number(tableData.totalDue || 0);
          const allItems: any[] = [];
          const matchedOrders = tableData.activeOrders || [];
          const matchedOrderIds = new Set(matchedOrders.map((o: any) => String(o.id)));
          matchedOrders.forEach((ord: any) => {
            const items = ord.order_items || ord.items || [];
            if (Array.isArray(items)) allItems.push(...items);
          });
          (tableData.heldBills || []).forEach((h: any) => {
            if (!matchedOrderIds.has(String(h.id)) && Array.isArray(h.cart)) allItems.push(...h.cart);
          });

          const receiptData: TaxReceiptData = {
            restaurantName: selectedRestaurant?.name || 'مطعم وكافيه كريتا',
            restaurantLogo: selectedRestaurant?.logo_url,
            taxNumber: restaurantGeofence?.tax_number || '100-245-890',
            commercialRegistration: restaurantGeofence?.commercial_registration || '45892',
            branchAddress: restaurantGeofence?.address || 'بورسعيد - حي الشرق',
            branchPhone: restaurantGeofence?.phone || '01000000000',
            invoiceNumber: `BILL-${tableData.table_number}`,
            dailyOrderNumber: 0,
            orderType: 'dine_in',
            tableNumber: tableData.table_number,
            cashierName: shift.cashierName,
            dateTime: new Date(),
            items: allItems.length > 0 ? allItems.map((it: any) => ({
              name: it.name || it.product_name || (it.products && it.products.name_ar) || 'صنف',
              quantity: it.quantity || 1,
              unitPrice: Number(it.price || it.price_at_order || 0),
              totalPrice: Number((it.price || it.price_at_order || 0) * (it.quantity || 1)),
              notes: it.notes,
              options: it.options
            })) : [
              {
                name: `حساب طاولة #${tableData.table_number}`,
                quantity: 1,
                unitPrice: totalAmt,
                totalPrice: totalAmt
              }
            ],
            subtotal: totalAmt,
            taxRate: 0,
            taxAmount: 0,
            serviceFeeRate: 0,
            serviceFeeAmount: 0,
            deliveryFee: 0,
            discountAmount: 0,
            finalTotal: totalAmt,
            paymentMethod: 'cash',
            amountPaid: totalAmt,
            changeDue: 0
          };
          setTaxReceiptData(receiptData);
          setIsReceiptModalOpen(true);
        }}
      />

      {/* 10. Cash Drawer In / Out Modal */}
      {isCashDrawerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in" dir="rtl">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <DollarSign size={18} className="text-emerald-600" />
                <span>حركة نقدية بالدرج (Cash In / Out)</span>
              </div>
              <button onClick={() => setIsCashDrawerModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleDrawerTransaction} className="space-y-3">
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setDrawerTransType('cash_out')}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    drawerTransType === 'cash_out' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  سحب / مصروفات
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerTransType('cash_in')}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    drawerTransType === 'cash_in' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  إيداع بالدرج
                </button>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 mb-1 block">المبلغ (ج.م):</label>
                <input
                  type="number"
                  step="1"
                  placeholder="0.00"
                  value={drawerTransAmount}
                  onChange={e => setDrawerTransAmount(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-800 outline-none focus:border-emerald-500 shadow-inner"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 mb-1 block">سبب الحركة / البيان:</label>
                <input
                  type="text"
                  placeholder="مثال: شراء خضار، بونات نظافة، دفع لمورد..."
                  value={drawerTransReason}
                  onChange={e => setDrawerTransReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 shadow-inner"
                  required
                />
              </div>

              <div className="pt-2 flex justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsCashDrawerModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-xl font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-xl font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  تسجيل الحركة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 11. Thermal Tax Receipt Modal */}
      {taxReceiptData && (
        <TaxReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => {
            setIsReceiptModalOpen(false);
            setTaxReceiptData(null);
          }}
          receiptData={taxReceiptData}
        />
      )}
    </div>
  );
};

export default CashierPOS;
