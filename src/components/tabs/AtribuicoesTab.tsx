import React, { useState } from 'react';
import { useBingo } from '@/contexts/BingoContext';
import { ListTodo, Plus, Search, Filter, Eraser, Edit, Trash2, ChevronDown, ChevronUp, RotateCcw, ArrowRightLeft, DollarSign, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatarData, formatarNumeroCartela, getStatusLabel, formatarMoeda } from '@/lib/utils/formatters';
import AtribuicaoModal from '@/components/modals/AtribuicaoModal';
import TransferenciaModal from '@/components/modals/TransferenciaModal';
import { useToast } from '@/hooks/use-toast';
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

const AtribuicoesTab: React.FC = () => {
  const { 
    sorteioAtivo, 
    atribuicoes,
    vendedores,
    filtrosAtribuicoes, 
    setFiltrosAtribuicoes,
    deleteAtribuicao,
    removeCartelaFromAtribuicao,
    updateCartelaStatusInAtribuicao
  } = useBingo();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAtribuicao, setEditingAtribuicao] = useState<Atribuicao | null>(null);
  const [expandedAtribuicao, setExpandedAtribuicao] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAtribuicao, setDeletingAtribuicao] = useState<{ id: string; vendedorId: string; cartela?: number } | null>(null);
  const [actionType, setActionType] = useState<'devolver' | 'excluir-cartela' | 'excluir-atribuicao' | 'extraviar'>('excluir-atribuicao');
  
  // Transfer modal state
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferAtribuicao, setTransferAtribuicao] = useState<Atribuicao | null>(null);
  const [transferCartelaNumero, setTransferCartelaNumero] = useState<number | null>(null);

  if (!sorteioAtivo) {
    return (
      <div className="text-center py-12">
        <ListTodo className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">Atribuições</h2>
        <p className="text-muted-foreground">Selecione um sorteio para gerenciar atribuições</p>
      </div>
    );
  }

  const atribuicoesFiltradas = atribuicoes.filter(a => {
    if (filtrosAtribuicoes.busca) {
      const busca = filtrosAtribuicoes.busca.toLowerCase();
      const matchVendedor = a.vendedor_nome && a.vendedor_nome.toLowerCase().includes(busca);
      const matchCartela = a.cartelas.some(c => c.numero.toString().includes(busca));
      if (!matchVendedor && !matchCartela) return false;
    }
    if (filtrosAtribuicoes.vendedor !== 'todos') {
      if (a.vendedor_id !== filtrosAtribuicoes.vendedor) return false;
    }
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

  const handleExcluirAtribuicao = (id: string, vendedorId: string) => {
    const atribuicao = atribuicoes.find(a => a.id === id);
    const possuiCartelaVendida = atribuicao?.cartelas.some(c => c.status === 'vendida');
    if (possuiCartelaVendida) {
      toast({
        title: "Ação não permitida",
        description: "Não é possível excluir uma atribuição que possui cartela(s) vendida(s).",
        variant: "destructive"
      });
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
    setIsTransferModalOpen(true);
  };

  const confirmAction = async () => {
    if (!deletingAtribuicao) return;
    
    const atribuicao = atribuicoes.find(a => a.id === deletingAtribuicao.id);
    if (!atribuicao) return;

    if (actionType === 'devolver' && deletingAtribuicao.cartela) {
      // Mark as returned in the attribution but make available for new assignments
      await updateCartelaStatusInAtribuicao(deletingAtribuicao.id, deletingAtribuicao.cartela, 'devolvida');
      toast({
        title: "Cartela devolvida",
        description: `A cartela ${formatarNumeroCartela(deletingAtribuicao.cartela)} foi devolvida e está disponível para novas atribuições.`
      });
    } else if (actionType === 'extraviar' && deletingAtribuicao.cartela) {
      await updateCartelaStatusInAtribuicao(deletingAtribuicao.id, deletingAtribuicao.cartela, 'extraviada');
      toast({
        title: "Cartela marcada como Extraviada",
        description: `A cartela ${formatarNumeroCartela(deletingAtribuicao.cartela)} foi marcada como extraviada.`
      });
    } else if (actionType === 'excluir-cartela' && deletingAtribuicao.cartela) {
      await removeCartelaFromAtribuicao(deletingAtribuicao.id, deletingAtribuicao.cartela);
      toast({
        title: "Cartela removida",
        description: `A cartela ${formatarNumeroCartela(deletingAtribuicao.cartela)} foi removida da atribuição.`
      });
    } else if (actionType === 'excluir-atribuicao') {
      await deleteAtribuicao(deletingAtribuicao.id);
      toast({
        title: "Atribuição excluída",
        description: `A atribuição de ${atribuicao.vendedor_nome} foi excluída.`
      });
    }

    setDeleteDialogOpen(false);
    setDeletingAtribuicao(null);
  };

  const limparFiltros = () => {
    setFiltrosAtribuicoes({ busca: '', status: 'todos', vendedor: 'todos' });
  };

  const toggleExpand = (id: string) => {
    setExpandedAtribuicao(prev => prev === id ? null : id);
  };

  const getStatusCounts = (cartelas: CartelaAtribuida[]) => {
    return {
      ativas: cartelas.filter(c => c.status === 'ativa').length,
      vendidas: cartelas.filter(c => c.status === 'vendida').length,
      devolvidas: cartelas.filter(c => c.status === 'devolvida').length,
      extraviadas: cartelas.filter(c => c.status === 'extraviada').length,
    };
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ListTodo className="w-6 h-6" />
          Atribuições - {sorteioAtivo.nome}
        </h2>
        <Button onClick={() => { setEditingAtribuicao(null); setIsModalOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Atribuição
        </Button>
      </div>

      {/* Filtros */}
      <div className="filter-bar">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex items-center gap-1">
              <Search className="w-4 h-4" />
              Buscar
            </label>
            <Input
              placeholder="Vendedor ou número..."
              value={filtrosAtribuicoes.busca}
              onChange={(e) => setFiltrosAtribuicoes({ ...filtrosAtribuicoes, busca: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex items-center gap-1">
              <Filter className="w-4 h-4" />
              Status Cartelas
            </label>
            <Select 
              value={filtrosAtribuicoes.status} 
              onValueChange={(value: string) => setFiltrosAtribuicoes({ ...filtrosAtribuicoes, status: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
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
            <label className="text-sm font-semibold text-foreground flex items-center gap-1">
              Vendedor
            </label>
            <Select 
              value={filtrosAtribuicoes.vendedor} 
              onValueChange={(value) => setFiltrosAtribuicoes({ ...filtrosAtribuicoes, vendedor: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
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

      {/* Lista de Atribuições */}
      <div className="space-y-4">
        {atribuicoesFiltradas.map((atribuicao) => {
          const counts = getStatusCounts(atribuicao.cartelas);
          const isExpanded = expandedAtribuicao === atribuicao.id;
          const possuiCartelaVendida = atribuicao.cartelas.some(c => c.status === 'vendida');
          
          return (
            <Collapsible key={atribuicao.id} open={isExpanded} onOpenChange={() => toggleExpand(atribuicao.id)}>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <CollapsibleTrigger asChild>
                  <div className="p-4 cursor-pointer hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                          <span className="text-primary font-bold text-lg">
                            {atribuicao.vendedor_nome?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                                        <div>
                                          <h3 className="font-bold text-foreground text-lg">{atribuicao.vendedor_nome}</h3>
                                          <p className="text-sm text-muted-foreground">
                                            {atribuicao.cartelas.length} cartela(s) atribuída(s)
                                          </p>
                                          <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                                            <DollarSign className="w-3 h-3" />
                                            Previsão: {formatarMoeda(atribuicao.cartelas.length * (sorteioAtivo?.valor_cartela || 0))}
                                          </p>
                                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex gap-2">
                          {counts.ativas > 0 && (
                            <span className="status-badge status-ativa">
                              {counts.ativas} ativa(s)
                            </span>
                          )}
                          {counts.vendidas > 0 && (
                            <span className="status-badge status-vendida">
                              {counts.vendidas} vendida(s)
                            </span>
                          )}
                          {counts.devolvidas > 0 && (
                            <span className="status-badge status-devolvida">
                              {counts.devolvidas} devolvida(s)
                            </span>
                          )}
                          {counts.extraviadas > 0 && (
                            <span className="status-badge status-extraviada">
                              {counts.extraviadas} extraviada(s)
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditarAtribuicao(atribuicao);
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive"
                            disabled={possuiCartelaVendida}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExcluirAtribuicao(atribuicao.id, atribuicao.vendedor_id);
                            }}
                            title={possuiCartelaVendida ? 'Não é possível excluir atribuição com cartela vendida' : 'Excluir atribuição'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <div className="border-t border-border p-4 bg-muted/20">
                    <div className="mb-4 flex justify-between items-center">
                      <h4 className="font-semibold text-foreground">Cartelas Atribuídas</h4>
                      <div className="flex gap-2">
                        {atribuicao.cartelas.filter(c => c.status === 'ativa').length > 1 && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setTransferAtribuicao(atribuicao);
                              setTransferCartelaNumero(null); // null = multi-select mode
                              setIsTransferModalOpen(true);
                            }}
                            className="gap-1"
                          >
                            <ArrowRightLeft className="w-4 h-4" />
                            Transferir Várias
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setIsModalOpen(true)}
                          className="gap-1"
                        >
                          <Plus className="w-4 h-4" />
                          Adicionar Cartelas
                        </Button>
                      </div>
                    </div>
                    
                    {atribuicao.cartelas.length === 0 ? (
                      <p className="text-center text-muted-foreground py-4">
                        Nenhuma cartela atribuída a este vendedor
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-muted/50">
                              <th className="p-3 text-left font-semibold text-foreground">Cartela</th>
                              <th className="p-3 text-left font-semibold text-foreground">Data Atribuição</th>
                              <th className="p-3 text-center font-semibold text-foreground">Status</th>
                              <th className="p-3 text-center font-semibold text-foreground">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {atribuicao.cartelas.map((cartela) => (
                              <tr key={cartela.numero} className="border-b border-border hover:bg-muted/30 transition-colors">
                                <td className="p-3">
                                  <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-bold">
                                    {formatarNumeroCartela(cartela.numero)}
                                  </span>
                                </td>
                                <td className="p-3 text-muted-foreground">
                                  {formatarData(cartela.data_atribuicao)}
                                </td>
                                <td className="p-3 text-center">
                                  <span className={cn('status-badge', `status-${cartela.status}`)}>
                                    {getStatusLabel(cartela.status)}
                                  </span>
                                </td>
                                <td className="p-3">
                                  <div className="flex justify-center gap-2">
                                    {cartela.status === 'ativa' && (
                                      <>
                                        <Button 
                                          size="sm" 
                                          variant="outline"
                                          onClick={() => handleExtraviada(atribuicao.id, cartela.numero)}
                                          className="gap-1 border-orange-400 text-orange-600 hover:bg-orange-50"
                                          title="Marcar como extraviada"
                                        >
                                          <AlertTriangle className="w-4 h-4" />
                                        </Button>
                                        <Button 
                                          size="sm" 
                                          variant="outline" 
                                          onClick={() => handleTransferirCartela(atribuicao, cartela.numero)}
                                          className="gap-1"
                                          title="Transferir para outro vendedor"
                                        >
                                          <ArrowRightLeft className="w-4 h-4" />
                                          Transferir
                                        </Button>
                                        <Button 
                                          size="sm" 
                                          variant="outline" 
                                          onClick={() => handleDevolverCartela(atribuicao.id, cartela.numero)}
                                          className="gap-1"
                                        >
                                          <RotateCcw className="w-4 h-4" />
                                          Devolver
                                        </Button>
                                      </>
                                    )}
                                    {cartela.status !== 'vendida' && (
                                      <Button 
                                        size="sm" 
                                        variant="destructive" 
                                        onClick={() => handleExcluirCartela(atribuicao.id, cartela.numero)}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
        
        {atribuicoesFiltradas.length === 0 && (
          <div className="text-center py-12 bg-card border border-border rounded-xl">
            {atribuicoes.length === 0 ? (
              <div>
                <ListTodo className="w-12 h-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
                <p className="text-lg text-foreground">Nenhuma atribuição encontrada</p>
                <p className="text-sm mt-2 text-muted-foreground">Atribua cartelas aos vendedores para começar</p>
                <Button onClick={() => setIsModalOpen(true)} className="mt-4 gap-2">
                  <Plus className="w-4 h-4" />
                  Nova Atribuição
                </Button>
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
        onClose={() => { setIsModalOpen(false); setEditingAtribuicao(null); }}
        editingAtribuicao={editingAtribuicao}
      />

      <TransferenciaModal
        isOpen={isTransferModalOpen}
        onClose={() => {
          setIsTransferModalOpen(false);
          setTransferAtribuicao(null);
          setTransferCartelaNumero(null);
        }}
        atribuicaoOrigem={transferAtribuicao}
        cartelaNumero={transferCartelaNumero}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === 'devolver' && 'Devolver Cartela'}
              {actionType === 'extraviar' && 'Marcar como Extraviada'}
              {actionType === 'excluir-cartela' && 'Remover Cartela'}
              {actionType === 'excluir-atribuicao' && 'Excluir Atribuição'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === 'devolver' && 'Tem certeza que deseja devolver esta cartela? Ela será marcada como devolvida.'}
              {actionType === 'extraviar' && 'Tem certeza que deseja marcar esta cartela como extraviada? Ela será registrada como perdida.'}
              {actionType === 'excluir-cartela' && 'Tem certeza que deseja remover esta cartela da atribuição? Ela voltará a ficar disponível.'}
              {actionType === 'excluir-atribuicao' && 'Tem certeza que deseja excluir esta atribuição? Todas as cartelas voltarão a ficar disponíveis.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmAction}
              className={actionType !== 'devolver' ? 'bg-danger text-danger-foreground hover:bg-danger/90' : ''}
            >
              {actionType === 'devolver' && 'Devolver'}
              {actionType === 'extraviar' && 'Marcar Extraviada'}
              {actionType === 'excluir-cartela' && 'Remover'}
              {actionType === 'excluir-atribuicao' && 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AtribuicoesTab;
