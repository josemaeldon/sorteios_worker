import React, { useCallback, useState } from 'react';
import { useBingo } from '@/contexts/BingoContext';
import { Grid3X3, Search, Filter, Eraser, User, Loader2, Edit2, Trash2, Printer, Plus, RefreshCw, Save, X, CheckSquare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { formatarNumeroCartela, getStatusLabel } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Cartela } from '@/types/bingo';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { generateBingoGrid, exportBingoCardsPDF, DEFAULT_LAYOUT, BINGO_COLS, A4_W_MM, A4_H_MM } from '@/lib/utils/bingoCardUtils';
import { Checkbox } from '@/components/ui/checkbox';
import { callApi } from '@/lib/apiClient';

// ─── BINGO column ranges (B I N G O) ─────────────────────────────────────────
const COL_RANGES = [
  { min: 1,  max: 15 },
  { min: 16, max: 30 },
  { min: 31, max: 45 },
  { min: 46, max: 60 },
  { min: 61, max: 75 },
] as const;

const generateRandomFlat = () => generateBingoGrid().flat();

const validateGrid = (flat: number[]): string | null => {
  if (flat.length !== 25) return 'A cartela deve ter 25 números.';
  for (let i = 0; i < 25; i++) {
    const col = i % 5;
    const { min, max } = COL_RANGES[col];
    if (!flat[i] || flat[i] < min || flat[i] > max)
      return `Coluna ${BINGO_COLS[col]}: número deve ser entre ${min} e ${max}.`;
  }
  if (new Set(flat).size !== 25) return 'Todos os 25 números devem ser únicos.';
  return null;
};

// ─── Shared grid editor ───────────────────────────────────────────────────────
const GridEditor: React.FC<{
  grid: number[];
  onChange: (i: number, v: number) => void;
}> = ({ grid, onChange }) => (
  <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
    {BINGO_COLS.map((col) => (
      <div key={col} className="flex items-center justify-center rounded bg-primary text-primary-foreground text-xs font-bold h-7">
        {col}
      </div>
    ))}
    {grid.map((num, i) => {
      const { min, max } = COL_RANGES[i % 5];
      const valid = num >= min && num <= max;
      return (
        <input
          key={i}
          type="number"
          min={min}
          max={max}
          value={num || ''}
          onChange={(e) => onChange(i, parseInt(e.target.value) || 0)}
          className={cn(
            'w-full text-center text-sm font-semibold rounded border h-8 bg-background focus:outline-none focus:ring-1',
            valid ? 'border-border focus:ring-primary' : 'border-destructive bg-destructive/10 focus:ring-destructive',
          )}
        />
      );
    })}
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

/** Parse a validation input string that can contain ranges (1-50), single numbers (42),
 *  and comma-separated combinations (1-5,10,15-20). Returns sorted unique numbers. */
const parseValidacaoInput = (input: string): number[] | null => {
  const parts = input.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const nums: number[] = [];
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const from = parseInt(rangeMatch[1]);
      const to = parseInt(rangeMatch[2]);
      if (isNaN(from) || isNaN(to) || from > to) return null;
      for (let n = from; n <= to; n++) nums.push(n);
    } else {
      const n = parseInt(part);
      if (isNaN(n) || n < 1) return null;
      nums.push(n);
    }
  }
  return [...new Set(nums)].sort((a, b) => a - b);
};

const LOTE_STORAGE_KEY = 'bingo_tamanho_lote';

