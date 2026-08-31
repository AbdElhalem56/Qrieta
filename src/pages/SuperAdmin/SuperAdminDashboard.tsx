import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseUrl, supabaseAnonKey, Restaurant, Table } from '../../lib/supabase';
import qretaLogo from '../../assets/images/qreta_logo_1787613852268.jpg';
import { 
  Building2, 
  Plus, 
  QrCode, 
  Settings, 
  Users, 
  Download,
  X,
  Menu,
  ExternalLink,
  BarChart3,
  History,
  TrendingUp,
  Package,
  Coffee,
  Trash2,
  PauseCircle,
  PlayCircle,
  DollarSign,
  UserPlus,
  Search,
  KeyRound,
  Lock,
  User,
  AlertCircle,
  CheckCircle2,
  Shield,
  Upload,
  Image as ImageLucide,
  LogOut,
  MapPin,
  Navigation,
  Percent,
  Receipt,
  Bike,
  Copy,
  Check,
  CreditCard
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { cn, formatCurrency } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { getCurrentPosition, fetchAllServerGeofences, syncRestaurantGeofence } from '../../lib/geoHelper';

export default function SuperAdminDashboard() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [search, setSearch] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [copiedDeliveryLink, setCopiedDeliveryLink] = useState(false);
  
  // UI States
  const [activeTab, setActiveTab] = useState<'restaurants' | 'tables' | 'staff' | 'analytics' | 'orders'>('restaurants');
  const [isResModalOpen, setIsResModalOpen] = useState(false);
  const [editingRes, setEditingRes] = useState<Partial<Restaurant> | null>(null);

  const [profiles, setProfiles] = useState<any[]>([]);
  const [editingProfile, setEditingProfile] = useState<any | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // New User Creation States
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'waiter' | 'admin' | 'super_admin'>('waiter');
  const [newUserRestaurantId, setNewUserRestaurantId] = useState<string>('none');
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // User Filter & Action States
  const [staffSearch, setStaffSearch] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState<'all' | 'super_admin' | 'admin' | 'waiter'>('all');
  const [deletingUser, setDeletingUser] = useState<any | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [newDirectPassword, setNewDirectPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [currentAuthUserId, setCurrentAuthUserId] = useState<string | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [logoFileLoading, setLogoFileLoading] = useState(false);

  // Analytics & Orders states
  const [orders, setOrders] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [itemSoldCount, setItemSoldCount] = useState(0);
  const [productsCount, setProductsCount] = useState(0);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [analyticsMode, setAnalyticsMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [isFixingRole, setIsFixingRole] = useState(false);

  useEffect(() => {
    fetchRestaurants();
    fetchProfiles();
    
    // Check current user role for repair UI
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentAuthUserId(user.id);
        supabase.from('profiles').select('*').eq('id', user.id).single()
          .then(({ data }) => setCurrentUserProfile(data));
      }
    });
  }, []);

  const handleFixRole = async () => {
    setIsFixingRole(true);
    try {
      const { data, error } = await supabase.rpc('fix_super_admin_role');
      if (error) throw error;
      alert(`النتيجة: ${data}`);
      window.location.reload();
    } catch (err: any) {
      alert(`خطأ: ${err.message}`);
    } finally {
      setIsFixingRole(false);
    }
  };

  useEffect(() => {
    if (selectedRestaurant && (activeTab === 'analytics' || activeTab === 'orders')) {
      fetchAnalyticsAndOrders(selectedRestaurant.id);
    }
  }, [selectedRestaurant, selectedDate, analyticsMode, activeTab]);

  const fetchAnalyticsAndOrders = async (resId: string) => {
    try {
      let query = supabase.from('orders')
        .select('*, order_items(*, products(*))')
        .eq('restaurant_id', resId)
        .order('id', { ascending: false });

      if (analyticsMode === 'daily') {
        query = query.gte('created_at', `${selectedDate}T00:00:00`)
                     .lte('created_at', `${selectedDate}T23:59:59`);
      } else if (analyticsMode === 'weekly') {
        const d = new Date(selectedDate);
        const day = d.getDay();
        const diff = d.getDate() - day;
        const start = new Date(d.setDate(diff));
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
      } else {
        const [year, month] = selectedDate.split('-');
        const startDate = `${year}-${month}-01T00:00:00`;
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        const endDate = `${year}-${month}-${lastDay}T23:59:59`;
        query = query.gte('created_at', startDate).lte('created_at', endDate);
      }

      const [ordersResult, prodResult] = await Promise.all([
        query,
        supabase.from('products').select('id', { count: 'exact' }).eq('restaurant_id', resId)
      ]);

      setOrders(ordersResult.data || []);
      setOrderCount(ordersResult.data?.length || 0);
      setProductsCount(prodResult.count || 0);

      if (ordersResult.data) {
        let totalItems = 0;
        let revenueTotal = 0;
        const itemsMap: Record<string, number> = {};
        const revenueMap: Record<string, number> = {};

        ordersResult.data.forEach((order: any) => {
          const orderTotal = Number(order.total_price || 0);
          revenueTotal += orderTotal;

          const d = new Date(order.created_at);
          let groupKey: string;
          
          if (analyticsMode === 'daily') {
            const hour = d.getHours();
            const ampm = hour >= 12 ? 'مساءً' : 'صباحاً';
            const displayHour = hour % 12 || 12;
            groupKey = `${displayHour} ${ampm}`;
          } else {
            groupKey = d.toLocaleDateString('ar-EG');
          }
          
          revenueMap[groupKey] = (revenueMap[groupKey] || 0) + orderTotal;

          order.order_items?.forEach((item: any) => {
            const name = item.products?.name_ar || item.products?.name_en || 'غير معروف';
            itemsMap[name] = (itemsMap[name] || 0) + item.quantity;
            totalItems += item.quantity;
          });
        });
        setItemSoldCount(totalItems);
        setTotalRevenue(revenueTotal);

        // Process Revenue Data
        const revData = Object.entries(revenueMap).map(([name, value]) => {
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
          .sort((a,b) => (b.value as number) - (a.value as number))
          .slice(0, 10);
        setAnalytics(chartData);
      }
    } catch (err) {
      console.error('Fetch analytics error:', err);
    }
  };

  const fetchRestaurants = async () => {
    try {
      const { data } = await supabase.from('restaurants').select('*');
      const geofences = await fetchAllServerGeofences();
      if (data) {
        const merged = data.map(r => ({
          ...r,
          service_fee_percentage: geofences[r.id]?.service_fee_percentage !== undefined 
            ? geofences[r.id].service_fee_percentage 
            : (r.service_fee_percentage !== undefined ? r.service_fee_percentage : 0),
          is_prepaid: geofences[r.id]?.is_prepaid !== undefined
            ? geofences[r.id].is_prepaid
            : (r.is_prepaid !== undefined ? r.is_prepaid : (r.payment_model === 'prepaid')),
          payment_model: geofences[r.id]?.payment_model || r.payment_model || (geofences[r.id]?.is_prepaid || r.is_prepaid ? 'prepaid' : 'postpaid'),
          ...(geofences[r.id] ? {
            geofence_enabled: geofences[r.id].geofence_enabled ?? r.geofence_enabled,
            latitude: geofences[r.id].latitude ?? r.latitude,
            longitude: geofences[r.id].longitude ?? r.longitude,
            geofence_radius_meters: geofences[r.id].geofence_radius_meters ?? r.geofence_radius_meters,
          } : {})
        }));
        setRestaurants(merged);
      }
    } catch (err) {
      console.error('Fetch restaurants error:', err);
    }
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*, restaurants(name)');
    if (data) setProfiles(data);
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;
    
    const targetRestaurant = restaurants.find(r => r.id === editingProfile.restaurant_id);
    const { error } = await supabase
      .from('profiles')
      .update({
        role: editingProfile.role,
        restaurant_id: editingProfile.restaurant_id === 'none' ? null : editingProfile.restaurant_id,
        restaurant_name: editingProfile.restaurant_id === 'none' ? null : (targetRestaurant?.name || null),
        full_name: editingProfile.full_name
      })
      .eq('id', editingProfile.id);

    if (error) alert(error.message);
    else {
      setIsProfileModalOpen(false);
      fetchProfiles();
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword) {
      setCreateError('يرجى ملء البريد الإلكتروني وكلمة المرور');
      return;
    }
    if (newUserPassword.length < 6) {
      setCreateError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    setIsCreatingUser(true);
    setCreateError(null);
    setCreateSuccess(null);

    const cleanEmail = newUserEmail.trim().toLowerCase();
    const fullName = newUserFullName.trim() || cleanEmail.split('@')[0];
    const resId = newUserRestaurantId === 'none' || !newUserRestaurantId ? null : newUserRestaurantId;
    const targetRestaurant = restaurants.find(r => r.id === resId);

    try {
      let createdViaRpc = false;
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('admin_create_user', {
          new_email: cleanEmail,
          new_password: newUserPassword,
          new_full_name: fullName,
          new_role: newUserRole,
          new_restaurant_id: resId
        });

        if (!rpcError && rpcData) {
          if (rpcData.success) {
            createdViaRpc = true;
            setCreateSuccess(rpcData.message || 'تم إنشاء الحساب بنجاح!');
          } else {
            throw new Error(rpcData.message || 'فشل في إنشاء الحساب');
          }
        }
      } catch (rpcErr: any) {
        if (rpcErr.message && !rpcErr.message.includes('Could not find the function') && !rpcErr.message.includes('schema cache')) {
          throw rpcErr;
        }
        console.warn('RPC unavailable, using fallback client:', rpcErr);
      }

      if (!createdViaRpc) {
        const tempAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        });

        const { data: authData, error: authError } = await tempAuthClient.auth.signUp({
          email: cleanEmail,
          password: newUserPassword,
          options: {
            data: {
              full_name: fullName,
              role: newUserRole,
              restaurant_id: resId,
              restaurant_name: targetRestaurant?.name || null
            }
          }
        });

        if (authError) throw authError;

        if (authData.user) {
          // Upsert directly into profiles using current super admin's authenticated client
          const { error: profileError } = await supabase.from('profiles').upsert({
            id: authData.user.id,
            email: cleanEmail,
            full_name: fullName,
            role: newUserRole,
            restaurant_id: resId,
            restaurant_name: targetRestaurant?.name || null
          });

          if (profileError) {
            console.warn('Profile upsert warning:', profileError);
          }
        }

        setCreateSuccess('تم إنشاء الحساب بنجاح وإضافته إلى النظام!');
      }
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserFullName('');
      setNewUserRole('waiter');
      setNewUserRestaurantId('none');
      await fetchProfiles();

      setTimeout(() => {
        setIsNewUserModalOpen(false);
        setCreateSuccess(null);
      }, 1200);
    } catch (err: any) {
      console.error('Create user error:', err);
      setCreateError(err.message || 'حدث خطأ أثناء إنشاء الحساب');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleDeleteUser = async (targetUser: any) => {
    if (!targetUser) return;
    setIsDeletingUser(true);
    try {
      let rpcSucceeded = false;
      try {
        const { data, error } = await supabase.rpc('delete_staff_member', {
          target_user_id: targetUser.id
        });
        if (!error && data) {
          rpcSucceeded = true;
          if (!data.success) {
            alert(`فشل الحذف: ${data.message}`);
            setIsDeletingUser(false);
            return;
          }
        }
      } catch (rpcErr) {
        console.warn('RPC delete not found, falling back to profiles delete:', rpcErr);
      }

      if (!rpcSucceeded) {
        // Direct delete from profiles
        await supabase.from('profiles').delete().eq('id', targetUser.id);
      }

      await fetchProfiles();
      setDeletingUser(null);
    } catch (err: any) {
      console.error('Delete user error:', err);
      alert(`خطأ: ${err.message}`);
    } finally {
      setIsDeletingUser(false);
    }
  };

  const handleResetUserPassword = async (targetEmail: string, passwordToSet: string) => {
    if (!passwordToSet || passwordToSet.length < 6) {
      alert('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    setIsResettingPassword(true);
    try {
      const { data, error } = await supabase.rpc('dev_reset_password', {
        target_email: targetEmail,
        new_password: passwordToSet
      });
      if (error) throw error;
      if (data && data.startsWith('Error:')) {
        alert(data);
      } else {
        alert('تم تغيير كلمة المرور بنجاح للمستخدم!');
        setNewDirectPassword('');
      }
    } catch (err: any) {
      console.error('Reset password error:', err);
      alert(`خطأ: ${err.message}`);
    } finally {
      setIsResettingPassword(false);
    }
  };

  const fetchTables = async (resId: string) => {
    const { data } = await supabase.from('tables').select('*').eq('restaurant_id', resId);
    if (data) setTables(data);
  };

  const handleResSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRes) return;
    
    try {
      const serviceFee = editingRes.service_fee_percentage !== undefined && editingRes.service_fee_percentage !== null
        ? Number(editingRes.service_fee_percentage)
        : 0;

      const isPrepaid = editingRes.is_prepaid !== undefined 
        ? !!editingRes.is_prepaid 
        : editingRes.payment_model === 'prepaid';

      const geofencePayload = {
        geofence_enabled: !!editingRes.geofence_enabled,
        latitude: editingRes.latitude !== undefined && editingRes.latitude !== null && editingRes.latitude !== '' ? Number(editingRes.latitude) : null,
        longitude: editingRes.longitude !== undefined && editingRes.longitude !== null && editingRes.longitude !== '' ? Number(editingRes.longitude) : null,
        geofence_radius_meters: editingRes.geofence_radius_meters ? Number(editingRes.geofence_radius_meters) : 100,
        service_fee_percentage: serviceFee,
        is_prepaid: isPrepaid,
        payment_model: (isPrepaid ? 'prepaid' : 'postpaid') as 'prepaid' | 'postpaid'
      };

      // Base fields that are standard in Supabase restaurants table
      const baseDbPayload: Record<string, any> = {
        name: editingRes.name,
        slug: editingRes.slug,
        primary_color: editingRes.primary_color || '#f97316',
        secondary_color: editingRes.secondary_color || '#1f2937',
        is_active: editingRes.is_active !== undefined ? editingRes.is_active : true,
        service_fee_percentage: serviceFee,
        is_prepaid: isPrepaid,
        payment_model: isPrepaid ? 'prepaid' : 'postpaid',
      };
      if (editingRes.logo_url !== undefined) {
        baseDbPayload.logo_url = editingRes.logo_url;
      }

      let targetId = editingRes.id;

      if (editingRes.id) {
        // Try updating with geofence fields first
        let updateRes = await supabase.from('restaurants').update({
          ...baseDbPayload,
          ...geofencePayload
        }).eq('id', editingRes.id);

        // If it failed because columns do not exist in Supabase schema, fall back to baseDbPayload
        if (updateRes.error) {
          console.warn('Supabase update with geofence failed, retrying with base columns:', updateRes.error);
          updateRes = await supabase.from('restaurants').update(baseDbPayload).eq('id', editingRes.id);
          if (updateRes.error) throw updateRes.error;
        }
      } else {
        // Insert new restaurant
        let insertRes = await supabase.from('restaurants').insert({
          ...baseDbPayload,
          ...geofencePayload
        }).select().single();

        if (insertRes.error) {
          console.warn('Supabase insert with geofence failed, retrying with base columns:', insertRes.error);
          insertRes = await supabase.from('restaurants').insert(baseDbPayload).select().single();
          if (insertRes.error) throw insertRes.error;
        }
        
        if (insertRes.data) {
          targetId = insertRes.data.id;
        }
      }
      
      // Persist geofence to backend store and local cache
      if (targetId) {
        await syncRestaurantGeofence(targetId, geofencePayload);
      }
      
      setIsResModalOpen(false);
      await fetchRestaurants();
      alert('تم حفظ بيانات المطعم والنطاق الجغرافي بنجاح! 📍');
    } catch (err: any) {
      console.error('Res save error:', err);
      alert(`خطأ في الحفظ: ${err.message || 'فشلت العملية'}`);
    }
  };

  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  const handleDeleteRestaurant = async (id: string, name: string) => {
    console.log('Delete handler triggered for:', name, id);
    if (!window.confirm(`هل أنت متأكد من حذف مطعم "${name}"؟ سيتم حذف جميع البيانات المرتبطة به (طلبات، طاولات، موظفين) نهائياً.`)) {
      console.log('Delete cancelled by user');
      return;
    }
    
    setIsActionLoading(id);
    try {
      console.log('Executing Supabase delete for:', id);
      const { error, count } = await supabase.from('restaurants').delete().eq('id', id);
      
      if (error) {
        console.error('Supabase delete error details:', error);
        throw error;
      }
      
      console.log('Delete successful, rows affected:', count);
      setRestaurants(prev => prev.filter(r => r.id !== id));
      alert('تم حذف المطعم وجميع بياناته بنجاح');
    } catch (err: any) {
      console.error('Full delete catch block:', err);
      if (err.code === '23503') {
        alert('لا يمكن حذف المطعم لوجود بيانات مرتبطة به. لقد حاولت تفعيل الحذف التلقائي، يرجى تحديث الصفحة والمحاولة مرة أخرى.');
      } else {
        alert(`خطأ في الحذف: ${err.message || 'فشلت العملية، تأكد من صلاحياتك كأدمن'}`);
      }
    } finally {
      setIsActionLoading(null);
    }
  };

  const toggleRestaurantStatus = async (id: string, currentStatus: boolean) => {
    setIsActionLoading(id);
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ is_active: !currentStatus })
        .eq('id', id)
        .select();

      if (error) throw error;
      
      setRestaurants(prev => prev.map(r => r.id === id ? { ...r, is_active: !currentStatus } : r));
    } catch (err: any) {
      alert(`خطأ في تحديث الحالة: ${err.message || 'مشكلة في الصلاحيات'}`);
    } finally {
      setIsActionLoading(null);
    }
  };

  const addTable = async (resId: string) => {
    try {
      const tableNum = (tables.length + 1).toString();
      const { error } = await supabase.from('tables').insert({
        restaurant_id: resId,
        table_number: tableNum
      });
      
      if (error) throw error;
      
      await fetchTables(resId);
      alert('Table added successfully!');
    } catch (err: any) {
      console.error('Error adding table:', err);
      alert(`Error: ${err.message}`);
    }
  };

  const downloadQR = (tableNum: string) => {
    const svg = document.getElementById(`qr-${tableNum}`);
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
      downloadLink.download = tableNum === 'delivery' 
        ? `${selectedRestaurant?.name || 'Restaurant'}-Delivery-QR.png` 
        : `Table-${tableNum}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col md:flex-row" dir="rtl">
      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between p-4 border-b bg-white sticky top-0 z-[100]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center p-1 overflow-hidden shadow-xs">
            <img src={qretaLogo} alt="Qrieta Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          </div>
          <h1 className="text-xl font-black italic text-gray-900">Qrieta HQ</h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={async () => {
              if (window.confirm('هل أنت متأكد من رغبتك في تسجيل الخروج؟')) {
                await supabase.auth.signOut();
                localStorage.clear();
                window.location.href = '/login';
              }
            }}
            title="تسجيل الخروج"
            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={20} />
          </button>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
          >
            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 right-0 z-[110] w-64 bg-white border-l transition-transform duration-300 transform md:relative md:translate-x-0 flex flex-col justify-between",
        isSidebarOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div>
          <div className="p-6 hidden md:flex items-center gap-3 border-b">
            <div className="w-11 h-11 bg-white border border-gray-200 rounded-xl flex items-center justify-center p-1 overflow-hidden shadow-xs">
              <img src={qretaLogo} alt="Qrieta Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
            <div>
              <h1 className="text-lg font-black italic text-gray-900 leading-tight">Qrieta HQ</h1>
              <p className="text-[10px] text-gray-500 font-bold">Super Admin Panel</p>
            </div>
          </div>
          
          <nav className="p-4 space-y-2 w-full mt-4 md:mt-0">
            <button 
              onClick={() => { setActiveTab('restaurants'); setIsSidebarOpen(false); }}
              className={cn(
                "w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all",
                activeTab === 'restaurants' ? "bg-gray-900 text-white shadow-xl shadow-gray-200" : "text-gray-400 hover:bg-gray-50"
              )}
            >
              <Building2 size={20} />
              <span className="font-bold">المطاعم</span>
            </button>
            <button 
              onClick={() => { setActiveTab('tables'); setIsSidebarOpen(false); }}
              className={cn(
                "w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all",
                activeTab === 'tables' ? "bg-gray-900 text-white shadow-xl shadow-gray-200" : "text-gray-400 hover:bg-gray-50"
              )}
            >
              <QrCode size={20} />
              <span className="font-bold">إدارة الطاولات</span>
            </button>
            <button 
              onClick={() => { setActiveTab('staff'); setIsSidebarOpen(false); }}
              className={cn(
                "w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all",
                activeTab === 'staff' ? "bg-gray-900 text-white shadow-xl shadow-gray-200" : "text-gray-400 hover:bg-gray-50"
              )}
            >
              <Users size={20} />
              <span className="font-bold">دليل الموظفين</span>
            </button>
            <button 
              onClick={() => { setActiveTab('orders'); setIsSidebarOpen(false); }}
              className={cn(
                "w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all",
                activeTab === 'orders' ? "bg-gray-900 text-white shadow-xl shadow-gray-200" : "text-gray-400 hover:bg-gray-50"
              )}
            >
              <History size={20} />
              <span className="font-bold">سجل الطلبات</span>
            </button>
            <button 
              onClick={() => { setActiveTab('analytics'); setIsSidebarOpen(false); }}
              className={cn(
                "w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all",
                activeTab === 'analytics' ? "bg-gray-900 text-white shadow-xl shadow-gray-200" : "text-gray-400 hover:bg-gray-50"
              )}
            >
              <BarChart3 size={20} />
              <span className="font-bold">الإحصائيات</span>
            </button>
          </nav>
        </div>

        {/* Logout Section in Sidebar */}
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={async () => {
              if (window.confirm('هل أنت متأكد من رغبتك في تسجيل الخروج من لوحة السوبر أدمن؟')) {
                await supabase.auth.signOut();
                localStorage.clear();
                window.location.href = '/login';
              }
            }}
            className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl text-red-600 bg-red-50/80 hover:bg-red-100 font-black text-sm transition-all group cursor-pointer border border-red-100"
          >
            <div className="flex items-center gap-3">
              <LogOut size={19} className="group-hover:-translate-x-1 transition-transform text-red-600" />
              <span>تسجيل الخروج</span>
            </div>
            <span className="text-[10px] text-red-500 font-bold bg-white px-2.5 py-1 rounded-lg border border-red-200 shadow-xs">
              خروج
            </span>
          </button>
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[105] md:hidden"
        />
      )}

      {/* Content */}
      <main className="flex-grow bg-gray-50/50 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          {currentUserProfile && currentUserProfile.role !== 'super_admin' && (
            <div className="bg-red-50 border border-red-200 p-6 rounded-3xl mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="text-right">
                <h3 className="text-red-900 font-black text-xl">⚠️ تنبيه: صلاحيات محدودة</h3>
                <p className="text-red-700 font-bold mt-1">حسابك مسجل بصفة "{currentUserProfile.role}". لكي تستطيع التحكم في النظام بالكامل يجب أن تكون "super_admin".</p>
              </div>
              <button 
                onClick={handleFixRole}
                disabled={isFixingRole}
                className="bg-red-600 text-white px-8 py-3 rounded-2xl font-black shadow-xl hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50"
              >
                {isFixingRole ? 'جاري الإصلاح...' : 'ترقية حسابي لمدير نظام'}
              </button>
            </div>
          )}

          {activeTab === 'restaurants' && (
            <section className="text-right">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 md:mb-12 gap-4">
                <div>
                  <h2 className="text-3xl md:text-4xl font-black tracking-tight text-gray-900">شبكة الشركاء</h2>
                  <p className="text-gray-400 mt-2 font-medium">إدارة ومراقبة جميع المستأجرين.</p>
                </div>
                <button 
                  onClick={() => { setEditingRes({ primary_color: '#f97316', secondary_color: '#1f2937' }); setIsResModalOpen(true); }}
                  className="bg-gray-900 text-white px-6 md:px-8 py-3 md:py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-2xl hover:scale-105 active:scale-95 transition-all text-sm md:text-base"
                >
                  <Plus size={24} />
                  <span>مطعم جديد</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                {restaurants.map(res => (
                  <motion.div 
                    layout
                    key={res.id}
                    className={cn(
                      "bg-white rounded-3xl border border-gray-100 p-8 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden",
                      !res.is_active && "opacity-60 grayscale"
                    )}
                  >
                    {!res.is_active && (
                      <div className="absolute top-4 left-[-40px] bg-red-500 text-white text-[10px] font-black px-12 py-1 rotate-[-45deg] shadow-lg z-10">
                        OFFLINE
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-gray-50 rounded-2xl p-2 border overflow-hidden flex items-center justify-center">
                          {res.logo_url ? (
                            <img 
                              src={res.logo_url} 
                              alt={res.name}
                              className="w-full h-full object-contain" 
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                                if (e.currentTarget.parentElement) {
                                  e.currentTarget.parentElement.innerHTML = '<span class="text-xs font-bold text-gray-400 text-center">خطأ في الرابط</span>';
                                }
                              }}
                            />
                          ) : (
                            <Building2 className="w-full h-full text-gray-300" />
                          )}
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">{res.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs font-mono text-gray-400">slug: {res.slug}</p>
                            {res.is_prepaid || res.payment_model === 'prepaid' ? (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                <CreditCard size={10} /> مسبق الدفع
                              </span>
                            ) : (
                              <span className="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                غير مسبق الدفع
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 transition-all relative z-[50]">
                        <button 
                          type="button"
                          disabled={isActionLoading === res.id}
                          onClick={(e) => { 
                            e.preventDefault();
                            e.stopPropagation(); 
                            console.log('Power button clicked');
                            toggleRestaurantStatus(res.id, res.is_active ?? true); 
                          }}
                          className={cn(
                            "p-3 rounded-xl transition-all cursor-pointer relative",
                            res.is_active ? "bg-orange-50 text-orange-600 hover:bg-orange-100" : "bg-green-50 text-green-600 hover:bg-green-100",
                            isActionLoading === res.id && "animate-pulse opacity-50"
                          )}
                          title={res.is_active ? "إيقاف الخدمة" : "تفعيل الخدمة"}
                        >
                          <div className="pointer-events-none">
                            {res.is_active ? <PauseCircle size={20} /> : <PlayCircle size={20} />}
                          </div>
                        </button>
                        <button 
                          type="button"
                          disabled={isActionLoading === res.id}
                          onClick={(e) => { 
                            e.preventDefault();
                            e.stopPropagation(); 
                            console.log('Edit button clicked');
                            setEditingRes(res); 
                            setIsResModalOpen(true); 
                          }} 
                          className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all disabled:opacity-50 cursor-pointer relative"
                          title="تعديل"
                        >
                          <Settings size={20} className="pointer-events-none" />
                        </button>
                        <button 
                          type="button"
                          disabled={isActionLoading === res.id}
                          onClick={(e) => { 
                            e.preventDefault();
                            e.stopPropagation(); 
                            console.log('Delete button clicked for:', res.name);
                            handleDeleteRestaurant(res.id, res.name); 
                          }} 
                          className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all disabled:opacity-50 cursor-pointer relative"
                          title="حذف"
                        >
                          <Trash2 size={20} className="pointer-events-none" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-8">
                      <div className="w-full h-2 rounded-full" style={{ backgroundColor: res.primary_color }} />
                      <div className="w-full h-2 rounded-full" style={{ backgroundColor: res.secondary_color }} />
                    </div>

                    <div className="flex items-center justify-between pt-6 border-t font-bold">
                       <div className="flex items-center gap-2 text-gray-400">
                         <Users size={18} />
                         <span>Staff: {profiles.filter(p => p.restaurant_id === res.id).length}</span>
                       </div>
                       <div className="flex items-center gap-3">
                         <a 
                           href={`/r/${res.slug}`} 
                           target="_blank" 
                           rel="noreferrer"
                           className="flex items-center gap-1 text-purple-700 hover:text-purple-900 bg-purple-50 px-2.5 py-1 rounded-lg transition-colors text-xs font-black"
                           title="رابط الدليفري والطلبات الخارجية المباشر"
                         >
                           <Bike size={14} />
                           <span>دليفري</span>
                         </a>
                         <a href={`/r/${res.slug}`} target="_blank" className="flex items-center gap-2 text-gray-900 hover:underline text-xs">
                           <span>Live View</span>
                           <ExternalLink size={16} />
                         </a>
                       </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'tables' && (
            <section className="bg-white rounded-3xl md:rounded-[40px] border p-6 md:p-12 shadow-sm min-h-[70vh] text-right">
              <div className="max-w-4xl mx-auto">
                <header className="mb-12">
                   <h2 className="text-2xl md:text-3xl font-black italic mb-4">إدارة الطاولات</h2>
                   <div className="flex flex-col sm:flex-row gap-4">
                      <select 
                        className="flex-grow bg-gray-50 border px-6 py-4 rounded-2xl outline-none font-bold text-right"
                        onChange={(e) => {
                          const res = restaurants.find(r => r.id === e.target.value);
                          if (res) {
                            setSelectedRestaurant(res);
                            fetchTables(res.id);
                          }
                        }}
                      >
                         <option value="">اختر المطعم</option>
                         {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      {selectedRestaurant && (
                        <button 
                          onClick={() => addTable(selectedRestaurant.id)}
                          className="px-8 py-4 bg-gray-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg"
                        >
                          <Plus size={20} />
                          إضافة طاولة
                        </button>
                      )}
                   </div>
                </header>

                {/* Delivery QR Code Highlighted Card for Selected Restaurant */}
                {selectedRestaurant && (() => {
                  const deliveryUrl = `${window.location.origin}/r/${selectedRestaurant.slug}`;
                  return (
                    <div className="mb-10 bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900 text-white rounded-3xl md:rounded-[36px] p-6 md:p-8 shadow-xl relative overflow-hidden border border-purple-400/20">
                      <div className="absolute top-0 left-0 -mt-12 -ml-12 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
                      <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6">
                        <div className="space-y-3 max-w-xl text-right">
                          <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/30 border border-purple-400/30 rounded-full text-xs font-black text-purple-200">
                            <Bike size={15} className="text-purple-300" />
                            <span>كود QR ورابط الدليفري والطلبات الخارجية ({selectedRestaurant.name})</span>
                          </div>

                          <h3 className="text-2xl font-black text-white leading-snug">
                            رابط دليفري مباشر بدون طاولة وبدون قيود نطاق
                          </h3>

                          <p className="text-xs text-purple-200/90 leading-relaxed font-medium">
                            هذا الرمز والرابط متاح لطلبات التوصيل للمنازل والمكاتب من أي مكان. يُعفي العميل من رسوم خدمة الصالة (0% خدمة)، ويُرسل بيانات العميل للتوصيل مباشرة للويتر.
                          </p>

                          <div className="pt-2 flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={() => downloadQR('delivery')}
                              className="bg-white text-purple-950 hover:bg-purple-50 px-4 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 shadow-md transition-all active:scale-95 cursor-pointer"
                            >
                              <Download size={15} />
                              <span>تحميل QR الدليفري (PNG)</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(deliveryUrl);
                                setCopiedDeliveryLink(true);
                                setTimeout(() => setCopiedDeliveryLink(false), 2500);
                              }}
                              className="bg-white/15 hover:bg-white/25 border border-white/20 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
                            >
                              {copiedDeliveryLink ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
                              <span>{copiedDeliveryLink ? 'تم نسخ الرابط!' : 'نسخ رابط الدليفري'}</span>
                            </button>

                            <a
                              href={deliveryUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-purple-200 hover:text-white px-3 py-2 text-xs font-bold flex items-center gap-1.5 underline underline-offset-4"
                            >
                              <ExternalLink size={13} />
                              <span>معاينة الرابط</span>
                            </a>
                          </div>
                        </div>

                        {/* QR Display Card */}
                        <div className="bg-white p-4 rounded-2xl shadow-xl flex flex-col items-center shrink-0 border-2 border-purple-300/30 text-gray-900">
                          <span className="text-[10px] font-black text-purple-900 uppercase tracking-wider mb-2 flex items-center gap-1">
                            <Bike size={13} />
                            <span>QR الدليفري</span>
                          </span>
                          <div className="p-2 bg-gray-50 rounded-xl border border-gray-100">
                            <QRCodeSVG
                              id="qr-delivery"
                              value={deliveryUrl}
                              size={140}
                              level="H"
                              includeMargin
                            />
                          </div>
                          <span className="text-[10px] text-gray-500 font-mono font-bold mt-1.5 max-w-[150px] truncate text-center" dir="ltr">
                            /r/{selectedRestaurant.slug}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {tables.map(table => (
                    <div key={table.id} className="bg-gray-50 p-8 rounded-3xl border border-gray-100 flex flex-col items-center">
                       <span className="text-xs font-black uppercase text-gray-400 mb-4 tracking-widest">رقم الطاولة</span>
                       <h4 className="text-5xl font-black mb-8 italic">{table.table_number}</h4>
                       
                       <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100 mb-6">
                         <QRCodeSVG 
                            id={`qr-${table.table_number}`}
                            value={`${window.location.origin}/r/${selectedRestaurant?.slug}/t/${table.id}`} 
                            size={160}
                            level="H"
                            includeMargin
                         />
                       </div>

                       <button 
                         onClick={() => downloadQR(table.table_number)}
                         className="w-full bg-white border px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-900 hover:text-white transition-all shadow-sm"
                       >
                         <Download size={18} />
                         تحميل QR
                       </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
          {activeTab === 'staff' && (
            <section className="bg-white rounded-3xl md:rounded-[40px] border p-6 md:p-10 shadow-sm overflow-hidden text-right">
               {/* Header and Quick Stats */}
               <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-8 gap-6 border-b pb-6">
                 <div>
                   <h2 className="text-2xl md:text-3xl font-black italic mb-2">إدارة المستخدمين والصلاحيات</h2>
                   <p className="text-gray-500 text-sm">
                     إضافة وحذف حسابات الموظفين وتعديل أدوارهم ومطاعمهم مباشرة من النظام
                   </p>
                 </div>

                 <button
                   onClick={() => {
                     setIsNewUserModalOpen(true);
                     setCreateError(null);
                     setCreateSuccess(null);
                   }}
                   className="px-6 py-3.5 bg-gray-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2.5 hover:bg-black transition-all shadow-md active:scale-95"
                 >
                   <UserPlus size={20} />
                   <span>إضافة حساب جديد</span>
                 </button>
               </div>

               {/* Role Counters */}
               <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-6">
                 <div className="bg-gray-50 border p-4 rounded-2xl">
                   <span className="text-xs text-gray-500 font-bold block mb-1">إجمالي الحسابات</span>
                   <span className="text-2xl font-black text-gray-900">{profiles.length}</span>
                 </div>
                 <div className="bg-purple-50/70 border border-purple-100 p-4 rounded-2xl">
                   <span className="text-xs text-purple-700 font-bold block mb-1">مدراء النظام (Super)</span>
                   <span className="text-2xl font-black text-purple-900">
                     {profiles.filter(p => p.role === 'super_admin').length}
                   </span>
                 </div>
                 <div className="bg-blue-50/70 border border-blue-100 p-4 rounded-2xl">
                   <span className="text-xs text-blue-700 font-bold block mb-1">مدراء المطاعم (Admin)</span>
                   <span className="text-2xl font-black text-blue-900">
                     {profiles.filter(p => p.role === 'admin').length}
                   </span>
                 </div>
                 <div className="bg-emerald-50/70 border border-emerald-100 p-4 rounded-2xl">
                   <span className="text-xs text-emerald-700 font-bold block mb-1">النوادل والعمال (Staff)</span>
                   <span className="text-2xl font-black text-emerald-900">
                     {profiles.filter(p => p.role === 'waiter').length}
                   </span>
                 </div>
               </div>

               {/* Search & Filter Toolbar */}
               <div className="flex flex-col md:flex-row gap-3 mb-6">
                 <div className="relative flex-grow">
                   <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
                   <input
                     type="text"
                     placeholder="ابحث بالاسم، البريد الإلكتروني، أو المطعم..."
                     value={staffSearch}
                     onChange={e => setStaffSearch(e.target.value)}
                     className="w-full bg-gray-50 border px-11 py-3.5 rounded-2xl outline-none text-sm font-medium focus:bg-white focus:border-gray-900 transition-all text-right"
                   />
                   {staffSearch && (
                     <button
                       onClick={() => setStaffSearch('')}
                       className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                     >
                       <X size={16} />
                     </button>
                   )}
                 </div>

                 <div className="flex gap-1.5 bg-gray-100 p-1 rounded-2xl overflow-x-auto">
                   <button
                     onClick={() => setStaffRoleFilter('all')}
                     className={cn(
                       "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                       staffRoleFilter === 'all' ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-900"
                     )}
                   >
                     الكل ({profiles.length})
                   </button>
                   <button
                     onClick={() => setStaffRoleFilter('super_admin')}
                     className={cn(
                       "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                       staffRoleFilter === 'super_admin' ? "bg-white shadow-sm text-purple-700" : "text-gray-500 hover:text-gray-900"
                     )}
                   >
                     مدير نظام
                   </button>
                   <button
                     onClick={() => setStaffRoleFilter('admin')}
                     className={cn(
                       "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                       staffRoleFilter === 'admin' ? "bg-white shadow-sm text-blue-700" : "text-gray-500 hover:text-gray-900"
                     )}
                   >
                     مدير مطعم
                   </button>
                   <button
                     onClick={() => setStaffRoleFilter('waiter')}
                     className={cn(
                       "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                       staffRoleFilter === 'waiter' ? "bg-white shadow-sm text-emerald-700" : "text-gray-500 hover:text-gray-900"
                     )}
                   >
                     نادل
                   </button>
                 </div>
               </div>
               
               {/* User Table */}
               <div className="overflow-x-auto">
                 <table className="w-full text-right min-w-[700px]">
                   <thead>
                     <tr className="text-xs uppercase font-black text-gray-400 border-b">
                       <th className="pb-4">المستخدم</th>
                       <th className="pb-4">الدور / الصلاحية</th>
                       <th className="pb-4">المطعم التابع له</th>
                       <th className="pb-4 text-left">الإجراءات</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-100">
                      {profiles
                        .filter(p => {
                          const matchesSearch = 
                            !staffSearch || 
                            (p.full_name && p.full_name.toLowerCase().includes(staffSearch.toLowerCase())) ||
                            (p.email && p.email.toLowerCase().includes(staffSearch.toLowerCase())) ||
                            (p.restaurant_name && p.restaurant_name.toLowerCase().includes(staffSearch.toLowerCase()));
                          const matchesRole = staffRoleFilter === 'all' || p.role === staffRoleFilter;
                          return matchesSearch && matchesRole;
                        })
                        .map(p => {
                          const isCurrentUser = p.id === currentAuthUserId;
                          return (
                            <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                              <td className="py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-2xl bg-gray-100 border flex items-center justify-center font-black text-gray-700 text-sm">
                                    {p.full_name ? p.full_name.charAt(0).toUpperCase() : <User size={18} />}
                                  </div>
                                  <div>
                                    <div className="font-bold text-gray-900 flex items-center gap-2">
                                      <span>{p.full_name || 'بدون اسم'}</span>
                                      {isCurrentUser && (
                                        <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                                          أنت (الحساب الحالي)
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-400 font-mono" dir="ltr">{p.email || '—'}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4">
                                 <span className={cn(
                                   "px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5",
                                   p.role === 'super_admin' ? "bg-purple-100 text-purple-700 border border-purple-200" : 
                                   p.role === 'admin' ? "bg-blue-100 text-blue-700 border border-blue-200" : 
                                   "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                 )}>
                                   <Shield size={12} />
                                   {p.role === 'super_admin' ? 'مدير النظام (Super Admin)' : 
                                    p.role === 'admin' ? 'مدير مطعم (Admin)' : 
                                    'طاقم نادل (Waiter)'}
                                 </span>
                              </td>
                              <td className="py-4 text-sm font-semibold text-gray-700">
                                {p.restaurant_name || p.restaurants?.name ? (
                                  <div className="flex items-center gap-2">
                                    <Building2 size={16} className="text-gray-400" />
                                    <span>{p.restaurant_name || p.restaurants?.name}</span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-xs italic">عام / غير مقيد بمطعم</span>
                                )}
                              </td>
                              <td className="py-4 text-left">
                                <div className="flex items-center justify-end gap-1.5">
                                   <button 
                                     onClick={() => { 
                                       setEditingProfile(p); 
                                       setIsProfileModalOpen(true); 
                                     }}
                                     title="تعديل الصلاحية أو المطعم أو كلمة المرور"
                                     className="p-2 hover:bg-gray-100 text-gray-600 rounded-xl transition-all border border-transparent hover:border-gray-200"
                                   >
                                      <Settings size={18}/>
                                   </button>
                                   
                                   <button 
                                     onClick={() => setDeletingUser(p)}
                                     disabled={isCurrentUser}
                                     title={isCurrentUser ? "لا يمكنك حذف حسابك الحالي" : "حذف الحساب نهائياً"}
                                     className={cn(
                                       "p-2 rounded-xl transition-all border border-transparent",
                                       isCurrentUser 
                                         ? "opacity-30 cursor-not-allowed text-gray-300" 
                                         : "hover:bg-red-50 text-red-500 hover:border-red-100"
                                     )}
                                   >
                                      <Trash2 size={18}/>
                                   </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                   </tbody>
                 </table>
                 
                 {profiles.length === 0 && (
                   <div className="text-center py-12 text-gray-400">
                     لا يوجد أي مستخدمين مسجلين حالياً.
                   </div>
                 )}
               </div>
            </section>
          )}

          {/* New Analytics Tab */}
          {activeTab === 'analytics' && (
            <section className="text-right space-y-6">
              <div className="bg-white p-6 rounded-3xl border shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                <select 
                  className="w-full md:w-64 bg-gray-50 border px-6 py-3 rounded-2xl outline-none font-bold text-right"
                  value={selectedRestaurant?.id || ''}
                  onChange={(e) => {
                    const res = restaurants.find(r => r.id === e.target.value);
                    setSelectedRestaurant(res || null);
                  }}
                >
                  <option value="">اختر المطعم للمتابعة</option>
                  {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>

                <div className="flex gap-2 bg-gray-100 p-1 rounded-2xl w-full md:w-auto">
                  <button 
                    onClick={() => setAnalyticsMode('daily')}
                    className={cn("flex-grow md:flex-none px-6 py-2 rounded-xl font-bold transition-all", analyticsMode === 'daily' ? "bg-white shadow-sm text-gray-900" : "text-gray-500")}
                  >
                    يومي
                  </button>
                  <button 
                    onClick={() => setAnalyticsMode('weekly')}
                    className={cn("flex-grow md:flex-none px-6 py-2 rounded-xl font-bold transition-all", analyticsMode === 'weekly' ? "bg-white shadow-sm text-gray-900" : "text-gray-500")}
                  >
                    أسبوعي
                  </button>
                  <button 
                    onClick={() => setAnalyticsMode('monthly')}
                    className={cn("flex-grow md:flex-none px-6 py-2 rounded-xl font-bold transition-all", analyticsMode === 'monthly' ? "bg-white shadow-sm text-gray-900" : "text-gray-500")}
                  >
                    شهري
                  </button>
                </div>

                <input 
                  type={analyticsMode === 'daily' || analyticsMode === 'weekly' ? "date" : "month"}
                  value={analyticsMode === 'monthly' ? selectedDate.substring(0, 7) : selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full md:w-auto bg-gray-50 border px-6 py-3 rounded-2xl outline-none font-bold"
                />
              </div>

              {selectedRestaurant ? (
                <div className="grid gap-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white p-6 rounded-3xl border shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><TrendingUp /></div>
                        <span className="text-gray-500 font-bold text-xs">إجمالي الطلبات</span>
                      </div>
                      <p className="text-4xl font-black">{orderCount}</p>
                    </div>
                    <div className="bg-white p-6 rounded-3xl border shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-green-50 text-green-600 rounded-2xl"><Package /></div>
                        <span className="text-gray-500 font-bold text-xs">الأصناف المباعة</span>
                      </div>
                      <p className="text-4xl font-black">{itemSoldCount}</p>
                    </div>
                    <div className="bg-white p-6 rounded-3xl border shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl"><DollarSign /></div>
                        <span className="text-gray-500 font-bold text-xs">الإيرادات</span>
                      </div>
                      <p className="text-4xl font-black">{formatCurrency(totalRevenue)}</p>
                    </div>
                    <div className="bg-white p-6 rounded-3xl border shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl"><Coffee /></div>
                        <span className="text-gray-500 font-bold text-xs">قائمة الطعام</span>
                      </div>
                      <p className="text-4xl font-black">{productsCount}</p>
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-3xl border shadow-sm">
                    <h3 className="text-xl font-bold mb-8">تحليل الإيرادات</h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revenueData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} />
                          <YAxis axisLine={false} tickLine={false} />
                          <Tooltip cursor={{fill: '#8b5cf610'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                          <Bar dataKey="revenue" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-3xl border shadow-sm">
                    <h3 className="text-xl font-bold mb-8">أكثر الأصناف مبيعاً</h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} />
                          <YAxis axisLine={false} tickLine={false} />
                          <Tooltip cursor={{fill: '#00000005'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                          <Bar dataKey="value" fill="#111827" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white p-20 rounded-[40px] border text-center text-gray-400 font-bold">
                  رجاء اختيار مطعم لعرض الإحصائيات الخاصة به
                </div>
              )}
            </section>
          )}

          {/* New Orders Tab */}
          {activeTab === 'orders' && (
            <section className="text-right space-y-6">
              <div className="bg-white p-6 rounded-3xl border shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                <select 
                  className="w-full md:w-64 bg-gray-50 border px-6 py-3 rounded-2xl outline-none font-bold text-right"
                  value={selectedRestaurant?.id || ''}
                  onChange={(e) => {
                    const res = restaurants.find(r => r.id === e.target.value);
                    setSelectedRestaurant(res || null);
                  }}
                >
                  <option value="">اختر المطعم للمراجعة</option>
                  {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>

                <div className="flex flex-col md:flex-row items-center gap-4">
                  <div className="flex gap-2 bg-gray-100 p-1 rounded-2xl w-full md:w-auto">
                    <button 
                      onClick={() => setAnalyticsMode('daily')}
                      className={cn("flex-grow md:flex-none px-6 py-2 rounded-xl font-bold transition-all", analyticsMode === 'daily' ? "bg-white shadow-sm text-gray-900" : "text-gray-500")}
                    >
                      يومي
                    </button>
                    <button 
                      onClick={() => setAnalyticsMode('weekly')}
                      className={cn("flex-grow md:flex-none px-6 py-2 rounded-xl font-bold transition-all", analyticsMode === 'weekly' ? "bg-white shadow-sm text-gray-900" : "text-gray-500")}
                    >
                      أسبوعي
                    </button>
                    <button 
                      onClick={() => setAnalyticsMode('monthly')}
                      className={cn("flex-grow md:flex-none px-6 py-2 rounded-xl font-bold transition-all", analyticsMode === 'monthly' ? "bg-white shadow-sm text-gray-900" : "text-gray-500")}
                    >
                      شهري
                    </button>
                  </div>

                  <input 
                    type={analyticsMode === 'daily' || analyticsMode === 'weekly' ? "date" : "month"}
                    value={analyticsMode === 'monthly' ? selectedDate.substring(0, 7) : selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full md:w-auto bg-gray-50 border px-6 py-3 rounded-2xl outline-none font-bold"
                  />
                </div>
              </div>

              {selectedRestaurant ? (
                <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-right min-w-[800px]">
                      <thead className="bg-gray-50 text-gray-500 text-xs font-black uppercase tracking-widest">
                        <tr>
                          <th className="px-6 py-4">رقم الطلب</th>
                          <th className="px-6 py-4">الوقت</th>
                          <th className="px-6 py-4">الأصناف</th>
                          <th className="px-6 py-4">الإجمالي</th>
                          <th className="px-6 py-4">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {orders.map((order) => (
                          <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-6 font-bold">#{order.id}</td>
                            <td className="px-6 py-6 text-sm text-gray-500">
                              {new Date(order.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-6 py-6">
                              <div className="flex flex-wrap gap-1">
                                {order.order_items?.map((item: any, idx: number) => (
                                  <span key={idx} className="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-bold">
                                    {item.quantity}x {item.products?.name_ar || item.products?.name_en}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-6 py-6 font-black">{formatCurrency(order.total_price)}</td>
                            <td className="px-6 py-6">
                               <span className={cn(
                                 "px-3 py-1 rounded-full text-[10px] font-black uppercase",
                                 order.status === 'delivered' ? "bg-green-100 text-green-600" :
                                 order.status === 'preparing' ? "bg-blue-100 text-blue-600" :
                                 order.status === 'cancelled' ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-600"
                               )}>
                                 {order.status === 'new' ? 'جديد' :
                                  order.status === 'preparing' ? 'جاري التحضير' :
                                  order.status === 'delivered' ? 'تم التوصيل' : 'ملغي'}
                               </span>
                            </td>
                          </tr>
                        ))}
                        {orders.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-6 py-20 text-center text-gray-400 font-bold underline">
                              لا توجد طلبات لهذه الفترة
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-white p-20 rounded-[40px] border text-center text-gray-400 font-bold">
                  رجاء اختيار مطعم لعرض سجل الطلبات
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {/* Add New User Modal */}
      <AnimatePresence>
        {isNewUserModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setIsNewUserModalOpen(false)}
               className="absolute inset-0 bg-black/80 backdrop-blur-md"
             />
             <motion.div 
               initial={{ scale: 0.95, opacity: 0, y: 20 }} 
               animate={{ scale: 1, opacity: 1, y: 0 }} 
               exit={{ scale: 0.95, opacity: 0, y: 20 }}
               className="relative bg-white w-full max-w-lg rounded-3xl md:rounded-[36px] shadow-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto text-right"
             >
                <div className="flex items-center justify-between mb-6 border-b pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-gray-900 text-white rounded-2xl">
                      <UserPlus size={22} />
                    </div>
                    <div>
                      <h3 className="text-xl md:text-2xl font-black italic">إضافة حساب مستخدم جديد</h3>
                      <p className="text-xs text-gray-400">سيتم إنشاء حساب فوري في Auth و Profiles معاً</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsNewUserModalOpen(false)}
                    className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-900 transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                {createError && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl flex items-center gap-3">
                    <AlertCircle size={20} className="shrink-0" />
                    <span>{createError}</span>
                  </div>
                )}

                {createSuccess && (
                  <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-2xl flex items-center gap-3">
                    <CheckCircle2 size={20} className="shrink-0" />
                    <span>{createSuccess}</span>
                  </div>
                )}

                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div>
                    <label className="text-xs font-black uppercase text-gray-500 mb-1.5 block">
                      الاسم الكامل / اسم الموظف
                    </label>
                    <input 
                      type="text"
                      required
                      placeholder="مثال: أحمد محمود"
                      className="w-full bg-gray-50 border px-5 py-3.5 rounded-2xl outline-none focus:bg-white focus:border-gray-900 transition-all font-medium text-sm"
                      value={newUserFullName}
                      onChange={e => setNewUserFullName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-black uppercase text-gray-500 mb-1.5 block">
                      البريد الإلكتروني (Email)
                    </label>
                    <input 
                      type="email"
                      required
                      placeholder="ahmed@restaurant.com"
                      className="w-full bg-gray-50 border px-5 py-3.5 rounded-2xl outline-none focus:bg-white focus:border-gray-900 transition-all font-medium text-sm text-left"
                      dir="ltr"
                      value={newUserEmail}
                      onChange={e => setNewUserEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-black uppercase text-gray-500 mb-1.5 block">
                      كلمة المرور (Password)
                    </label>
                    <input 
                      type="password"
                      required
                      minLength={6}
                      placeholder="••••••••"
                      className="w-full bg-gray-50 border px-5 py-3.5 rounded-2xl outline-none focus:bg-white focus:border-gray-900 transition-all font-medium text-sm text-left font-mono"
                      dir="ltr"
                      value={newUserPassword}
                      onChange={e => setNewUserPassword(e.target.value)}
                    />
                    <span className="text-[11px] text-gray-400 mt-1 block">6 أحرف على الأقل</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="text-xs font-black uppercase text-gray-500 mb-1.5 block">
                        الدور / الصلاحية
                      </label>
                      <select 
                        className="w-full bg-gray-50 border px-4 py-3.5 rounded-2xl outline-none font-bold text-sm"
                        value={newUserRole}
                        onChange={e => setNewUserRole(e.target.value as any)}
                      >
                        <option value="waiter">طاقم نادل (Waiter)</option>
                        <option value="admin">مدير مطعم (Admin)</option>
                        <option value="super_admin">مدير نظام عام (Super Admin)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-black uppercase text-gray-500 mb-1.5 block">
                        ربط بمطعم
                      </label>
                      <select 
                        className="w-full bg-gray-50 border px-4 py-3.5 rounded-2xl outline-none text-sm font-medium"
                        value={newUserRestaurantId}
                        onChange={e => setNewUserRestaurantId(e.target.value)}
                      >
                        <option value="none">بدون مطعم (عام)</option>
                        {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-6">
                    <button 
                      type="button" 
                      onClick={() => setIsNewUserModalOpen(false)} 
                      className="flex-1 py-3.5 font-bold text-gray-500 hover:text-gray-900 transition-colors"
                    >
                      إلغاء
                    </button>
                    <button 
                      type="submit" 
                      disabled={isCreatingUser}
                      className="flex-2 bg-gray-900 text-white py-3.5 rounded-2xl font-bold hover:bg-black transition-all shadow-lg active:scale-95 disabled:opacity-50"
                    >
                      {isCreatingUser ? 'جاري الإنشاء...' : 'إنشاء الحساب الآن'}
                    </button>
                  </div>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete User Confirmation Modal */}
      <AnimatePresence>
        {deletingUser && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setDeletingUser(null)}
               className="absolute inset-0 bg-black/80 backdrop-blur-md"
             />
             <motion.div 
               initial={{ scale: 0.95, opacity: 0, y: 20 }} 
               animate={{ scale: 1, opacity: 1, y: 0 }} 
               exit={{ scale: 0.95, opacity: 0, y: 20 }}
               className="relative bg-white w-full max-w-md rounded-3xl md:rounded-[36px] shadow-2xl p-6 md:p-8 text-right"
             >
                <div className="w-14 h-14 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mb-5 mx-auto">
                  <Trash2 size={28} />
                </div>
                
                <h3 className="text-xl font-black text-gray-900 text-center mb-2">تأكيد حذف الحساب</h3>
                <p className="text-sm text-gray-500 text-center mb-6 leading-relaxed">
                  هل أنت متأكد من حذف حساب <span className="font-bold text-gray-900">"{deletingUser.full_name || deletingUser.email}"</span> نهائياً؟ سيتم حذف الحساب من قاعدة البيانات والـ Auth ولن يتمكن من الدخول مجدداً.
                </p>

                <div className="flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setDeletingUser(null)} 
                    disabled={isDeletingUser}
                    className="flex-1 py-3.5 border rounded-2xl font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    إلغاء
                  </button>
                  <button 
                    type="button" 
                    onClick={() => handleDeleteUser(deletingUser)}
                    disabled={isDeletingUser}
                    className="flex-1 bg-red-600 text-white py-3.5 rounded-2xl font-bold hover:bg-red-700 transition-all shadow-md disabled:opacity-50"
                  >
                    {isDeletingUser ? 'جاري الحذف...' : 'نعم، احذف الحساب'}
                  </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Profile & Password Modal */}
      <AnimatePresence>
        {isProfileModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setIsProfileModalOpen(false)}
               className="absolute inset-0 bg-black/80 backdrop-blur-md"
             />
             <motion.div 
               initial={{ scale: 0.95, opacity: 0 }} 
               animate={{ scale: 1, opacity: 1 }} 
               exit={{ scale: 0.95, opacity: 0 }}
               className="relative bg-white w-full max-w-lg rounded-3xl md:rounded-[36px] shadow-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto text-right"
             >
                <div className="flex items-center justify-between mb-6 border-b pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                      <Settings size={22} />
                    </div>
                    <div>
                      <h3 className="text-xl md:text-2xl font-black italic">تعديل بيانات الحساب والصلاحيات</h3>
                      <p className="text-xs text-gray-400">{editingProfile?.email}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsProfileModalOpen(false)}
                    className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-900 transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={handleProfileSave} className="space-y-4">
                  <div>
                    <label className="text-xs font-black uppercase text-gray-500 mb-1.5 block">الاسم</label>
                    <input 
                      className="w-full bg-gray-50 border px-5 py-3.5 rounded-2xl outline-none font-medium text-sm focus:bg-white focus:border-gray-900 transition-all"
                      value={editingProfile?.full_name || ''}
                      onChange={e => setEditingProfile({...editingProfile, full_name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black uppercase text-gray-500 mb-1.5 block">الدور في النظام (Role)</label>
                    <select 
                      className="w-full bg-gray-50 border px-5 py-3.5 rounded-2xl outline-none font-bold text-sm"
                      value={editingProfile?.role}
                      onChange={e => setEditingProfile({...editingProfile, role: e.target.value})}
                    >
                      <option value="waiter">طاقم نادل (Waiter)</option>
                      <option value="admin">مدير مطعم (Admin)</option>
                      <option value="super_admin">مدير نظام عام (Super Admin)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-black uppercase text-gray-500 mb-1.5 block">ربط بمطعم</label>
                    <select 
                      className="w-full bg-gray-50 border px-5 py-3.5 rounded-2xl outline-none font-medium text-sm"
                      value={editingProfile?.restaurant_id || 'none'}
                      onChange={e => setEditingProfile({...editingProfile, restaurant_id: e.target.value})}
                    >
                      <option value="none">بدون مطعم (عام)</option>
                      {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  
                  <button type="submit" className="w-full bg-gray-900 text-white py-3.5 rounded-2xl font-bold shadow-lg hover:bg-black transition-all">
                    حفظ التغييرات
                  </button>
                </form>

                {/* Direct Password Reset Section */}
                <div className="mt-8 pt-6 border-t">
                  <div className="flex items-center gap-2 mb-3">
                    <KeyRound size={18} className="text-amber-600" />
                    <h4 className="font-black text-sm text-gray-900">تغيير كلمة المرور لهذا المستخدم</h4>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">
                    بصفتك Super Admin، يمكنك تعيين كلمة مرور جديدة للمستخدم مباشرة دون الحاجة لإرسال بريد استعادة.
                  </p>
                  <div className="flex gap-2">
                    <input 
                      type="password"
                      placeholder="كلمة مرور جديدة (6 أحرف فأكثر)"
                      value={newDirectPassword}
                      onChange={e => setNewDirectPassword(e.target.value)}
                      className="flex-grow bg-gray-50 border px-4 py-3 rounded-2xl outline-none font-mono text-sm"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      disabled={isResettingPassword || !newDirectPassword}
                      onClick={() => handleResetUserPassword(editingProfile?.email, newDirectPassword)}
                      className="px-5 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-bold text-xs transition-all disabled:opacity-40"
                    >
                      {isResettingPassword ? 'جاري التغيير...' : 'تحديث كلمة المرور'}
                    </button>
                  </div>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Restaurant Modal */}
      <AnimatePresence>
        {isResModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setIsResModalOpen(false)}
               className="absolute inset-0 bg-black/80 backdrop-blur-md"
             />
             <motion.div 
               initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
               className="relative bg-white w-full max-w-xl rounded-3xl md:rounded-[40px] shadow-2xl p-6 md:p-10 max-h-[90vh] overflow-y-auto"
             >
                <h3 className="text-3xl font-black italic mb-8">بيانات المطعم</h3>
                <form onSubmit={handleResSave} className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                       <label className="text-xs font-black uppercase text-gray-400 mb-2 block">Name</label>
                       <input 
                         required className="w-full bg-gray-50 border px-6 py-4 rounded-2xl outline-none" placeholder="Lumiere Cafe"
                         value={editingRes?.name || ''}
                         onChange={e => setEditingRes({...editingRes, name: e.target.value})}
                       />
                    </div>
                    <div className="col-span-2">
                       <label className="text-xs font-black uppercase text-gray-400 mb-2 block">Slug (URL Path)</label>
                       <input 
                         required className="w-full bg-gray-50 border px-6 py-4 rounded-2xl outline-none font-mono text-sm" placeholder="lumiere-cafe"
                         value={editingRes?.slug || ''}
                         onChange={e => setEditingRes({...editingRes, slug: e.target.value.toLowerCase().replace(/ /g, '-')})}
                       />
                    </div>
                    <div className="col-span-2 space-y-2">
                       <label className="text-xs font-black uppercase text-gray-500 mb-1 flex items-center justify-between">
                         <span>شعار المطعم (Logo)</span>
                         <span className="text-[10px] text-gray-400 font-normal">رابط إنترنت أو رفع ملف</span>
                       </label>
                       
                       <div className="flex flex-col sm:flex-row gap-3 items-start">
                         <div className="w-20 h-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 p-1 flex items-center justify-center shrink-0 overflow-hidden relative group">
                           {editingRes?.logo_url ? (
                             <img 
                               src={editingRes.logo_url} 
                               alt="Preview" 
                               className="w-full h-full object-contain" 
                               referrerPolicy="no-referrer"
                               onError={(e) => {
                                 (e.currentTarget as HTMLElement).style.display = 'none';
                                 if (e.currentTarget.parentElement) {
                                   const errorMsg = document.createElement('span');
                                   errorMsg.className = 'text-[9px] text-red-500 font-bold text-center px-1';
                                   errorMsg.innerText = 'رابط غير صالح';
                                   e.currentTarget.parentElement.appendChild(errorMsg);
                                 }
                               }}
                             />
                           ) : (
                             <ImageLucide size={24} className="text-gray-300" />
                           )}
                           {logoFileLoading && (
                             <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                               <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                             </div>
                           )}
                         </div>

                         <div className="flex-1 space-y-2 w-full">
                           <input 
                             className="w-full bg-gray-50 border px-4 py-3 rounded-xl outline-none text-xs font-mono text-left" 
                             placeholder="https://example.com/logo.png أو data:image/..." 
                             dir="ltr"
                             value={editingRes?.logo_url || ''}
                             onChange={e => setEditingRes({...editingRes, logo_url: e.target.value.trim()})}
                           />
                           
                           <div className="flex items-center gap-2">
                             <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-all">
                               <Upload size={14} />
                               <span>رفع صورة من الجهاز</span>
                               <input 
                                 type="file" 
                                 accept="image/*" 
                                 className="hidden" 
                                 onChange={(e) => {
                                   const file = e.target.files?.[0];
                                   if (!file) return;
                                   setLogoFileLoading(true);
                                   const reader = new FileReader();
                                   reader.onload = (uploadEvent) => {
                                     const result = uploadEvent.target?.result as string;
                                     setEditingRes({ ...editingRes, logo_url: result });
                                     setLogoFileLoading(false);
                                   };
                                   reader.readAsDataURL(file);
                                 }}
                               />
                             </label>

                             {editingRes?.logo_url && (
                               <button
                                 type="button"
                                 onClick={() => setEditingRes({ ...editingRes, logo_url: '' })}
                                 className="px-2.5 py-1.5 text-red-500 hover:bg-red-50 rounded-lg text-xs font-bold transition-all"
                               >
                                 مسح الصورة
                               </button>
                             )}
                           </div>
                         </div>
                       </div>
                    </div>
                    <div className="col-span-1">
                       <label className="text-xs font-black uppercase text-gray-400 mb-2 block">Primary Color</label>
                       <div className="flex gap-3 items-center">
                         <input 
                            type="color" className="w-12 h-12 rounded-xl outline-none cursor-pointer border-none p-0"
                            value={editingRes?.primary_color || '#f97316'}
                            onChange={e => setEditingRes({...editingRes, primary_color: e.target.value})}
                          />
                         <span className="font-mono text-xs">{editingRes?.primary_color}</span>
                       </div>
                    </div>
                    <div className="col-span-1">
                       <label className="text-xs font-black uppercase text-gray-400 mb-2 block">Secondary Color</label>
                       <div className="flex gap-3 items-center">
                         <input 
                            type="color" className="w-12 h-12 rounded-xl outline-none cursor-pointer border-none p-0"
                            value={editingRes?.secondary_color || '#1f2937'}
                            onChange={e => setEditingRes({...editingRes, secondary_color: e.target.value})}
                          />
                         <span className="font-mono text-xs">{editingRes?.secondary_color}</span>
                       </div>
                    </div>

                    {/* Restaurant Payment System Model */}
                    <div className="col-span-2 bg-gradient-to-br from-emerald-50/80 to-teal-50/80 border-2 border-emerald-200/90 rounded-3xl p-5 md:p-6 space-y-4 text-right shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shrink-0">
                          <CreditCard size={20} />
                        </div>
                        <div>
                          <h4 className="font-black text-gray-900 text-sm md:text-base">نظام محاسبة ودفع الطلبات (Payment Mode)</h4>
                          <p className="text-xs text-gray-500 font-medium mt-0.5">
                            تحديد آلية دفع الحساب عند طلب الزبائن من طاولات المطعم
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        {/* Option 1: Postpaid / Non-prepaid */}
                        <div
                          onClick={() => setEditingRes({ ...editingRes, is_prepaid: false, payment_model: 'postpaid' })}
                          className={cn(
                            "p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between text-right relative select-none",
                            !editingRes?.is_prepaid && editingRes?.payment_model !== 'prepaid'
                              ? "bg-white border-emerald-500 shadow-md ring-2 ring-emerald-400/30"
                              : "bg-white/60 border-gray-200 hover:border-gray-300 hover:bg-white"
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-black text-sm text-gray-900">المطعم غير مسبق الدفع</span>
                            <div className={cn(
                              "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                              !editingRes?.is_prepaid && editingRes?.payment_model !== 'prepaid'
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-gray-300"
                            )}>
                              {(!editingRes?.is_prepaid && editingRes?.payment_model !== 'prepaid') && (
                                <div className="w-2 h-2 bg-white rounded-full" />
                              )}
                            </div>
                          </div>
                          <p className="text-[11px] text-gray-500 leading-relaxed font-medium">
                            (دفع لاحق كالمعتاد) — يستلم الزبون الأوردر أولاً ثم يدفع الحساب عند المغادرة دون مطالبته بالتوجه للكاشير.
                          </p>
                          <span className="text-[10px] text-gray-400 font-bold mt-2">الوضع الافتراضي (عادي)</span>
                        </div>

                        {/* Option 2: Prepaid */}
                        <div
                          onClick={() => setEditingRes({ ...editingRes, is_prepaid: true, payment_model: 'prepaid' })}
                          className={cn(
                            "p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between text-right relative select-none",
                            (editingRes?.is_prepaid || editingRes?.payment_model === 'prepaid')
                              ? "bg-white border-emerald-500 shadow-md ring-2 ring-emerald-400/30"
                              : "bg-white/60 border-gray-200 hover:border-gray-300 hover:bg-white"
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-black text-sm text-emerald-800">المطعم مسبق الدفع</span>
                            <div className={cn(
                              "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                              (editingRes?.is_prepaid || editingRes?.payment_model === 'prepaid')
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-gray-300"
                            )}>
                              {(editingRes?.is_prepaid || editingRes?.payment_model === 'prepaid') && (
                                <div className="w-2 h-2 bg-white rounded-full" />
                              )}
                            </div>
                          </div>
                          <p className="text-[11px] text-emerald-700 leading-relaxed font-medium">
                            تظهر للزبون شاشة تنبيه فورية بعد تأكيد الأوردر: <strong>"بالرجاء التوجه للكاشير ودفع مبلغ ($) للطلب الخاص بك رقم ($)"</strong> قبل التجهيز.
                          </p>
                          <span className="text-[10px] text-emerald-600 font-black mt-2">دفع فوري عند الكاشير 💳</span>
                        </div>
                      </div>
                    </div>

                    {/* Service Fee / VAT Setting Section */}
                    <div className="col-span-2 bg-gradient-to-br from-blue-50/80 to-indigo-50/80 border-2 border-indigo-200/90 rounded-3xl p-5 md:p-6 space-y-4 text-right shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shrink-0">
                            <Receipt size={20} />
                          </div>
                          <div>
                            <h4 className="font-black text-gray-900 text-sm md:text-base">نسبة الخدمة / القيمة المضافة (Service & VAT Fee)</h4>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">
                              تحديد النسبة المئوية للخدمة أو الضريبة المضافة التي تضاف تلقائياً في سلة العميل (مثال: 14%)
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 pt-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-black text-gray-700">النسب الشائعة المقترحة:</span>
                          <div className="flex items-center gap-1.5">
                            {[0, 10, 12, 14, 15].map(pct => (
                              <button
                                key={pct}
                                type="button"
                                onClick={() => setEditingRes({ ...editingRes, service_fee_percentage: pct })}
                                className={cn(
                                  "px-3 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer",
                                  Number(editingRes?.service_fee_percentage || 0) === pct
                                    ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                                )}
                              >
                                {pct === 0 ? 'بدون (0%)' : `${pct}%`}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-indigo-100 shadow-inner">
                          <div className="flex-1">
                            <label className="text-[11px] font-black uppercase text-gray-500 mb-1 block">
                              النسبة المئوية للخدمة / الضريبة المضافة (%):
                            </label>
                            <div className="relative flex items-center">
                              <input 
                                type="number" 
                                min="0"
                                max="100"
                                step="0.5"
                                placeholder="14"
                                className="w-full bg-gray-50 border border-indigo-200 px-4 py-2.5 rounded-xl outline-none font-black text-sm text-left pr-8"
                                dir="ltr"
                                value={editingRes?.service_fee_percentage ?? 0}
                                onChange={e => setEditingRes({ 
                                  ...editingRes, 
                                  service_fee_percentage: e.target.value === '' ? 0 : parseFloat(e.target.value) 
                                })}
                              />
                              <span className="absolute right-3 text-gray-400 font-black text-sm pointer-events-none">%</span>
                            </div>
                          </div>
                          
                          <div className="text-left bg-indigo-50 border border-indigo-200/60 px-4 py-2.5 rounded-xl">
                            <span className="text-[10px] text-gray-400 font-bold block">مثال لطلب بـ 100 جـ:</span>
                            <span className="text-xs font-black text-indigo-700">
                              + {(100 * (Number(editingRes?.service_fee_percentage || 0) / 100)).toFixed(1)} جـ خدمة
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Geofence Protection Zone Section */}
                    <div className="col-span-2 bg-gradient-to-br from-amber-50/80 to-orange-50/80 border-2 border-orange-200/90 rounded-3xl p-5 md:p-6 space-y-4 text-right shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-md shrink-0">
                            <MapPin size={20} />
                          </div>
                          <div>
                            <h4 className="font-black text-gray-900 text-sm md:text-base">نطاق الحماية الجغرافي للطاولات (Geofence Zone)</h4>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">
                              تعطيل كود QR للطاولات خارج حدود المطعم لمنع الطلبات عن بُعد
                            </p>
                          </div>
                        </div>
                        
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={editingRes?.geofence_enabled || false}
                            onChange={e => setEditingRes({ ...editingRes, geofence_enabled: e.target.checked })}
                          />
                          <div className="w-12 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-orange-600"></div>
                        </label>
                      </div>

                      {editingRes?.geofence_enabled && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="space-y-4 pt-3 border-t border-orange-200/60"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-black text-gray-700">تحديد موقع المطعم الجغرافي:</span>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  setIsLocating(true);
                                  const pos = await getCurrentPosition();
                                  setEditingRes({
                                    ...editingRes,
                                    latitude: Number(pos.latitude.toFixed(6)),
                                    longitude: Number(pos.longitude.toFixed(6)),
                                    geofence_radius_meters: editingRes?.geofence_radius_meters || 100
                                  });
                                } catch (err: any) {
                                  alert(err.message || 'تعذر تحديد الموقع الجغرافي عبر المتصفح');
                                } finally {
                                  setIsLocating(false);
                                }
                              }}
                              disabled={isLocating}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black shadow-sm transition-all cursor-pointer disabled:opacity-50"
                            >
                              {isLocating ? (
                                <>
                                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  <span>جاري التحديد بالـ GPS...</span>
                                </>
                              ) : (
                                <>
                                  <Navigation size={14} />
                                  <span>📍 التقاط موقعي الحالي تلقائياً</span>
                                </>
                              )}
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[11px] font-black uppercase text-gray-600 mb-1 block">خط العرض (Latitude)</label>
                              <input 
                                type="number" 
                                step="0.000001"
                                className="w-full bg-white border border-orange-200 px-4 py-3 rounded-xl outline-none font-mono text-xs text-left" 
                                placeholder="مثال: 30.044420"
                                dir="ltr"
                                value={editingRes?.latitude ?? ''}
                                onChange={e => setEditingRes({ ...editingRes, latitude: e.target.value ? parseFloat(e.target.value) : null })}
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-black uppercase text-gray-600 mb-1 block">خط الطول (Longitude)</label>
                              <input 
                                type="number" 
                                step="0.000001"
                                className="w-full bg-white border border-orange-200 px-4 py-3 rounded-xl outline-none font-mono text-xs text-left" 
                                placeholder="مثال: 31.235712"
                                dir="ltr"
                                value={editingRes?.longitude ?? ''}
                                onChange={e => setEditingRes({ ...editingRes, longitude: e.target.value ? parseFloat(e.target.value) : null })}
                              />
                            </div>
                          </div>

                          {/* Radius selector */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="text-[11px] font-black uppercase text-gray-600">
                                نصف قطر النطاق المسموح للطلب (بالمتر):
                              </label>
                              <span className="font-mono text-xs font-black text-orange-700 bg-orange-100/70 px-2 py-0.5 rounded-md">
                                {editingRes?.geofence_radius_meters || 100} متر
                              </span>
                            </div>
                            <div className="grid grid-cols-4 gap-2 mb-2">
                              {[50, 100, 200, 500].map(rad => (
                                <button
                                  key={rad}
                                  type="button"
                                  onClick={() => setEditingRes({ ...editingRes, geofence_radius_meters: rad })}
                                  className={cn(
                                    "py-2 px-2 rounded-xl text-xs font-black border transition-all cursor-pointer",
                                    (editingRes?.geofence_radius_meters || 100) === rad
                                      ? "bg-orange-600 text-white border-orange-600 shadow-sm"
                                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                                  )}
                                >
                                  {rad} متر
                                </button>
                              ))}
                            </div>
                            
                            <input 
                              type="range" 
                              min="20" 
                              max="1000" 
                              step="10"
                              value={editingRes?.geofence_radius_meters || 100}
                              onChange={e => setEditingRes({ ...editingRes, geofence_radius_meters: parseInt(e.target.value) })}
                              className="w-full accent-orange-600 cursor-pointer"
                            />
                          </div>

                          {editingRes?.latitude && editingRes?.longitude && (
                            <div className="bg-white/95 p-3 rounded-2xl border border-orange-200 text-xs font-bold text-gray-700 flex flex-wrap items-center justify-between gap-2">
                              <span className="text-emerald-700 flex items-center gap-1.5">
                                <CheckCircle2 size={16} />
                                <span>تم تحديد الإحداثيات ونطاق الحماية بنجاح ({editingRes.geofence_radius_meters || 100}م)</span>
                              </span>
                              <a 
                                href={`https://www.google.com/maps?q=${editingRes.latitude},${editingRes.longitude}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-orange-600 hover:underline flex items-center gap-1 text-[11px]"
                              >
                                <span>عرض الموقع على الخريطة</span>
                                <ExternalLink size={12} />
                              </a>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-4 pt-4">
                    <button type="button" onClick={() => setIsResModalOpen(false)} className="flex-grow py-4 font-bold text-gray-400">إلغاء</button>
                    <button type="submit" className="flex-grow bg-gray-900 text-white rounded-2xl font-bold shadow-xl">إتمام التسجيل</button>
                  </div>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
