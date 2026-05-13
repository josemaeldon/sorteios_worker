import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { User, AuthState, LoginCredentials, CreateUserData, Plan } from '@/types/auth';
import { callApi, getStoredToken, setStoredToken, clearStoredToken, isSelfhostedMode } from '@/lib/apiClient';
import { OFFLINE_EVENT_NAMES, getOfflineAppState, isOfflineModeEnabled, patchOfflineAppState } from '@/lib/offlineMode';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { useNavigate } from 'react-router-dom';

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  registerUser: (data: { nome: string; email: string; senha: string }) => Promise<{ success: boolean; error?: string }>;
  createUser: (data: CreateUserData) => Promise<{ success: boolean; error?: string }>;
  updateUser: (id: string, data: Partial<CreateUserData>) => Promise<{ success: boolean; error?: string }>;
  deleteUser: (id: string) => Promise<{ success: boolean; error?: string }>;
  approveUser: (id: string) => Promise<{ success: boolean; error?: string }>;
  rejectUser: (id: string) => Promise<{ success: boolean; error?: string }>;
  getAllUsers: () => Promise<User[]>;
  checkFirstAccess: () => Promise<boolean>;
  setupAdmin: (email: string, senha: string, nome: string, titulo_sistema: string) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (data: { nome: string; email: string; titulo_sistema: string; avatar_url?: string; senha_atual?: string; nova_senha?: string }) => Promise<{ success: boolean; error?: string }>;
  getAuthToken: () => string | null;
  getAllSorteiosAdmin: () => Promise<Sorteio[]>;
  getSorteioUsers: (sorteioId: string) => Promise<{ data: User[]; owner_id: string }>;
  assignSorteioToUser: (sorteioId: string, userId: string) => Promise<{ success: boolean; error?: string }>;
  removeUserFromSorteio: (sorteioId: string, userId: string) => Promise<{ success: boolean; error?: string }>;
  changeSorteioOwner: (sorteioId: string, newOwnerId: string) => Promise<{ success: boolean; error?: string }>;
  getPublicPlanos: () => Promise<Plan[]>;
  getPlanos: () => Promise<Plan[]>;
  createPlano: (data: { nome: string; valor: number; descricao?: string; stripe_price_id?: string; tipo_plano?: 'teste_gratis' | 'mensal' | 'anual'; ciclo_dias_renovacao?: number }) => Promise<{ success: boolean; error?: string }>;
  updatePlano: (id: string, data: { nome: string; valor: number; descricao?: string; stripe_price_id?: string; tipo_plano?: 'teste_gratis' | 'mensal' | 'anual'; ciclo_dias_renovacao?: number }) => Promise<{ success: boolean; error?: string }>;
  deletePlano: (id: string) => Promise<{ success: boolean; error?: string }>;
  assignUserPlan: (userId: string, planoId: string | null, extensionDays?: number) => Promise<{ success: boolean; error?: string }>;
  grantLifetimeAccess: (userId: string, grant: boolean) => Promise<{ success: boolean; error?: string }>;
  getConfiguracoes: () => Promise<Record<string, string>>;
  updateConfiguracoes: (config: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
  getUserConfiguracoes: () => Promise<Record<string, string>>;
  updateUserConfiguracoes: (config: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
  getUserConfiguracoesByUserId: (userId: string) => Promise<Record<string, string>>;
  updateUserConfiguracoesByUserId: (userId: string, config: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
  getLojaCompradores: () => Promise<Record<string, string | number>[]>;
  getCartelasComprador: (email: string) => Promise<Record<string, unknown>[]>;
  createLojaComprador: (data: { nome: string; email: string; cpf?: string; telefone?: string; cidade?: string; endereco?: string }) => Promise<{ success: boolean; error?: string }>;
  updateLojaComprador: (data: { nome: string; email: string; cpf?: string; telefone?: string; cidade?: string; endereco?: string }) => Promise<{ success: boolean; error?: string }>;
  deleteLojaComprador: (email: string) => Promise<{ success: boolean; error?: string }>;
  createStripeCheckout: (planoId: string, successPath?: string, cancelPath?: string) => Promise<{ url?: string; error?: string }>;
  createStripeConnectOnboardingLink: () => Promise<{ url?: string; error?: string }>;
  refreshUser: () => Promise<void>;
  confirmStripeCheckout: (sessionId: string) => Promise<{ success: boolean; pending?: boolean; message?: string; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_KEY = 'bingo_auth_user';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  if (typeof error === 'string') return error;
  return '';
};

const updateOfflineAuthSnapshot = (patch: Record<string, unknown>): void => {
  const current = (getOfflineAppState().auth || {}) as Record<string, unknown>;
  patchOfflineAppState({
    auth: {
      ...current,
      ...patch,
    },
  });
};

const updateOfflineAuthArray = <T,>(key: string, value: T[]): void => {
  updateOfflineAuthSnapshot({ [key]: value });
};

const updateOfflineAuthMap = (key: string, value: Record<string, unknown>): void => {
  const current = (getOfflineAppState().auth || {}) as Record<string, unknown>;
  const prevMap = (current[key] || {}) as Record<string, unknown>;
  updateOfflineAuthSnapshot({ [key]: { ...prevMap, ...value } });
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const shownExpirationWarningRef = useRef<string | null>(null);

  const getAuthToken = useCallback(() => token, [token]);

  // Check stored auth on mount
  useEffect(() => {
    const initAuth = async () => {
      const stored = localStorage.getItem(AUTH_KEY);
      const storedToken = getStoredToken();
      if (stored && storedToken) {
        try {
          const parsed = JSON.parse(stored);
          setUser(parsed);
          setToken(storedToken);
          const result = await callApi('getMyProfile');
          if (result.user) {
            setUser(result.user);
            localStorage.setItem(AUTH_KEY, JSON.stringify(result.user));
          }
        } catch (e) {
          if (!isOfflineModeEnabled()) {
            localStorage.removeItem(AUTH_KEY);
            clearStoredToken();
          }
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  useEffect(() => {
    if (!user?.id || !user.plano_vencimento || user.gratuidade_vitalicia) return;
    const venc = new Date(user.plano_vencimento);
    if (Number.isNaN(venc.getTime())) return;
    const diffMs = venc.getTime() - Date.now();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0 || diffDays > 7) return;
    const key = `${user.id}:${user.plano_vencimento}`;
    if (shownExpirationWarningRef.current === key) return;
    shownExpirationWarningRef.current = key;
    toast({
      title: 'Plano próximo do vencimento',
      description: `Seu plano vence em ${diffDays} dia(s). Renove para evitar interrupção.`,
      variant: 'destructive',
      action: (
        <ToastAction altText="Renovar assinatura" onClick={() => { navigate('/profile?tab=assinatura'); }}>
          Renovar agora
        </ToastAction>
      ),
    });
  }, [user, toast]);

  const checkFirstAccess = useCallback(async (): Promise<boolean> => {
    try {
      const result = await callApi('checkFirstAccess');
      return result.isFirstAccess === true;
    } catch (error: unknown) {
      console.error('Error checking first access:', error);
      const message = getErrorMessage(error);
      if (message.includes('Banco de dados não configurado')) {
        window.location.href = '/setup';
        return true;
      }
      return false;
    }
  }, []);

  const setupAdmin = useCallback(async (email: string, senha: string, nome: string, titulo_sistema: string) => {
    try {
      const result = await callApi('setupAdmin', { email, senha, nome, titulo_sistema });
      
      if (result.user) {
        setUser(result.user);
        localStorage.setItem(AUTH_KEY, JSON.stringify(result.user));
        updateOfflineAuthSnapshot({ user: result.user });
        toast({
          title: "Administrador criado",
          description: "Você está logado como administrador.",
        });
        return { success: true };
      }
      
      return { success: false, error: result.error || 'Erro ao criar administrador' };
    } catch (error: unknown) {
      console.error('Setup admin error:', error);
      return { success: false, error: getErrorMessage(error) || 'Erro ao criar administrador' };
    }
  }, [toast]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    try {
      setIsLoading(true);
      const result = await callApi('login', credentials);
      
      if (result.user && result.token) {
        setUser(result.user);
        setToken(result.token);
        localStorage.setItem(AUTH_KEY, JSON.stringify(result.user));
        setStoredToken(result.token);
        updateOfflineAuthSnapshot({ user: result.user });
        toast({
          title: "Login realizado",
          description: `Bem-vindo, ${result.user.nome}!`,
        });
        return { success: true };
      }
      
      return { success: false, error: result.error || 'Credenciais inválidas' };
    } catch (error: unknown) {
      console.error('Login error:', error);
      return { success: false, error: getErrorMessage(error) || 'Erro ao fazer login' };
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(AUTH_KEY);
    clearStoredToken();
    toast({
      title: "Logout realizado",
      description: "Você foi desconectado.",
    });
  }, [toast]);

  const registerUser = useCallback(async (data: { nome: string; email: string; senha: string }) => {
    try {
      const result = await callApi('publicRegister', data);
      if (result.success && result.user && result.token) {
        setUser(result.user);
        setToken(result.token);
        localStorage.setItem(AUTH_KEY, JSON.stringify(result.user));
        setStoredToken(result.token);
        updateOfflineAuthSnapshot({ user: result.user });
        toast({
          title: "Cadastro realizado",
          description: "Escolha seu plano para continuar.",
        });
        return { success: true };
      }
      return { success: false, error: result.error || 'Erro ao realizar cadastro' };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) || 'Erro ao realizar cadastro' };
    }
  }, [toast]);

  const approveUser = useCallback(async (id: string) => {
    if (user?.role !== 'admin') return { success: false, error: 'Apenas administradores' };
    try {
      const result = await callApi('approveUser', { id });
      if (result.success) {
        const currentUsers = (((getOfflineAppState().auth || {}) as Record<string, unknown>).users as User[]) || [];
        updateOfflineAuthArray('users', currentUsers.map((current) => current.id === id ? { ...current, ativo: true } : current));
        toast({ title: 'Cadastro aprovado', description: 'O usuário foi aprovado e notificado.' });
        return { success: true };
      }
      return { success: false, error: result.error || 'Erro ao aprovar usuário' };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) || 'Erro ao aprovar usuário' };
    }
  }, [user, toast]);

  const rejectUser = useCallback(async (id: string) => {
    if (user?.role !== 'admin') return { success: false, error: 'Apenas administradores' };
    try {
      const result = await callApi('rejectUser', { id });
      if (result.success) {
        const currentUsers = (((getOfflineAppState().auth || {}) as Record<string, unknown>).users as User[]) || [];
        updateOfflineAuthArray('users', currentUsers.filter((current) => current.id !== id));
        toast({ title: 'Cadastro rejeitado', description: 'O cadastro pendente foi removido.' });
        return { success: true };
      }
      return { success: false, error: result.error || 'Erro ao rejeitar usuário' };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) || 'Erro ao rejeitar usuário' };
    }
  }, [user, toast]);

  const createUser = useCallback(async (data: CreateUserData) => {
    if (user?.role !== 'admin') {
      return { success: false, error: 'Apenas administradores podem criar usuários' };
    }

    try {
      const result = await callApi('createUser', data);
      
      if (result.user) {
        const currentUsers = (((getOfflineAppState().auth || {}) as Record<string, unknown>).users as User[]) || [];
        updateOfflineAuthArray('users', [...currentUsers.filter((item) => item.id !== result.user.id), result.user]);
        toast({
          title: "Usuário criado",
          description: `${result.user.nome} foi criado com sucesso.`,
        });
        return { success: true };
      }
      if ((result as { offlineQueued?: boolean }).offlineQueued) {
        const currentUsers = (((getOfflineAppState().auth || {}) as Record<string, unknown>).users as User[]) || [];
        const tempUser = {
          id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          nome: data.nome,
          email: data.email,
          role: data.role || 'user',
          titulo_sistema: data.titulo_sistema || 'Sorteios',
          ativo: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as User;
        updateOfflineAuthArray('users', [...currentUsers.filter((item) => item.email !== tempUser.email), tempUser]);
        toast({
          title: "Usuário criado",
          description: `${tempUser.nome} foi criado com sucesso.`,
        });
        return { success: true };
      }
      
      return { success: false, error: result.error || 'Erro ao criar usuário' };
    } catch (error: unknown) {
      console.error('Create user error:', error);
      return { success: false, error: getErrorMessage(error) || 'Erro ao criar usuário' };
    }
  }, [user, toast]);

  const updateUser = useCallback(async (id: string, data: Partial<CreateUserData>) => {
    if (user?.role !== 'admin') {
      return { success: false, error: 'Apenas administradores podem editar usuários' };
    }

    try {
      const result = await callApi('updateUser', { id, ...data });
      
      if (result.success) {
        const currentUsers = (((getOfflineAppState().auth || {}) as Record<string, unknown>).users as User[]) || [];
        updateOfflineAuthArray('users', currentUsers.map((current) => current.id === id ? { ...current, ...data } : current));
        toast({
          title: "Usuário atualizado",
          description: "As alterações foram salvas.",
        });
        return { success: true };
      }
      
      return { success: false, error: result.error || 'Erro ao atualizar usuário' };
    } catch (error: unknown) {
      console.error('Update user error:', error);
      return { success: false, error: getErrorMessage(error) || 'Erro ao atualizar usuário' };
    }
  }, [user, toast]);

  const deleteUser = useCallback(async (id: string) => {
    if (user?.role !== 'admin') {
      return { success: false, error: 'Apenas administradores podem excluir usuários' };
    }

    if (id === user.id) {
      return { success: false, error: 'Você não pode excluir sua própria conta' };
    }

    try {
      const result = await callApi('deleteUser', { id });
      
      if (result.success) {
        const currentUsers = (((getOfflineAppState().auth || {}) as Record<string, unknown>).users as User[]) || [];
        updateOfflineAuthArray('users', currentUsers.filter((item) => item.id !== id));
        toast({
          title: "Usuário excluído",
          description: "O usuário foi removido do sistema.",
        });
        return { success: true };
      }
      
      return { success: false, error: result.error || 'Erro ao excluir usuário' };
    } catch (error: unknown) {
      console.error('Delete user error:', error);
      return { success: false, error: getErrorMessage(error) || 'Erro ao excluir usuário' };
    }
  }, [user, toast]);

  const getAllUsers = useCallback(async (): Promise<User[]> => {
    if (user?.role !== 'admin') {
      return [];
    }

    try {
      const result = await callApi('getUsers');
      if (Array.isArray(result.users)) {
        updateOfflineAuthArray('users', result.users);
      }
      return result.users || [];
    } catch (error) {
      console.error('Get users error:', error);
      return [];
    }
  }, [user]);

  const updateProfile = useCallback(async (data: { nome: string; email: string; titulo_sistema: string; avatar_url?: string; senha_atual?: string; nova_senha?: string }) => {
    if (!user) {
      return { success: false, error: 'Usuário não autenticado' };
    }

    try {
      const result = await callApi('updateProfile', { 
        id: user.id, 
        nome: data.nome,
        email: data.email,
        titulo_sistema: data.titulo_sistema,
        avatar_url: data.avatar_url,
        senha_atual: data.senha_atual,
        nova_senha: data.nova_senha,
      });
      
      if (result.success) {
        const updatedUser = { 
          ...user, 
          nome: data.nome,
          email: data.email,
          titulo_sistema: data.titulo_sistema, 
          avatar_url: data.avatar_url 
        };
        setUser(updatedUser);
        localStorage.setItem(AUTH_KEY, JSON.stringify(updatedUser));
        updateOfflineAuthSnapshot({ user: updatedUser });
        return { success: true };
      }
      
      return { success: false, error: result.error || 'Erro ao atualizar perfil' };
    } catch (error: unknown) {
      console.error('Update profile error:', error);
      return { success: false, error: getErrorMessage(error) || 'Erro ao atualizar perfil' };
    }
  }, [user]);

  const getAllSorteiosAdmin = useCallback(async (): Promise<Sorteio[]> => {
    if (user?.role !== 'admin') return [];
    try {
      const result = await callApi('getAllSorteiosAdmin');
      if (Array.isArray(result.data)) {
        patchOfflineAppState({
          bingo: {
            ...(getOfflineAppState().bingo || {}),
            sorteios: result.data,
          },
        });
      }
      return result.data || [];
    } catch (error) {
      console.error('Get all sorteios error:', error);
      return [];
    }
  }, [user]);

  const getSorteioUsers = useCallback(async (sorteioId: string): Promise<{ data: User[]; owner_id: string }> => {
    try {
      const result = await callApi('getSorteioUsers', { sorteio_id: sorteioId });
      return { data: result.data || [], owner_id: result.owner_id };
    } catch (error) {
      console.error('Get sorteio users error:', error);
      return { data: [], owner_id: '' };
    }
  }, []);

  const assignSorteioToUser = useCallback(async (sorteioId: string, userId: string) => {
    if (user?.role !== 'admin') return { success: false, error: 'Apenas administradores' };
    try {
      await callApi('assignSorteioToUser', { sorteio_id: sorteioId, user_id: userId });
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) || 'Erro ao atribuir sorteio' };
    }
  }, [user]);

  const removeUserFromSorteio = useCallback(async (sorteioId: string, userId: string) => {
    if (user?.role !== 'admin') return { success: false, error: 'Apenas administradores' };
    try {
      await callApi('removeUserFromSorteio', { sorteio_id: sorteioId, user_id: userId });
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) || 'Erro ao remover atribuição' };
    }
  }, [user]);

  const changeSorteioOwner = useCallback(async (sorteioId: string, newOwnerId: string) => {
    if (user?.role !== 'admin') return { success: false, error: 'Apenas administradores' };
    try {
      await callApi('changeSorteioOwner', { sorteio_id: sorteioId, new_owner_id: newOwnerId });
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) || 'Erro ao alterar proprietário' };
    }
  }, [user]);

  const getPublicPlanos = useCallback(async (): Promise<Plan[]> => {
    try {
      const result = await callApi('getPublicPlanos');
      if (Array.isArray(result.data)) {
        updateOfflineAuthArray('planos', result.data);
      }
      return result.data || [];
    } catch (error) {
      console.error('Get public planos error:', error);
      return [];
    }
  }, []);

  const getPlanos = useCallback(async (): Promise<Plan[]> => {
    if (user?.role !== 'admin') return [];
    try {
      const result = await callApi('getPlanos');
      if (Array.isArray(result.data)) {
        updateOfflineAuthArray('planos', result.data);
      }
      return result.data || [];
    } catch (error) {
      console.error('Get planos error:', error);
      return [];
    }
  }, [user]);

  const createPlano = useCallback(async (data: { nome: string; valor: number; descricao?: string; stripe_price_id?: string; tipo_plano?: 'teste_gratis' | 'mensal' | 'anual'; ciclo_dias_renovacao?: number }) => {
    if (user?.role !== 'admin') return { success: false, error: 'Apenas administradores' };
    try {
      const result = await callApi('createPlano', data);
      if (result.data) {
        const currentPlanos = (((getOfflineAppState().auth || {}) as Record<string, unknown>).planos as Plan[]) || [];
        updateOfflineAuthArray('planos', [...currentPlanos.filter((item) => item.id !== result.data.id), result.data]);
        toast({ title: 'Plano criado', description: `${result.data.nome} foi criado com sucesso.` });
        return { success: true };
      }
      if ((result as { offlineQueued?: boolean }).offlineQueued) {
        const currentPlanos = (((getOfflineAppState().auth || {}) as Record<string, unknown>).planos as Plan[]) || [];
        const localPlan = {
          id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          nome: data.nome,
          valor: data.valor,
          descricao: data.descricao || '',
          stripe_price_id: data.stripe_price_id || '',
          tipo_plano: data.tipo_plano || 'mensal',
          ciclo_dias_renovacao: data.ciclo_dias_renovacao || 30,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as Plan;
        updateOfflineAuthArray('planos', [...currentPlanos.filter((item) => item.nome !== localPlan.nome), localPlan]);
        toast({ title: 'Plano criado', description: `${localPlan.nome} foi criado com sucesso.` });
        return { success: true };
      }
      return { success: false, error: result.error || 'Erro ao criar plano' };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) || 'Erro ao criar plano' };
    }
  }, [user, toast]);

  const updatePlano = useCallback(async (id: string, data: { nome: string; valor: number; descricao?: string; stripe_price_id?: string; tipo_plano?: 'teste_gratis' | 'mensal' | 'anual'; ciclo_dias_renovacao?: number }) => {
    if (user?.role !== 'admin') return { success: false, error: 'Apenas administradores' };
    try {
      const result = await callApi('updatePlano', { id, ...data });
      if (result.data) {
        const currentPlanos = (((getOfflineAppState().auth || {}) as Record<string, unknown>).planos as Plan[]) || [];
        updateOfflineAuthArray('planos', currentPlanos.map((item) => item.id === id ? { ...item, ...data } : item));
        toast({ title: 'Plano atualizado', description: 'As alterações foram salvas.' });
        return { success: true };
      }
      if ((result as { offlineQueued?: boolean }).offlineQueued) {
        const currentPlanos = (((getOfflineAppState().auth || {}) as Record<string, unknown>).planos as Plan[]) || [];
        updateOfflineAuthArray('planos', currentPlanos.map((item) => item.id === id ? { ...item, ...data } : item));
        toast({ title: 'Plano atualizado', description: 'As alterações foram salvas.' });
        return { success: true };
      }
      return { success: false, error: result.error || 'Erro ao atualizar plano' };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) || 'Erro ao atualizar plano' };
    }
  }, [user, toast]);

  const deletePlano = useCallback(async (id: string) => {
    if (user?.role !== 'admin') return { success: false, error: 'Apenas administradores' };
    try {
      const result = await callApi('deletePlano', { id });
      if (result.success) {
        const currentPlanos = (((getOfflineAppState().auth || {}) as Record<string, unknown>).planos as Plan[]) || [];
        updateOfflineAuthArray('planos', currentPlanos.filter((item) => item.id !== id));
        toast({ title: 'Plano excluído', description: 'O plano foi removido do sistema.' });
        return { success: true };
      }
      return { success: false, error: result.error || 'Erro ao excluir plano' };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) || 'Erro ao excluir plano' };
    }
  }, [user, toast]);

  const assignUserPlan = useCallback(async (userId: string, planoId: string | null, extensionDays = 0) => {
    if (user?.role !== 'admin') return { success: false, error: 'Apenas administradores' };
    try {
      const result = await callApi('assignUserPlan', { user_id: userId, plano_id: planoId, extension_days: extensionDays });
      if (result.success) {
        const currentUsers = (((getOfflineAppState().auth || {}) as Record<string, unknown>).users as User[]) || [];
        updateOfflineAuthArray('users', currentUsers.map((current) => current.id === userId ? {
          ...current,
          plano_id: planoId || null,
          plano_vencimento: result.user?.plano_vencimento || current.plano_vencimento,
          plano_pagamento_status: result.user?.plano_pagamento_status || current.plano_pagamento_status,
          plano_pagamento_metodo: result.user?.plano_pagamento_metodo || current.plano_pagamento_metodo,
          ativo: typeof result.user?.ativo === 'boolean' ? result.user.ativo : current.ativo,
        } : current));
        toast({ title: 'Plano atribuído', description: 'O plano foi atribuído ao usuário.' });
        return { success: true };
      }
      if ((result as { offlineQueued?: boolean }).offlineQueued) {
        const currentUsers = (((getOfflineAppState().auth || {}) as Record<string, unknown>).users as User[]) || [];
        updateOfflineAuthArray('users', currentUsers.map((current) => current.id === userId ? {
          ...current,
          plano_id: planoId || null,
          ativo: true,
        } : current));
        toast({ title: 'Plano atribuído', description: 'O plano foi atribuído ao usuário.' });
        return { success: true };
      }
      return { success: false, error: result.error || 'Erro ao atribuir plano' };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) || 'Erro ao atribuir plano' };
    }
  }, [user, toast]);

  const grantLifetimeAccess = useCallback(async (userId: string, grant: boolean) => {
    if (user?.role !== 'admin') return { success: false, error: 'Apenas administradores' };
    try {
      const result = await callApi('grantLifetimeAccess', { user_id: userId, gratuidade_vitalicia: grant });
      if (result.success) {
        const currentUsers = (((getOfflineAppState().auth || {}) as Record<string, unknown>).users as User[]) || [];
        updateOfflineAuthArray('users', currentUsers.map((current) => current.id === userId ? { ...current, gratuidade_vitalicia: grant } : current));
        toast({
          title: grant ? 'Gratuidade vitalícia concedida' : 'Gratuidade vitalícia removida',
          description: grant ? 'O usuário agora tem acesso vitalício gratuito.' : 'O acesso vitalício foi removido.',
        });
        return { success: true };
      }
      if ((result as { offlineQueued?: boolean }).offlineQueued) {
        const currentUsers = (((getOfflineAppState().auth || {}) as Record<string, unknown>).users as User[]) || [];
        updateOfflineAuthArray('users', currentUsers.map((current) => current.id === userId ? { ...current, gratuidade_vitalicia: grant } : current));
        return { success: true };
      }
      return { success: false, error: result.error || 'Erro ao alterar gratuidade' };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) || 'Erro ao alterar gratuidade' };
    }
  }, [user, toast]);

  const getConfiguracoes = useCallback(async (): Promise<Record<string, string>> => {
    if (user?.role !== 'admin') return {};
    try {
      const result = await callApi('getConfiguracoes');
      if (result.data && typeof result.data === 'object') {
        updateOfflineAuthSnapshot({ configuracoes: result.data });
      }
      return result.data || {};
    } catch (error) {
      console.error('Get configuracoes error:', error);
      return {};
    }
  }, [user]);

  const updateConfiguracoes = useCallback(async (config: Record<string, string>) => {
    if (user?.role !== 'admin') return { success: false, error: 'Apenas administradores' };
    try {
      const result = await callApi('updateConfiguracoes', { config });
      if (result.success) {
        updateOfflineAuthSnapshot({ configuracoes: config });
        toast({ title: 'Configurações salvas', description: 'As configurações foram atualizadas.' });
        return { success: true };
      }
      if ((result as { offlineQueued?: boolean }).offlineQueued) {
        updateOfflineAuthSnapshot({ configuracoes: config });
        toast({ title: 'Configurações salvas', description: 'As configurações foram atualizadas.' });
        return { success: true };
      }
      return { success: false, error: result.error || 'Erro ao salvar configurações' };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) || 'Erro ao salvar configurações' };
    }
  }, [user, toast]);

  const getUserConfiguracoes = useCallback(async (): Promise<Record<string, string>> => {
    try {
      const result = await callApi('getUserConfiguracoes');
      if (result.data && typeof result.data === 'object') {
        updateOfflineAuthSnapshot({ userConfiguracoes: result.data });
      }
      return result.data || {};
    } catch (error) {
      console.error('Get user configuracoes error:', error);
      return {};
    }
  }, []);

  const updateUserConfiguracoes = useCallback(async (config: Record<string, string>) => {
    try {
      const result = await callApi('updateUserConfiguracoes', { config });
      if (result.success) {
        updateOfflineAuthSnapshot({ userConfiguracoes: config });
        toast({ title: 'Configurações salvas', description: 'Configurações de pagamento atualizadas.' });
        return { success: true };
      }
      if ((result as { offlineQueued?: boolean }).offlineQueued) {
        updateOfflineAuthSnapshot({ userConfiguracoes: config });
        toast({ title: 'Configurações salvas', description: 'Configurações de pagamento atualizadas.' });
        return { success: true };
      }
      return { success: false, error: result.error || 'Erro ao salvar configurações' };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) || 'Erro ao salvar configurações' };
    }
  }, [toast]);

  const getLojaCompradores = useCallback(async (): Promise<Sorteio[]> => {
    try {
      const result = await callApi('getLojaCompradores');
      if (Array.isArray(result.data)) {
        updateOfflineAuthArray('lojaCompradores', result.data);
      }
      return result.data || [];
    } catch (error) {
      console.error('Get loja compradores error:', error);
      return [];
    }
  }, []);

  const getUserConfiguracoesByUserId = useCallback(async (userId: string): Promise<Record<string, string>> => {
    try {
      const result = await callApi('getUserConfiguracoesAdmin', { user_id: userId }) as { data?: Record<string, string> };
      if (result.data && typeof result.data === 'object') {
        updateOfflineAuthMap('userConfiguracoesByUserId', { [userId]: result.data });
      }
      return result.data || {};
    } catch {
      return {};
    }
  }, []);

  const updateUserConfiguracoesByUserId = useCallback(async (userId: string, config: Record<string, string>) => {
    try {
      await callApi('updateUserConfiguracoesAdmin', { user_id: userId, config });
      updateOfflineAuthMap('userConfiguracoesByUserId', { [userId]: config });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erro ao salvar configurações do usuário' };
    }
  }, []);

  const getCartelasComprador = useCallback(async (email: string): Promise<Record<string, unknown>[]> => {
    try {
      const result = await callApi('getCartelasComprador', { email });
      if (Array.isArray(result.data)) {
        updateOfflineAuthMap('cartelasCompradorByEmail', { [email]: result.data });
      }
      return result.data || [];
    } catch (error) {
      console.error('Get cartelas comprador error:', error);
      return [];
    }
  }, []);

  const createLojaComprador = useCallback(async (data: { nome: string; email: string; cpf?: string; telefone?: string; cidade?: string; endereco?: string }) => {
    try {
      const result = await callApi('createLojaComprador', data);
      if (result.data) {
        const current = (((getOfflineAppState().auth || {}) as Record<string, unknown>).lojaCompradores as Record<string, unknown>[]) || [];
        updateOfflineAuthArray('lojaCompradores', [...current.filter((item) => item.email !== data.email), result.data]);
        toast({ title: 'Cliente adicionado', description: 'O cliente foi cadastrado com sucesso.' });
        return { success: true };
      }
      if ((result as { offlineQueued?: boolean }).offlineQueued) {
        const current = (((getOfflineAppState().auth || {}) as Record<string, unknown>).lojaCompradores as Record<string, unknown>[]) || [];
        const localBuyer = { ...data };
        updateOfflineAuthArray('lojaCompradores', [...current.filter((item) => item.email !== data.email), localBuyer]);
        toast({ title: 'Cliente adicionado', description: 'O cliente foi cadastrado com sucesso.' });
        return { success: true };
      }
      return { success: false, error: result.error || 'Erro ao adicionar cliente' };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) || 'Erro ao adicionar cliente' };
    }
  }, [toast]);

  const updateLojaComprador = useCallback(async (data: { nome: string; email: string; cpf?: string; telefone?: string; cidade?: string; endereco?: string }) => {
    try {
      const result = await callApi('updateLojaComprador', data);
      if (result.success) {
        const current = (((getOfflineAppState().auth || {}) as Record<string, unknown>).lojaCompradores as Record<string, unknown>[]) || [];
        updateOfflineAuthArray('lojaCompradores', current.map((item) => item.email === data.email ? { ...item, ...data } : item));
        toast({ title: 'Cliente atualizado', description: 'Os dados do cliente foram atualizados.' });
        return { success: true };
      }
      if ((result as { offlineQueued?: boolean }).offlineQueued) {
        const current = (((getOfflineAppState().auth || {}) as Record<string, unknown>).lojaCompradores as Record<string, unknown>[]) || [];
        updateOfflineAuthArray('lojaCompradores', current.map((item) => item.email === data.email ? { ...item, ...data } : item));
        toast({ title: 'Cliente atualizado', description: 'Os dados do cliente foram atualizados.' });
        return { success: true };
      }
      return { success: false, error: result.error || 'Erro ao atualizar cliente' };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) || 'Erro ao atualizar cliente' };
    }
  }, [toast]);

  const deleteLojaComprador = useCallback(async (email: string) => {
    try {
      const result = await callApi('deleteLojaComprador', { email });
      if (result.success) {
        const current = (((getOfflineAppState().auth || {}) as Record<string, unknown>).lojaCompradores as Record<string, unknown>[]) || [];
        updateOfflineAuthArray('lojaCompradores', current.filter((item) => item.email !== email));
        toast({ title: 'Cliente removido', description: 'O cliente foi removido da sua lista.' });
        return { success: true };
      }
      if ((result as { offlineQueued?: boolean }).offlineQueued) {
        const current = (((getOfflineAppState().auth || {}) as Record<string, unknown>).lojaCompradores as Record<string, unknown>[]) || [];
        updateOfflineAuthArray('lojaCompradores', current.filter((item) => item.email !== email));
        toast({ title: 'Cliente removido', description: 'O cliente foi removido da sua lista.' });
        return { success: true };
      }
      return { success: false, error: result.error || 'Erro ao remover cliente' };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) || 'Erro ao remover cliente' };
    }
  }, [toast]);

  const createStripeCheckout = useCallback(async (planoId: string, successPath?: string, cancelPath?: string) => {
    try {
      const result = await callApi('createStripeCheckout', {
        plano_id: planoId,
        ...(successPath ? { success_path: successPath } : {}),
        ...(cancelPath ? { cancel_path: cancelPath } : {}),
      });
      if (result.url) {
        return { url: result.url };
      }
      return { error: result.error || 'Erro ao iniciar checkout' };
    } catch (error: unknown) {
      return { error: getErrorMessage(error) || 'Erro ao iniciar checkout' };
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!getStoredToken()) return;
    try {
      const result = await callApi('getMyProfile');
      if (result.user) {
        setUser(result.user);
        localStorage.setItem(AUTH_KEY, JSON.stringify(result.user));
        updateOfflineAuthSnapshot({ user: result.user });
      }
    } catch (error) {
      console.error('Refresh user error:', error);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    refreshUser();
    return () => {
      // Intentionally no background polling here.
    };
  }, [token, refreshUser]);

  useEffect(() => {
    patchOfflineAppState({
      auth: {
        user,
      },
    });
  }, [user]);

  useEffect(() => {
    const handleSyncComplete = () => {
      void refreshUser();
    };
    window.addEventListener(OFFLINE_EVENT_NAMES.syncComplete, handleSyncComplete);
    return () => window.removeEventListener(OFFLINE_EVENT_NAMES.syncComplete, handleSyncComplete);
  }, [refreshUser]);

  const confirmStripeCheckout = useCallback(async (sessionId: string): Promise<{ success: boolean; pending?: boolean; message?: string; error?: string }> => {
    try {
      const result = await callApi('confirmStripeCheckout', { session_id: sessionId });
      if (result.user) {
        setUser(result.user);
        localStorage.setItem(AUTH_KEY, JSON.stringify(result.user));
        updateOfflineAuthSnapshot({ user: result.user });
        return { success: true, pending: !!result.pending, message: result.message };
      }
      return { success: false, error: result.error || 'Erro ao confirmar pagamento' };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) || 'Erro ao confirmar pagamento' };
    }
  }, []);

  const createStripeConnectOnboardingLink = useCallback(async (): Promise<{ url?: string; error?: string }> => {
    try {
      const result = await callApi('createStripeConnectOnboardingLink');
      return result.url ? { url: result.url } : { error: result.error || 'Erro ao iniciar conexão com Stripe' };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      return { error: message || 'Erro desconhecido ao conectar Stripe. Verifique as configurações do servidor.' };
    }
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user && !!token,
    login,
    logout,
    registerUser,
    createUser,
    updateUser,
    deleteUser,
    approveUser,
    rejectUser,
    getAllUsers,
    checkFirstAccess,
    setupAdmin,
    updateProfile,
    getAuthToken,
    getAllSorteiosAdmin,
    getSorteioUsers,
    assignSorteioToUser,
    removeUserFromSorteio,
    changeSorteioOwner,
    getPublicPlanos,
    getPlanos,
    createPlano,
    updatePlano,
    deletePlano,
    assignUserPlan,
    grantLifetimeAccess,
    getConfiguracoes,
    updateConfiguracoes,
    getUserConfiguracoes,
    updateUserConfiguracoes,
    getUserConfiguracoesByUserId,
    updateUserConfiguracoesByUserId,
    getLojaCompradores,
    getCartelasComprador,
    createLojaComprador,
    updateLojaComprador,
    deleteLojaComprador,
    createStripeCheckout,
    createStripeConnectOnboardingLink,
    refreshUser,
    confirmStripeCheckout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