const CartelasTab: React.FC = () => {
  const {
    sorteioAtivo,
    vendedores,
    filtrosCartelas,
    setFiltrosCartelas,
    salvarNumerosCartelas,
    deleteCartela,
    createCartela,
    cartelasValidadas,
    loadCartelasValidadas,
    validarCartela,
    validarCartelas,
    removerValidacaoCartela,
    removerValidacaoLote,
    removerTodasValidacoes,
    updateCartelaValidada,
    updateSorteio,
    atualizarStatusCartela,
    loadAtribuicoes,
  } = useBingo();
  const { toast } = useToast();

  // ─── Sub-tab ───────────────────────────────────────────────────────────────
  const [subTab, setSubTab] = useState<'lista' | 'validacao'>('lista');

  // ─── Cartela view / edit state ─────────────────────────────────────────────
  const [selectedCartela, setSelectedCartela] = useState<Cartela | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editGrids, setEditGrids] = useState<number[][]>([Array(25).fill(0)]);
  const [isSaving, setIsSaving] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [forcedStatus, setForcedStatus] = useState<Cartela['status']>('disponivel');
  const [isForcingStatus, setIsForcingStatus] = useState(false);
  const [isLoadingCartelaDetalhe, setIsLoadingCartelaDetalhe] = useState(false);

  // ─── New-cartela modal state ───────────────────────────────────────────────
  const [showNewModal, setShowNewModal] = useState(false);
  const [newGrid, setNewGrid] = useState<number[]>(Array(25).fill(0));
  const [isSavingNew, setIsSavingNew] = useState(false);

  // ─── Validation state ──────────────────────────────────────────────────────
  const [validacaoNumero, setValidacaoNumero] = useState('');
  const [validacaoNome, setValidacaoNome] = useState('');
  const [isValidando, setIsValidando] = useState(false);
  const [nomeObrigatorio, setNomeObrigatorio] = useState(false);
  const [tamanhoLote, setTamanhoLoteState] = useState<number>(() => {
    const saved = localStorage.getItem(LOTE_STORAGE_KEY);
    if (saved !== null) {
      const parsed = parseInt(saved);
      return isNaN(parsed) ? 50 : Math.max(1, parsed);
    }
    return 50;
  });
  const [isSavingLote, setIsSavingLote] = useState(false);

  // Sync tamanhoLote from database when sorteio changes
  React.useEffect(() => {
    if (sorteioAtivo?.tamanho_lote != null) {
      setTamanhoLoteState(sorteioAtivo.tamanho_lote);
    }
  }, [sorteioAtivo?.id, sorteioAtivo?.tamanho_lote]);

  const handleSaveTamanhoLote = async () => {
    if (!sorteioAtivo) return;
    setIsSavingLote(true);
    try {
      await updateSorteio(sorteioAtivo.id, { tamanho_lote: tamanhoLote });
    } finally {
      setIsSavingLote(false);
    }
  };

  const setTamanhoLote = (value: number) => {
    const clamped = Math.max(1, value);
    setTamanhoLoteState(clamped);
  };

  // ─── Delete lote confirmation ──────────────────────────────────────────────
  const [loteToDelete, setLoteToDelete] = useState<number[] | null>(null);
  const [isDeletingLote, setIsDeletingLote] = useState(false);

  // ─── Remove all validations confirmation ──────────────────────────────────
  const [showRemoverTodas, setShowRemoverTodas] = useState(false);
  const [isRemovingTodas, setIsRemovingTodas] = useState(false);

  // ─── Edit validated cartela ────────────────────────────────────────────────
  const [editingValidada, setEditingValidada] = useState<{ numero: number; nome: string } | null>(null);
  const [isSavingValidada, setIsSavingValidada] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingLista, setIsLoadingLista] = useState(false);
  const [cartelasPagina, setCartelasPagina] = useState<Cartela[]>([]);
  const [totalFiltrado, setTotalFiltrado] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [contadores, setContadores] = useState({
    disponivel: 0,
    atribuida: 0,
    vendida: 0,
    devolvida: 0,
  });
  const PAGE_SIZE = 600;

  // Group validated cartelas into batches for display (must be before early return)
  const lotes = React.useMemo(() => {
    const size = Math.max(1, tamanhoLote);
    const result: typeof cartelasValidadas[] = [];
    for (let i = 0; i < cartelasValidadas.length; i += size) {
      result.push(cartelasValidadas.slice(i, i + size));
    }
    return result;
  }, [cartelasValidadas, tamanhoLote]);

  if (!sorteioAtivo) {
    return (
      <div className="text-center py-12">
        <Grid3X3 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">Cartelas</h2>
        <p className="text-muted-foreground">Selecione um sorteio para visualizar as cartelas</p>
      </div>
    );
  }

  const loadCartelasPagina = useCallback(async () => {
    if (!sorteioAtivo || subTab !== 'lista') return;
    setIsLoadingLista(true);
    try {
      const result = await callApi('getCartelas', {
        sorteio_id: sorteioAtivo.id,
        include_grades: false,
        page: currentPage,
        page_size: PAGE_SIZE,
        busca: filtrosCartelas.busca,
        status: filtrosCartelas.status,
        vendedor_id: filtrosCartelas.vendedor,
      });
      setCartelasPagina(result?.data || []);
      setTotalFiltrado(Number(result?.pagination?.total || 0));
      setTotalPaginas(Math.max(1, Number(result?.pagination?.total_pages || 1)));
      if (result?.counters) {
        setContadores({
          disponivel: Number(result.counters.disponivel || 0),
          atribuida: Number(result.counters.atribuida || 0),
          vendida: Number(result.counters.vendida || 0),
          devolvida: Number(result.counters.devolvida || 0),
        });
      }
    } catch (error) {
      console.error('Error loading paged cartelas:', error);
      toast({ title: 'Erro ao carregar cartelas', description: 'Não foi possível carregar a lista paginada.', variant: 'destructive' });
    } finally {
      setIsLoadingLista(false);
    }
  }, [sorteioAtivo, subTab, currentPage, filtrosCartelas, toast]);

  const pageStart = (currentPage - 1) * PAGE_SIZE;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [filtrosCartelas.busca, filtrosCartelas.status, filtrosCartelas.vendedor, sorteioAtivo?.id]);

  React.useEffect(() => {
    if (currentPage > totalPaginas) {
      setCurrentPage(totalPaginas);
    }
  }, [currentPage, totalPaginas]);

  React.useEffect(() => {
    loadCartelasPagina();
  }, [loadCartelasPagina]);

  const limparFiltros = () => setFiltrosCartelas({ busca: '', status: 'todos', vendedor: 'todos' });

  const getCartelaStatusClass = (status: string) => {
    switch (status) {
      case 'disponivel':  return 'bg-card border-border text-muted-foreground';
      case 'ativa':       return 'status-atribuida';
      case 'vendida':     return 'status-vendida';
      case 'devolvida':   return 'status-devolvida';
      case 'extraviada':  return 'bg-black border-black text-white';
      default:            return 'bg-card border-border';
    }
  };

  const getTooltip = (cartela: Cartela) => {
    const vendedor = cartela.vendedor_id ? vendedores.find(v => v.id === cartela.vendedor_id) : null;
    const nome = vendedor?.nome || cartela.vendedor_nome || cartela.comprador_nome || 'N/A';
    switch (cartela.status) {
      case 'disponivel':  return 'Disponível';
      case 'ativa':       return `Atribuída: ${nome}`;
      case 'vendida':     return `Vendida: ${nome}`;
      case 'devolvida':   return 'Devolvida';
      case 'extraviada':  return 'Extraviada';
      default:            return '';
    }
  };

  // ─── Edit handlers ─────────────────────────────────────────────────────────
  const openCartela = async (cartela: Cartela) => {
    setSelectedCartela(cartela);
    setForcedStatus(cartela.status);
    setEditMode(false);

    if (!sorteioAtivo || (cartela.numeros_grade && cartela.numeros_grade.length > 0)) return;

    setIsLoadingCartelaDetalhe(true);
    try {
      const result = await callApi('getCartelaDetalhe', { sorteio_id: sorteioAtivo.id, numero: cartela.numero });
      if (result?.data) {
        setSelectedCartela((prev) => {
          if (!prev || prev.numero !== cartela.numero) return prev;
          return { ...prev, ...result.data };
        });
      }
    } catch (error) {
      console.error('Error loading cartela details:', error);
      toast({ title: 'Erro ao carregar detalhes da cartela', variant: 'destructive' });
    } finally {
      setIsLoadingCartelaDetalhe(false);
    }
  };

  const handleForceStatus = async () => {
    if (!selectedCartela || forcedStatus === selectedCartela.status) return;
    setIsForcingStatus(true);
    try {
      const vendedorId = forcedStatus === 'disponivel' || forcedStatus === 'devolvida'
        ? undefined
        : selectedCartela.vendedor_id || undefined;
      await atualizarStatusCartela(selectedCartela.numero, forcedStatus, vendedorId);
      await loadAtribuicoes();
      setSelectedCartela(prev => prev ? ({
        ...prev,
        status: forcedStatus,
        vendedor_id: forcedStatus === 'disponivel' || forcedStatus === 'devolvida'
          ? null
          : prev.vendedor_id
      }) : null);
      await loadCartelasPagina();
      toast({
        title: "Status atualizado",
        description: `Cartela ${formatarNumeroCartela(selectedCartela.numero)} alterada para ${getStatusLabel(forcedStatus)}.`
      });
    } finally {
      setIsForcingStatus(false);
    }
  };

  const openEditMode = () => {
    const current = selectedCartela?.numeros_grade;
    if (current && current.length > 0) {
      setEditGrids(current.map(flat => [...flat]));
    } else {
      const numeroPremios = Math.max(1, sorteioAtivo?.premios?.length ?? 1);
      setEditGrids(Array.from({ length: numeroPremios }, () => generateRandomFlat()));
    }
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedCartela) return;
    for (let i = 0; i < editGrids.length; i++) {
      const error = validateGrid(editGrids[i]);
      if (error) {
        toast({ title: `Prêmio ${i + 1}: dados inválidos`, description: error, variant: 'destructive' });
        return;
      }
    }
    setIsSaving(true);
    try {
      await salvarNumerosCartelas([{ numero: selectedCartela.numero, numeros_grade: editGrids }]);
      setSelectedCartela(prev => prev ? { ...prev, numeros_grade: editGrids } : null);
      setEditMode(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = async () => {
    if (!selectedCartela?.numeros_grade) return;
    setIsPrinting(true);
    try {
      // numeros_grade is now number[][] - one flat 25-number array per prize
      const grids = selectedCartela.numeros_grade.map(flat =>
        Array.from({ length: 5 }, (_, row) => flat.slice(row * 5, row * 5 + 5))
      );
      await exportBingoCardsPDF(
        [{ cartelaNumero: selectedCartela.numero, grids }],
        DEFAULT_LAYOUT,
        sorteioAtivo?.nome ?? 'bingo',
        undefined,
        sorteioAtivo?.papel_largura ?? A4_W_MM,
        sorteioAtivo?.papel_altura ?? A4_H_MM,
      );
    } catch {
      toast({ title: 'Erro ao exportar PDF', variant: 'destructive' });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCartela) return;
    setIsDeleting(true);
    try {
      await deleteCartela(selectedCartela.numero);
      setSelectedCartela(null);
      setShowDeleteConfirm(false);
      await loadCartelasPagina();
    } finally {
      setIsDeleting(false);
    }
  };

  // ─── New cartela handlers ──────────────────────────────────────────────────
  const openNewModal = () => {
    setNewGrid(generateRandomFlat());
    setShowNewModal(true);
  };

  const handleCreateCartela = async () => {
    const error = validateGrid(newGrid);
    if (error) { toast({ title: 'Dados inválidos', description: error, variant: 'destructive' }); return; }
    setIsSavingNew(true);
    try {
      await createCartela(newGrid);
      await loadCartelasPagina();
      setShowNewModal(false);
    } finally {
      setIsSavingNew(false);
    }
  };

  // ─── Validation handlers ──────────────────────────────────────────────────
  const handleValidarCartela = async () => {
    const trimmed = validacaoNumero.trim();
    if (!trimmed) {
      toast({ title: 'Entrada inválida', description: 'Digite um número, faixa (ex: 1-50) ou lista (ex: 1,2,5).', variant: 'destructive' });
      return;
    }
    if (nomeObrigatorio && !validacaoNome.trim()) {
      toast({ title: 'Nome obrigatório', description: 'Preencha o Nome do Comprador antes de validar.', variant: 'destructive' });
      return;
    }
    const numeros = parseValidacaoInput(trimmed);
    if (!numeros || numeros.length === 0) {
      toast({ title: 'Entrada inválida', description: 'Formato inválido. Use número único (42), faixa (1-50) ou lista separada por vírgula (1,2,5).', variant: 'destructive' });
      return;
    }
    setIsValidando(true);
    try {
      if (numeros.length === 1) {
        await validarCartela(numeros[0], validacaoNome.trim() || undefined);
        toast({ title: `Cartela ${formatarNumeroCartela(numeros[0])} validada!` });
      } else {
        await validarCartelas(numeros, validacaoNome.trim() || undefined);
        toast({ title: `${numeros.length} cartelas validadas!` });
      }
      setValidacaoNumero('');
      setValidacaoNome('');
    } catch {
      // error handled in context
    } finally {
      setIsValidando(false);
    }
  };

  const handleDeletarLote = async () => {
    if (!loteToDelete) return;
    setIsDeletingLote(true);
    try {
      await removerValidacaoLote(loteToDelete);
      toast({ title: `Lote de ${loteToDelete.length} cartela(s) removido!` });
      setLoteToDelete(null);
    } finally {
      setIsDeletingLote(false);
    }
  };

  const handleRemoverTodas = async () => {
    setIsRemovingTodas(true);
    try {
      await removerTodasValidacoes();
      toast({ title: 'Todas as validações foram removidas!' });
      setShowRemoverTodas(false);
    } finally {
      setIsRemovingTodas(false);
    }
  };

  const handleSaveValidada = async () => {
    if (!editingValidada) return;
    setIsSavingValidada(true);
    try {
      await updateCartelaValidada(editingValidada.numero, editingValidada.nome.trim() || null);
      toast({ title: `Cartela ${formatarNumeroCartela(editingValidada.numero)} atualizada!` });
      setEditingValidada(null);
    } finally {
      setIsSavingValidada(false);
    }
  };

  // ─── Permission helpers ────────────────────────────────────────────────────
  const canEdit   = selectedCartela?.status !== 'vendida';
  const canDelete = selectedCartela?.status === 'disponivel';

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Grid3X3 className="w-6 h-6" />
            Cartelas - {sorteioAtivo.nome}
          </h2>
          <p className="text-muted-foreground mt-1">
            {totalFiltrado} cartelas
            {totalFiltrado !== sorteioAtivo.quantidade_cartelas && (
              <span className="text-xs ml-1">({sorteioAtivo.quantidade_cartelas} configuradas)</span>
            )}
          </p>
        </div>
        {subTab === 'lista' && (
          <Button onClick={openNewModal} className="gap-2">
            <Plus className="w-4 h-4" />
            Nova Cartela
          </Button>
        )}
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setSubTab('lista')}
          className={cn(
            'px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
            subTab === 'lista'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Grid3X3 className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          Lista de Cartelas
        </button>
        <button
          onClick={() => { setSubTab('validacao'); loadCartelasValidadas(); }}
          className={cn(
            'px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
            subTab === 'validacao'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <CheckSquare className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          Validação
          {cartelasValidadas.length > 0 && (
            <span className="ml-1.5 bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5">
              {cartelasValidadas.length}
            </span>
          )}
        </button>
      </div>

      {subTab === 'lista' ? (
        <>
          {/* Estatísticas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="stat-card">
              <div className="text-sm text-muted-foreground">Disponíveis</div>
              <div className="text-2xl font-bold text-foreground">
                {contadores.disponivel}
                {contadores.devolvida > 0 && (
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    (+{contadores.devolvida} devolvidas)
                  </span>
                )}
              </div>
            </div>
            <div className="stat-card">
              <div className="text-sm text-muted-foreground">Atribuídas</div>
              <div className="text-2xl font-bold text-warning">{contadores.atribuida}</div>
            </div>
            <div className="stat-card">
              <div className="text-sm text-muted-foreground">Vendidas</div>
              <div className="text-2xl font-bold text-success">{contadores.vendida}</div>
            </div>
            <div className="stat-card">
              <div className="text-sm text-muted-foreground">Devolvidas</div>
              <div className="text-2xl font-bold text-danger">{contadores.devolvida}</div>
            </div>
          </div>

          {/* Filtros */}
          <div className="filter-bar">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground flex items-center gap-1">
                  <Search className="w-4 h-4" />
                  Número da Cartela
                </label>
                <Input
                  placeholder="Digite o número..."
                  value={filtrosCartelas.busca}
                  onChange={(e) => setFiltrosCartelas({ ...filtrosCartelas, busca: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground flex items-center gap-1">
                  <Filter className="w-4 h-4" />
                  Status
                </label>
                <Select
                  value={filtrosCartelas.status}
                  onValueChange={(value: string) => setFiltrosCartelas({ ...filtrosCartelas, status: value })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="disponivel">Disponíveis</SelectItem>
                    <SelectItem value="ativa">Atribuídas</SelectItem>
                    <SelectItem value="vendida">Vendidas</SelectItem>
                    <SelectItem value="devolvida">Devolvidas</SelectItem>
                    <SelectItem value="extraviada">Extraviadas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground flex items-center gap-1">
                  <User className="w-4 h-4" />
                  Vendedor
                </label>
                <Select
                  value={filtrosCartelas.vendedor}
                  onValueChange={(value) => setFiltrosCartelas({ ...filtrosCartelas, vendedor: value })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {vendedores.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={limparFiltros} className="w-full gap-2">
                  <Eraser className="w-4 h-4" />
                  Limpar
                </Button>
              </div>
            </div>
          </div>

          {/* Legenda */}
          <div className="bg-card p-4 rounded-xl border border-border mb-6">
            <h3 className="font-semibold text-foreground mb-3">Legenda:</h3>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-card border-2 border-border" />
                <span className="text-sm text-muted-foreground">Disponível</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded status-atribuida" />
                <span className="text-sm text-muted-foreground">Atribuída</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded status-vendida" />
                <span className="text-sm text-muted-foreground">Vendida</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded status-devolvida" />
                <span className="text-sm text-muted-foreground">Devolvida</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-black border border-black" />
                <span className="text-sm text-muted-foreground">Extraviada</span>
              </div>
            </div>
          </div>

          {/* Grid de Cartelas */}
          <div className="bg-card p-6 rounded-xl border border-border">
            {isLoadingLista ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Carregando cartelas...</span>
              </div>
            ) : (
              <div className="flex flex-wrap justify-start">
                {cartelasPagina.map((cartela) => (
                  <div
                    key={cartela.numero}
                    className={cn(
                      'cartela-item cursor-pointer hover:ring-2 hover:ring-primary',
                      getCartelaStatusClass(cartela.status),
                    )}
                    onClick={() => openCartela(cartela)}
                  >
                    {formatarNumeroCartela(cartela.numero)}
                    <div className="cartela-tooltip">{getTooltip(cartela)}</div>
                  </div>
                ))}
                {totalFiltrado === 0 && (
                  <div className="w-full text-center py-12">
                    <Filter className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-lg text-muted-foreground">Nenhuma cartela encontrada</p>
                    <p className="text-sm text-muted-foreground mt-2">Tente ajustar os filtros de busca</p>
                  </div>
                )}
              </div>
            )}

            {!isLoadingLista && totalFiltrado > 0 && (
              <div className="mt-5 border-t border-border pt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  Exibindo {pageStart + 1} a {Math.min(pageStart + PAGE_SIZE, totalFiltrado)} de {totalFiltrado} cartelas
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">Página {currentPage} de {totalPaginas}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={currentPage >= totalPaginas}
                    onClick={() => setCurrentPage((p) => Math.min(totalPaginas, p + 1))}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* ── Validation sub-tab ── */
        <div className="space-y-6">
          {/* Add validation form */}
          <div className="bg-card p-6 rounded-xl border border-border">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <CheckSquare className="w-5 h-5" />
              Validar Cartela
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Adicione os números das cartelas validadas. O sorteio considerará apenas as cartelas validadas aqui.
            </p>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Número(s) da Cartela *</label>
                <Input
                  type="text"
                  placeholder="Ex: 42 | 1-50 | 1,5,10 | 1-10,20"
                  value={validacaoNumero}
                  onChange={(e) => setValidacaoNumero(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleValidarCartela()}
                  className="w-56"
                />
                <p className="text-xs text-muted-foreground">
                  Número único, faixa (1-50) ou lista separada por vírgula
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Nome do Comprador {nomeObrigatorio ? '*' : '(opcional)'}
                </label>
                <Input
                  placeholder="Nome de quem comprou..."
                  value={validacaoNome}
                  onChange={(e) => setValidacaoNome(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleValidarCartela()}
                  className="w-56"
                />
              </div>
              <Button onClick={handleValidarCartela} disabled={isValidando} className="gap-2">
                {isValidando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Validar
              </Button>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Checkbox
                id="nome-obrigatorio"
                checked={nomeObrigatorio}
                onCheckedChange={(checked) => setNomeObrigatorio(!!checked)}
              />
              <label htmlFor="nome-obrigatorio" className="text-sm font-medium text-foreground cursor-pointer select-none">
                Nome do Comprador obrigatório
              </label>
            </div>
          </div>

          {/* Batch size + summary */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">Cartelas por lote:</span>
              <Input
                type="number"
                min={1}
                max={500}
                value={tamanhoLote}
                onChange={(e) => setTamanhoLote(Math.max(1, parseInt(e.target.value) || tamanhoLote))}
                className="w-20"
                disabled={cartelasValidadas.length > 0}
                title={cartelasValidadas.length > 0 ? 'Exclua os números validados para alterar o tamanho do lote' : undefined}
              />
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={handleSaveTamanhoLote}
                disabled={cartelasValidadas.length > 0 || isSavingLote}
                title={cartelasValidadas.length > 0 ? 'Exclua os números validados para alterar o tamanho do lote' : 'Salvar configuração de lote'}
              >
                {isSavingLote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {cartelasValidadas.length} cartela(s) validada(s)
                {lotes.length > 0 && ` em ${lotes.length} lote(s)`}
              </span>
              {cartelasValidadas.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1"
                  onClick={() => setShowRemoverTodas(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remover Todas
                </Button>
              )}
            </div>
          </div>

          {/* Batches display */}
          {cartelasValidadas.length === 0 ? (
            <div className="bg-card p-12 rounded-xl border border-border text-center">
              <CheckSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
              <p className="text-lg text-muted-foreground">Nenhuma cartela validada</p>
              <p className="text-sm text-muted-foreground mt-1">Use o formulário acima para validar cartelas</p>
            </div>
          ) : (
            <div className="space-y-4">
              {lotes.map((lote, loteIdx) => (
                <div key={loteIdx} className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">
                      Lote {loteIdx + 1}
                      <span className="ml-2 text-muted-foreground font-normal text-xs">
                        ({lote.length} cartela{lote.length !== 1 ? 's' : ''})
                      </span>
                    </span>
                    <button
                      onClick={() => setLoteToDelete(lote.map(cv => cv.numero))}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
                      title="Excluir lote inteiro"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir lote
                    </button>
                  </div>
                  <div className="p-4">
                    <div className="flex flex-wrap gap-2">
                      {lote.map((cv) => (
                        <div
                          key={cv.numero}
                          className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-3 py-1.5 group"
                        >
                          <span className="text-sm font-semibold text-foreground">
                            {formatarNumeroCartela(cv.numero)}
                          </span>
                          {cv.comprador_nome && (
                            <span className="text-xs text-muted-foreground">— {cv.comprador_nome}</span>
                          )}
                          <button
                            onClick={() => setEditingValidada({ numero: cv.numero, nome: cv.comprador_nome || '' })}
                            className="ml-1 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                            title="Editar nome do comprador"
                            aria-label="Editar nome do comprador"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => removerValidacaoCartela(cv.numero)}
                            className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                            title="Remover validação"
                            aria-label="Remover validação"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal: View / Edit cartela ── */}
      <Dialog
        open={!!selectedCartela}
        onOpenChange={(open) => { if (!open) { setSelectedCartela(null); setEditMode(false); } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Cartela {selectedCartela ? formatarNumeroCartela(selectedCartela.numero) : ''}</span>
              <span className={cn(
                'text-xs font-medium px-2 py-0.5 rounded-full border',
                selectedCartela?.status === 'disponivel'  ? 'bg-muted text-muted-foreground border-border' :
                selectedCartela?.status === 'ativa'       ? 'status-atribuida' :
                selectedCartela?.status === 'vendida'     ? 'status-vendida' :
                selectedCartela?.status === 'extraviada'  ? 'bg-black text-white border-black' :
                'status-devolvida',
              )}>
                {getStatusLabel(selectedCartela?.status ?? '')}
              </span>
            </DialogTitle>
            {isLoadingCartelaDetalhe && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando detalhes da cartela...
              </div>
            )}
            {selectedCartela?.comprador_nome && selectedCartela.status === 'vendida' && (
              <p className="text-sm text-muted-foreground mt-1">Comprador: <strong>{selectedCartela.comprador_nome}</strong></p>
            )}
          </DialogHeader>

          {!editMode && selectedCartela && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Forçar status da cartela</p>
              <div className="flex gap-2">
                <Select
                  value={forcedStatus}
                  onValueChange={(value: Cartela['status']) => setForcedStatus(value)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disponivel">Disponível</SelectItem>
                    <SelectItem value="ativa">Atribuída</SelectItem>
                    <SelectItem value="vendida">Vendida</SelectItem>
                    <SelectItem value="devolvida">Devolvida</SelectItem>
                    <SelectItem value="extraviada">Extraviada</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={handleForceStatus}
                  disabled={isForcingStatus || forcedStatus === selectedCartela.status}
                >
                  {isForcingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Aplicar'}
                </Button>
              </div>
            </div>
          )}

          {editMode ? (
            /* ── Edit mode ── */
            <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
              {editGrids.map((grid, pIdx) => (
                <div key={pIdx} className="space-y-2">
                  {editGrids.length > 1 && (
                    <p className="text-xs font-semibold text-muted-foreground">Prêmio {pIdx + 1}</p>
                  )}
                  <GridEditor
                    grid={grid}
                    onChange={(i, v) => setEditGrids(prev => {
                      const gs = prev.map(g => [...g]);
                      gs[pIdx][i] = v;
                      return gs;
                    })}
                  />
                  <Button
                    size="sm" variant="outline" className="w-full gap-2"
                    onClick={() => setEditGrids(prev => { const gs = prev.map(g => [...g]); gs[pIdx] = generateRandomFlat(); return gs; })}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Gerar Aleatório {editGrids.length > 1 ? `(Prêmio ${pIdx + 1})` : ''}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            /* ── View mode ── */
            selectedCartela?.numeros_grade ? (
              <div className="space-y-3">
                {selectedCartela.numeros_grade.map((flat, premioIdx) => (
                  <div key={premioIdx}>
                    {selectedCartela.numeros_grade!.length > 1 && (
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Prêmio {premioIdx + 1}</p>
                    )}
                    <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                      {BINGO_COLS.map((col) => (
                        <div key={col} className="flex items-center justify-center rounded bg-primary text-primary-foreground text-xs font-bold h-7">
                          {col}
                        </div>
                      ))}
                      {flat.map((num, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-center rounded border border-border text-sm font-semibold aspect-square"
                        >
                          {num || '—'}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Esta cartela ainda não possui números definidos.
              </p>
            )
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            {editMode ? (
              <>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditMode(false)} disabled={isSaving}>
                  <X className="w-3.5 h-3.5" /> Cancelar
                </Button>
                <Button size="sm" className="gap-2" onClick={handleSaveEdit} disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Salvar
                </Button>
              </>
            ) : (
              <>
                {canDelete && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2 sm:mr-auto"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Excluir
                  </Button>
                )}
                {selectedCartela?.numeros_grade && (
                  <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint} disabled={isPrinting}>
                    {isPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                    Imprimir
                  </Button>
                )}
                {canEdit && (
                  <Button size="sm" className="gap-2" onClick={openEditMode}>
                    <Edit2 className="w-3.5 h-3.5" /> Editar
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cartela?</AlertDialogTitle>
            <AlertDialogDescription>
              A cartela {selectedCartela ? formatarNumeroCartela(selectedCartela.numero) : ''} será removida permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete lote confirmation ── */}
      <AlertDialog open={!!loteToDelete} onOpenChange={(open) => { if (!open) setLoteToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lote inteiro?</AlertDialogTitle>
            <AlertDialogDescription>
              {loteToDelete ? `Este lote contém ${loteToDelete.length} cartela(s) validada(s). Todas serão removidas permanentemente. Esta ação não pode ser desfeita.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingLote}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletarLote} disabled={isDeletingLote} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeletingLote ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Excluir lote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Remove all validations confirmation ── */}
      <AlertDialog open={showRemoverTodas} onOpenChange={(open) => { if (!open) setShowRemoverTodas(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover todas as validações?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as {cartelasValidadas.length} cartela(s) validada(s) serão removidas permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemovingTodas}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoverTodas} disabled={isRemovingTodas} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isRemovingTodas ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Remover Todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit validated cartela ── */}
      <Dialog open={!!editingValidada} onOpenChange={(open) => { if (!open) setEditingValidada(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Editar Cartela {editingValidada ? formatarNumeroCartela(editingValidada.numero) : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Nome do Comprador</label>
              <Input
                placeholder="Nome de quem comprou..."
                value={editingValidada?.nome ?? ''}
                onChange={(e) => setEditingValidada(prev => prev ? { ...prev, nome: e.target.value } : null)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveValidada()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingValidada(null)} disabled={isSavingValidada}>
              Cancelar
            </Button>
            <Button size="sm" className="gap-2" onClick={handleSaveValidada} disabled={isSavingValidada}>
              {isSavingValidada ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Nova Cartela ── */}
      <Dialog open={showNewModal} onOpenChange={(open) => { if (!open) setShowNewModal(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Cartela</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <GridEditor
              grid={newGrid}
              onChange={(i, v) => setNewGrid(prev => { const g = [...prev]; g[i] = v; return g; })}
            />
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-2"
              onClick={() => setNewGrid(generateRandomFlat())}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Gerar Aleatório
            </Button>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowNewModal(false)} disabled={isSavingNew}>
              Cancelar
            </Button>
            <Button size="sm" className="gap-2" onClick={handleCreateCartela} disabled={isSavingNew}>
              {isSavingNew ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Criar Cartela
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CartelasTab;
