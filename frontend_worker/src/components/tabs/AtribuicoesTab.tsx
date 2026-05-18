import React, { useState } from 'react';
import { useBingo } from '@/contexts/BingoContext';
import { ListTodo, Plus, Search, Filter, Eraser, Edit, Trash2, ChevronDown, ChevronUp, RotateCcw, ArrowRightLeft, DollarSign, AlertTriangle, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatarData, formatarNumeroCartela, getStatusLabel, formatarMoeda } from '@/lib/utils/formatters';
import AtribuicaoModal from '@/components/modals/AtribuicaoModal';
import { AtribuicaoHistoricoPayload } from '@/components/modals/AtribuicaoModal';
import TransferenciaModal from '@/components/modals/TransferenciaModal';
import ComprovanteAtribuicaoModal, { ComprovanteAtribuicaoData } from '@/components/modals/ComprovanteAtribuicaoModal';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/useApi';
import { CartelaAtribuida, Atribuicao } from '@/types/bingo';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { getOfflineAppState, getOfflineQueue, isOfflineModeEnabled, patchOfflineAppState } from '@/lib/offlineMode';

const AtribuicoesTab: React.FC = () => {
  const {
    sorteioAtivo,
    atribuicoes,
    vendedores,
    filtrosAtribuicoes,
    setFiltrosAtribuicoes,
    deleteAtribuicao,
    removeCartelaFromAtribuicao,
    updateCartelaStatusInAtribuicao,
    loadAtribuicoes,
    loadCartelas,
  } = useBingo();
  const { toast } = useToast();
  const { callApi } = useApi();
  const atribuicoesTabSnapshot = (getOfflineAppState().bingo?.atribuicoesTab || {}) as Record<string, unknown>;
  const shouldHydrateOfflineState = isOfflineModeEnabled() || getOfflineQueue().length > 0;

  const [isModalOpen, setIsModalOpen] = useState(shouldHydrateOfflineState ? !!atribuicoesTabSnapshot.isModalOpen : false);
  const [editingAtribuicao, setEditingAtribuicao] = useState<Atribuicao | null>(shouldHydrateOfflineState ? ((atribuicoesTabSnapshot.editingAtribuicao as Atribuicao | null) || null) : null);
  const [expandedAtribuicao, setExpandedAtribuicao] = useState<string | null>(shouldHydrateOfflineState ? ((atribuicoesTabSnapshot.expandedAtribuicao as string | null) || null) : null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(shouldHydrateOfflineState ? !!atribuicoesTabSnapshot.deleteDialogOpen : false);
  const [deletingAtribuicao, setDeletingAtribuicao] = useState<{ id: string; vendedorId: string; cartela?: number; cartelas?: number[] } | null>(shouldHydrateOfflineState ? ((atribuicoesTabSnapshot.deletingAtribuicao as { id: string; vendedorId: string; cartela?: number; cartelas?: number[] } | null) || null) : null);
  const [actionType, setActionType] = useState<'devolver' | 'excluir-cartela' | 'excluir-atribuicao' | 'extraviar' | 'reverter-extravio'>(shouldHydrateOfflineState ? ((atribuicoesTabSnapshot.actionType as 'devolver' | 'excluir-cartela' | 'excluir-atribuicao' | 'extraviar' | 'reverter-extravio') || 'excluir-atribuicao') : 'excluir-atribuicao');

  const [initialVendedorId, setInitialVendedorId] = useState<string | null>(null);
  const [filtrosPorAtribuicao, setFiltrosPorAtribuicao] = useState<Record<string, { busca: string; status: 'todos' | 'ativa' | 'vendida' | 'devolvida' | 'extraviada' }>>({});
  const [selecionadasPorAtribuicao, setSelecionadasPorAtribuicao] = useState<Record<string, number[]>>({});
  const [faixaAcaoPorAtribuicao, setFaixaAcaoPorAtribuicao] = useState<Record<string, string>>({});

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(shouldHydrateOfflineState ? !!atribuicoesTabSnapshot.isTransferModalOpen : false);
  const [transferAtribuicao, setTransferAtribuicao] = useState<Atribuicao | null>(shouldHydrateOfflineState ? ((atribuicoesTabSnapshot.transferAtribuicao as Atribuicao | null) || null) : null);
  const [transferCartelaNumero, setTransferCartelaNumero] = useState<number | null>(shouldHydrateOfflineState ? ((atribuicoesTabSnapshot.transferCartelaNumero as number | null) || null) : null);
  const [transferCartelasSelecionadas, setTransferCartelasSelecionadas] = useState<number[]>(shouldHydrateOfflineState ? ((atribuicoesTabSnapshot.transferCartelasSelecionadas as number[]) || []) : []);

  const [comprovanteOpen, setComprovanteOpen] = useState(false);
  const [comprovanteData, setComprovanteData] = useState<ComprovanteAtribuicaoData | null>(null);
  const [detalhesAtribuicaoId, setDetalhesAtribuicaoId] = useState<string | null>(null);
  const [editLancamentoOpen, setEditLancamentoOpen] = useState(false);
  const [editLancamentoAtribuicao, setEditLancamentoAtribuicao] = useState<Atribuicao | null>(null);
  const [editLancamentoId, setEditLancamentoId] = useState<string | null>(null);
  const [editLancamentoNumeros, setEditLancamentoNumeros] = useState('');
  const [historicoPorVendedor, setHistoricoPorVendedor] = useState<Record<string, Array<{ id: string; dataHora: string; acao: string; numeros: number[] }>>>(
    shouldHydrateOfflineState ? ((atribuicoesTabSnapshot.historicoPorVendedor as Record<string, Array<{ id: string; dataHora: string; acao: string; numeros: number[] }>>) || {}) : {}
  );

  React.useEffect(() => {
    const currentBingo = (getOfflineAppState().bingo || {}) as Record<string, unknown>;
    patchOfflineAppState({
      bingo: {
        ...currentBingo,
        atribuicoesTab: {
          isModalOpen,
          editingAtribuicao,
          expandedAtribuicao,
          deleteDialogOpen,
          deletingAtribuicao,
          actionType,
          isTransferModalOpen,
          transferAtribuicao,
          transferCartelaNumero,
          transferCartelasSelecionadas,
          historicoPorVendedor,
          filtrosAtribuicoes,
        },
      },
    });
  }, [isModalOpen, editingAtribuicao, expandedAtribuicao, deleteDialogOpen, deletingAtribuicao, actionType, isTransferModalOpen, transferAtribuicao, transferCartelaNumero, transferCartelasSelecionadas, historicoPorVendedor, filtrosAtribuicoes]);

  const loadHistorico = React.useCallback(async () => {
    if (!sorteioAtivo?.id) return;
    try {
      const result = await callApi('getAtribuicoesHistorico', { sorteio_id: sorteioAtivo.id }) as { data?: Array<{ id: string; vendedor_id: string; acao: string; numeros_cartelas: string; data_hora: string }> };
      const byVendedor: Record<string, Array<{ id: string; dataHora: string; acao: string; numeros: number[] }>> = {};
      for (const row of result.data || []) {
        const numeros = String(row.numeros_cartelas || '')
          .split(',')
          .map((n) => Number(n.trim()))
          .filter((n) => Number.isFinite(n));
        const item = {
          id: row.id,
          dataHora: new Date(row.data_hora).toLocaleString('pt-BR'),
          acao: row.acao,
          numeros,
        };
        if (!byVendedor[row.vendedor_id]) byVendedor[row.vendedor_id] = [];
        byVendedor[row.vendedor_id].push(item);
      }
      setHistoricoPorVendedor(byVendedor);
    } catch {
      // keep current UI state if backend load fails
    }
  }, [sorteioAtivo?.id, callApi]);

  React.useEffect(() => {
    void loadHistorico();
  }, [loadHistorico]);

  if (!sorteioAtivo) {
    return (
      <div className="text-center py-12">
        <ListTodo className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">Atribuições</h2>
        <p className="text-muted-foreground">Selecione um sorteio para gerenciar atribuições</p>
      </div>
    );
  }

  const parseFaixa = (input: string): [number, number] | null => {
    const clean = input.trim().toLowerCase().replace(/\s+/g, '');
    const parts = clean.split(/-|a/);
    if (parts.length !== 2) return null;
    const ini = Number(parts[0]);
    const fim = Number(parts[1]);
    if (!Number.isFinite(ini) || !Number.isFinite(fim) || ini <= 0 || fim <= 0 || fim < ini) return null;
    return [ini, fim];
  };

  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  const registrarHistorico = (payload: { vendedorId: string; acao: string; numeros: number[] }) => {
    if (payload.numeros.length === 0) return;
    const nowIso = new Date().toISOString();
    const tempId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setHistoricoPorVendedor(prev => ({
      ...prev,
      [payload.vendedorId]: [
        {
          id: tempId,
          dataHora: new Date(nowIso).toLocaleString('pt-BR'),
          acao: payload.acao,
          numeros: [...payload.numeros].sort((a, b) => a - b),
        },
        ...(prev[payload.vendedorId] || []),
      ],
    }));
    if (sorteioAtivo?.id) {
      void (async () => {
        try {
          const result = await callApi('createAtribuicaoHistorico', {
            sorteio_id: sorteioAtivo.id,
            vendedor_id: payload.vendedorId,
            acao: payload.acao,
            numeros_cartelas: payload.numeros,
            data_hora: nowIso,
          }) as { data?: Array<{ id?: string }> };
          const realId = result?.data?.[0]?.id;
          if (realId && isUuid(realId)) {
            setHistoricoPorVendedor((prev) => ({
              ...prev,
              [payload.vendedorId]: (prev[payload.vendedorId] || []).map((h) =>
                h.id === tempId ? { ...h, id: realId } : h,
              ),
            }));
          }
          await loadHistorico();
        } catch {
          // Keep temporary entry locally if API fails; sync can happen later.
        }
      })();
    }
  };

  const excluirLancamentoRegistrado = async (atribuicao: Atribuicao, historicoId: string) => {
    if (!sorteioAtivo?.id) return;
    const ok = window.confirm('Excluir este lançamento? Todas as cartelas desse lançamento serão removidas da atribuição.');
    if (!ok) return;
    try {
      if (!isUuid(historicoId)) {
        setHistoricoPorVendedor((prev) => ({
          ...prev,
          [atribuicao.vendedor_id]: (prev[atribuicao.vendedor_id] || []).filter((h) => h.id !== historicoId),
        }));
        await loadHistorico();
        toast({ title: 'Lançamento removido da lista', description: 'Este lançamento ainda não tinha sido persistido no banco.' });
        return;
      }
      await callApi('deleteAtribuicaoHistorico', {
        historico_id: historicoId,
        sorteio_id: sorteioAtivo.id,
        vendedor_id: atribuicao.vendedor_id,
      });
      setHistoricoPorVendedor((prev) => ({
        ...prev,
        [atribuicao.vendedor_id]: (prev[atribuicao.vendedor_id] || []).filter((h) => h.id !== historicoId),
      }));
      await loadHistorico();
      await loadAtribuicoes();
      await loadCartelas();
      toast({ title: 'Lançamento excluído', description: 'As cartelas do lançamento foram removidas da atribuição.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível excluir o lançamento.';
      toast({ title: 'Erro ao excluir lançamento', description: message, variant: 'destructive' });
    }
  };

  const abrirEditarLancamento = (atribuicao: Atribuicao, h: { id: string; numeros: number[] }) => {
    setEditLancamentoAtribuicao(atribuicao);
    setEditLancamentoId(h.id);
    setEditLancamentoNumeros(h.numeros.join(','));
    setEditLancamentoOpen(true);
  };

  const parseNumerosEntrada = (raw: string): number[] => {
    const partes = raw.split(',').map((v) => v.trim()).filter(Boolean);
    const nums: number[] = [];
    for (const p of partes) {
      const m = p.match(/^(\d+)\s*[-aA]\s*(\d+)$/);
      if (m) {
        const ini = Number(m[1]);
        const fim = Number(m[2]);
        if (Number.isFinite(ini) && Number.isFinite(fim) && fim >= ini) {
          for (let n = ini; n <= fim; n++) nums.push(n);
        }
      } else {
        const n = Number(p);
        if (Number.isFinite(n)) nums.push(n);
      }
    }
    return Array.from(new Set(nums)).sort((a, b) => a - b);
  };

  const salvarEdicaoLancamento = async () => {
    if (!sorteioAtivo?.id || !editLancamentoAtribuicao || !editLancamentoId) return;
    const numeros = parseNumerosEntrada(editLancamentoNumeros);
    if (numeros.length === 0) {
      toast({ title: 'Números inválidos', description: 'Informe cartelas válidas. Ex: 1,2,3 ou 10-20', variant: 'destructive' });
      return;
    }
    try {
      if (!isUuid(editLancamentoId)) {
        setHistoricoPorVendedor((prev) => ({
          ...prev,
          [editLancamentoAtribuicao.vendedor_id]: (prev[editLancamentoAtribuicao.vendedor_id] || []).map((h) =>
            h.id === editLancamentoId ? { ...h, numeros } : h,
          ),
        }));
        await loadHistorico();
        toast({ title: 'Lançamento atualizado localmente', description: 'Esse lançamento ainda não foi persistido no banco.' });
        setEditLancamentoOpen(false);
        return;
      }
      await callApi('updateAtribuicaoHistorico', {
        historico_id: editLancamentoId,
        sorteio_id: sorteioAtivo.id,
        vendedor_id: editLancamentoAtribuicao.vendedor_id,
        numeros_cartelas: numeros,
      });
      setHistoricoPorVendedor((prev) => ({
        ...prev,
        [editLancamentoAtribuicao.vendedor_id]: (prev[editLancamentoAtribuicao.vendedor_id] || []).map((h) =>
          h.id === editLancamentoId ? { ...h, numeros } : h,
        ),
      }));
      await loadHistorico();
      await loadAtribuicoes();
      await loadCartelas();
      toast({ title: 'Lançamento atualizado', description: 'Os números do lançamento foram atualizados.' });
      setEditLancamentoOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível editar o lançamento.';
      toast({ title: 'Erro ao editar lançamento', description: message, variant: 'destructive' });
    }
  };

  const atribuicoesFiltradas = atribuicoes.filter(a => {
    if (filtrosAtribuicoes.busca) {
      const busca = filtrosAtribuicoes.busca.toLowerCase();
      const matchVendedor = a.vendedor_nome && a.vendedor_nome.toLowerCase().includes(busca);
      const matchCartela = a.cartelas.some(c => c.numero.toString().includes(busca));
      if (!matchVendedor && !matchCartela) return false;
    }
    if (filtrosAtribuicoes.vendedor !== 'todos' && a.vendedor_id !== filtrosAtribuicoes.vendedor) return false;
    if (filtrosAtribuicoes.status !== 'todos') {
      const hasCartelaWithStatus = a.cartelas.some(c => c.status === filtrosAtribuicoes.status);
      if (!hasCartelaWithStatus) return false;
    }
    return true;
  });

  const handleDevolverCartela = (atribuicaoId: string, numeroCartela: number) => {
    setDeletingAtribuicao({ id: atribuicaoId, vendedorId: '', cartela: numeroCartela });
    setActionType('devolver');
    setDeleteDialogOpen(true);
  };
  const handleExtraviada = (atribuicaoId: string, numeroCartela: number) => {
    setDeletingAtribuicao({ id: atribuicaoId, vendedorId: '', cartela: numeroCartela });
    setActionType('extraviar');
    setDeleteDialogOpen(true);
  };
  const handleExcluirCartela = (atribuicaoId: string, numeroCartela: number) => {
    setDeletingAtribuicao({ id: atribuicaoId, vendedorId: '', cartela: numeroCartela });
    setActionType('excluir-cartela');
    setDeleteDialogOpen(true);
  };
  const handleReverterExtravio = (atribuicaoId: string, numeroCartela: number) => {
    setDeletingAtribuicao({ id: atribuicaoId, vendedorId: '', cartela: numeroCartela });
    setActionType('reverter-extravio');
    setDeleteDialogOpen(true);
  };

  const toggleCartelaSelecionada = (atribuicaoId: string, numeroCartela: number, checked: boolean) => {
    setSelecionadasPorAtribuicao(prev => {
      const atual = prev[atribuicaoId] || [];
      const proximo = checked ? Array.from(new Set([...atual, numeroCartela])) : atual.filter(n => n !== numeroCartela);
      return { ...prev, [atribuicaoId]: proximo };
    });
  };
  const selecionarTodasFiltradas = (atribuicaoId: string, numeros: number[]) => {
    setSelecionadasPorAtribuicao(prev => ({ ...prev, [atribuicaoId]: numeros }));
  };
  const limparSelecao = (atribuicaoId: string) => {
    setSelecionadasPorAtribuicao(prev => ({ ...prev, [atribuicaoId]: [] }));
  };

  const selecionarPorFaixa = (atribuicao: Atribuicao) => {
    const valor = faixaAcaoPorAtribuicao[atribuicao.id] || '';
    const faixa = parseFaixa(valor);
    if (!faixa) {
      toast({ title: 'Faixa inválida', description: 'Use o formato 10-100 ou 10 a 100.', variant: 'destructive' });
      return;
    }
    const [ini, fim] = faixa;
    const numeros = atribuicao.cartelas.filter(c => c.numero >= ini && c.numero <= fim).map(c => c.numero);
    if (numeros.length === 0) {
      toast({ title: 'Sem cartelas na faixa', description: 'Nenhuma cartela encontrada no intervalo informado.', variant: 'destructive' });
      return;
    }
    selecionarTodasFiltradas(atribuicao.id, numeros);
    toast({ title: 'Faixa aplicada', description: `${numeros.length} cartela(s) selecionada(s).` });
  };

  const handleAcaoEmLote = (
    atribuicao: Atribuicao,
    action: 'devolver' | 'extraviar' | 'reverter-extravio' | 'transferir' | 'excluir-cartela',
    filtroStatus?: CartelaAtribuida['status'],
  ) => {
    const selecionadas = selecionadasPorAtribuicao[atribuicao.id] || [];
    if (selecionadas.length === 0) {
      toast({ title: 'Selecione cartelas', description: 'Marque uma ou mais cartelas para continuar.', variant: 'destructive' });
      return;
    }
    const cartelasSelecionadas = atribuicao.cartelas.filter(c => selecionadas.includes(c.numero));
    const numerosValidos = filtroStatus ? cartelasSelecionadas.filter(c => c.status === filtroStatus).map(c => c.numero) : cartelasSelecionadas.map(c => c.numero);
    if (numerosValidos.length === 0) {
      toast({ title: 'Ação não permitida', description: 'As cartelas selecionadas não estão no status esperado para esta ação.', variant: 'destructive' });
      return;
    }
    if (action === 'transferir') {
      setTransferAtribuicao(atribuicao);
      setTransferCartelaNumero(null);
      setTransferCartelasSelecionadas(numerosValidos);
      setIsTransferModalOpen(true);
      return;
    }
    setDeletingAtribuicao({ id: atribuicao.id, vendedorId: atribuicao.vendedor_id, cartelas: numerosValidos });
    setActionType(action);
    setDeleteDialogOpen(true);
  };

  const handleExcluirAtribuicao = (id: string, vendedorId: string) => {
    const atribuicao = atribuicoes.find(a => a.id === id);
    const possuiCartelaVendida = atribuicao?.cartelas.some(c => c.status === 'vendida');
    if (possuiCartelaVendida) {
      toast({ title: 'Ação não permitida', description: 'Não é possível excluir uma atribuição que possui cartela(s) vendida(s).', variant: 'destructive' });
      return;
    }
    setDeletingAtribuicao({ id, vendedorId });
    setActionType('excluir-atribuicao');
    setDeleteDialogOpen(true);
  };

  const handleEditarAtribuicao = (atribuicao: Atribuicao) => {
    setEditingAtribuicao(atribuicao);
    setIsModalOpen(true);
  };

  const handleTransferirCartela = (atribuicao: Atribuicao, numeroCartela: number) => {
    setTransferAtribuicao(atribuicao);
    setTransferCartelaNumero(numeroCartela);
    setTransferCartelasSelecionadas([numeroCartela]);
    setIsTransferModalOpen(true);
  };

  const confirmAction = async () => {
    if (!deletingAtribuicao) return;
    const atribuicao = atribuicoes.find(a => a.id === deletingAtribuicao.id);
    if (!atribuicao) return;

    if (actionType === 'devolver' && deletingAtribuicao.cartela) {
      await updateCartelaStatusInAtribuicao(deletingAtribuicao.id, deletingAtribuicao.cartela, 'devolvida');
      registrarHistorico({ vendedorId: atribuicao.vendedor_id, acao: 'Devolução', numeros: [deletingAtribuicao.cartela] });
      toast({ title: 'Cartela devolvida', description: `A cartela ${formatarNumeroCartela(deletingAtribuicao.cartela)} foi devolvida.` });
    } else if (actionType === 'devolver' && deletingAtribuicao.cartelas?.length) {
      for (const numero of deletingAtribuicao.cartelas) await updateCartelaStatusInAtribuicao(deletingAtribuicao.id, numero, 'devolvida');
      registrarHistorico({ vendedorId: atribuicao.vendedor_id, acao: 'Devolução em lote', numeros: deletingAtribuicao.cartelas });
      toast({ title: 'Cartelas devolvidas', description: `${deletingAtribuicao.cartelas.length} cartela(s) marcadas como devolvidas.` });
      limparSelecao(deletingAtribuicao.id);
    } else if (actionType === 'extraviar' && deletingAtribuicao.cartela) {
      await updateCartelaStatusInAtribuicao(deletingAtribuicao.id, deletingAtribuicao.cartela, 'extraviada');
      registrarHistorico({ vendedorId: atribuicao.vendedor_id, acao: 'Extravio', numeros: [deletingAtribuicao.cartela] });
      toast({ title: 'Cartela marcada como extraviada', description: `A cartela ${formatarNumeroCartela(deletingAtribuicao.cartela)} foi marcada como extraviada.` });
    } else if (actionType === 'extraviar' && deletingAtribuicao.cartelas?.length) {
      for (const numero of deletingAtribuicao.cartelas) await updateCartelaStatusInAtribuicao(deletingAtribuicao.id, numero, 'extraviada');
      registrarHistorico({ vendedorId: atribuicao.vendedor_id, acao: 'Extravio em lote', numeros: deletingAtribuicao.cartelas });
      toast({ title: 'Cartelas extraviadas', description: `${deletingAtribuicao.cartelas.length} cartela(s) marcadas como extraviadas.` });
      limparSelecao(deletingAtribuicao.id);
    } else if (actionType === 'reverter-extravio' && deletingAtribuicao.cartela) {
      await updateCartelaStatusInAtribuicao(deletingAtribuicao.id, deletingAtribuicao.cartela, 'ativa');
      registrarHistorico({ vendedorId: atribuicao.vendedor_id, acao: 'Reversão de status', numeros: [deletingAtribuicao.cartela] });
      toast({ title: 'Status revertido', description: `A cartela ${formatarNumeroCartela(deletingAtribuicao.cartela)} voltou para ativa.` });
    } else if (actionType === 'reverter-extravio' && deletingAtribuicao.cartelas?.length) {
      for (const numero of deletingAtribuicao.cartelas) await updateCartelaStatusInAtribuicao(deletingAtribuicao.id, numero, 'ativa');
      registrarHistorico({ vendedorId: atribuicao.vendedor_id, acao: 'Reversão de status em lote', numeros: deletingAtribuicao.cartelas });
      toast({ title: 'Cartelas reativadas', description: `${deletingAtribuicao.cartelas.length} cartela(s) voltaram para ativa.` });
      limparSelecao(deletingAtribuicao.id);
    } else if (actionType === 'excluir-cartela' && deletingAtribuicao.cartela) {
      await removeCartelaFromAtribuicao(deletingAtribuicao.id, deletingAtribuicao.cartela);
      registrarHistorico({ vendedorId: atribuicao.vendedor_id, acao: 'Exclusão de cartela', numeros: [deletingAtribuicao.cartela] });
      toast({ title: 'Cartela removida', description: `A cartela ${formatarNumeroCartela(deletingAtribuicao.cartela)} foi removida da atribuição.` });
    } else if (actionType === 'excluir-cartela' && deletingAtribuicao.cartelas?.length) {
      for (const numero of deletingAtribuicao.cartelas) await removeCartelaFromAtribuicao(deletingAtribuicao.id, numero);
      registrarHistorico({ vendedorId: atribuicao.vendedor_id, acao: 'Exclusão de cartelas em lote', numeros: deletingAtribuicao.cartelas });
      toast({ title: 'Cartelas removidas', description: `${deletingAtribuicao.cartelas.length} cartela(s) removidas da atribuição.` });
      limparSelecao(deletingAtribuicao.id);
    } else if (actionType === 'excluir-atribuicao') {
      await deleteAtribuicao(deletingAtribuicao.id);
      toast({ title: 'Atribuição excluída', description: `A atribuição de ${atribuicao.vendedor_nome} foi excluída.` });
    }

    setDeleteDialogOpen(false);
    setDeletingAtribuicao(null);
  };

  const limparFiltros = () => setFiltrosAtribuicoes({ busca: '', status: 'todos', vendedor: 'todos' });
  const toggleExpand = (id: string) => setExpandedAtribuicao(prev => (prev === id ? null : id));

  const getStatusCounts = (cartelas: CartelaAtribuida[]) => ({
    ativas: cartelas.filter(c => c.status === 'ativa').length,
    vendidas: cartelas.filter(c => c.status === 'vendida').length,
    devolvidas: cartelas.filter(c => c.status === 'devolvida').length,
    extraviadas: cartelas.filter(c => c.status === 'extraviada').length,
  });
  const compactarNumeros = (nums: number[]) => {
    if (nums.length === 0) return 'Nenhuma';
    const ordenados = [...nums].sort((a, b) => a - b);
    const partes: string[] = [];
    let ini = ordenados[0];
    let fim = ordenados[0];
    for (let i = 1; i < ordenados.length; i++) {
      const n = ordenados[i];
      if (n === fim + 1) {
        fim = n;
        continue;
      }
      partes.push(ini === fim ? formatarNumeroCartela(ini) : `${formatarNumeroCartela(ini)}-${formatarNumeroCartela(fim)}`);
      ini = n;
      fim = n;
    }
    partes.push(ini === fim ? formatarNumeroCartela(ini) : `${formatarNumeroCartela(ini)}-${formatarNumeroCartela(fim)}`);
    return partes.join(', ');
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ListTodo className="w-6 h-6" />
          Atribuições - {sorteioAtivo.nome}
        </h2>
        <Button onClick={() => { setEditingAtribuicao(null); setInitialVendedorId(null); setIsModalOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Atribuição
        </Button>
      </div>

      <div className="filter-bar">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex items-center gap-1"><Search className="w-4 h-4" />Buscar</label>
            <Input placeholder="Vendedor ou número..." value={filtrosAtribuicoes.busca} onChange={(e) => setFiltrosAtribuicoes({ ...filtrosAtribuicoes, busca: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex items-center gap-1"><Filter className="w-4 h-4" />Status Cartelas</label>
            <Select value={filtrosAtribuicoes.status} onValueChange={(value: 'todos' | 'ativa' | 'vendida' | 'devolvida' | 'extraviada') => setFiltrosAtribuicoes({ ...filtrosAtribuicoes, status: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativa">Ativas</SelectItem>
                <SelectItem value="vendida">Vendidas</SelectItem>
                <SelectItem value="devolvida">Devolvidas</SelectItem>
                <SelectItem value="extraviada">Extraviadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Vendedor</label>
            <Select value={filtrosAtribuicoes.vendedor} onValueChange={(value) => setFiltrosAtribuicoes({ ...filtrosAtribuicoes, vendedor: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={limparFiltros} className="w-full gap-2"><Eraser className="w-4 h-4" />Limpar</Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {atribuicoesFiltradas.map((atribuicao) => {
          const counts = getStatusCounts(atribuicao.cartelas);
          const isExpanded = expandedAtribuicao === atribuicao.id;
          const possuiCartelaVendida = atribuicao.cartelas.some(c => c.status === 'vendida');
          const cartelasFiltradasDaAtribuicao = atribuicao.cartelas.filter((cartela) => {
            const filtro = filtrosPorAtribuicao[atribuicao.id];
            const busca = (filtro?.busca || '').trim();
            const status = filtro?.status || 'todos';
            if (busca && !cartela.numero.toString().includes(busca)) return false;
            if (status !== 'todos' && cartela.status !== status) return false;
            return true;
          });
          const selecionadas = selecionadasPorAtribuicao[atribuicao.id] || [];
          const todasFiltradasSelecionadas = cartelasFiltradasDaAtribuicao.length > 0 && cartelasFiltradasDaAtribuicao.every(c => selecionadas.includes(c.numero));

          return (
            <Collapsible key={atribuicao.id} open={isExpanded} onOpenChange={() => toggleExpand(atribuicao.id)}>
              <div
                className={cn(
                  'bg-card border rounded-xl overflow-hidden transition-all duration-200',
                  isExpanded
                    ? 'border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.35),0_10px_30px_-15px_hsl(var(--primary)/0.65)]'
                    : 'border-border'
                )}
              >
                <CollapsibleTrigger asChild>
                  <div
                    className={cn(
                      'p-4 cursor-pointer transition-colors',
                      isExpanded ? 'bg-primary/5' : 'hover:bg-muted/30'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                          <span className="text-primary font-bold text-lg">{atribuicao.vendedor_nome?.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <h3 className="font-bold text-foreground text-lg">{atribuicao.vendedor_nome}</h3>
                          <p className="text-sm text-muted-foreground">{atribuicao.cartelas.length} cartela(s) atribuída(s)</p>
                          <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium"><DollarSign className="w-3 h-3" />Previsão: {formatarMoeda(atribuicao.cartelas.length * (sorteioAtivo?.valor_cartela || 0))}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex gap-2">
                          {counts.ativas > 0 && <span className="status-badge status-ativa">{counts.ativas} ativa(s)</span>}
                          {counts.vendidas > 0 && <span className="status-badge status-vendida">{counts.vendidas} vendida(s)</span>}
                          {counts.devolvidas > 0 && <span className="status-badge status-devolvida">{counts.devolvidas} devolvida(s)</span>}
                          {counts.extraviadas > 0 && <span className="status-badge status-extraviada">{counts.extraviadas} extraviada(s)</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleEditarAtribuicao(atribuicao); }}><Edit className="w-4 h-4" /></Button>
                          <Button size="sm" variant="destructive" disabled={possuiCartelaVendida} onClick={(e) => { e.stopPropagation(); handleExcluirAtribuicao(atribuicao.id, atribuicao.vendedor_id); }}><Trash2 className="w-4 h-4" /></Button>
                          {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                        </div>
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t border-border p-4 bg-muted/20 space-y-3">
                    <div className="mb-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <h4 className="font-semibold text-foreground">Cartelas Atribuídas</h4>
                      <div className="grid grid-cols-1 sm:flex gap-2 w-full sm:w-auto">
                        {atribuicao.cartelas.filter(c => c.status === 'ativa').length > 1 && (
                          <Button size="sm" variant="outline" onClick={() => { setTransferAtribuicao(atribuicao); setTransferCartelaNumero(null); setTransferCartelasSelecionadas([]); setIsTransferModalOpen(true); }} className="gap-1 w-full sm:w-auto">
                            <ArrowRightLeft className="w-4 h-4" />Transferir Várias
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => { setInitialVendedorId(atribuicao.vendedor_id); setIsModalOpen(true); }} className="gap-1 w-full sm:w-auto"><Plus className="w-4 h-4" />Adicionar Cartelas</Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 w-full sm:w-auto"
                          onClick={() => {
                            const nums = atribuicao.cartelas.map(c => c.numero);
                            if (nums.length === 0) {
                              toast({ title: 'Sem cartelas', description: 'Este vendedor ainda não tem cartelas para comprovante.', variant: 'destructive' });
                              return;
                            }
                            setComprovanteData({
                              sorteioNome: sorteioAtivo.nome,
                              vendedorNome: atribuicao.vendedor_nome || 'Vendedor',
                              numeros: nums,
                              valorCartela: sorteioAtivo.valor_cartela || 0,
                              dataHora: new Date().toLocaleString('pt-BR'),
                            });
                            setComprovanteOpen(true);
                            registrarHistorico({ vendedorId: atribuicao.vendedor_id, acao: 'Comprovante impresso/gerado', numeros: nums });
                          }}
                        >
                          <Printer className="w-4 h-4" />
                          Imprimir Comprovante
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-md border bg-background p-3">
                      <p className="text-sm font-medium">Resumo de cartelas</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {atribuicao.cartelas.length} cartela(s) • {compactarNumeros(atribuicao.cartelas.map(c => c.numero))}
                      </p>
                      <Button size="sm" variant="outline" className="mt-2" onClick={() => setDetalhesAtribuicaoId(atribuicao.id)}>
                        Ver detalhes e ações
                      </Button>
                    </div>

                    <div className="border rounded-lg p-3 bg-background/70">
                      <p className="text-sm font-semibold text-foreground mb-2">Atribuições Registradas</p>
                      {(historicoPorVendedor[atribuicao.vendedor_id] || []).filter(h => h.acao.toLowerCase().includes('atribuição')).length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhuma atribuição registrada ainda para este vendedor.</p>
                      ) : (
                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {(historicoPorVendedor[atribuicao.vendedor_id] || []).filter(h => h.acao.toLowerCase().includes('atribuição')).map((h) => (
                            <div key={h.id} className="rounded-md border bg-card p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium">{h.acao}</p>
                                  <p className="text-xs text-muted-foreground">{h.dataHora}</p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => abrirEditarLancamento(atribuicao, h)}
                                    title="Editar cartelas deste lançamento"
                                  >
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1"
                                    onClick={() => {
                                      setComprovanteData({
                                        sorteioNome: sorteioAtivo.nome,
                                        vendedorNome: atribuicao.vendedor_nome || 'Vendedor',
                                        numeros: h.numeros,
                                        valorCartela: sorteioAtivo.valor_cartela || 0,
                                        dataHora: h.dataHora,
                                      });
                                      setComprovanteOpen(true);
                                    }}
                                  >
                                    <Printer className="w-3 h-3" />
                                    Comprovante
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => { void excluirLancamentoRegistrado(atribuicao, h.id); }}
                                    title="Excluir lançamento e remover cartelas atribuídas neste lançamento"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {h.numeros.length} cartela(s): {h.numeros.slice(0, 20).map(n => formatarNumeroCartela(n)).join(', ')}{h.numeros.length > 20 ? ` ... (+${h.numeros.length - 20})` : ''}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Dialog open={detalhesAtribuicaoId === atribuicao.id} onOpenChange={(open) => setDetalhesAtribuicaoId(open ? atribuicao.id : null)}>
                      <DialogContent className="w-[95vw] sm:max-w-[1100px] max-h-[90vh] overflow-y-auto p-4 sm:p-6 [&>button]:fixed [&>button]:right-3 [&>button]:top-3 sm:[&>button]:right-5 sm:[&>button]:top-5 [&>button]:z-[70] [&>button]:flex [&>button]:h-10 [&>button]:w-10 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-full [&>button]:border [&>button]:border-border/70 [&>button]:bg-background/95 [&>button]:text-foreground [&>button]:shadow-lg [&>button]:backdrop-blur-sm [&>button]:opacity-100 [&>button]:ring-offset-background [&>button]:transition-all [&>button:hover]:scale-105 [&>button:hover]:bg-primary [&>button:hover]:text-primary-foreground [&>button:focus-visible]:outline-none [&>button:focus-visible]:ring-2 [&>button:focus-visible]:ring-ring [&>button:focus-visible]:ring-offset-2 [&>button>svg]:h-4 [&>button>svg]:w-4">
                        <DialogHeader>
                          <DialogTitle>Detalhes da atribuição - {atribuicao.vendedor_nome}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <Input placeholder="Filtrar por número..." value={filtrosPorAtribuicao[atribuicao.id]?.busca || ''} onChange={(e) => setFiltrosPorAtribuicao(prev => ({ ...prev, [atribuicao.id]: { busca: e.target.value, status: prev[atribuicao.id]?.status || 'todos' } }))} />
                            <Select value={filtrosPorAtribuicao[atribuicao.id]?.status || 'todos'} onValueChange={(value: 'todos' | 'ativa' | 'vendida' | 'devolvida' | 'extraviada') => setFiltrosPorAtribuicao(prev => ({ ...prev, [atribuicao.id]: { busca: prev[atribuicao.id]?.busca || '', status: value } }))}>
                              <SelectTrigger><SelectValue placeholder="Status da cartela" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="todos">Todos os status</SelectItem>
                                <SelectItem value="ativa">Ativa</SelectItem>
                                <SelectItem value="vendida">Vendida</SelectItem>
                                <SelectItem value="devolvida">Devolvida</SelectItem>
                                <SelectItem value="extraviada">Extraviada</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button type="button" variant="outline" onClick={() => setFiltrosPorAtribuicao(prev => ({ ...prev, [atribuicao.id]: { busca: '', status: 'todos' } }))}>Limpar filtros desta atribuição</Button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Input placeholder="Faixa para ação (ex: 10-100)" value={faixaAcaoPorAtribuicao[atribuicao.id] || ''} onChange={(e) => setFaixaAcaoPorAtribuicao(prev => ({ ...prev, [atribuicao.id]: e.target.value }))} className="w-56" />
                            <Button type="button" size="sm" variant="outline" onClick={() => selecionarPorFaixa(atribuicao)}>Selecionar Faixa</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => selecionarTodasFiltradas(atribuicao.id, cartelasFiltradasDaAtribuicao.map(c => c.numero))}>Selecionar filtradas</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => limparSelecao(atribuicao.id)}>Limpar seleção</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => handleAcaoEmLote(atribuicao, 'extraviar', 'ativa')}>Extraviar selecionadas</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => handleAcaoEmLote(atribuicao, 'devolver', 'ativa')}>Devolver selecionadas</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => handleAcaoEmLote(atribuicao, 'reverter-extravio')}>Reverter selecionadas</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => handleAcaoEmLote(atribuicao, 'transferir', 'ativa')}>Transferir selecionadas</Button>
                            <Button type="button" size="sm" variant="destructive" onClick={() => handleAcaoEmLote(atribuicao, 'excluir-cartela')}>Excluir selecionadas</Button>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="bg-muted/50">
                                  <th className="p-3 text-center font-semibold text-foreground">
                                    <Checkbox checked={todasFiltradasSelecionadas} onCheckedChange={(checked) => checked ? selecionarTodasFiltradas(atribuicao.id, cartelasFiltradasDaAtribuicao.map(c => c.numero)) : limparSelecao(atribuicao.id)} />
                                  </th>
                                  <th className="p-3 text-left font-semibold text-foreground">Cartela</th>
                                  <th className="p-3 text-left font-semibold text-foreground">Data Atribuição</th>
                                  <th className="p-3 text-center font-semibold text-foreground">Status</th>
                                  <th className="p-3 text-center font-semibold text-foreground">Ações</th>
                                </tr>
                              </thead>
                              <tbody>
                                {cartelasFiltradasDaAtribuicao.map((cartela) => (
                                  <tr key={cartela.numero} className="border-b border-border hover:bg-muted/30 transition-colors">
                                    <td className="p-3 text-center"><Checkbox checked={selecionadas.includes(cartela.numero)} onCheckedChange={(checked) => toggleCartelaSelecionada(atribuicao.id, cartela.numero, !!checked)} /></td>
                                    <td className="p-3"><span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-bold">{formatarNumeroCartela(cartela.numero)}</span></td>
                                    <td className="p-3 text-muted-foreground">{formatarData(cartela.data_atribuicao)}</td>
                                    <td className="p-3 text-center"><span className={cn('status-badge', `status-${cartela.status}`)}>{getStatusLabel(cartela.status)}</span></td>
                                    <td className="p-3">
                                      <div className="flex justify-center gap-2">
                                        {cartela.status === 'ativa' && (
                                          <>
                                            <Button size="sm" variant="outline" onClick={() => handleExtraviada(atribuicao.id, cartela.numero)} className="gap-1 border-orange-400 text-orange-600 hover:border-orange-600 hover:bg-orange-600 hover:text-white" title="Marcar como extraviada"><AlertTriangle className="w-4 h-4" /></Button>
                                            <Button size="sm" variant="outline" onClick={() => handleTransferirCartela(atribuicao, cartela.numero)} className="gap-1" title="Transferir para outro vendedor"><ArrowRightLeft className="w-4 h-4" />Transferir</Button>
                                            <Button size="sm" variant="outline" onClick={() => handleDevolverCartela(atribuicao.id, cartela.numero)} className="gap-1"><RotateCcw className="w-4 h-4" />Devolver</Button>
                                          </>
                                        )}
                                        {cartela.status === 'extraviada' && <Button size="sm" variant="outline" onClick={() => handleReverterExtravio(atribuicao.id, cartela.numero)} className="gap-1 border-blue-400 text-blue-600 hover:border-blue-600 hover:bg-blue-600 hover:text-white"><RotateCcw className="w-4 h-4" />Reverter</Button>}
                                        {cartela.status === 'devolvida' && <Button size="sm" variant="outline" onClick={() => handleReverterExtravio(atribuicao.id, cartela.numero)} className="gap-1 border-blue-400 text-blue-600 hover:border-blue-600 hover:bg-blue-600 hover:text-white"><RotateCcw className="w-4 h-4" />Reverter Devolução</Button>}
                                        {cartela.status !== 'vendida' && <Button size="sm" variant="destructive" onClick={() => handleExcluirCartela(atribuicao.id, cartela.numero)}><Trash2 className="w-4 h-4" /></Button>}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}

        {atribuicoesFiltradas.length === 0 && (
          <div className="text-center py-12 bg-card border border-border rounded-xl xl:col-span-2">
            {atribuicoes.length === 0 ? (
              <div>
                <ListTodo className="w-12 h-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
                <p className="text-lg text-foreground">Nenhuma atribuição encontrada</p>
                <p className="text-sm mt-2 text-muted-foreground">Atribua cartelas aos vendedores para começar</p>
                <Button onClick={() => setIsModalOpen(true)} className="mt-4 gap-2"><Plus className="w-4 h-4" />Nova Atribuição</Button>
              </div>
            ) : (
              <div>
                <Filter className="w-12 h-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
                <p className="text-lg text-foreground">Nenhuma atribuição encontrada</p>
                <p className="text-sm mt-2 text-muted-foreground">Tente ajustar os filtros de busca</p>
              </div>
            )}
          </div>
        )}
      </div>

      <AtribuicaoModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingAtribuicao(null); setInitialVendedorId(null); }}
        editingAtribuicao={editingAtribuicao}
        initialVendedorId={initialVendedorId}
        onShowComprovante={(data) => { setComprovanteData(data); setComprovanteOpen(true); }}
        onRegistrarHistorico={(payload: AtribuicaoHistoricoPayload) => {
          registrarHistorico({
            vendedorId: payload.vendedorId,
            acao: payload.acao,
            numeros: payload.numeros,
          });
        }}
      />

      <TransferenciaModal
        isOpen={isTransferModalOpen}
        onClose={() => { setIsTransferModalOpen(false); setTransferAtribuicao(null); setTransferCartelaNumero(null); setTransferCartelasSelecionadas([]); }}
        atribuicaoOrigem={transferAtribuicao}
        cartelaNumero={transferCartelaNumero}
        initialSelectedCartelas={transferCartelasSelecionadas}
        onTransferSuccess={({ origemVendedorId, destinoVendedorId, numeros }) => {
          registrarHistorico({ vendedorId: origemVendedorId, acao: 'Transferência enviada', numeros });
          registrarHistorico({ vendedorId: destinoVendedorId, acao: 'Transferência recebida', numeros });
        }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === 'devolver' && 'Devolver Cartela'}
              {actionType === 'extraviar' && 'Marcar como Extraviada'}
              {actionType === 'reverter-extravio' && 'Reverter Status'}
              {actionType === 'excluir-cartela' && 'Remover Cartela(s)'}
              {actionType === 'excluir-atribuicao' && 'Excluir Atribuição'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === 'devolver' && `Tem certeza que deseja devolver ${deletingAtribuicao?.cartelas?.length ? `${deletingAtribuicao.cartelas.length} cartela(s)` : 'esta cartela'}?`}
              {actionType === 'extraviar' && `Tem certeza que deseja marcar ${deletingAtribuicao?.cartelas?.length ? `${deletingAtribuicao.cartelas.length} cartela(s)` : 'esta cartela'} como extraviada?`}
              {actionType === 'reverter-extravio' && `Tem certeza que deseja reverter ${deletingAtribuicao?.cartelas?.length ? `${deletingAtribuicao.cartelas.length} cartela(s)` : 'esta cartela'} para ativa?`}
              {actionType === 'excluir-cartela' && `Tem certeza que deseja remover ${deletingAtribuicao?.cartelas?.length ? `${deletingAtribuicao.cartelas.length} cartela(s)` : 'esta cartela'} da atribuição?`}
              {actionType === 'excluir-atribuicao' && 'Tem certeza que deseja excluir esta atribuição? Todas as cartelas voltarão a ficar disponíveis.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAction} className={actionType !== 'devolver' ? 'bg-danger text-danger-foreground hover:bg-danger/90' : ''}>
              {actionType === 'devolver' && 'Devolver'}
              {actionType === 'extraviar' && 'Marcar Extraviada'}
              {actionType === 'reverter-extravio' && 'Reverter'}
              {actionType === 'excluir-cartela' && 'Remover'}
              {actionType === 'excluir-atribuicao' && 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ComprovanteAtribuicaoModal isOpen={comprovanteOpen} onClose={() => setComprovanteOpen(false)} data={comprovanteData} />

      <Dialog open={editLancamentoOpen} onOpenChange={setEditLancamentoOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>Editar Atribuição Registrada</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Informe os números (aceita vírgula e faixa: `1,2,3,10-20`).
            </p>
            <Input
              value={editLancamentoNumeros}
              onChange={(e) => setEditLancamentoNumeros(e.target.value)}
              placeholder="Ex: 1,2,3,10-20"
            />
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={() => void salvarEdicaoLancamento()}>
                Salvar
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => setEditLancamentoOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AtribuicoesTab;
