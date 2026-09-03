import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
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
import { printThermalElement } from '../../lib/printHelper';
import { KOTModal } from '../../components/POS/KOTModal';
import { ShiftReportModal } from '../../components/POS/ShiftReportModal';
import { SplitBillModal } from '../../components/POS/SplitBillModal';
import { SplitPaymentModal } from '../../components/POS/SplitPaymentModal';
import { ManagerPinModal } from '../../components/POS/ManagerPinModal';
import { WasteModal } from '../../components/POS/WasteModal';
import { HeldBillsDrawer } from '../../components/POS/HeldBillsDrawer';
import { OrdersHistoryModal } from '../../components/POS/OrdersHistoryModal';
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
  MonitorCheck
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

export const CashierPOS: React.FC = () => {
  const [searchParams] = useSearchParams();
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
  const [hasUnviewedCustomerAlert, setHasUnviewedCustomerAlert] = useState<boolean>(false);
  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(false);
  const lastAlertedOrderIdRef = useRef<string | number | null>(null);

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
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('percentage');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [tipsAmount, setTipsAmount] = useState<number>(0);
  const [assignedWaiter, setAssignedWaiter] = useState<string>('');

  // Customizing Product Modal (Modifiers / Options / Notes)
  const [customizingItem, setCustomizingItem] = useState<Product | null>(null);
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

  // Held Bills (Parked Orders)
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  const [isHeldDrawerOpen, setIsHeldDrawerOpen] = useState<boolean>(false);

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

  // Screen Lock PIN (Default: LOCKED for security like Waiter app, works 100% offline)
  const [isScreenLocked, setIsScreenLocked] = useState<boolean>(true);
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

  // 1. Initial Load: Offline First with Locked Restaurant Enforcement
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const lockedId = getLockedRestaurantId() || searchParams.get('restaurantId');
      
      // 1. Immediate Offline Cache Load: Render instantly without waiting for network!
      if (lockedId) {
        const cached = getCachedRestaurantData(lockedId);
        if (cached && cached.restaurant) {
          setSelectedRestaurant(cached.restaurant);
          setRestaurantGeofence(cached.geofence);
          setCategories(cached.categories);
          setProducts(cached.products);
          setTables(cached.tables);
          const initialStock: Record<string, number> = {};
          cached.products.forEach((p, idx) => {
            initialStock[p.id] = (idx % 4 === 0) ? 6 : (idx % 7 === 0) ? 2 : 30;
          });
          setStockMap(initialStock);
          setOfflineQueue(getOfflineOrdersQueue(lockedId));
        }
      }

      // 2. Fetch Latest from Server if Online
      if (navigator.onLine) {
        try {
          const [restRes, geofences] = await Promise.all([
            supabase.from('restaurants').select('*').order('name'),
            fetchAllServerGeofences()
          ]);

          const loadedRestaurants = restRes.data || [];
          setRestaurants(loadedRestaurants);

          let targetRest: Restaurant | null = null;
          if (lockedId) {
            targetRest = loadedRestaurants.find(r => r.id === lockedId) || null;
          }
          
          // If device is not yet locked to any restaurant, lock to the first one
          if (!targetRest && loadedRestaurants.length > 0) {
            targetRest = loadedRestaurants[0];
            setLockedRestaurantId(targetRest.id);
          }

          if (targetRest) {
            setSelectedRestaurant(targetRest);
            const geo = geofences[targetRest.id] || null;
            setRestaurantGeofence(geo);
            await loadRestaurantDetails(targetRest.id, geo, targetRest);
          }
        } catch (netErr) {
          console.warn('Network load failed, falling back to cache:', netErr);
        }
      } else {
        // Pure Offline Mode with no existing cache? Use rich seed data!
        if (!selectedRestaurant) {
          const fallbackId = lockedId || 'qrieta-pos-offline';
          const fallback = getInitialOfflineFallbackData(fallbackId);
          setSelectedRestaurant(fallback.restaurant);
          setCategories(fallback.categories);
          setProducts(fallback.products);
          setTables(fallback.tables);
          setLockedRestaurantId(fallbackId);
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
        const [catsRes, itemsRes, tablesRes, ordersRes] = await Promise.all([
          supabase.from('categories').select('*').eq('restaurant_id', restaurantId).order('name_ar'),
          supabase.from('products').select('*').eq('restaurant_id', restaurantId),
          supabase.from('tables').select('*').eq('restaurant_id', restaurantId).order('table_number'),
          supabase.from('orders').select('*, order_items(*, products(*)), tables(table_number)').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(60)
        ]);

        const loadedCats = catsRes.data || [];
        const loadedItems = itemsRes.data || [];
        const loadedTables = tablesRes.data || [];
        const loadedOrders = ordersRes.data || [];

        if (loadedCats.length > 0) setCategories(loadedCats);
        if (loadedItems.length > 0) {
          setProducts(loadedItems);
          const initialStock: Record<string, number> = {};
          loadedItems.forEach((p, idx) => {
            initialStock[p.id] = (idx % 4 === 0) ? 6 : (idx % 7 === 0) ? 2 : 30;
          });
          setStockMap(initialStock);
        }
        if (loadedTables.length > 0) setTables(loadedTables);
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

          if (customerOrdersFromDb.length > 0) {
            setCustomerLiveOrders(prev => {
              const map = new Map<string, LiveOrder>();
              customerOrdersFromDb.forEach(co => map.set(String(co.id), co));
              prev.forEach(po => map.set(String(po.id), po));
              return Array.from(map.values()).sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              );
            });
          }
        }

        // Save fresh snapshot to offline cache
        saveCachedRestaurantData(restaurantId, {
          restaurant: restObj || selectedRestaurant,
          geofence: geo !== undefined ? geo : restaurantGeofence,
          categories: loadedCats,
          products: loadedItems,
          tables: loadedTables,
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
        }
      }

      setOfflineQueue(getOfflineOrdersQueue(restaurantId));
      setShift(prev => ({
        ...prev,
        restaurantId: restaurantId
      }));
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

  // Customer Order Handlers
  const handleAcceptCustomerOrder = async (order: LiveOrder) => {
    if (!selectedRestaurant) return;
    await updateLiveOrderStatus(order.id, selectedRestaurant.id, 'preparing');
    setCustomerLiveOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'preparing' } : o));
    
    // Auto prompt to print KOT
    handlePrintCustomerKOT(order);
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

    setActiveTab('pos');
  };

  const handleCompleteCustomerOrder = async (order: LiveOrder) => {
    if (!selectedRestaurant) return;
    await updateLiveOrderStatus(order.id, selectedRestaurant.id, 'completed', 'paid');
    setCustomerLiveOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'completed', payment_status: 'paid' } : o));
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

  // Click Product: If has options, open modifier modal, otherwise add directly
  const handleProductClick = (item: Product) => {
    const currentStock = stockMap[item.id] ?? 20;
    if (currentStock <= 0) {
      alert(`عذراً، الصنف "${item.name_ar || item.name_en}" غير متاح حالياً ونفذ من المخزون!`);
      return;
    }

    if (item.options && Array.isArray(item.options) && item.options.length > 0) {
      setCustomizingItem(item);
      setSelectedItemOptions([]);
      setItemNoteInput('');
      return;
    }

    addToCart(item, [], '');
  };

  const addToCart = (item: Product, options: CartItemOption[], notes: string) => {
    const optionsPrice = options.reduce((sum, opt) => sum + (opt.price || 0), 0);
    const unitPrice = item.price + optionsPrice;
    const itemName = item.name_ar || item.name_en || (item as any).name || 'صنف';
    const cartItemId = `${item.id}-${options.map(o => o.name).sort().join('_')}-${notes}`;

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
        setDiscountValue(0);
        setTipsAmount(0);
        setOrderNotes('');
      }
    } else {
      setCart([]);
      setDiscountValue(0);
      setTipsAmount(0);
      setOrderNotes('');
    }
  };

  // Hold Current Bill
  const handleHoldBill = () => {
    if (cart.length === 0) {
      alert('لا توجد أصناف لتعليق الفاتورة!');
      return;
    }

    const title = orderType === 'dine_in' 
      ? `صالة - طاولة #${selectedTable?.table_number || 'بدون'}`
      : orderType === 'takeaway'
      ? `سفري - ${customerName || 'عميل كاشير'}`
      : `دليفري - ${customerName || 'طلب خارجي'}`;

    const newHeldBill: HeldBill = {
      id: `hold-${Date.now()}`,
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
    setCart([]);
    setDiscountValue(0);
    setTipsAmount(0);
    setOrderNotes('');
    setCustomerName('');
    setCustomerPhone('');
    setSelectedTable(null);

    addAuditLog('void_item', `تم تعليق الفاتورة (${title}) بإجمالي ${finalTotal.toFixed(2)} ج.م`);
  };

  // Recall Held Bill
  const handleRecallBill = (bill: HeldBill) => {
    setCart(bill.cart);
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

    if (orderType === 'dine_in' && !selectedTable) {
      alert('يرجى تحديد رقم الطاولة لطلبات الصالة!');
      return;
    }

    const currentPayMethod = overridePaymentMethod || paymentMethod;

    try {
      let dailyOrderNum = parseInt(customOrderNumber) || 0;
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
          const { data, error } = await supabase
            .from('orders')
            .insert({
              restaurant_id: selectedRestaurant?.id,
              table_id: selectedTable?.id || null,
              status: 'delivered',
              total_price: parseFloat(finalTotal.toFixed(2))
            })
            .select('id')
            .single();

          if (!error && data) {
            createdOrder = { ...orderPayload, id: data.id };
            const itemsPayload = cart.map((it, idx) => ({
              order_id: data.id,
              product_id: it.menuItemId,
              quantity: it.quantity,
              notes: idx === 0 
                ? `[طلب كاشير POS #${dailyOrderNum} | ${orderType === 'dine_in' ? `طاولة ${selectedTable?.table_number || ''}` : orderType === 'takeaway' ? 'سفري' : 'دليفري'}${customerName ? ` | ${customerName}` : ''}]` 
                : (it.notes || null),
              price_at_order: it.price
            }));
            await supabase.from('order_items').insert(itemsPayload);
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
          source: 'pos',
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

        // Update inventory store
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
        }).catch(() => {});
      }

      // Update local activeOrders list immediately
      const newSavedOrder: any = createdOrder || {
        ...orderPayload,
        id: `ord-${Date.now()}`,
        table_number: selectedTable?.table_number,
      };
      setActiveOrders(prev => [newSavedOrder, ...prev]);

      // Deduct Inventory Stock
      setStockMap(prev => {
        const next = { ...prev };
        cart.forEach(item => {
          const current = next[item.menuItemId] ?? 20;
          next[item.menuItemId] = Math.max(0, current - item.quantity);
        });
        return next;
      });

      // Update Shift Record
      setShift(prev => {
        const cashAdd = currentPayMethod === 'cash' ? finalTotal : (splitData?.cash || 0);
        const cardAdd = currentPayMethod === 'card' ? finalTotal : (splitData?.card || 0);
        const walletAdd = currentPayMethod === 'wallet' ? finalTotal : (splitData?.wallet || 0);

        return {
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
        };
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
      setDiscountValue(0);
      setTipsAmount(0);
      setCashTendered('');
      setCustomOrderNumber('');
      setOrderNotes('');
      if (orderType !== 'dine_in') {
        setCustomerName('');
        setCustomerPhone('');
        setCustomerAddress('');
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

    setShift(prev => ({
      ...prev,
      isOpen: false,
      closedAt: new Date().toISOString(),
      closingCashActual: actualCash,
      closingCashExpected: expected,
      difference: diff,
      notes: notes,
    }));

    addAuditLog('close_shift', `تم إغلاق الوردية. النقدية الفعلية: ${actualCash} ج.م، الفارق: ${diff.toFixed(2)} ج.م`);
    alert(`تم إغلاق وردية الكاشير بنجاح! تم حفظ تقرير الـ Z-Report.`);
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

  const handleUnlockScreen = () => {
    const restId = selectedRestaurant?.id || '';
    if (verifyCashierOrManagerPin(restId, lockPinInput)) {
      setIsScreenLocked(false);
      setLockPinInput('');
      setLockPinError('');
      if (cashierInputName.trim()) {
        setShift(prev => ({
          ...prev,
          cashierName: cashierInputName.trim(),
        }));
      }
    } else {
      setLockPinError('رمز PIN غير صحيح! يرجى مراجعة إدارة المطعم');
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
                <span>نظام كاشير مستقل (أوفلاين بدون نت)</span>
              </div>
            </div>
          </div>

          {/* Cashier Name / Operator Input */}
          <div className="text-right">
            <label className="text-[11px] font-bold text-slate-600 block mb-1">اسم الكاشير المناوب:</label>
            <input
              type="text"
              value={cashierInputName}
              onChange={e => setCashierInputName(e.target.value)}
              placeholder="مثال: أحمد، كاشير 1..."
              className="w-full bg-slate-50 border border-slate-300 focus:border-amber-500 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none text-center shadow-inner"
            />
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
              <p className="text-[11px] text-slate-400 font-medium">أدخل رمز PIN للكاشير المحدد من الإدارة</p>
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
                      const restId = selectedRestaurant?.id || '';
                      if (verifyCashierOrManagerPin(restId, next)) {
                        setIsScreenLocked(false);
                        setLockPinInput('');
                        setLockPinError('');
                        if (cashierInputName.trim()) {
                          setShift(prev => ({ ...prev, cashierName: cashierInputName.trim() }));
                        }
                      } else {
                        setLockPinError('رمز PIN غير صحيح! يرجى مراجعة إدارة المطعم');
                        setLockPinInput('');
                      }
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
                    const restId = selectedRestaurant?.id || '';
                    if (verifyCashierOrManagerPin(restId, next)) {
                      setIsScreenLocked(false);
                      setLockPinInput('');
                      setLockPinError('');
                      if (cashierInputName.trim()) {
                        setShift(prev => ({ ...prev, cashierName: cashierInputName.trim() }));
                      }
                    } else {
                      setLockPinError('رمز PIN غير صحيح!');
                      setLockPinInput('');
                    }
                  }
                }
              }}
              className="h-13 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-800 font-mono font-bold text-xl rounded-2xl border border-slate-200 flex items-center justify-center shadow-sm"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleUnlockScreen}
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

  // 🚫 Access Restriction: If Cashier POS is disabled for this restaurant
  if (restaurantServices && restaurantServices.pos_enabled === false) {
    return (
      <div className="h-screen w-full bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none" dir="rtl">
        <div className="w-20 h-20 rounded-3xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-5 border border-amber-500/30 shadow-2xl">
          <MonitorCheck size={40} />
        </div>
        <h1 className="text-2xl md:text-3xl font-black mb-3 text-white">نظام الكاشير (POS) غير مفعل لهذا المتجر</h1>
        <p className="text-slate-400 max-w-md text-sm md:text-base mb-6 leading-relaxed">
          تم ضبط باقة تشغيل مطعم <span className="text-amber-400 font-bold">{selectedRestaurant?.name}</span> على نمط لا يتضمن شاشة الكاشير المباشرة (مثل: منيو وتوصيل أونلاين فقط).
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link 
            to="/" 
            className="px-6 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-sm font-bold text-slate-200 transition-all"
          >
            الرئيسية
          </Link>
          {selectedRestaurant?.slug && (
            <a 
              href={`/r/${selectedRestaurant.slug}`} 
              className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-sm font-black text-slate-950 shadow-lg shadow-amber-500/20 transition-all"
            >
              فتح تطبيق الطلبات والدليفري
            </a>
          )}
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
              <span className="text-[10px] text-amber-600 block font-mono leading-none font-bold">نظام الكاشير المكتبي</span>
            </div>
          </div>

          {/* 🔒 Locked Restaurant Badge (مقيد بالفرع بدون أي إمكانية للتبديل) */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1 rounded-xl shadow-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <div className="leading-tight text-right">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs text-slate-800 block">
                  {selectedRestaurant?.name || 'مطعم كريتا'}
                </span>
                <span className="bg-slate-900 text-white text-[9px] font-black px-1.5 py-0.2 rounded-md">
                  {currentPresetInfo.titleAr}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                <Lock size={10} className="text-amber-500 inline" />
                فرع معتمد ومقفل للجهاز
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

          {/* Shift Live Counter Badge */}
          <div className="hidden lg:flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1 rounded-xl text-xs shadow-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-500">الوردية الحالية:</span>
            <span className="font-mono font-bold text-slate-800">{shift.cashSales.toFixed(0)} كاش</span>
            <span className="text-slate-300">|</span>
            <span className="font-mono font-bold text-blue-600">{shift.cardSales.toFixed(0)} فيزا</span>
            <span className="text-slate-300">|</span>
            <span className="font-mono font-bold text-amber-600">({shift.ordersCount}) طلب</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
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

          {/* X-Report Button */}
          <button
            onClick={() => setShiftReportType('X')}
            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-blue-200 transition-all cursor-pointer"
            title="تقرير مبيعات الشيفت اللحظي (X-Report)"
          >
            <TrendingUp size={14} />
            <span className="hidden sm:inline">X-Report</span>
          </button>

          {/* Z-Report / Shift Close Button */}
          <button
            onClick={() => setShiftReportType('Z')}
            className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-rose-200 transition-all cursor-pointer"
            title="تقفيل الوردية والدرج (Z-Report)"
          >
            <FileText size={14} />
            <span className="hidden sm:inline">تقفيل الشيفت (Z)</span>
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

          {/* Customer App Orders Quick Indicator & Button */}
          <button
            onClick={() => {
              setActiveTab('customer_orders');
              setHasUnviewedCustomerAlert(false);
            }}
            className={`px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-2 border shadow-sm transition-all cursor-pointer ${
              unhandledCustomerOrdersCount > 0
                ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white border-red-500 animate-pulse shadow-red-500/30 ring-2 ring-red-400'
                : 'bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100'
            }`}
            title="شاشة طلبات تطبيق الزبائن والدليفري الحية"
          >
            <div className="relative flex items-center">
              <Smartphone size={15} className={unhandledCustomerOrdersCount > 0 ? "animate-bounce" : ""} />
              {unhandledCustomerOrdersCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-300 rounded-full animate-ping" />
              )}
            </div>
            <span>طلبات الزبائن</span>
            {unhandledCustomerOrdersCount > 0 ? (
              <span className="px-2 py-0.5 rounded-full bg-white text-red-600 font-black text-[10px] leading-none shadow-sm">
                {unhandledCustomerOrdersCount} جديد
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded-md bg-orange-200/70 text-orange-900 text-[10px] font-bold">
                {customerLiveOrders.length}
              </span>
            )}
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

      {/* 📱 MAIN WORKSPACE: Grid Layout (Products 65% | Cart & Settlement 35%) */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* 🍔 LEFT/CENTER AREA: Categories, Search, Products Grid */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-100 border-l border-slate-200">
          
          {/* Search & Category Filter Bar */}
          <div className="p-3 bg-white border-b border-slate-200 flex items-center gap-2 shrink-0 shadow-sm">
            {/* Barcode Search Box */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute right-3 top-2.5 text-slate-400" size={16} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="بحث بالاسم أو مسح الباركود (Scan Barcode)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleBarcodeSearch}
                className="w-full bg-slate-50 border border-slate-300 focus:border-amber-500 rounded-xl pr-9 pl-8 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none font-medium shadow-inner"
              />
              <Barcode className="absolute left-2.5 top-2.5 text-slate-400" size={16} />
            </div>

            {/* Quick Category Chips */}
            <div className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                الكل ({products.length})
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cat.name_ar || cat.name_en || (cat as any).name}
                </button>
              ))}
            </div>

            {/* Mode Tabs (Sales / Orders History / Tables Map / Customer Live Orders) */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
              <button
                onClick={() => setActiveTab('pos')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'pos' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                البيع
              </button>
              <button
                onClick={() => setActiveTab('orders')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'orders' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                الفواتير ({activeOrders.length})
              </button>
              {restaurantServices.tables_enabled && (
                <button
                  onClick={() => setActiveTab('tables')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'tables' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  الطاولات ({tables.length})
                </button>
              )}
              {(restaurantServices.customer_app_enabled || restaurantServices.delivery_enabled) && (
                <button
                  onClick={() => {
                    setActiveTab('customer_orders');
                    setHasUnviewedCustomerAlert(false);
                  }}
                  className={`relative px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                    activeTab === 'customer_orders'
                      ? 'bg-orange-600 text-white shadow-md shadow-orange-500/30 ring-2 ring-orange-400'
                      : unhandledCustomerOrdersCount > 0
                      ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white animate-pulse shadow-md ring-2 ring-red-400'
                      : 'bg-orange-50 text-orange-900 hover:bg-orange-100 border border-orange-200'
                  }`}
                >
                  <Smartphone size={14} className={unhandledCustomerOrdersCount > 0 ? "animate-bounce" : ""} />
                  <span>طلبات تطبيق الزبائن</span>
                  {unhandledCustomerOrdersCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-white text-red-600 text-[10px] font-black leading-none shadow-xs">
                      {unhandledCustomerOrdersCount} جديد!
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded-md bg-orange-200/80 text-orange-950 text-[10px] font-bold">
                      {customerLiveOrders.length}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* 🔔 Highly Prominent, Unmissable Banner Alert for New Incoming Customer Orders */}
          {unhandledCustomerOrdersCount > 0 && activeTab !== 'customer_orders' && (
            <div 
              className="bg-gradient-to-r from-red-600 via-orange-600 to-amber-600 text-white p-3.5 mx-3 my-2 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-2xl border-2 border-red-400/80 animate-pulse shrink-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white text-red-600 flex items-center justify-center font-black text-xl shrink-0 shadow-md">
                  🔔
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bg-slate-900 text-white font-mono font-black text-sm px-2.5 py-0.5 rounded-lg border border-white/30 shadow-xs">
                      #{getDisplayOrderNumber(latestCustomerOrder)}
                    </span>
                    <p className="font-black text-sm sm:text-base text-white">
                      طلب زبون جديد ينتظر الاستلام! ({unhandledCustomerOrdersCount} بالانتظار)
                    </p>
                  </div>
                  <p className="text-xs text-orange-100 mt-1 flex flex-wrap items-center gap-1.5 font-medium">
                    {latestCustomerOrder?.order_type === 'delivery' 
                      ? `🛵 دليفري: ${latestCustomerOrder?.customer_name || 'عميل'} (${latestCustomerOrder?.customer_phone || ''})`
                      : `🍽️ صالة: طاولة #${latestCustomerOrder?.table_number || 'صالة'}`} 
                    {' • '}
                    <span className="font-mono font-bold bg-white/20 px-2 py-0.5 rounded-md">
                      {latestCustomerOrder ? `${latestCustomerOrder.total_price.toFixed(2)} ج.م` : ''}
                    </span>
                    {' • '}
                    <span>{latestCustomerOrder?.items?.length || 0} أصناف</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 mr-auto">
                {latestCustomerOrder && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAcceptCustomerOrder(latestCustomerOrder);
                    }}
                    className="bg-white hover:bg-orange-50 text-orange-700 font-black text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                  >
                    <Printer size={15} />
                    <span>{restaurantServices.kitchen_enabled ? '⚡ قبول وطباعة KOT فوراً' : '⚡ قبول وتسليم فوري'}</span>
                  </button>
                )}
                
                <button
                  onClick={() => {
                    setActiveTab('customer_orders');
                    setHasUnviewedCustomerAlert(false);
                  }}
                  className="bg-slate-900/80 hover:bg-slate-900 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl border border-white/20 flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                >
                  <span>عرض الكل ({unhandledCustomerOrdersCount})</span>
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Tab 1: Product Grid View */}
          {activeTab === 'pos' && (
            <div className="flex-1 overflow-y-auto p-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
                {filteredProducts.map(item => {
                  const currentStock = stockMap[item.id] ?? 20;
                  const isOutOfStock = currentStock <= 0;
                  const isLowStock = currentStock > 0 && currentStock <= 5;
                  const hasOptions = item.options && Array.isArray(item.options) && item.options.length > 0;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleProductClick(item)}
                      disabled={isOutOfStock}
                      className={`relative bg-white border rounded-2xl p-2.5 text-right flex flex-col justify-between transition-all group overflow-hidden ${
                        isOutOfStock 
                          ? 'opacity-40 border-slate-200 cursor-not-allowed bg-slate-50' 
                          : 'border-slate-200 hover:border-amber-400 hover:shadow-md active:scale-95 cursor-pointer shadow-sm'
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
                            <Coffee size={32} />
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

                        {/* Options Indicator */}
                        {hasOptions && (
                          <div className="absolute bottom-1.5 right-1.5 bg-slate-900/70 backdrop-blur-sm text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1">
                            <Sparkles size={10} />
                            <span>إضافات</span>
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
                })}
              </div>
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
                              <span>طباعة</span>
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
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {tables.map(table => {
                  const isSelected = selectedTable?.id === table.id;
                  const isOccupied = table.is_occupied;

                  return (
                    <button
                      key={table.id}
                      onClick={() => {
                        setSelectedTable(table);
                        setOrderType('dine_in');
                        setActiveTab('pos');
                      }}
                      className={`p-4 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${
                        isSelected 
                          ? 'bg-amber-500 text-white border-amber-400 shadow-md scale-105'
                          : isOccupied
                          ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                          : 'bg-white border-slate-200 text-slate-800 hover:border-amber-400 shadow-sm'
                      }`}
                    >
                      <UtensilsCrossed size={24} />
                      <div>
                        <span className="font-bold text-sm block">طاولة #{table.table_number}</span>
                        <span className="text-[10px] font-medium opacity-80">
                          {isOccupied ? 'مشغولة' : 'متاحة'}
                        </span>
                      </div>
                    </button>
                  );
                })}
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
                  مكتملة ومسلمة ({customerLiveOrders.filter(o => o.status === 'completed').length})
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
                      if (customerFilter === 'completed') return ord.status === 'completed';
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
                              ) : ord.status === 'completed' ? (
                                <span className="px-2.5 py-1 bg-emerald-600 text-white rounded-xl text-[11px] font-black inline-block">
                                  🟢 مكتمل ومستلم
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 bg-slate-600 text-white rounded-xl text-[11px] font-black inline-block">
                                  ⚫ ملغي
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
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                            <button
                              onClick={() => handlePrintCustomerKOT(ord)}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm"
                            >
                              <Printer size={13} />
                              <span>طباعة بون (KOT)</span>
                            </button>

                            {isNew ? (
                              <button
                                onClick={() => handleAcceptCustomerOrder(ord)}
                                className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-md shadow-red-500/20"
                              >
                                <CheckCircle2 size={13} />
                                <span>قبول وتحضير</span>
                              </button>
                            ) : ord.status === 'preparing' ? (
                              <button
                                onClick={() => handleCompleteCustomerOrder(ord)}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm"
                              >
                                <Check size={13} />
                                <span>إنهاء وتسليم</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleLoadCustomerOrderToCart(ord)}
                                className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm"
                              >
                                <ShoppingCart size={13} />
                                <span>تحميل للكاشير</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleLoadCustomerOrderToCart(ord)}
                              className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                            >
                              <ShoppingCart size={13} />
                              <span>تحميل للسلة</span>
                            </button>

                            {ord.status !== 'cancelled' && (
                              <button
                                onClick={() => handleCancelCustomerOrder(ord)}
                                className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                              >
                                <X size={13} />
                                <span>إلغاء الطلب</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 🧾 RIGHT SIDEBAR: Order Ticket, Cart, Modifiers & Settlement */}
        <div className="w-80 md:w-96 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 shadow-lg">
          
          {/* Order Header / Configuration */}
          <div className="p-3 bg-white border-b border-slate-200 space-y-2">
            {/* 📱 Prominent Customer App Orders Card in Right Sidebar (Cart) */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('customer_orders');
                setHasUnviewedCustomerAlert(false);
              }}
              className={`w-full p-2.5 rounded-2xl flex items-center justify-between transition-all cursor-pointer shadow-sm text-right ${
                unhandledCustomerOrdersCount > 0
                  ? 'bg-gradient-to-r from-red-600 via-orange-600 to-amber-600 text-white ring-2 ring-red-400 animate-pulse'
                  : customerLiveOrders.length > 0
                  ? 'bg-orange-50 hover:bg-orange-100 text-orange-900 border-2 border-orange-300'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  unhandledCustomerOrdersCount > 0 
                    ? 'bg-white text-red-600' 
                    : customerLiveOrders.length > 0
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  <Smartphone size={16} className={unhandledCustomerOrdersCount > 0 ? "animate-bounce" : ""} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black">طلبات تطبيق الزبائن</span>
                    {unhandledCustomerOrdersCount > 0 && (
                      <span className="w-2 h-2 rounded-full bg-yellow-300 animate-ping"></span>
                    )}
                  </div>
                  <span className="text-[10px] block opacity-85 font-medium">
                    {unhandledCustomerOrdersCount > 0 
                      ? `⚠️ ${unhandledCustomerOrdersCount} أوردر جديد يحتاج استلام!`
                      : customerLiveOrders.length > 0
                      ? `${customerLiveOrders.length} طلبات مسجلة (عرض الشاشة)`
                      : 'لا توجد طلبات جديدة'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <span className={`px-2 py-0.5 rounded-lg text-xs font-mono font-black ${
                  unhandledCustomerOrdersCount > 0 
                    ? 'bg-white text-red-600' 
                    : customerLiveOrders.length > 0
                    ? 'bg-orange-200 text-orange-950'
                    : 'bg-slate-200 text-slate-700'
                }`}>
                  {customerLiveOrders.length}
                </span>
                <ChevronLeft size={15} />
              </div>
            </button>

            {/* Order Type Tabs (Dynamically adapted to restaurant services) */}
            <div className={`grid gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 ${
              restaurantServices.tables_enabled && restaurantServices.delivery_enabled
                ? 'grid-cols-3'
                : (restaurantServices.tables_enabled || restaurantServices.delivery_enabled)
                ? 'grid-cols-2'
                : 'grid-cols-1'
            }`}>
              {restaurantServices.tables_enabled && (
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
              )}
              <button
                type="button"
                onClick={() => setOrderType('takeaway')}
                className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  orderType === 'takeaway' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShoppingBag size={13} />
                <span>سفري</span>
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
                <span className="text-slate-600 font-bold">رقم الطاولة:</span>
                <select
                  value={selectedTable?.id || ''}
                  onChange={e => {
                    const tb = tables.find(t => t.id === e.target.value);
                    setSelectedTable(tb || null);
                  }}
                  className="bg-white border border-slate-300 text-slate-800 rounded-lg px-2 py-1 outline-none font-bold text-xs shadow-sm"
                >
                  <option value="">اختر طاولة...</option>
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
                      {item.options && (
                        <div className="text-[10px] text-amber-700 mt-0.5 space-x-1">
                          {item.options.map((o, idx) => (
                            <span key={idx}>+{o.name} </span>
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
                  onClick={() => setIsKOTModalOpen(true)}
                  className="py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[11px] rounded-xl border border-amber-200 flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm"
                  title="إرسال البون للمطبخ والأقسام"
                >
                  <ChefHat size={13} className="text-amber-600" />
                  <span>إرسال KOT</span>
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

            {/* Complete Payment Button */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleClearCart}
                disabled={cart.length === 0}
                className="p-3 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-2xl border border-slate-200 transition-all cursor-pointer disabled:opacity-40"
                title="إلغاء الفاتورة بالكامل"
              >
                <Trash2 size={18} />
              </button>

              <button
                type="button"
                onClick={() => handleProcessPayment()}
                disabled={cart.length === 0}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs md:text-sm rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-98 transition-all cursor-pointer"
              >
                <CheckCircle2 size={18} />
                <span>إتمام الدفع وطباعة الفاتورة ({finalTotal.toFixed(2)} ج.م)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 🛠️ MODALS INTEGRATION */}

      {/* 1. Item Customization & Modifiers Modal */}
      {customizingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in" dir="rtl">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-800">
                  {customizingItem.name_ar || customizingItem.name_en || (customizingItem as any).name}
                </h3>
                <span className="font-mono text-xs text-emerald-600 font-bold">{customizingItem.price.toFixed(2)} ج.م</span>
              </div>
              <button onClick={() => setCustomizingItem(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            {/* Options list */}
            {customizingItem.options && customizingItem.options.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">الإضافات والخيارات المتاحة:</label>
                <div className="grid grid-cols-2 gap-2">
                  {customizingItem.options.map((opt: any, idx: number) => {
                    const isSelected = selectedItemOptions.some(o => o.name === opt.name);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedItemOptions(prev => prev.filter(o => o.name !== opt.name));
                          } else {
                            setSelectedItemOptions(prev => [...prev, { name: opt.name, price: opt.price || 0 }]);
                          }
                        }}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                          isSelected ? 'bg-amber-500 text-white border-amber-400 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span>{opt.name}</span>
                        <span className="font-mono">{opt.price > 0 ? `+${opt.price}` : 'مجاني'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Custom kitchen notes */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">ملاحظة خاصة للمطبخ (Special Notes):</label>
              <input
                type="text"
                placeholder="مثال: زيادة صوص، بدون بصل، تسوية جيدة..."
                value={itemNoteInput}
                onChange={e => setItemNoteInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-amber-500 shadow-inner"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                addToCart(customizingItem, selectedItemOptions, itemNoteInput);
                setCustomizingItem(null);
              }}
              className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md shadow-amber-500/20 cursor-pointer"
            >
              <Plus size={16} />
              <span>إضافة الصنف للسلة</span>
            </button>
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
        cashierName={shift.cashierName}
        cart={cart}
        orderNotes={orderNotes}
        onConfirmSend={() => {
          handleHoldBill();
          alert('تم إرسال بونات التشغيل للمطبخ والأقسام وحفظ الطلب بنجاح! 👨‍🍳');
        }}
      />

      {/* 3. Shift Report Modal (X-Report & Z-Report) */}
      {shiftReportType && (
        <ShiftReportModal
          isOpen={!!shiftReportType}
          onClose={() => setShiftReportType(null)}
          reportType={shiftReportType}
          shift={shift}
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
