import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import './lib/i18n';

// Pages (to be implemented)
import CustomerApp from './pages/CustomerApp';
import WaiterDashboard from './pages/WaiterDashboard';
import AdminDashboard from './pages/Admin/AdminDashboard';
import SuperAdminDashboard from './pages/SuperAdmin/SuperAdminDashboard';
import Login from './pages/Login';
import Register from './pages/Register';

function isSubdomainHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host.includes('qrieta.com') && !host.startsWith('www.') && host !== 'qrieta.com';
}

function RootRedirect() {
  const { user, profile, loading } = useAuth();

  // If visiting via a restaurant subdomain (e.g. burger.qrieta.com), show CustomerApp
  if (isSubdomainHost()) {
    return <CustomerApp />;
  }

  if (loading) return <div className="h-screen flex items-center justify-center font-sans">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.role === 'super_admin') return <Navigate to="/super-admin" replace />;
  if (profile?.role === 'admin') return <Navigate to="/admin" replace />;
  return <Navigate to="/waiter" replace />;
}

function PrivateRoute({ children, roles }: { children: React.ReactNode, roles?: string[] }) {
  const { user, profile, loading } = useAuth();

  if (loading) return <div className="h-screen flex items-center justify-center font-sans">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && profile && !roles.includes(profile.role)) {
    if (profile.role === 'super_admin') return <Navigate to="/super-admin" replace />;
    if (profile.role === 'admin') return <Navigate to="/admin" replace />;
    return <Navigate to="/waiter" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Customer Application (Public/QR) */}
          <Route path="/r/:restaurantSlug/t/:tableId" element={<CustomerApp />} />
          <Route path="/r/:restaurantSlug" element={<CustomerApp />} />
          <Route path="/t/:tableId" element={<CustomerApp />} />

          {/* Auth */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Waiter Dashboard */}
          <Route path="/waiter" element={
            <PrivateRoute roles={['waiter', 'admin']}>
              <WaiterDashboard />
            </PrivateRoute>
          } />

          {/* Admin Dashboard */}
          <Route path="/admin" element={
            <PrivateRoute roles={['admin']}>
              <AdminDashboard />
            </PrivateRoute>
          } />

          {/* Super Admin Dashboard */}
          <Route path="/super-admin" element={
            <PrivateRoute roles={['super_admin']}>
              <SuperAdminDashboard />
            </PrivateRoute>
          } />

          {/* Root Redirect */}
          <Route path="/" element={<RootRedirect />} />

          {/* Default Redirect */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
