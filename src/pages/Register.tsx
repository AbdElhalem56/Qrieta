import React, { useState, useEffect } from 'react';
import { supabase, Restaurant } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { UtensilsCrossed, UserPlus, AlertCircle, Building2, User } from 'lucide-react';
import { motion } from 'motion/react';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [restaurantId, setRestaurantId] = useState('');
  const [role, setRole] = useState<'admin' | 'waiter'>('admin');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchRestaurants();
    const params = new URLSearchParams(window.location.search);
    const resId = params.get('restaurant_id');
    if (resId) setRestaurantId(resId);
  }, []);

  const fetchRestaurants = async () => {
    const { data } = await supabase.from('restaurants').select('*').eq('is_active', true);
    if (data) setRestaurants(data);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId) {
      setError('يرجى اختيار المطعم');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const selectedRes = restaurants.find(r => r.id === restaurantId);
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            restaurant_id: restaurantId,
            restaurant_name: selectedRes?.name || '',
            role: role
          }
        }
      });

      if (signUpError) throw signUpError;
      
      alert('تم التسجيل بنجاح! يمكنك الآن تسجيل الدخول.');
      navigate('/login');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100"
      >
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mb-4">
            <UserPlus className="w-8 h-8 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 font-sans tracking-tight">إنشاء حساب نادل</h1>
          <p className="text-gray-500 text-sm mt-1">سجل حسابك للانضمام إلى فريق العمل</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4 text-right">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الكامل</label>
            <input
              type="text" required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 outline-none text-right"
              placeholder="مثال: أحمد محمد"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">المطعم</label>
            <div className="relative">
              <select
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 outline-none appearance-none bg-white text-right"
                value={restaurantId}
                onChange={(e) => setRestaurantId(e.target.value)}
              >
                <option value="">اختر مطعمك...</option>
                {restaurants.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <Building2 size={18} />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الدور الوظيفي (الصلاحيات)</label>
            <div className="relative">
              <select
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 outline-none appearance-none bg-white text-right"
                value={role}
                onChange={(e) => setRole(e.target.value as 'admin' | 'waiter')}
              >
                <option value="admin">مدير مطعم (Admin)</option>
                <option value="waiter">نادل (Waiter)</option>
              </select>
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <User size={18} />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
            <input
              type="email" required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 outline-none"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور</label>
            <input
              type="password" required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 outline-none"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-600 text-white py-3 rounded-xl font-semibold hover:bg-orange-700 transition-colors disabled:opacity-50 mt-6 shadow-lg shadow-orange-100"
          >
            {loading ? 'جاري التسجيل...' : 'إنشاء الحساب'}
          </button>
          
          <p className="text-center text-sm text-gray-500 mt-4">
            لديك حساب بالفعل؟ <button type="button" onClick={() => navigate('/login')} className="text-orange-600 font-bold hover:underline">سجل دخولك</button>
          </p>
        </form>
      </motion.div>
    </div>
  );
}
