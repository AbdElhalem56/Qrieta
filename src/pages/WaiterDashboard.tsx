import React, { useEffect, useState } from 'react';
import { supabase, Order, OrderItem } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, 
  Clock, 
  ChefHat, 
  CheckCircle, 
  MoreVertical, 
  LogOut, 
  LayoutDashboard, 
  Timer, 
  X,
  Trash2,
  RefreshCw,
  Sparkles,
  Filter,
  Bike,
  Phone,
  MapPin,
  User,
  ExternalLink
} from 'lucide-react';
import { formatCurrency, cn, parseOrderDeliveryInfo, cleanItemNotes } from '../lib/utils';
import { getDisplayOrderNumber, updateLiveOrderStatus } from '../lib/ordersService';

export default function WaiterDashboard() {
  const { profile, signOut, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [orders, setOrders] = useState<any[]>([]);
  const [stats, setStats] = useState({ active: 0, completed: 0 });
  const [cancellingOrder, setCancellingOrder] = useState<string | null>(null);
  const [waiterCalls, setWaiterCalls] = useState<any[]>([]);
  const [isWithinShift, setIsWithinShift] = useState(true);
  const [nextShiftTime, setNextShiftTime] = useState({ hours: 0, minutes: 0 });
  const [filterTab, setFilterTab] = useState<'active' | 'completed' | 'all'>('active');
  const [isPurging, setIsPurging] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState<string | null>(null);

  const checkShift = () => {
    if (!profile || profile.role !== 'waiter') return;
    if (!profile.shift_start || !profile.shift_end) {
      setIsWithinShift(true); // No shift assigned = always allowed
      return;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const [startH, startM] = profile.shift_start.split(':').map(Number);
    const [endH, endM] = profile.shift_end.split(':').map(Number);
    
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    let within = false;
    if (startMinutes < endMinutes) {
      // Daytime shift
      within = currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Night shift (crosses midnight)
      within = currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    setIsWithinShift(within);

    if (!within) {
      // Calculate time until next shift starts
      let diff = startMinutes - currentMinutes;
      if (diff < 0) diff += 24 * 60; // Shift starts tomorrow
      
      setNextShiftTime({
        hours: Math.floor(diff / 60),
        minutes: diff % 60
      });
    }
  };

  const prevCallsCountRef = React.useRef(0);

  useEffect(() => {
    let resId = profile?.restaurant_id;

    const setupDashboard = async () => {
      if (!resId) {
        // Auto-heal/find restaurant if missing on profile
        const { data: resList } = await supabase.from('restaurants').select('id').limit(1);
        if (resList && resList.length > 0) {
          resId = resList[0].id;
        }
      }

      if (!resId) return;

      checkShift();
      const shiftInterval = setInterval(checkShift, 60000); // Check every minute

      fetchOrders(resId);
      fetchWaiterCalls(resId);
      
      // Realtime subscription for orders
      const ordersChannel = supabase
        .channel('orders-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `restaurant_id=eq.${resId}`
          },
          (payload) => {
            fetchOrders(resId);
            if (payload.eventType === 'INSERT') {
              playNotificationSound();
            }
          }
        )
        .subscribe();

      // Realtime subscription for waiter calls
      const callsChannel = supabase
        .channel('calls-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'waiter_calls',
            filter: `restaurant_id=eq.${resId}`
          },
          (payload) => {
            console.log('Waiter call change received:', payload);
            fetchWaiterCalls(resId);
            if (payload.eventType === 'INSERT') {
              playNotificationSound();
            }
          }
        )
        .subscribe();

      // Fast polling fallback for waiter calls every 4 seconds (guarantees instant reception)
      const pollInterval = setInterval(() => {
        fetchWaiterCalls(resId);
        fetchOrders(resId);
      }, 4000);

      return () => {
        supabase.removeChannel(ordersChannel);
        supabase.removeChannel(callsChannel);
        clearInterval(pollInterval);
        clearInterval(shiftInterval);
      };
    };

    const cleanupPromise = setupDashboard();
    return () => {
      cleanupPromise.then(cleanup => cleanup && cleanup());
    };
  }, [profile]);

  const fetchOrders = async (targetResId?: string) => {
    const resId = targetResId || profile?.restaurant_id;
    if (!resId) return;
    
    // 24 hours window calculation
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1. Auto-cleanup: Permanently delete orders older than 24 hours from database to reduce database bloat
    try {
      await supabase
        .from('orders')
        .delete()
        .eq('restaurant_id', resId)
        .lt('created_at', twentyFourHoursAgo);
    } catch (cleanupErr) {
      console.warn('Auto cleanup old orders:', cleanupErr);
    }

    // 2. Fetch recent orders from database
    const { data } = await supabase
      .from('orders')
      .select('*, tables(table_number), order_items(*, products(*))')
      .eq('restaurant_id', resId)
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false });

    if (data) {
      // Extra client-side filter to guarantee strictly < 24h
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const recentOrders = data.filter(o => new Date(o.created_at).getTime() >= cutoff);
      
      setOrders(recentOrders);
      const active = recentOrders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length;
      const completed = recentOrders.filter(o => o.status === 'delivered').length;
      setStats({ active, completed });
    }
  };

  const handlePurgeOldOrders = async () => {
    const resId = profile?.restaurant_id;
    if (!resId) return;
    setIsPurging(true);
    setPurgeMessage(null);
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('restaurant_id', resId)
        .lt('created_at', twentyFourHoursAgo);

      if (error) throw error;

      await fetchOrders(resId);
      setPurgeMessage('تم تنظيف وحذف جميع الطلبات الأقدم من 24 ساعة بنجاح!');
      setTimeout(() => setPurgeMessage(null), 3000);
    } catch (err: any) {
      console.error('Purge error:', err);
      setPurgeMessage(`خطأ في الحذف: ${err.message}`);
    } finally {
      setIsPurging(false);
    }
  };

  const fetchWaiterCalls = async (targetResId?: string) => {
    const resId = targetResId || profile?.restaurant_id;
    if (!resId) return;
    
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('waiter_calls')
      .select('*, tables(table_number)')
      .eq('restaurant_id', resId)
      .in('status', ['pending', 'new'])
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false });

    if (data) {
      if (data.length > prevCallsCountRef.current) {
        playNotificationSound();
      }
      prevCallsCountRef.current = data.length;
      setWaiterCalls(data);
    } else if (error) {
      console.warn('fetchWaiterCalls error:', error);
    }
  };

  const updateStatus = async (orderId: string, status: 'new' | 'preparing' | 'ready' | 'delivered' | 'completed' | 'cancelled') => {
    const updateData: any = { status };
    if (status === 'delivered' || status === 'completed') {
      updateData.waiter_id = profile?.id;
      updateData.delivered_at = new Date().toISOString();
    } else if (status === 'ready') {
      updateData.ready_at = new Date().toISOString();
    } else if (status === 'preparing') {
      updateData.preparing_at = new Date().toISOString();
    } else if (status === 'cancelled') {
      updateData.cancelled_at = new Date().toISOString();
      updateData.cancelled_by = profile?.id;
    }
    
    await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId);

    const restId = profile?.restaurant_id;
    if (restId) {
      updateLiveOrderStatus(orderId, restId, status).catch(() => {});
    }

    if (status === 'cancelled') {
      setCancellingOrder(null);
    }
  };

  const handleCall = async (callId: string) => {
    setWaiterCalls(prev => prev.filter(c => c.id !== callId));
    prevCallsCountRef.current = Math.max(0, prevCallsCountRef.current - 1);
    
    try {
      const { error } = await supabase
        .from('waiter_calls')
        .update({ status: 'resolved' })
        .eq('id', callId);

      if (error) {
        await supabase
          .from('waiter_calls')
          .update({ status: 'handled' })
          .eq('id', callId);
      }
    } catch (e) {
      console.warn('Error handling call:', e);
    }
    fetchWaiterCalls();
  };

  const playNotificationSound = () => {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play().catch(e => console.log('Audio auto-play blocked:', e));
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
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-8 rounded-3xl border shadow-sm"
        >
          <div className="w-20 h-20 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <LayoutDashboard size={40} />
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-3">الحساب غير مرتبط بمطعم</h2>
          <p className="text-gray-500 font-medium mb-6 leading-relaxed">
            مرحباً {profile.full_name || ''}، حسابك مسجل بنجاح ولكن لم يتم ربطه بمطعم بعد. يرجى من مدير النظام تعيين المطعم الخاص بك من جدول الملفات الشخصية (Profiles).
          </p>
          <button 
            onClick={() => signOut()}
            className="flex items-center gap-2 px-6 py-3.5 bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-600 rounded-xl w-full transition-all font-bold justify-center"
          >
            <LogOut size={18} />
            <span>تسجيل الخروج</span>
          </button>
        </motion.div>
      </div>
    );
  }

  if (!isWithinShift && profile.role === 'waiter') {
    return (
      <div className="h-screen bg-white flex items-center justify-center p-6 text-center" dir="rtl">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full"
        >
          <div className="w-24 h-24 bg-orange-100 text-orange-600 rounded-[32px] flex items-center justify-center mx-auto mb-8">
            <Clock size={48} />
          </div>
          <h2 className="text-3xl font-black text-gray-900 mb-4 tracking-tight">أنت خارج وقت الشيفت الخاص بك</h2>
          <p className="text-gray-500 font-medium mb-8 leading-relaxed">
            مرحباً {profile.full_name}, حالياً أنت خارج مواعيد العمل المحددة لك من قبل الإدارة. يرجى العودة عند بدء الشيفت الخاص بك.
          </p>
          
          <div className="bg-orange-50 rounded-3xl p-6 border border-orange-100 mb-8">
            <p className="text-sm font-bold text-orange-800 mb-2 uppercase tracking-widest">سيبدأ الشيفت القادم خلال:</p>
            <div className="flex justify-center gap-4">
              <div className="text-center">
                <p className="text-4xl font-black text-orange-600">{nextShiftTime.hours}</p>
                <p className="text-[10px] font-black text-orange-400 mt-1">ساعة</p>
              </div>
              <p className="text-4xl font-black text-orange-200">:</p>
              <div className="text-center">
                <p className="text-4xl font-black text-orange-600">{nextShiftTime.minutes}</p>
                <p className="text-[10px] font-black text-orange-400 mt-1">دقيقة</p>
              </div>
            </div>
          </div>

          <button 
            onClick={() => signOut()}
            className="flex items-center gap-3 px-8 py-4 bg-gray-50 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-2xl w-full transition-all font-black justify-center shadow-sm"
          >
            <LogOut size={20} />
            <span>تسجيل الخروج</span>
          </button>
        </motion.div>
      </div>
    );
  }

  const statusColors = {
    new: 'border-blue-500 bg-blue-50 text-blue-700',
    preparing: 'border-orange-500 bg-orange-50 text-orange-700',
    ready: 'border-amber-500 bg-amber-50 text-amber-700',
    delivered: 'border-green-500 bg-green-50 text-green-700',
    completed: 'border-green-500 bg-green-50 text-green-700',
    cancelled: 'border-gray-500 bg-gray-50 text-gray-700'
  };

  const statusLabels = {
    new: 'جديد',
    preparing: 'قيد التحضير',
    ready: 'جاهز للتسليم',
    delivered: 'تم التوصيل',
    completed: 'تم التوصيل',
    cancelled: 'ملغي'
  };

  const filteredOrders = orders.filter((order) => {
    if (filterTab === 'active') {
      return order.status === 'new' || order.status === 'preparing' || order.status === 'ready';
    }
    if (filterTab === 'completed') {
      return order.status === 'delivered' || order.status === 'completed';
    }
    return true; // 'all'
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row" dir="rtl">
      {/* Sidebar - Hidden on mobile, full sidebar on desktop */}
      <aside className="hidden md:flex md:w-64 bg-white border-l border-gray-100 flex-col shrink-0">
        <div className="p-6 border-b">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white font-bold">
              {profile?.restaurants?.name?.[0]}
            </div>
            <div className="text-right">
              <h1 className="font-bold text-gray-900 leading-none">{profile?.restaurants?.name}</h1>
              <span className="text-xs text-gray-400 capitalize">
                {profile?.role === 'admin' ? 'مدير' : 'نادل'}
              </span>
            </div>
          </div>
          
          <nav className="space-y-1">
            <a href="#" className="flex items-center justify-between px-4 py-3 bg-orange-50 text-orange-600 rounded-xl font-semibold transition-all">
              <div className="flex items-center gap-3">
                <LayoutDashboard size={20} />
                <span>الطلبات</span>
              </div>
              {waiterCalls.length > 0 && (
                <span className="w-5 h-5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full animate-pulse font-black">
                  {waiterCalls.length}
                </span>
              )}
            </a>
          </nav>
        </div>
        
        <div className="p-6 mt-auto">
          <button 
            onClick={() => signOut()}
            className="flex items-center gap-3 px-4 py-3 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl w-full transition-all font-bold"
          >
            <LogOut size={20} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Mobile-only compact header */}
      <div className="md:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            {profile?.restaurants?.name?.[0]}
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-sm leading-none">{profile?.restaurants?.name}</h1>
            <span className="text-[10px] text-gray-400 font-medium">لوحة النادل</span>
          </div>
        </div>
        
        {waiterCalls.length > 0 && (
          <div className="flex items-center gap-1.5 bg-red-50 border border-red-100 text-red-600 px-2.5 py-1 rounded-full text-xs font-black animate-pulse">
            <Bell size={14} />
            <span>{waiterCalls.length} نداء طاولات</span>
          </div>
        )}
      </div>

      {/* Main Content */}
      <main className="flex-grow p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div className="text-right">
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-bold text-gray-900 tracking-tight">الطلبات النشطة</h2>
                <span className="text-xs bg-orange-100 text-orange-700 font-bold px-3 py-1 rounded-full border border-orange-200">
                  آخر 24 ساعة
                </span>
              </div>
              <p className="text-gray-500 text-sm mt-1">{new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            
            <div className="flex flex-wrap gap-4 overflow-x-auto no-scrollbar pb-2">
              {waiterCalls.map((call) => (
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  key={call.id}
                  className="bg-red-600 text-white p-4 rounded-2xl shadow-xl flex items-center gap-4 text-right animate-pulse cursor-pointer shrink-0 min-w-[200px]"
                >
                  <div className="bg-white/20 p-3 rounded-xl">
                    <Bell size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase opacity-80 leading-none mb-1">طلب نادل</p>
                    <p className="text-lg font-bold">طاولة {call.tables?.table_number || 'N/A'}</p>
                    <p className="text-[10px] opacity-70 mb-2">
                      {new Date(call.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <button 
                      onClick={() => handleCall(call.id)}
                      className="text-[10px] bg-white text-red-600 px-3 py-1 rounded-lg font-black uppercase hover:bg-gray-100 transition-colors"
                    >
                      تمت الخدمة
                    </button>
                  </div>
                </motion.div>
              ))}
              <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 text-right">
                <div className="bg-blue-50 p-3 rounded-xl text-blue-600">
                  <Bell size={24} />
                </div>
                <div>
                  <p className="text-sm text-gray-400 font-medium leading-none mb-1">نشط</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 text-right">
                <div className="bg-green-50 p-3 rounded-xl text-green-600">
                  <CheckCircle size={24} />
                </div>
                <div>
                  <p className="text-sm text-gray-400 font-medium leading-none mb-1">مكتمل</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.completed}</p>
                </div>
              </div>
            </div>
          </header>

          {/* Action Bar & Tabs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6 bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setFilterTab('active')}
                className={cn(
                  "px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2",
                  filterTab === 'active' 
                    ? "bg-orange-500 text-white shadow-md shadow-orange-500/20" 
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                )}
              >
                <span>الطلبات الجارية الآن</span>
                <span className={cn(
                  "px-2 py-0.5 rounded-md text-xs font-black",
                  filterTab === 'active' ? "bg-white/20 text-white" : "bg-gray-200 text-gray-700"
                )}>
                  {stats.active}
                </span>
              </button>

              <button
                onClick={() => setFilterTab('completed')}
                className={cn(
                  "px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2",
                  filterTab === 'completed' 
                    ? "bg-green-600 text-white shadow-md shadow-green-600/20" 
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                )}
              >
                <span>المكتملة اليوم</span>
                <span className={cn(
                  "px-2 py-0.5 rounded-md text-xs font-black",
                  filterTab === 'completed' ? "bg-white/20 text-white" : "bg-gray-200 text-gray-700"
                )}>
                  {stats.completed}
                </span>
              </button>

              <button
                onClick={() => setFilterTab('all')}
                className={cn(
                  "px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2",
                  filterTab === 'all' 
                    ? "bg-gray-900 text-white shadow-md" 
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                )}
              >
                <span>كل طلبات اليوم</span>
                <span className={cn(
                  "px-2 py-0.5 rounded-md text-xs font-black",
                  filterTab === 'all' ? "bg-white/20 text-white" : "bg-gray-200 text-gray-700"
                )}>
                  {orders.length}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handlePurgeOldOrders}
                disabled={isPurging}
                className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-bold text-xs flex items-center gap-2 transition-all disabled:opacity-50"
                title="حذف أي طلبات قديمة تجاوزت 24 ساعة من قاعدة البيانات"
              >
                <Trash2 size={16} />
                <span>{isPurging ? 'جاري التنظيف...' : 'تنظيف الطلبات القديمة (>24س)'}</span>
              </button>

              <button
                onClick={() => fetchOrders()}
                className="p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl transition-all"
                title="تحديث البيانات"
              >
                <RefreshCw size={18} />
              </button>
            </div>
          </div>

          {purgeMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-sm font-bold flex items-center gap-3"
            >
              <Sparkles size={18} className="text-emerald-600 shrink-0" />
              <span>{purgeMessage}</span>
            </motion.div>
          )}

          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-3xl border border-gray-100 p-16 text-center shadow-sm">
              <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">
                {filterTab === 'active' ? 'لا توجد طلبات جارية حالياً' : 'لا توجد طلبات في هذا القسم'}
              </h3>
              <p className="text-gray-400 text-sm max-w-sm mx-auto">
                {filterTab === 'active' 
                  ? 'تم تسليم كافة الطلبات الحديثة! ستظهر الطلبات الجديدة تلقائياً فور إرسالها من الزبائن.'
                  : 'تظهر هنا الطلبات المسجلة خلال الـ 24 ساعة الماضية فقط.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {filteredOrders.map((order) => {
                  const delivery = parseOrderDeliveryInfo(order);

                  return (
                    <motion.div
                      key={order.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={cn(
                        "bg-white rounded-3xl border-2 p-6 shadow-sm flex flex-col h-full text-right transition-all",
                        delivery.isDelivery ? "border-purple-300 ring-1 ring-purple-200" : statusColors[order.status as keyof typeof statusColors]
                      )}
                    >
                      {/* Delivery Header Banner */}
                      {delivery.isDelivery && (
                        <div className="mb-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-3.5 py-1.5 rounded-2xl flex items-center justify-between shadow-xs">
                          <div className="flex items-center gap-2">
                            <Bike size={16} className="shrink-0" />
                            <span className="font-black text-xs">طلب دليفري (توصيل خارجي)</span>
                          </div>
                          <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">
                            خارجي
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2.5 rounded-2xl shadow-xs", delivery.isDelivery ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600")}>
                            {delivery.isDelivery ? <Bike size={22} /> : <Timer size={20} className="text-gray-400" />}
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold text-gray-400 uppercase">
                              {delivery.isDelivery ? 'النوع' : 'طاولة'}
                            </span>
                            <h3 className="text-xl font-black text-gray-900">
                              {delivery.isDelivery ? 'دليفري' : (order.tables?.table_number || 'N/A')}
                            </h3>
                          </div>
                        </div>
                        <div className="text-left">
                          <span className="text-xs font-bold block opacity-60 font-mono">
                            #{getDisplayOrderNumber(order)}
                          </span>
                          <span className="text-xs font-mono font-bold text-gray-500">{new Date(order.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>

                      {/* Delivery Customer Details Box */}
                      {delivery.isDelivery && (
                        <div className="bg-purple-50/80 border border-purple-200/90 rounded-2xl p-3.5 space-y-2.5 mb-4 text-xs">
                          <div className="font-black text-purple-950 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <User size={14} className="text-purple-600" />
                              <span>المستلم: {delivery.customerName || 'عميل خارجي'}</span>
                            </span>
                            {delivery.deliveryZone && (
                              <span className="bg-purple-600 text-white px-2 py-0.5 rounded-lg text-[10px] font-black flex items-center gap-1">
                                <Bike size={11} />
                                <span>{delivery.deliveryZone}</span>
                                {delivery.deliveryFee && (
                                  <span>(+{delivery.deliveryFee} جـ)</span>
                                )}
                              </span>
                            )}
                          </div>

                          {delivery.phone && (
                            <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-purple-100 shadow-xs">
                              <div className="flex items-center gap-1.5 text-gray-900 font-mono font-bold text-xs" dir="ltr">
                                <Phone size={13} className="text-purple-600" />
                                <span>{delivery.phone}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={`tel:${delivery.phone}`}
                                  className="px-2.5 py-1 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1"
                                  title="اتصال بالعميل"
                                >
                                  <span>اتصال</span>
                                </a>
                                <a
                                  href={`https://wa.me/${delivery.phone.replace(/[^0-9]/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition-all"
                                  title="مراسلة على واتساب"
                                >
                                  واتساب
                                </a>
                              </div>
                            </div>
                          )}

                          {delivery.address && (
                            <div className="flex items-start gap-2 text-gray-800 bg-white/70 p-2 rounded-xl border border-purple-100">
                              <MapPin size={14} className="text-purple-600 shrink-0 mt-0.5" />
                              <div className="flex flex-col flex-grow">
                                {delivery.deliveryZone && (
                                  <span className="text-[10px] text-purple-700 font-black">
                                    المنطقة: {delivery.deliveryZone} {delivery.deliveryFee ? `(توصيل ${delivery.deliveryFee} جـ)` : ''}
                                  </span>
                                )}
                                <span className="font-bold leading-tight">{delivery.address}</span>
                              </div>
                            </div>
                          )}

                          {delivery.locationUrl && (
                            <div className="pt-1">
                              <a
                                href={delivery.locationUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="w-full py-2 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-sm active:scale-98 transition-all"
                              >
                                <MapPin size={14} className="animate-bounce" />
                                <span>فتح موقع العميل على خرائط جوجل (GPS)</span>
                                <ExternalLink size={12} className="opacity-80" />
                              </a>
                            </div>
                          )}

                          {delivery.deliveryNotes && (
                            <div className="text-[11px] text-purple-900 bg-purple-100/60 p-2 rounded-xl font-medium">
                              📝 ملاحظة: {delivery.deliveryNotes}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex-grow space-y-3 mb-6">
                        {order.order_items?.map((item: any) => {
                          const cleanedNote = cleanItemNotes(item.notes);
                          return (
                            <div key={item.id} className="flex gap-3 bg-white/70 p-3 rounded-2xl border border-black/5">
                              <div className="flex-grow">
                                <div className="flex justify-between items-baseline">
                                  <h4 className="font-bold text-gray-900">{item.products?.name_ar || item.products?.name}</h4>
                                  <span className="bg-white px-2 py-0.5 rounded-lg text-sm font-bold shadow-sm">x{item.quantity}</span>
                                </div>
                                {item.sugar_level && item.sugar_level !== 'none' && (
                                  <div className="mt-2 flex items-center gap-1.5 bg-orange-50 px-2 py-1 rounded-lg border border-orange-100 self-start">
                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                                    <p className="text-[10px] font-black text-orange-700 uppercase tracking-wider">
                                      سكر {(item.sugar_level === 'low' ? 'خفيف' : item.sugar_level === 'medium' ? 'وسط' : 'زيادة')}
                                    </p>
                                  </div>
                                )}
                                {cleanedNote && (
                                  <p className="text-xs italic text-gray-600 mt-1.5 bg-gray-50 p-1.5 rounded-lg">"{cleanedNote}"</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {order.status === 'new' && (
                            <button 
                              onClick={() => updateStatus(order.id, 'preparing')}
                              className="col-span-2 bg-orange-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-orange-700 transition-colors shadow-md"
                            >
                              <ChefHat size={18} />
                              بدء التحضير
                            </button>
                        )}
                        {order.status === 'preparing' && (
                          <div className="col-span-2 grid grid-cols-2 gap-2">
                            <button 
                              onClick={() => updateStatus(order.id, 'ready')}
                              className="bg-amber-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-1.5 hover:bg-amber-600 transition-colors shadow-md"
                            >
                              <CheckCircle size={16} />
                              جاهز للتسليم
                            </button>
                            <button 
                              onClick={() => updateStatus(order.id, 'delivered')}
                              className="bg-green-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-1.5 hover:bg-green-700 transition-colors shadow-md"
                            >
                              <CheckCircle size={16} />
                              {delivery.isDelivery ? 'تم التسليم' : 'تم التوصيل'}
                            </button>
                          </div>
                        )}
                        {order.status === 'ready' && (
                          <button 
                            onClick={() => updateStatus(order.id, 'delivered')}
                            className="col-span-2 bg-green-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-green-700 transition-colors shadow-md"
                          >
                            <CheckCircle size={18} />
                            {delivery.isDelivery ? 'تم تسليم الدليفري ✅' : 'تم التوصيل للطاولة ✅'}
                          </button>
                        )}
                        {['new', 'preparing', 'ready'].includes(order.status) && (
                          <button 
                            onClick={() => setCancellingOrder(order.id)}
                            className="col-span-2 mt-2 bg-red-50 text-red-600 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"
                          >
                            إلغاء الطلب
                          </button>
                        )}
                        {(order.status === 'delivered' || order.status === 'completed' || order.status === 'cancelled') && (
                           <div className="col-span-2 text-center py-2 font-bold uppercase tracking-widest text-sm opacity-50">
                             {statusLabels[order.status as keyof typeof statusLabels] || 'تم'}
                           </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}

          {/* Mobile Logout Button at the bottom */}
          <div className="md:hidden mt-12 pt-6 border-t border-gray-200/60 flex justify-center">
            <button 
              onClick={() => signOut()}
              className="flex items-center gap-2 px-6 py-3 bg-white text-gray-600 hover:text-red-600 border border-gray-200 rounded-xl text-sm font-bold shadow-sm transition-all active:scale-95"
            >
              <LogOut size={16} className="text-red-500" />
              <span>تسجيل الخروج من الحساب</span>
            </button>
          </div>
        </div>
      </main>

      {/* Cancellation Confirmation Modal */}
      <AnimatePresence>
        {cancellingOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[32px] p-8 max-w-sm w-full text-center shadow-2xl"
            >
              <div className="w-20 h-20 bg-red-50 text-red-600 rounded-[28px] flex items-center justify-center mx-auto mb-6">
                <X size={40} />
              </div>
              <h3 className="text-2xl font-black mb-2 tracking-tight">إلغاء الطلب؟</h3>
              <p className="text-gray-500 font-medium mb-8 leading-relaxed">
                هل أنت متأكد من رغبتك في إلغاء هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => updateStatus(cancellingOrder, 'cancelled')}
                  className="w-full bg-red-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-red-200 hover:bg-red-700 transition-all active:scale-[0.98]"
                >
                  تأكيد الإلغاء
                </button>
                <button
                  onClick={() => setCancellingOrder(null)}
                  className="w-full bg-gray-50 text-gray-500 py-4 rounded-2xl font-black hover:bg-gray-100 transition-all active:scale-[0.98]"
                >
                  تراجع
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
