import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { 
  Sorteio, 
  Vendedor, 
  Cartela, 
  Atribuicao, 
  Venda, 
  TabType,
  FiltrosVendedores,
  FiltrosCartelas,
  FiltrosAtribuicoes,
  FiltrosVendas,
  CartelaLayout,
  CartelaValidada,
  LojaCartela,
} from '@/types/bingo';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { callApi as callBackendApi } from '@/lib/apiClient';
import { OFFLINE_EVENT_NAMES, getOfflineAppState, patchOfflineAppState, isOfflineModeEnabled } from '@/lib/offlineMode';

interface BingoContextType {
  // State
  sorteioAtivo: Sorteio | null;
  sorteios: Sorteio[];
  vendedores: Vendedor[];
  cartelas: Cartela[];
  atribuicoes: Atribuicao[];
  vendas: Venda[];
  cartelaLayouts: CartelaLayout[];
  cartelasValidadas: CartelaValidada[];
  currentTab: TabType;
  isLoading: boolean;
  
  // Filtros
  filtrosVendedores: FiltrosVendedores;
  filtrosCartelas: FiltrosCartelas;
  filtrosAtribuicoes: FiltrosAtribuicoes;
  filtrosVendas: FiltrosVendas;
  
  // Actions
  setSorteioAtivo: (sorteio: Sorteio | null) => void;
  setCurrentTab: (tab: TabType) => void;
  
  // Filtros Actions
  setFiltrosVendedores: (filtros: FiltrosVendedores) => void;
  setFiltrosCartelas: (filtros: FiltrosCartelas) => void;
  setFiltrosAtribuicoes: (filtros: FiltrosAtribuicoes) => void;
  setFiltrosVendas: (filtros: FiltrosVendas) => void;
  
  // CRUD Operations - Sorteios
  loadSorteios: () => Promise<void>;
  addSorteio: (sorteio: Omit<Sorteio, 'id' | 'created_at' | 'updated_at'>, targetUserId?: string) => Promise<void>;
  updateSorteio: (id: string, sorteio: Partial<Sorteio>) => Promise<void>;
  deleteSorteio: (id: string) => Promise<void>;
  exportSorteioBackup: (sorteioId: string) => Promise<Record<string, unknown>>;
  importSorteioBackup: (backup: Record<string, unknown>, targetUserId?: string, importedNome?: string) => Promise<void>;
  
  // CRUD Operations - Vendedores
  loadVendedores: () => Promise<void>;
  addVendedor: (vendedor: Omit<Vendedor, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updateVendedor: (id: string, vendedor: Partial<Vendedor>) => Promise<void>;
  deleteVendedor: (id: string) => Promise<void>;
  
  // CRUD Operations - Cartelas
  loadCartelas: () => Promise<void>;
  gerarCartelas: (quantidade: number) => Promise<void>;
  atualizarStatusCartela: (numero: number, status: Cartela['status'], vendedorId?: string) => Promise<void>;
  salvarNumerosCartelas: (cartelas: { numero: number; numeros_grade: number[][] }[]) => Promise<void>;
  deleteCartela: (numero: number) => Promise<void>;
  createCartela: (numerosGrade: number[]) => Promise<void>;
  
  // CRUD Operations - Cartela Layouts
  loadCartelaLayouts: () => Promise<void>;
  saveCartelaLayout: (nome: string, layoutData: string, cardsData: string) => Promise<CartelaLayout>;
  updateCartelaLayout: (id: string, nome: string, layoutData: string, cardsData: string) => Promise<void>;
  deleteCartelaLayout: (id: string) => Promise<void>;
  
  // CRUD Operations - Cartelas Validadas
  loadCartelasValidadas: () => Promise<void>;
  validarCartela: (numero: number, compradorNome?: string) => Promise<void>;
  validarCartelas: (numeros: number[], compradorNome?: string) => Promise<void>;
  removerValidacaoCartela: (numero: number) => Promise<void>;
  removerValidacaoLote: (numeros: number[]) => Promise<void>;
  removerTodasValidacoes: () => Promise<void>;
  updateCartelaValidada: (numero: number, compradorNome: string | null) => Promise<void>;
  
  // CRUD Operations - Atribuicoes
  loadAtribuicoes: () => Promise<void>;
  addAtribuicao: (vendedorId: string, cartelas: number[]) => Promise<void>;
  addAtribuicaoComProgresso: (vendedorId: string, cartelas: number[], onProgress: (done: number, total: number) => void) => Promise<void>;
  addCartelasToAtribuicaoComProgresso: (atribuicaoId: string, vendedorId: string, cartelas: number[], onProgress: (done: number, total: number) => void) => Promise<void>;
  addCartelasToAtribuicao: (atribuicaoId: string, vendedorId: string, cartelas: number[]) => Promise<void>;
  removeCartelaFromAtribuicao: (atribuicaoId: string, numeroCartela: number) => Promise<void>;
  updateCartelaStatusInAtribuicao: (atribuicaoId: string, numeroCartela: number, status: 'ativa' | 'vendida' | 'devolvida' | 'extraviada') => Promise<void>;
  deleteAtribuicao: (id: string) => Promise<void>;
  transferirCartelas: (atribuicaoOrigemId: string, numerosCartelas: number[], vendedorDestinoId: string) => Promise<void>;
  
  // CRUD Operations - Vendas
  loadVendas: () => Promise<void>;
  addVenda: (venda: Omit<Venda, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updateVenda: (id: string, venda: Partial<Venda>) => Promise<void>;
  deleteVenda: (id: string) => Promise<void>;

  // CRUD Operations - Loja Pública
  lojaCartelas: LojaCartela[];
  loadMinhaLoja: () => Promise<void>;
  adicionarCartelaLoja: (cardSetId: string, numeroCartela: number, preco: number, cardData: string, layoutData: string, vendedorId?: string) => Promise<LojaCartela>;
  removerCartelaLoja: (id: string) => Promise<void>;
  removerMultiplasCartelasLoja: (ids: string[]) => Promise<void>;
  atualizarPrecoLojaCartela: (id: string, preco: number) => Promise<void>;
  
  // Refresh all data for current sorteio
  refreshData: () => Promise<void>;
}

const BingoContext = createContext<BingoContextType | undefined>(undefined);
const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : '');

export const BingoProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const offlineSnapshot = getOfflineAppState().bingo || {};
  
