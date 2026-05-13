import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  skipPlanCheck?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireAdmin = false, skipPlanCheck = false }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (requireAdmin && user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  // Non-admin users without a plan or lifetime access must subscribe
  if (!skipPlanCheck && user?.role !== 'admin') {
    const hasLifetime = !!user?.gratuidade_vitalicia;
    const hasPlan = !!user?.plano_id;
    const planExpired = !!user?.plano_vencimento && new Date(user.plano_vencimento).getTime() < Date.now();
    if (!hasLifetime && (!hasPlan || planExpired)) {
      return <Navigate to="/planos" replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
