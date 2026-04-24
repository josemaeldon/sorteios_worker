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
  
  // State
  const [sorteioAtivo, setSorteioAtivoState] = useState<Sorteio | null>(null);
  const [sorteios, setSorteios] = useState<Sorteio[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [cartelas, setCartelas] = useState<Cartela[]>([]);
  const [atribuicoes, setAtribuicoes] = useState<Atribuicao[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [cartelaLayouts, setCartelaLayouts] = useState<CartelaLayout[]>([]);
  const [cartelasValidadas, setCartelasValidadas] = useState<CartelaValidada[]>([]);
  const [lojaCartelas, setLojaCartelas] = useState<LojaCartela[]>([]);
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

  // API call helper (funciona em qualquer modo)
  const callApi = useCallback(async (action: string, data: Record<string, unknown> = {}) => {
    return callBackendApi(action, data);
  }, []);

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
      await callApi('createSorteio', { ...sorteio, user_id: user.id, ...(targetUserId ? { target_user_id: targetUserId } : {}) });
      toast({ title: "Sorteio criado com sucesso!" });
      await loadSorteios();
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
      
      await callApi('updateSorteio', { id, ...sorteio, ...updates });
      toast({ title: "Sorteio atualizado!" });
      await loadSorteios();
      
      if (sorteioAtivo?.id === id) {
        setSorteioAtivoState(prev => prev ? { ...prev, ...updates } : null);
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
      await callApi('deleteSorteio', { id });
      toast({ title: "Sorteio excluído!" });
      await loadSorteios();
      
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
    } finally {
      setIsLoading(false);
    }
  }, [sorteioAtivo, callApi, toast, loadSorteios]);

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
      await callApi('createVendedor', { ...vendedor, sorteio_id: sorteioAtivo.id });
      toast({ title: "Vendedor criado!" });
      await loadVendedores();
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
      
      await callApi('updateVendedor', { id, ...vendedor, ...updates });
      toast({ title: "Vendedor atualizado!" });
      await loadVendedores();
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
      await callApi('deleteVendedor', { id });
      toast({ title: "Vendedor excluído!" });
      await loadVendedores();
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
      const result = await callApi('getCartelas', { sorteio_id: sorteioAtivo.id });
      setCartelas(result.data || []);
    } catch (error: unknown) {
      console.error('Error loading cartelas:', error);
    }
  }, [sorteioAtivo, callApi]);

  const gerarCartelas = useCallback(async (quantidade: number) => {
    if (!sorteioAtivo) return;
    
    try {
      setIsLoading(true);
      await callApi('gerarCartelas', { sorteio_id: sorteioAtivo.id, quantidade });
      toast({ title: `${quantidade} cartelas geradas!` });
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
      await callApi('updateCartela', { 
        sorteio_id: sorteioAtivo.id, 
        numero, 
        status, 
        vendedor_id: vendedorId || null 
      });
      await loadCartelas();
    } catch (error: unknown) {
      console.error('Error updating cartela:', error);
    }
  }, [sorteioAtivo, callApi, loadCartelas]);

  const salvarNumerosCartelas = useCallback(async (cartelas: { numero: number; numeros_grade: number[][] }[]) => {
    if (!sorteioAtivo) return;
    try {
      await callApi('salvarNumerosCartelas', { sorteio_id: sorteioAtivo.id, cartelas });
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
      await callApi('deleteCartela', { sorteio_id: sorteioAtivo.id, numero });
      toast({ title: "Cartela excluída!" });
      await loadCartelas();
    } catch (error: unknown) {
      console.error('Error deleting cartela:', error);
      toast({ title: "Erro ao excluir cartela", description: getErrorMessage(error), variant: "destructive" });
    }
  }, [sorteioAtivo, callApi, toast, loadCartelas]);

  const createCartela = useCallback(async (numerosGrade: number[]) => {
    if (!sorteioAtivo) return;
    try {
      await callApi('createCartela', { sorteio_id: sorteioAtivo.id, numeros_grade: numerosGrade });
      toast({ title: "Cartela criada!" });
      await loadCartelas();
    } catch (error: unknown) {
      console.error('Error creating cartela:', error);
      toast({ title: "Erro ao criar cartela", description: getErrorMessage(error), variant: "destructive" });
    }
  }, [sorteioAtivo, callApi, toast, loadCartelas]);

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
      await callApi('createAtribuicao', { 
        sorteio_id: sorteioAtivo.id, 
        vendedor_id: vendedorId, 
        cartelas: cartelasNums 
      });
      toast({ title: "Atribuição criada!" });
      await loadAtribuicoes();
      await loadCartelas();
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

    await loadAtribuicoes();
    await loadCartelas();
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
    await loadAtribuicoes();
    await loadCartelas();
  }, [sorteioAtivo, callApi, loadAtribuicoes, loadCartelas]);

  const addCartelasToAtribuicao = useCallback(async (atribuicaoId: string, vendedorId: string, cartelasNums: number[]) => {
    if (!sorteioAtivo) return;
    
    try {
      await callApi('addCartelasToAtribuicao', { 
        atribuicao_id: atribuicaoId,
        vendedor_id: vendedorId,
        sorteio_id: sorteioAtivo.id,
        cartelas: cartelasNums 
      });
      toast({ title: "Cartelas adicionadas!" });
      await loadAtribuicoes();
      await loadCartelas();
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
      await callApi('removeCartelaFromAtribuicao', { 
        atribuicao_id: atribuicaoId,
        sorteio_id: sorteioAtivo.id,
        numero_cartela: numeroCartela 
      });
      toast({ title: "Cartela removida!" });
      await loadAtribuicoes();
      await loadCartelas();
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
      await callApi('updateCartelaStatusInAtribuicao', { 
        atribuicao_id: atribuicaoId,
        sorteio_id: sorteioAtivo.id,
        numero_cartela: numeroCartela,
        status
      });
      await loadAtribuicoes();
      await loadCartelas();
    } catch (error: unknown) {
      console.error('Error updating cartela status:', error);
    }
  }, [sorteioAtivo, callApi, loadAtribuicoes, loadCartelas]);

  const deleteAtribuicao = useCallback(async (id: string) => {
    if (!sorteioAtivo) return;
    
    try {
      await callApi('deleteAtribuicao', { atribuicao_id: id, sorteio_id: sorteioAtivo.id });
      toast({ title: "Atribuição excluída!" });
      await loadAtribuicoes();
      await loadCartelas();
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
      await callApi('transferirCartelas', { 
        atribuicao_origem_id: atribuicaoOrigemId,
        sorteio_id: sorteioAtivo.id,
        numeros_cartelas: numerosCartelas,
        vendedor_destino_id: vendedorDestinoId
      });
      toast({ title: `${numerosCartelas.length} cartela(s) transferida(s)!` });
      await loadAtribuicoes();
      await loadCartelas();
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
    setLojaCartelas(prev => {
      const idx = prev.findIndex(c => c.card_set_id === cardSetId && c.numero_cartela === numeroCartela);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = result.data;
        return updated;
      }
      return [...prev, result.data];
    });
    return result.data;
  }, [callApi]);

  const removerCartelaLoja = useCallback(async (id: string) => {
    await callApi('removerCartelaLoja', { id });
    setLojaCartelas(prev => prev.filter(c => c.id !== id));
  }, [callApi]);

  const removerMultiplasCartelasLoja = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    await callApi('removerMultiplasCartelasLoja', { ids });
    setLojaCartelas(prev => prev.filter(c => !ids.includes(c.id)));
  }, [callApi]);

  const atualizarPrecoLojaCartela = useCallback(async (id: string, preco: number) => {
    await callApi('atualizarPrecoLojaCartela', { id, preco });
    setLojaCartelas(prev => prev.map(c => c.id === id ? { ...c, preco } : c));
  }, [callApi]);

  const addVenda = useCallback(async (venda: Omit<Venda, 'id' | 'created_at' | 'updated_at'>) => {
    if (!sorteioAtivo) return;
    
    try {
      await callApi('createVenda', { ...venda, sorteio_id: sorteioAtivo.id });
      toast({ title: "Venda registrada!" });
      await loadVendas();
      await loadCartelas();
      await loadAtribuicoes();
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
      
      await callApi('updateVenda', { id, sorteio_id: sorteioAtivo.id, ...venda, ...updates });
      toast({ title: "Venda atualizada!" });
      await loadVendas();
      await loadCartelas();
      await loadAtribuicoes();
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
      await callApi('deleteVenda', { id });
      toast({ title: "Venda excluída!" });
      await loadVendas();
      await loadCartelas();
      await loadAtribuicoes();
      await loadMinhaLoja();
    } catch (error: unknown) {
      console.error('Error deleting venda:', error);
      toast({
        title: "Erro ao excluir venda",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    }
  }, [callApi, toast, loadVendas, loadCartelas, loadAtribuicoes, loadMinhaLoja]);

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