  // State
  const [sorteioAtivo, setSorteioAtivoState] = useState<Sorteio | null>((offlineSnapshot.sorteioAtivo as Sorteio | null) || null);
  const [sorteios, setSorteios] = useState<Sorteio[]>((offlineSnapshot.sorteios as Sorteio[]) || []);
  const [vendedores, setVendedores] = useState<Vendedor[]>((offlineSnapshot.vendedores as Vendedor[]) || []);
  const [cartelas, setCartelas] = useState<Cartela[]>((offlineSnapshot.cartelas as Cartela[]) || []);
  const [atribuicoes, setAtribuicoes] = useState<Atribuicao[]>((offlineSnapshot.atribuicoes as Atribuicao[]) || []);
  const [vendas, setVendas] = useState<Venda[]>((offlineSnapshot.vendas as Venda[]) || []);
  const [cartelaLayouts, setCartelaLayouts] = useState<CartelaLayout[]>((offlineSnapshot.cartelaLayouts as CartelaLayout[]) || []);
  const [cartelasValidadas, setCartelasValidadas] = useState<CartelaValidada[]>((offlineSnapshot.cartelasValidadas as CartelaValidada[]) || []);
  const [lojaCartelas, setLojaCartelas] = useState<LojaCartela[]>((offlineSnapshot.lojaCartelas as LojaCartela[]) || []);
  const [currentTab, setCurrentTab] = useState<TabType>('sorteios');
  const [isLoading, setIsLoading] = useState(false);
  
  // Filtros
  const [filtrosVendedores, setFiltrosVendedores] = useState<FiltrosVendedores>({
    busca: '',
    status: 'todos'
  });
  
  const [filtrosCartelas, setFiltrosCartelas] = useState<FiltrosCartelas>({
    busca: '',
    status: 'todos',
    vendedor: 'todos'
  });
  
  const [filtrosAtribuicoes, setFiltrosAtribuicoes] = useState<FiltrosAtribuicoes>({
    busca: '',
    status: 'todos',
    vendedor: 'todos'
  });
  
  const [filtrosVendas, setFiltrosVendas] = useState<FiltrosVendas>({
    busca: '',
    status: 'todos',
    vendedor: 'todos',
    periodo: 'todos'
  });

  useEffect(() => {
    const currentBingo = (getOfflineAppState().bingo || {}) as Record<string, unknown>;
    patchOfflineAppState({
      bingo: {
        ...currentBingo,
        sorteioAtivo,
        sorteios,
        vendedores,
        cartelas,
        atribuicoes,
        vendas,
        cartelaLayouts,
        cartelasValidadas,
        lojaCartelas,
      },
    });
  }, [sorteioAtivo, sorteios, vendedores, cartelas, atribuicoes, vendas, cartelaLayouts, cartelasValidadas, lojaCartelas]);

  // API call helper (funciona em qualquer modo)
  const callApi = useCallback(async (action: string, data: Record<string, unknown> = {}) => {
    return callBackendApi(action, data);
  }, []);

  const makeTempId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const parseCartelaList = (value: string) => value.split(',').map(v => Number(v.trim())).filter(Number.isFinite);
  const isOfflineQueued = (result: unknown): boolean => !!(result && typeof result === 'object' && 'offlineQueued' in result && (result as { offlineQueued?: boolean }).offlineQueued);
  const persistOfflineBingoState = useCallback((next: Partial<{
    sorteioAtivo: Sorteio | null;
    sorteios: Sorteio[];
    vendedores: Vendedor[];
    cartelas: Cartela[];
    atribuicoes: Atribuicao[];
    vendas: Venda[];
    cartelaLayouts: CartelaLayout[];
    cartelasValidadas: CartelaValidada[];
    lojaCartelas: LojaCartela[];
  }>) => {
    patchOfflineAppState({
      bingo: {
        sorteioAtivo,
        sorteios,
        vendedores,
        cartelas,
        atribuicoes,
        vendas,
        cartelaLayouts,
        cartelasValidadas,
        lojaCartelas,
        ...next,
      },
    });
  }, [sorteioAtivo, sorteios, vendedores, cartelas, atribuicoes, vendas, cartelaLayouts, cartelasValidadas, lojaCartelas]);

