import React, { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useFavicon } from "@/hooks/useFavicon";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Admin = lazy(() => import("./pages/Admin"));
const Profile = lazy(() => import("./pages/Profile"));
const Planos = lazy(() => import("./pages/Planos"));
const NotFound = lazy(() => import("./pages/NotFound"));
const LojaPublica = lazy(() => import("./pages/LojaPublica"));
const PublicDraw = lazy(() => import("./pages/PublicDraw"));

const queryClient = new QueryClient();

const RouteFallback = () => <div className="p-4 text-sm text-muted-foreground">Carregando...</div>;

const AppRoutes = () => {
  useFavicon();
  return (
    <AuthProvider>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/sorteador" element={<PublicDraw />} />
          <Route path="/loja/:userId" element={<LojaPublica />} />
          <Route path="/loja/:sorteioSlug/:shortId" element={<LojaPublica />} />
          <Route
            path="/planos"
            element={
              <ProtectedRoute skipPlanCheck>
                <Planos />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Index />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute skipPlanCheck>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
