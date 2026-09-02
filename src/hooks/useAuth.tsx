import React, { useEffect, useState, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

type AuthContextType = {
  user: User | null;
  profile: any | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // Get initial session
    supabase.auth.getSession()
      .then((res) => {
        if (!isMounted) return;
        const session = res?.data?.session;
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Initial session check error:', err);
        if (isMounted) {
          setUser(null);
          setLoading(false);
        }
      });

    // Listen for auth changes
    let unsubscribeFn = () => {};
    try {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!isMounted) return;
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      });
      if (data?.subscription) {
        unsubscribeFn = () => data.subscription.unsubscribe();
      }
    } catch (e) {
      console.warn('onAuthStateChange subscription error:', e);
      if (isMounted) setLoading(false);
    }

    return () => {
      isMounted = false;
      unsubscribeFn();
    };
  }, []);

  async function fetchProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, restaurants(*)')
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        setProfile(data);
        setLoading(false);
        return;
      }

      if (error) {
        console.warn('Initial profile fetch with relation failed, trying simple select:', error);
      }

      // Fallback: simple select without relation
      const { data: simpleData, error: simpleError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (simpleData) {
        setProfile(simpleData);
        setLoading(false);
        return;
      }

      if (simpleError) {
        console.warn('Simple profile fetch error:', simpleError);
      }

      // Auto-heal: Profile does not exist yet for this auth user, create it on the fly
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.id === userId) {
        console.log('Self-healing: Creating missing profile for user:', user.email);
        const isOwner = user.email === 'mohamed.pes.elsayed@gmail.com';
        const newProfile = {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
          role: isOwner ? 'super_admin' : (user.user_metadata?.role || 'waiter'),
          restaurant_id: user.user_metadata?.restaurant_id || null,
          restaurant_name: user.user_metadata?.restaurant_name || null,
        };

        const { data: createdData, error: insertError } = await supabase
          .from('profiles')
          .upsert([newProfile])
          .select('*')
          .maybeSingle();

        if (createdData) {
          setProfile(createdData);
        } else if (insertError) {
          console.error('Self-healing profile insert error:', insertError);
          // Temporary local fallback so user is never blocked
          setProfile(newProfile);
        }
      }
    } catch (e) {
      console.error('Unexpected error in fetchProfile:', e);
    } finally {
      setLoading(false);
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