  // ================== SORTEIOS ==================
  const loadSorteios = useCallback(async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      const result = await callApi('getSorteios', { user_id: user.id });
      setSorteios(result.data || []);
    } catch (error: unknown) {
      console.error('Error loading sorteios:', error);
      toast({
        title: "Erro ao carregar sorteios",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, callApi, toast]);

  const addSorteio = useCallback(async (sorteio: Omit<Sorteio, 'id' | 'created_at' | 'updated_at'>, targetUserId?: string) => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      const result = await callApi('createSorteio', { ...sorteio, user_id: user.id, ...(targetUserId ? { target_user_id: targetUserId } : {}) });
      if (isOfflineQueued(result)) {
        const created: Sorteio = {
          ...sorteio,
          id: makeTempId(),
          user_id: targetUserId || user.id,
          premios: sorteio.premios || (sorteio.premio ? [sorteio.premio] : ['']),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setSorteios(prev => [...prev, created]);
      }
      toast({ title: "Sorteio criado com sucesso!" });
      if (!isOfflineQueued(result)) {
        await loadSorteios();
      }
    } catch (error: unknown) {
      console.error('Error creating sorteio:', error);
      toast({
        title: "Erro ao criar sorteio",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, callApi, toast, loadSorteios]);

  const updateSorteio = useCallback(async (id: string, updates: Partial<Sorteio>) => {
    try {
      setIsLoading(true);
      const sorteio = sorteios.find(s => s.id === id);
      if (!sorteio) return;
      
      const result = await callApi('updateSorteio', { id, ...sorteio, ...updates });
      const updatedSorteio = result.data?.[0] as Sorteio | undefined;
      if (isOfflineQueued(result)) {
        setSorteios(prev => prev.map(s => s.id === id ? { ...s, ...updates } as Sorteio : s));
        if (sorteioAtivo?.id === id) {
          setSorteioAtivoState(prev => prev ? { ...prev, ...updates } : prev);
        }
      }
      toast({ title: "Sorteio atualizado!" });
      if (!isOfflineQueued(result)) {
        await loadSorteios();
      }
      
      if (sorteioAtivo?.id === id) {
        setSorteioAtivoState(prev => updatedSorteio || (prev ? { ...prev, ...updates } : null));
        const cartelasResult = await callApi('getCartelas', { sorteio_id: id, include_grades: false });
        setCartelas(cartelasResult.data || []);
      }
    } catch (error: unknown) {
      console.error('Error updating sorteio:', error);
      toast({
        title: "Erro ao atualizar sorteio",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [sorteios, sorteioAtivo, callApi, toast, loadSorteios]);

  const deleteSorteio = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      const result = await callApi('deleteSorteio', { id });
      if (isOfflineQueued(result)) {
        setSorteios(prev => prev.filter(s => s.id !== id));
      }
      toast({ title: "Sorteio excluído!" });
      if (!isOfflineQueued(result)) {
        await loadSorteios();
      }
      
      if (sorteioAtivo?.id === id) {
        setSorteioAtivoState(null);
      }
    } catch (error: unknown) {
      console.error('Error deleting sorteio:', error);
      toast({
        title: "Erro ao excluir sorteio",
        description: getErrorMessage(error),
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [sorteioAtivo, callApi, toast, loadSorteios]);

  const exportSorteioBackup = useCallback(async (sorteioId: string) => {
    try {
      setIsLoading(true);
      const result = await callApi('exportSorteioBackup', { sorteio_id: sorteioId });
      return result.data || {};
    } catch (error: unknown) {
      console.error('Error exporting sorteio backup:', error);
      toast({
        title: "Erro ao exportar backup",
        description: getErrorMessage(error),
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [callApi, toast]);

  const importSorteioBackup = useCallback(async (backup: Record<string, unknown>, targetUserId?: string, importedNome?: string) => {
    try {
      setIsLoading(true);
      await callApi('importSorteioBackup', {
        backup,
        ...(importedNome ? { imported_nome: importedNome } : {}),
        ...(targetUserId ? { target_user_id: targetUserId } : {})
      });
      await loadSorteios();
    } catch (error: unknown) {
      console.error('Error importing sorteio backup:', error);
      toast({
        title: "Erro ao importar backup",
        description: getErrorMessage(error),
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [callApi, toast, loadSorteios]);

  // ================== VENDEDORES ==================
  const loadVendedores = useCallback(async () => {
    if (!sorteioAtivo) return;
    
    try {
      const result = await callApi('getVendedores', { sorteio_id: sorteioAtivo.id });
      setVendedores(result.data || []);
    } catch (error: unknown) {
      console.error('Error loading vendedores:', error);
    }
  }, [sorteioAtivo, callApi]);

  const addVendedor = useCallback(async (vendedor: Omit<Vendedor, 'id' | 'created_at' | 'updated_at'>) => {
    if (!sorteioAtivo) return;
    
    try {
      const result = await callApi('createVendedor', { ...vendedor, sorteio_id: sorteioAtivo.id });
      if (isOfflineQueued(result)) {
        setVendedores(prev => [...prev, {
          ...vendedor,
          id: makeTempId(),
          sorteio_id: sorteioAtivo.id,
          ativo: vendedor.ativo ?? true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }]);
      }
      toast({ title: "Vendedor criado!" });
      if (!isOfflineQueued(result)) {
        await loadVendedores();
      }
    } catch (error: unknown) {
      console.error('Error creating vendedor:', error);
      toast({
        title: "Erro ao criar vendedor",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    }
  }, [sorteioAtivo, callApi, toast, loadVendedores]);

  const updateVendedor = useCallback(async (id: string, updates: Partial<Vendedor>) => {
    try {
      const vendedor = vendedores.find(v => v.id === id);
      if (!vendedor) return;
      
      const result = await callApi('updateVendedor', { id, ...vendedor, ...updates });
      if (isOfflineQueued(result)) {
        setVendedores(prev => prev.map(v => v.id === id ? { ...v, ...updates } as Vendedor : v));
      }
      toast({ title: "Vendedor atualizado!" });
      if (!isOfflineQueued(result)) {
        await loadVendedores();
      }
    } catch (error: unknown) {
      console.error('Error updating vendedor:', error);
      toast({
        title: "Erro ao atualizar vendedor",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    }
  }, [vendedores, callApi, toast, loadVendedores]);

  const deleteVendedor = useCallback(async (id: string) => {
    try {
      const result = await callApi('deleteVendedor', { id });
      if (isOfflineQueued(result)) {
        setVendedores(prev => prev.filter(v => v.id !== id));
      }
      toast({ title: "Vendedor excluído!" });
      if (!isOfflineQueued(result)) {
        await loadVendedores();
      }
    } catch (error: unknown) {
      console.error('Error deleting vendedor:', error);
      toast({
        title: "Erro ao excluir vendedor",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    }
  }, [callApi, toast, loadVendedores]);

  // ================== CARTELAS ==================
  const loadCartelas = useCallback(async () => {
    if (!sorteioAtivo) return;
    
    try {
      const result = await callApi('getCartelas', { sorteio_id: sorteioAtivo.id, include_grades: false });
      setCartelas(result.data || []);
    } catch (error: unknown) {
      console.error('Error loading cartelas:', error);
    }
  }, [sorteioAtivo, callApi]);

  const gerarCartelas = useCallback(async (quantidade: number) => {
    if (!sorteioAtivo) return;
    
    try {
      setIsLoading(true);
      const result = await callApi('gerarCartelas', { sorteio_id: sorteioAtivo.id, quantidade });
      const info = result.data?.[0];
      const quantidadeFinal = Number(info?.quantidade ?? quantidade);
      const adicionadas = Number(info?.adicionadas ?? quantidade);
      if (isOfflineQueued(result)) {
        const novasCartelas = Array.from({ length: quantidadeFinal }, (_, idx) => ({
          numero: idx + 1,
          status: 'disponivel' as const,
          vendedor_id: undefined,
          comprador_nome: undefined,
          numeros_grade: undefined,
        }));
        setCartelas(novasCartelas as Cartela[]);
      }
      setSorteioAtivoState(prev => prev ? { ...prev, quantidade_cartelas: quantidadeFinal } : prev);
      setSorteios(prev => prev.map(s => s.id === sorteioAtivo.id ? { ...s, quantidade_cartelas: quantidadeFinal } : s));
      toast({ title: adicionadas > 0 ? `${adicionadas} nova(s) cartela(s) gerada(s)!` : 'Nenhuma cartela existente foi alterada.' });
      await loadCartelas();
    } catch (error: unknown) {
      console.error('Error generating cartelas:', error);
      toast({
        title: "Erro ao gerar cartelas",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [sorteioAtivo, callApi, toast, loadCartelas]);

  const atualizarStatusCartela = useCallback(async (numero: number, status: Cartela['status'], vendedorId?: string) => {
    if (!sorteioAtivo) return;
    
    try {
      const result = await callApi('updateCartela', { 
        sorteio_id: sorteioAtivo.id, 
        numero, 
        status, 
        vendedor_id: vendedorId || null 
      });
      if (isOfflineQueued(result)) {
        setCartelas(prev => prev.map(c => c.numero === numero ? { ...c, status, vendedor_id: vendedorId || c.vendedor_id } : c));
      }
      await loadCartelas();
    } catch (error: unknown) {
      console.error('Error updating cartela:', error);
    }
  }, [sorteioAtivo, callApi, loadCartelas]);

  const salvarNumerosCartelas = useCallback(async (cartelas: { numero: number; numeros_grade: number[][] }[]) => {
    if (!sorteioAtivo) return;
    try {
      const result = await callApi('salvarNumerosCartelas', { sorteio_id: sorteioAtivo.id, cartelas });
      if (isOfflineQueued(result)) {
        setCartelas(prev => prev.map(c => {
          const found = cartelas.find(item => item.numero === c.numero);
          return found ? { ...c, numeros_grade: found.numeros_grade } : c;
        }));
      }
      await loadCartelas();
    } catch (error: unknown) {
      console.error('Error saving cartela numbers:', error);
      toast({
        title: "Erro ao salvar números das cartelas",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    }
  }, [sorteioAtivo, callApi, toast, loadCartelas]);

  const deleteCartela = useCallback(async (numero: number) => {
    if (!sorteioAtivo) return;
    try {
      const result = await callApi('deleteCartela', { sorteio_id: sorteioAtivo.id, numero });
      if (isOfflineQueued(result)) {
        setCartelas(prev => prev.filter(c => c.numero !== numero));
      }
      toast({ title: "Cartela excluída!" });
      if (!isOfflineQueued(result)) {
        await loadCartelas();
      }
    } catch (error: unknown) {
      console.error('Error deleting cartela:', error);
      toast({ title: "Erro ao excluir cartela", description: getErrorMessage(error), variant: "destructive" });
    }
  }, [sorteioAtivo, callApi, toast, loadCartelas]);

  const createCartela = useCallback(async (numerosGrade: number[]) => {
    if (!sorteioAtivo) return;
    try {
      const result = await callApi('createCartela', { sorteio_id: sorteioAtivo.id, numeros_grade: numerosGrade });
      const numeroCriado = Number(result.data?.[0]?.numero || 0);
      if (isOfflineQueued(result)) {
        const nextNumero = numeroCriado || ((cartelas.reduce((max, c) => Math.max(max, c.numero), 0)) + 1);
        setCartelas(prev => [...prev, {
          numero: nextNumero,
          status: 'disponivel',
          vendedor_id: undefined,
          comprador_nome: undefined,
          numeros_grade: [numerosGrade],
        } as Cartela]);
      }
      toast({ title: "Cartela criada!" });
      if (!isOfflineQueued(result)) {
        await loadCartelas();
        await loadSorteios();
      }
      setSorteioAtivoState(prev => prev ? { ...prev, quantidade_cartelas: Math.max(prev.quantidade_cartelas || 0, numeroCriado) } : prev);
    } catch (error: unknown) {
      console.error('Error creating cartela:', error);
      toast({ title: "Erro ao criar cartela", description: getErrorMessage(error), variant: "destructive" });
    }
  }, [sorteioAtivo, callApi, toast, loadCartelas, loadSorteios]);

  // ================== ATRIBUIÇÕES ==================
  const loadAtribuicoes = useCallback(async () => {
    if (!sorteioAtivo) return;
    
    try {
      const result = await callApi('getAtribuicoes', { sorteio_id: sorteioAtivo.id });
      setAtribuicoes(result.data || []);
    } catch (error: unknown) {
      console.error('Error loading atribuicoes:', error);
    }
  }, [sorteioAtivo, callApi]);

  const addAtribuicao = useCallback(async (vendedorId: string, cartelasNums: number[]) => {
    if (!sorteioAtivo) return;
    
    try {
      const result = await callApi('createAtribuicao', { 
        sorteio_id: sorteioAtivo.id, 
        vendedor_id: vendedorId, 
        cartelas: cartelasNums 
      });
      if (isOfflineQueued(result)) {
        const createdAt = new Date().toISOString();
        setAtribuicoes(prev => [...prev, {
          id: makeTempId(),
          sorteio_id: sorteioAtivo.id,
          vendedor_id: vendedorId,
          cartelas: cartelasNums.map(numero => ({ numero, status: 'ativa', data_atribuicao: createdAt })),
          created_at: createdAt,
          updated_at: createdAt,
        }]);
        setCartelas(prev => prev.map(c => cartelasNums.includes(c.numero) ? { ...c, status: 'ativa', vendedor_id: vendedorId } : c));
      }
      toast({ title: "Atribuição criada!" });
      if (!isOfflineQueued(result)) {
        await loadAtribuicoes();
        await loadCartelas();
      }
    } catch (error: unknown) {
      console.error('Error creating atribuicao:', error);
      toast({
        title: "Erro ao criar atribuição",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    }
  }, [sorteioAtivo, callApi, toast, loadAtribuicoes, loadCartelas]);

  const ATRIB_BATCH_SIZE = 50;

  const addAtribuicaoComProgresso = useCallback(async (
    vendedorId: string,
    cartelasNums: number[],
    onProgress: (done: number, total: number) => void,
  ) => {
    if (!sorteioAtivo) return;
    const total = cartelasNums.length;
    const firstBatch = cartelasNums.slice(0, ATRIB_BATCH_SIZE);
    const result = await callApi('createAtribuicao', {
      sorteio_id: sorteioAtivo.id,
      vendedor_id: vendedorId,
      cartelas: firstBatch,
    }) as { data: { id: string }[] };
    const atribuicaoId = result.data[0].id;
    if (isOfflineQueued(result)) {
      const createdAt = new Date().toISOString();
      setAtribuicoes(prev => [...prev, {
        id: atribuicaoId || makeTempId(),
        sorteio_id: sorteioAtivo.id,
        vendedor_id: vendedorId,
        cartelas: firstBatch.map(numero => ({ numero, status: 'ativa', data_atribuicao: createdAt })),
        created_at: createdAt,
        updated_at: createdAt,
      }]);
      setCartelas(prev => prev.map(c => firstBatch.includes(c.numero) ? { ...c, status: 'ativa', vendedor_id: vendedorId } : c));
    }
    onProgress(Math.min(ATRIB_BATCH_SIZE, total), total);

    for (let i = ATRIB_BATCH_SIZE; i < total; i += ATRIB_BATCH_SIZE) {
      const batch = cartelasNums.slice(i, i + ATRIB_BATCH_SIZE);
      await callApi('addCartelasToAtribuicao', {
        atribuicao_id: atribuicaoId,
        vendedor_id: vendedorId,
        sorteio_id: sorteioAtivo.id,
        cartelas: batch,
      });
      onProgress(Math.min(i + ATRIB_BATCH_SIZE, total), total);
    }

    if (!isOfflineQueued(result)) {
      await loadAtribuicoes();
      await loadCartelas();
    }
  }, [sorteioAtivo, callApi, loadAtribuicoes, loadCartelas]);

  const addCartelasToAtribuicaoComProgresso = useCallback(async (
    atribuicaoId: string,
    vendedorId: string,
    cartelasNums: number[],
    onProgress: (done: number, total: number) => void,
  ) => {
    if (!sorteioAtivo) return;
    const total = cartelasNums.length;
    for (let i = 0; i < total; i += ATRIB_BATCH_SIZE) {
      const batch = cartelasNums.slice(i, i + ATRIB_BATCH_SIZE);
      await callApi('addCartelasToAtribuicao', {
        atribuicao_id: atribuicaoId,
        vendedor_id: vendedorId,
        sorteio_id: sorteioAtivo.id,
        cartelas: batch,
      });
      onProgress(Math.min(i + ATRIB_BATCH_SIZE, total), total);
    }
    if (!isOfflineQueued(result)) {
      await loadAtribuicoes();
      await loadCartelas();
    }
  }, [sorteioAtivo, callApi, loadAtribuicoes, loadCartelas]);

  const addCartelasToAtribuicao = useCallback(async (atribuicaoId: string, vendedorId: string, cartelasNums: number[]) => {
    if (!sorteioAtivo) return;
    
    try {
      const result = await callApi('addCartelasToAtribuicao', { 
        atribuicao_id: atribuicaoId,
        vendedor_id: vendedorId,
        sorteio_id: sorteioAtivo.id,
        cartelas: cartelasNums 
      });
      if (isOfflineQueued(result)) {
        setAtribuicoes(prev => prev.map(a => a.id === atribuicaoId ? {
          ...a,
          cartelas: [...a.cartelas, ...cartelasNums.map(numero => ({ numero, status: 'ativa', data_atribuicao: new Date().toISOString() }))]
        } : a));
        setCartelas(prev => prev.map(c => cartelasNums.includes(c.numero) ? { ...c, status: 'ativa', vendedor_id: vendedorId } : c));
      }
      toast({ title: "Cartelas adicionadas!" });
      if (!isOfflineQueued(result)) {
        await loadAtribuicoes();
        await loadCartelas();
      }
    } catch (error: unknown) {
      console.error('Error adding cartelas:', error);
      toast({
        title: "Erro ao adicionar cartelas",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    }
  }, [sorteioAtivo, callApi, toast, loadAtribuicoes, loadCartelas]);

  const removeCartelaFromAtribuicao = useCallback(async (atribuicaoId: string, numeroCartela: number) => {
    if (!sorteioAtivo) return;
    
    try {
      const result = await callApi('removeCartelaFromAtribuicao', { 
        atribuicao_id: atribuicaoId,
        sorteio_id: sorteioAtivo.id,
        numero_cartela: numeroCartela 
      });
      if (isOfflineQueued(result)) {
        setAtribuicoes(prev => prev.map(a => a.id === atribuicaoId ? {
          ...a,
          cartelas: a.cartelas.filter(c => c.numero !== numeroCartela)
        } : a));
        setCartelas(prev => prev.map(c => c.numero === numeroCartela ? { ...c, status: 'disponivel', vendedor_id: undefined } : c));
      }
      toast({ title: "Cartela removida!" });
      if (!isOfflineQueued(result)) {
        await loadAtribuicoes();
        await loadCartelas();
      }
    } catch (error: unknown) {
      console.error('Error removing cartela:', error);
      toast({
        title: "Erro ao remover cartela",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    }
  }, [sorteioAtivo, callApi, toast, loadAtribuicoes, loadCartelas]);

  const updateCartelaStatusInAtribuicao = useCallback(async (atribuicaoId: string, numeroCartela: number, status: 'ativa' | 'vendida' | 'devolvida' | 'extraviada') => {
    if (!sorteioAtivo) return;
    
    try {
      const result = await callApi('updateCartelaStatusInAtribuicao', { 
        atribuicao_id: atribuicaoId,
        sorteio_id: sorteioAtivo.id,
        numero_cartela: numeroCartela,
        status
      });
      if (isOfflineQueued(result)) {
        setAtribuicoes(prev => prev.map(a => a.id === atribuicaoId ? {
          ...a,
          cartelas: a.cartelas.map(c => c.numero === numeroCartela ? { ...c, status } : c)
        } : a));
        setCartelas(prev => prev.map(c => c.numero === numeroCartela ? { ...c, status } : c));
      }
      if (!isOfflineQueued(result)) {
        await loadAtribuicoes();
        await loadCartelas();
      }
    } catch (error: unknown) {
      console.error('Error updating cartela status:', error);
    }
  }, [sorteioAtivo, callApi, loadAtribuicoes, loadCartelas]);

  const deleteAtribuicao = useCallback(async (id: string) => {
    if (!sorteioAtivo) return;
    
    try {
      const result = await callApi('deleteAtribuicao', { atribuicao_id: id, sorteio_id: sorteioAtivo.id });
      if (isOfflineQueued(result)) {
        const removed = atribuicoes.find(a => a.id === id);
        setAtribuicoes(prev => prev.filter(a => a.id !== id));
        if (removed) {
          setCartelas(prev => prev.map(c => removed.cartelas.some(rc => rc.numero === c.numero) ? { ...c, status: 'disponivel', vendedor_id: undefined } : c));
        }
      }
      toast({ title: "Atribuição excluída!" });
      if (!isOfflineQueued(result)) {
        await loadAtribuicoes();
        await loadCartelas();
      }
    } catch (error: unknown) {
      console.error('Error deleting atribuicao:', error);
      toast({
        title: "Erro ao excluir atribuição",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    }
  }, [sorteioAtivo, callApi, toast, loadAtribuicoes, loadCartelas]);

  const transferirCartelas = useCallback(async (atribuicaoOrigemId: string, numerosCartelas: number[], vendedorDestinoId: string) => {
    if (!sorteioAtivo) return;
    
    try {
      const result = await callApi('transferirCartelas', { 
        atribuicao_origem_id: atribuicaoOrigemId,
        sorteio_id: sorteioAtivo.id,
        numeros_cartelas: numerosCartelas,
        vendedor_destino_id: vendedorDestinoId
      });
      if (isOfflineQueued(result)) {
        setAtribuicoes(prev => prev.map(a => a.id === atribuicaoOrigemId ? {
          ...a,
          vendedor_id: vendedorDestinoId,
          cartelas: a.cartelas.map(c => numerosCartelas.includes(c.numero) ? { ...c, status: 'ativa' } : c)
        } : a));
        setCartelas(prev => prev.map(c => numerosCartelas.includes(c.numero) ? { ...c, vendedor_id: vendedorDestinoId } : c));
      }
      toast({ title: `${numerosCartelas.length} cartela(s) transferida(s)!` });
      if (!isOfflineQueued(result)) {
        await loadAtribuicoes();
        await loadCartelas();
      }
    } catch (error: unknown) {
      console.error('Error transferring cartelas:', error);
      toast({
        title: "Erro ao transferir cartelas",
        description: getErrorMessage(error),
        variant: "destructive"
      });
      throw error;
    }
  }, [sorteioAtivo, callApi, toast, loadAtribuicoes, loadCartelas]);
  const loadVendas = useCallback(async () => {
    if (!sorteioAtivo) return;
    
    try {
      const result = await callApi('getVendas', { sorteio_id: sorteioAtivo.id });
      setVendas(result.data || []);
    } catch (error: unknown) {
      console.error('Error loading vendas:', error);
    }
  }, [sorteioAtivo, callApi]);

  // ================== LOJA PÚBLICA ==================
  const loadMinhaLoja = useCallback(async () => {
    try {
      const result = await callApi('getMinhaLoja', sorteioAtivo ? { sorteio_id: sorteioAtivo.id } : {});
      setLojaCartelas(result.data || []);
    } catch (error: unknown) {
      console.error('Error loading loja:', error);
    }
  }, [callApi, sorteioAtivo]);

  const adicionarCartelaLoja = useCallback(async (cardSetId: string, numeroCartela: number, preco: number, cardData: string, layoutData: string, vendedorId?: string): Promise<LojaCartela> => {
    const result = await callApi('adicionarCartelaLoja', { card_set_id: cardSetId, numero_cartela: numeroCartela, preco, card_data: cardData, layout_data: layoutData, vendedor_id: vendedorId || null });
    if (!result.data) throw new Error(result.error || 'Erro ao disponibilizar cartela.');
    const localData: LojaCartela = result.data || {
      id: makeTempId(),
      card_set_id: cardSetId,
      numero_cartela: numeroCartela,
      preco,
      status: 'disponivel',
      vendedor_id: vendedorId,
      card_data: cardData,
      layout_data: layoutData,
    };
    setLojaCartelas(prev => {
      const idx = prev.findIndex(c => c.card_set_id === cardSetId && c.numero_cartela === numeroCartela);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = localData;
        return updated;
      }
      return [...prev, localData];
    });
    return localData;
  }, [callApi]);

  const removerCartelaLoja = useCallback(async (id: string) => {
    const result = await callApi('removerCartelaLoja', { id });
    if (isOfflineQueued(result)) {
      const removed = lojaCartelas.find(c => c.id === id);
      setLojaCartelas(prev => prev.filter(c => c.id !== id));
      if (removed) {
        setCartelas(prev => prev.map(c => c.numero === removed.numero_cartela ? { ...c, status: 'disponivel' } : c));
      }
    } else {
      setLojaCartelas(prev => prev.filter(c => c.id !== id));
    }
    if (!isOfflineQueued(result)) {
      await loadMinhaLoja();
      await loadVendas();
      await loadCartelas();
      await loadAtribuicoes();
    }
  }, [callApi, loadMinhaLoja, loadVendas, loadCartelas, loadAtribuicoes, lojaCartelas]);

  const removerMultiplasCartelasLoja = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const result = await callApi('removerMultiplasCartelasLoja', { ids });
    if (isOfflineQueued(result)) {
      const removed = lojaCartelas.filter(c => ids.includes(c.id));
      setLojaCartelas(prev => prev.filter(c => !ids.includes(c.id)));
      setCartelas(prev => prev.map(c => removed.some(r => r.numero_cartela === c.numero) ? { ...c, status: 'disponivel' } : c));
    } else {
      setLojaCartelas(prev => prev.filter(c => !ids.includes(c.id)));
    }
    if (!isOfflineQueued(result)) {
      await loadMinhaLoja();
      await loadVendas();
      await loadCartelas();
      await loadAtribuicoes();
    }
  }, [callApi, loadMinhaLoja, loadVendas, loadCartelas, loadAtribuicoes, lojaCartelas]);

  const atualizarPrecoLojaCartela = useCallback(async (id: string, preco: number) => {
    const result = await callApi('atualizarPrecoLojaCartela', { id, preco });
    if (isOfflineQueued(result)) {
      setLojaCartelas(prev => prev.map(c => c.id === id ? { ...c, preco } : c));
    }
    setLojaCartelas(prev => prev.map(c => c.id === id ? { ...c, preco } : c));
  }, [callApi]);

  const addVenda = useCallback(async (venda: Omit<Venda, 'id' | 'created_at' | 'updated_at'>) => {
    if (!sorteioAtivo) return;
    
    try {
      const result = await callApi('createVenda', { ...venda, sorteio_id: sorteioAtivo.id });
      if (isOfflineQueued(result)) {
        const createdAt = new Date().toISOString();
        const localVenda: Venda = {
          ...venda,
          id: makeTempId(),
          sorteio_id: sorteioAtivo.id,
          created_at: createdAt,
          updated_at: createdAt,
        };
        const nextVendas = [...vendas, localVenda];
        setVendas(nextVendas);
        const numeros = parseCartelaList(venda.numeros_cartelas);
        const nextCartelas = cartelas.map(c => numeros.includes(c.numero) ? { ...c, status: 'vendida' } : c);
        setCartelas(nextCartelas);
        const nextAtribuicoes = atribuicoes.map(a => ({
          ...a,
          cartelas: a.cartelas.map(c => numeros.includes(c.numero) ? { ...c, status: 'vendida' } : c)
        }));
        setAtribuicoes(nextAtribuicoes);
        const nextLojaCartelas = lojaCartelas.map(c => numeros.includes(c.numero_cartela) ? { ...c, status: 'vendida' } : c);
        setLojaCartelas(nextLojaCartelas);
        persistOfflineBingoState({
          vendas: nextVendas,
          cartelas: nextCartelas,
          atribuicoes: nextAtribuicoes,
          lojaCartelas: nextLojaCartelas,
        });
      }
      toast({ title: "Venda registrada!" });
      if (!isOfflineQueued(result)) {
        await loadVendas();
        await loadCartelas();
        await loadAtribuicoes();
      }
    } catch (error: unknown) {
      console.error('Error creating venda:', error);
      toast({
        title: "Erro ao registrar venda",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    }
  }, [sorteioAtivo, callApi, toast, loadVendas, loadCartelas, loadAtribuicoes]);

  const updateVenda = useCallback(async (id: string, updates: Partial<Venda>) => {
    if (!sorteioAtivo) return;
    
    try {
      const venda = vendas.find(v => v.id === id);
      if (!venda) return;
      
      const result = await callApi('updateVenda', { id, sorteio_id: sorteioAtivo.id, ...venda, ...updates });
      if (isOfflineQueued(result)) {
        setVendas(prev => prev.map(v => v.id === id ? { ...v, ...updates } : v));
      }
      toast({ title: "Venda atualizada!" });
      if (!isOfflineQueued(result)) {
        await loadVendas();
        await loadCartelas();
        await loadAtribuicoes();
      }
    } catch (error: unknown) {
      console.error('Error updating venda:', error);
      toast({
        title: "Erro ao atualizar venda",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    }
  }, [sorteioAtivo, vendas, callApi, toast, loadVendas, loadCartelas, loadAtribuicoes]);

  const deleteVenda = useCallback(async (id: string) => {
    try {
      const result = await callApi('deleteVenda', { id });
      if (isOfflineQueued(result)) {
        const venda = vendas.find(v => v.id === id);
        if (venda) {
          const numeros = parseCartelaList(venda.numeros_cartelas);
          const nextCartelas = cartelas.map(c => numeros.includes(c.numero) ? { ...c, status: 'disponivel' } : c);
          const nextLojaCartelas = lojaCartelas.map(c => numeros.includes(c.numero_cartela) ? { ...c, status: 'disponivel', comprador_nome: undefined, comprador_email: undefined, comprador_endereco: undefined, comprador_cidade: undefined, comprador_telefone: undefined } : c);
          const nextVendas = vendas.filter(v => v.id !== id);
          setCartelas(nextCartelas);
          setLojaCartelas(nextLojaCartelas);
          setVendas(nextVendas);
          persistOfflineBingoState({
            vendas: nextVendas,
            cartelas: nextCartelas,
            lojaCartelas: nextLojaCartelas,
          });
        }
      }
      toast({ title: "Venda excluída!" });
      if (!isOfflineQueued(result)) {
        await loadVendas();
        await loadCartelas();
        await loadAtribuicoes();
        await loadMinhaLoja();
      }
    } catch (error: unknown) {
      console.error('Error deleting venda:', error);
      toast({
        title: "Erro ao excluir venda",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    }
  }, [callApi, toast, loadVendas, loadCartelas, loadAtribuicoes, loadMinhaLoja, vendas]);

  // ================== CARTELA LAYOUTS ==================
  const loadCartelaLayouts = useCallback(async () => {
    if (!sorteioAtivo) return;
    try {
      const result = await callApi('getCartelaLayouts', { sorteio_id: sorteioAtivo.id });
      setCartelaLayouts(result.data || []);
    } catch (error: unknown) {
      console.error('Error loading cartela layouts:', error);
    }
  }, [sorteioAtivo, callApi]);

  const saveCartelaLayout = useCallback(async (nome: string, layoutData: string, cardsData: string): Promise<CartelaLayout> => {
    if (!sorteioAtivo) throw new Error('No active sorteio');
    const result = await callApi('saveCartelaLayout', {
      sorteio_id: sorteioAtivo.id, nome, layout_data: layoutData, cards_data: cardsData,
    });
    await loadCartelaLayouts();
    return result.data;
  }, [sorteioAtivo, callApi, loadCartelaLayouts]);

  const updateCartelaLayout = useCallback(async (id: string, nome: string, layoutData: string, cardsData: string) => {
    await callApi('updateCartelaLayout', { id, nome, layout_data: layoutData, cards_data: cardsData });
    await loadCartelaLayouts();
  }, [callApi, loadCartelaLayouts]);

  const deleteCartelaLayout = useCallback(async (id: string) => {
    await callApi('deleteCartelaLayout', { id });
    setCartelaLayouts(prev => prev.filter(l => l.id !== id));
  }, [callApi]);

  // ================== CARTELAS VALIDADAS ==================
  const loadCartelasValidadas = useCallback(async () => {
    if (!sorteioAtivo) return;
    try {
      const result = await callApi('getCartelasValidadas', { sorteio_id: sorteioAtivo.id });
      setCartelasValidadas(result.data || []);
    } catch (error: unknown) {
      console.error('Error loading cartelas validadas:', error);
    }
  }, [sorteioAtivo, callApi]);

  const validarCartela = useCallback(async (numero: number, compradorNome?: string) => {
    if (!sorteioAtivo) return;
    try {
      await callApi('validarCartela', { sorteio_id: sorteioAtivo.id, numero, comprador_nome: compradorNome || null });
      await loadCartelasValidadas();
    } catch (error: unknown) {
      console.error('Error validating cartela:', error);
      toast({ title: 'Erro ao validar cartela', description: getErrorMessage(error), variant: 'destructive' });
      throw error;
    }
  }, [sorteioAtivo, callApi, toast, loadCartelasValidadas]);

  const removerValidacaoCartela = useCallback(async (numero: number) => {
    if (!sorteioAtivo) return;
    try {
      await callApi('removerValidacaoCartela', { sorteio_id: sorteioAtivo.id, numero });
      await loadCartelasValidadas();
    } catch (error: unknown) {
      console.error('Error removing cartela validation:', error);
      toast({ title: 'Erro ao remover validação', description: getErrorMessage(error), variant: 'destructive' });
    }
  }, [sorteioAtivo, callApi, toast, loadCartelasValidadas]);

  const validarCartelas = useCallback(async (numeros: number[], compradorNome?: string) => {
    if (!sorteioAtivo) return;
    try {
      await callApi('validarCartelas', { sorteio_id: sorteioAtivo.id, numeros, comprador_nome: compradorNome || null });
      await loadCartelasValidadas();
    } catch (error: unknown) {
      console.error('Error validating cartelas:', error);
      toast({ title: 'Erro ao validar cartelas', description: getErrorMessage(error), variant: 'destructive' });
      throw error;
    }
  }, [sorteioAtivo, callApi, toast, loadCartelasValidadas]);

  const removerValidacaoLote = useCallback(async (numeros: number[]) => {
    if (!sorteioAtivo) return;
    try {
      await callApi('removerValidacaoLote', { sorteio_id: sorteioAtivo.id, numeros });
      await loadCartelasValidadas();
    } catch (error: unknown) {
      console.error('Error removing lote validation:', error);
      toast({ title: 'Erro ao remover lote', description: getErrorMessage(error), variant: 'destructive' });
    }
  }, [sorteioAtivo, callApi, toast, loadCartelasValidadas]);

  const removerTodasValidacoes = useCallback(async () => {
    if (!sorteioAtivo) return;
    try {
      await callApi('removerTodasValidacoes', { sorteio_id: sorteioAtivo.id });
      await loadCartelasValidadas();
    } catch (error: unknown) {
      console.error('Error removing all validations:', error);
      toast({ title: 'Erro ao remover validações', description: getErrorMessage(error), variant: 'destructive' });
    }
  }, [sorteioAtivo, callApi, toast, loadCartelasValidadas]);

  const updateCartelaValidada = useCallback(async (numero: number, compradorNome: string | null) => {
    if (!sorteioAtivo) return;
    try {
      await callApi('updateCartelaValidada', { sorteio_id: sorteioAtivo.id, numero, comprador_nome: compradorNome });
      await loadCartelasValidadas();
    } catch (error: unknown) {
      console.error('Error updating cartela validada:', error);
      toast({ title: 'Erro ao atualizar cartela', description: getErrorMessage(error), variant: 'destructive' });
    }
  }, [sorteioAtivo, callApi, toast, loadCartelasValidadas]);

  // ================== REFRESH & SET SORTEIO ATIVO ==================
  const refreshData = useCallback(async () => {
    if (!sorteioAtivo) return;
    
    setIsLoading(true);
    try {
      await Promise.all([
        loadVendedores(),
        loadCartelas(),
        loadAtribuicoes(),
        loadVendas(),
        loadCartelaLayouts(),
        loadCartelasValidadas(),
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [sorteioAtivo, loadVendedores, loadCartelas, loadAtribuicoes, loadVendas, loadCartelaLayouts, loadCartelasValidadas]);

  const setSorteioAtivo = useCallback((sorteio: Sorteio | null) => {
    setSorteioAtivoState(sorteio);
  }, []);

  // Load sorteio data when sorteio changes
  useEffect(() => {
    if (sorteioAtivo) {
      refreshData();
    } else {
      setVendedores([]);
      setCartelas([]);
      setAtribuicoes([]);
      setVendas([]);
      setCartelaLayouts([]);
      setCartelasValidadas([]);
    }
  }, [sorteioAtivo, refreshData]);

  // Load sorteios when user changes
  useEffect(() => {
    if (user) {
      loadSorteios();
    }
  }, [user, loadSorteios]);

  useEffect(() => {
    const handleSyncComplete = () => {
      if (sorteioAtivo) {
        void refreshData();
      } else {
        void loadSorteios();
      }
    };
    window.addEventListener(OFFLINE_EVENT_NAMES.syncComplete, handleSyncComplete);
    return () => window.removeEventListener(OFFLINE_EVENT_NAMES.syncComplete, handleSyncComplete);
  }, [sorteioAtivo, refreshData, loadSorteios]);

  const value: BingoContextType = {
    sorteioAtivo,
    sorteios,
    vendedores,
    cartelas,
    atribuicoes,
    vendas,
    cartelaLayouts,
    cartelasValidadas,
    currentTab,
    isLoading,
    filtrosVendedores,
    filtrosCartelas,
    filtrosAtribuicoes,
    filtrosVendas,
    setSorteioAtivo,
    setCurrentTab,
    setFiltrosVendedores,
    setFiltrosCartelas,
    setFiltrosAtribuicoes,
    setFiltrosVendas,
    loadSorteios,
    addSorteio,
    updateSorteio,
    deleteSorteio,
    exportSorteioBackup,
    importSorteioBackup,
    loadVendedores,
    addVendedor,
    updateVendedor,
    deleteVendedor,
    loadCartelas,
    gerarCartelas,
    atualizarStatusCartela,
    salvarNumerosCartelas,
    deleteCartela,
    createCartela,
    loadCartelaLayouts,
    saveCartelaLayout,
    updateCartelaLayout,
    deleteCartelaLayout,
    loadCartelasValidadas,
    validarCartela,
    validarCartelas,
    removerValidacaoCartela,
    removerValidacaoLote,
    removerTodasValidacoes,
    updateCartelaValidada,
    loadAtribuicoes,
    addAtribuicao,
    addAtribuicaoComProgresso,
    addCartelasToAtribuicaoComProgresso,
    addCartelasToAtribuicao,
    removeCartelaFromAtribuicao,
    updateCartelaStatusInAtribuicao,
    deleteAtribuicao,
    transferirCartelas,
    loadVendas,
    addVenda,
    updateVenda,
    deleteVenda,
    lojaCartelas,
    loadMinhaLoja,
    adicionarCartelaLoja,
    removerCartelaLoja,
    removerMultiplasCartelasLoja,
    atualizarPrecoLojaCartela,
    refreshData
  };
  
  return (
    <BingoContext.Provider value={value}>
      {children}
    </BingoContext.Provider>
  );
};

export const useBingo = () => {
  const context = useContext(BingoContext);
  if (context === undefined) {
    throw new Error('useBingo must be used within a BingoProvider');
  }
  return context;
};
