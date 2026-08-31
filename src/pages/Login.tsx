import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UtensilsCrossed, LogIn, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

import { useAuth } from '../hooks/useAuth';
import qretaLogo from '../assets/images/qreta_logo_1787613852268.jpg';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const [isFixingRole, setIsFixingRole] = useState(false);

  const [view, setView] = useState<'login' | 'forgot' | 'reset'>('login');
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [useDirectReset, setUseDirectReset] = useState(false);
  const [directPassword, setDirectPassword] = useState('');

  React.useEffect(() => {
    // Listen for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed in Login page:', event, session);
      if (event === 'PASSWORD_RECOVERY') {
        setView('reset');
      }
    });

    // Check URL parameters or hash
    const hash = window.location.hash || '';
    if (hash.includes('type=recovery') || hash.includes('access_token=')) {
      setView('reset');
    }
    const search = window.location.search || '';
    if (search.includes('type=recovery')) {
      setView('reset');
    }

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResetSuccess(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/login?type=recovery`,
      });
      if (error) throw error;
      setResetSuccess('تم إرسال بريد إعادة تعيين كلمة المرور بنجاح. يرجى مراجعة صندوق الوارد الخاص بك.');
    } catch (err: any) {
      console.error('Reset error:', err);
      setError(err.message || 'حدث خطأ أثناء إرسال البريد');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResetSuccess(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setResetSuccess('تم تحديث كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.');
      setTimeout(() => {
        setView('login');
        setResetSuccess(null);
        setNewPassword('');
      }, 3000);
    } catch (err: any) {
      console.error('Update password error:', err);
      setError(err.message || 'حدث خطأ أثناء تحديث كلمة المرور');
    } finally {
      setLoading(false);
    }
  };

  const handleDirectReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail || !directPassword) {
      setError('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    setLoading(true);
    setError(null);
    setResetSuccess(null);
    try {
      console.log('Calling dev_reset_password RPC for:', resetEmail);
      const { data, error } = await supabase.rpc('dev_reset_password', {
        target_email: resetEmail,
        new_password: directPassword
      });
      
      if (error) throw error;
      
      if (data && data.startsWith('Error:')) {
        setError(data.replace('Error:', '').trim());
      } else {
        setResetSuccess('تم تحديث كلمة المرور بنجاح وبشكل مباشر! يمكنك الآن تسجيل الدخول.');
        setDirectPassword('');
        setTimeout(() => {
          setView('login');
          setUseDirectReset(false);
          setResetSuccess(null);
        }, 3000);
      }
    } catch (err: any) {
      console.error('Direct reset error:', err);
      setError(err.message || 'حدث خطأ أثناء إعادة التعيين المباشر');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    console.log('Login useEffect:', { user: user?.email, profile: profile?.role, authLoading });
    if (!authLoading && user && profile && view === 'login') {
      // Allow super owner to stay and fix role
      if (user.email === 'mohamed.pes.elsayed@gmail.com' && profile.role !== 'super_admin') {
        return;
      }
      
      if (profile.role === 'super_admin') navigate('/super-admin');
      else if (profile.role === 'admin') navigate('/admin');
      else navigate('/waiter');
    }
  }, [user, profile, authLoading, navigate, view]);

  const handleFixRole = async () => {
    setIsFixingRole(true);
    try {
      console.log('Attempting to fix role for:', user?.email);
      const { data, error } = await supabase.rpc('fix_super_admin_role');
      if (error) throw error;
      alert(`النتيجة: ${data}`);
      window.location.reload();
    } catch (err: any) {
      console.error('Fix role error:', err);
      alert(`خطأ: ${err.message}`);
    } finally {
      setIsFixingRole(false);
    }
  };

  const isConfigMissing = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('handleLogin called');
    if (isConfigMissing) {
      setError('Supabase configuration is missing.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) {
        console.error('Login error:', loginError);
        const msg = loginError.message.toLowerCase();
        if (msg.includes('email not confirmed')) {
          setError('لم يتم تأكيد البريد الإلكتروني بعد. يرجى مراجعة البريد أو إيقاف تفعيل خيار "Confirm Email" في إعدادات Supabase Authentication.');
        } else if (msg.includes('invalid login credentials')) {
          setError('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
        } else if (msg.includes('database error querying schema') || msg.includes('database error')) {
          setError('خطأ في قاعدة بيانات التوثيق (Database error querying schema). يرجى تشغيل كود الإصلاح في Supabase SQL Editor أو إعادة إضافة النادل من لوحة تحكم المدير.');
        } else {
          setError(loginError.message);
        }
        setLoading(false);
        return;
      }

      console.log('Login success, fetching profile...');
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      if (profileError) {
        console.error('Profile fetch error:', profileError);
        // Even without profile, we can try to navigate based on email for the owner
        if (data.user.email === 'mohamed.pes.elsayed@gmail.com') {
           return; // Use the UI to fix it
        }
      }

      console.log('Navigation role:', profileData?.role);
      if (profileData?.role === 'super_admin') {
        navigate('/super-admin');
      } else if (profileData?.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/waiter');
      }
    } catch (err: any) {
      console.error('Unexpected login error:', err);
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
        <div className="flex flex-col items-center mb-8">
          <div className="w-28 h-28 mb-3 flex items-center justify-center p-1 rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
            <img 
              src={qretaLogo} 
              alt="Qreta Logo" 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <h1 className="text-2xl font-black text-gray-900 font-sans tracking-tight">Qreta Staff</h1>
          <p className="text-gray-500 text-xs font-medium mt-1">SaaS for Restaurants & Cafes</p>
        </div>

        {authLoading ? (
          <div className="text-center py-8">
             <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-4"></div>
             <p className="text-gray-500 text-sm">جاري التحقق من الجلسة...</p>
          </div>
        ) : (
          <form onSubmit={view === 'login' ? handleLogin : (view === 'forgot' ? (useDirectReset ? handleDirectReset : handleForgotPassword) : handleUpdatePassword)} className="space-y-4">
            {!user && view === 'login' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all"
                    placeholder="name@restaurant.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 text-right">كلمة المرور / Password</label>
                  <input
                    type="password"
                    required
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </>
            )}

            {!user && view === 'forgot' && (
              <div className="space-y-4">
                <div className="text-right">
                  <h2 className="text-lg font-bold text-gray-900 mb-1">
                    {useDirectReset ? 'إعادة التعيين المباشر للمطورين' : 'استعادة كلمة المرور'}
                  </h2>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {useDirectReset 
                      ? 'أدخل بريدك الإلكتروني وكلمة المرور الجديدة لتعديلها فوراً بقاعدة البيانات دون الحاجة لرسائل البريد' 
                      : 'أدخل بريدك الإلكتروني لإرسال رابط إعادة التعيين'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 text-right">البريد الإلكتروني</label>
                  <input
                    type="email"
                    required
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all text-right"
                    placeholder="your-email@example.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                  />
                </div>

                {useDirectReset && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 text-right">كلمة المرور الجديدة</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all text-right"
                      placeholder="••••••••"
                      value={directPassword}
                      onChange={(e) => setDirectPassword(e.target.value)}
                    />
                  </div>
                )}

                <div className="pt-2 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setUseDirectReset(!useDirectReset);
                      setError(null);
                      setResetSuccess(null);
                    }}
                    className="text-xs text-orange-600 hover:underline font-bold"
                  >
                    {useDirectReset 
                      ? '← العودة لاستخدام بريد إعادة التعيين العادي' 
                      : '⚠️ رابط بريد إعادة التعيين معطل أو يوجه لـ localhost؟ اضغط هنا للتعيين المباشر فوراً'}
                  </button>
                </div>
              </div>
            )}

            {!user && view === 'reset' && (
              <div className="space-y-4">
                <div className="text-right">
                  <h2 className="text-lg font-bold text-gray-900 mb-1">تعيين كلمة مرور جديدة</h2>
                  <p className="text-xs text-gray-500 font-sans">أدخل كلمة المرور الجديدة لحسابك</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 text-right">كلمة المرور الجديدة</label>
                  <input
                    type="password"
                    required
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all text-right"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm text-right justify-end">
                <span>{error}</span>
                <AlertCircle size={16} />
              </div>
            )}

            {resetSuccess && (
              <div className="p-3 rounded-lg text-sm text-green-700 bg-green-50 border border-green-100 text-right">
                {resetSuccess}
              </div>
            )}

            {user && (!profile || profile.role !== 'super_admin') && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl space-y-3">
                <p className="text-xs text-orange-800 font-medium text-center leading-relaxed">
                  أنت مسجل دخولك ببريد: <span className="font-bold">{user.email}</span>
                  <br />
                  الحالة الحالية: <span className="font-bold">{profile?.role || 'بدون ملف شخصي'}</span>
                </p>
                
                {user.email === 'mohamed.pes.elsayed@gmail.com' ? (
                   <button
                    type="button"
                    onClick={handleFixRole}
                    disabled={isFixingRole}
                    className="w-full bg-orange-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-orange-700 transition-colors disabled:opacity-50"
                  >
                    {isFixingRole ? 'جاري التفعيل...' : 'تفعيل صلاحيات مدير النظام'}
                  </button>
                ) : (
                  <p className="text-[10px] text-orange-600 text-center">يرجى تسجيل الدخول بحساب له صلاحيات كافية</p>
                )}

                <button
                  type="button"
                  onClick={() => signOut()}
                  className="w-full text-gray-500 py-1 text-[10px] hover:underline"
                >
                  تسجيل الخروج
                </button>
              </div>
            )}

            {!user && (
              <div className="flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {loading ? 'جاري المعالجة...' : (
                    view === 'login' ? (
                      <>
                        <LogIn size={20} />
                        <span>{t('login')}</span>
                      </>
                    ) : view === 'forgot' ? (
                      <span>{useDirectReset ? 'تحديث كلمة المرور مباشرة' : 'إرسال بريد إعادة التعيين'}</span>
                    ) : (
                      <span>حفظ كلمة المرور وتحديثها</span>
                    )
                  )}
                </button>

                {view !== 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setView('login');
                      setError(null);
                      setResetSuccess(null);
                    }}
                    className="w-full bg-white text-gray-700 border border-gray-200 py-2 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
                  >
                    العودة لتسجيل الدخول
                  </button>
                )}


              </div>
            )}
          </form>
        )}
      </motion.div>
      <p className="mt-8 text-gray-400 text-xs">© 2026 Qreta SaaS</p>
    </div>
  );
}
