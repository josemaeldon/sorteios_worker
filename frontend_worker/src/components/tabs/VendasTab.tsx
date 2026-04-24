import React, { useState } from 'react';
import { useBingo } from '@/contexts/BingoContext';
import { ShoppingCart, Plus, Search, Filter, Eraser, Edit, Trash2, DollarSign, Calendar, User, Loader2, Hash, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatarData, formatarMoeda, getStatusLabel, formatarNumeroCartela } from '@/lib/utils/formatters';
import VendaModal from '@/components/modals/VendaModal';
import PagamentoModal from '@/components/modals/PagamentoModal';
import ReciboModal from '@/components/modals/ReciboModal';
import { useToast } from '@/hooks/use-toast';
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

const VendasTab: React.FC = () => {
  const { 
    sorteioAtivo, 
    vendas,
    vendedores,
    filtrosVendas, 
    setFiltrosVendas,
    deleteVenda,
    isLoading
  } = useBingo();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendaId, setEditingVendaId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingVendaId, setDeletingVendaId] = useState<string | null>(null);
  const [isPagamentoOpen, setIsPagamentoOpen] = useState(false);
  const [pagamentoVendaId, setPagamentoVendaId] = useState<string | null>(null);
  const [isReciboOpen, setIsReciboOpen] = useState(false);
  const [reciboVendaId, setReciboVendaId] = useState<string | null>(null);

  if (!sorteioAtivo) {
    return (
      <div className="text-center py-12">
        <ShoppingCart className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">Vendas</h2>
        <p className="text-muted-foreground">Selecione um sorteio para gerenciar vendas</p>
      </div>
    );
  }

  const vendasFiltradas = vendas.filter(v => {
    if (filtrosVendas.busca) {
      const busca = filtrosVendas.busca.toLowerCase();
      const match = v.cliente_nome.toLowerCase().includes(busca) ||
                   (v.cliente_telefone && v.cliente_telefone.includes(busca)) ||
                   (v.vendedor_nome && v.vendedor_nome.toLowerCase().includes(busca));
      if (!match) return false;
    }
    if (filtrosVendas.status !== 'todos') {
      if (v.status !== filtrosVendas.status) return false;
    }
    if (filtrosVendas.vendedor !== 'todos') {
      if (v.vendedor_id !== filtrosVendas.vendedor) return false;
    }
    if (filtrosVendas.periodo !== 'todos') {
      const dataVenda = new Date(v.data_venda);
      const hoje = new Date();
      const diff = Math.floor((hoje.getTime() - dataVenda.getTime()) / (1000 * 60 * 60 * 24));
      if (filtrosVendas.periodo === 'hoje' && diff !== 0) return false;
      if (filtrosVendas.periodo === 'semana' && diff > 7) return false;
      if (filtrosVendas.periodo === 'mes' && diff > 30) return false;
    }
    return true;
  });

  const totalVendas = vendasFiltradas.length;
  const totalCartelas = vendasFiltradas.reduce((sum, v) => sum + v.numeros_cartelas.split(',').length, 0);
  const totalArrecadado = vendasFiltradas.reduce((sum, v) => sum + Number(v.valor_total || 0), 0);

  const handleEdit = (id: string) => {
    setEditingVendaId(id);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeletingVendaId(id);
    setDeleteDialogOpen(true);
  };

  const handlePagamento = (id: string) => {
    setPagamentoVendaId(id);
    setIsPagamentoOpen(true);
  };

  const handleRecibo = (id: string) => {
    setReciboVendaId(id);
    setIsReciboOpen(true);
  };

  const confirmDelete = () => {
    if (deletingVendaId) {
      deleteVenda(deletingVendaId);
      toast({
        title: "Venda excluída",
        description: "A venda foi excluída com sucesso."
      });
    }
    setDeleteDialogOpen(false);
    setDeletingVendaId(null);
  };

  const limparFiltros = () => {
    setFiltrosVendas({ busca: '', status: 'todos', vendedor: 'todos', periodo: 'todos' });
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShoppingCart className="w-6 h-6" />
          Vendas - {sorteioAtivo.nome}
        </h2>
        <Button onClick={() => { setEditingVendaId(null); setIsModalOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Venda
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="stat-card">
          <div className="text-sm text-muted-foreground">Total de Vendas</div>
          <div className="text-2xl font-bold text-foreground">{totalVendas}</div>
        </div>
        <div className="stat-card">
          <div className="text-sm text-muted-foreground">Cartelas Vendidas</div>
          <div className="text-2xl font-bold text-foreground">{totalCartelas}</div>
        </div>
        <div className="stat-card">
          <div className="text-sm text-muted-foreground">Total Arrecadado</div>
          <div className="text-2xl font-bold text-foreground">{formatarMoeda(totalArrecadado)}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="filter-bar">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex items-center gap-1">
              <Search className="w-4 h-4" />
              Buscar
            </label>
            <Input
              placeholder="Cliente ou vendedor..."
              value={filtrosVendas.busca}
              onChange={(e) => setFiltrosVendas({ ...filtrosVendas, busca: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex items-center gap-1">
              <Filter className="w-4 h-4" />
              Status
            </label>
            <Select 
              value={filtrosVendas.status} 
              onValueChange={(value: string) => setFiltrosVendas({ ...filtrosVendas, status: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="concluida">Concluídas</SelectItem>
                <SelectItem value="pendente">Pendentes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex items-center gap-1">
              <User className="w-4 h-4" />
              Vendedor
            </label>
            <Select 
              value={filtrosVendas.vendedor} 
              onValueChange={(value) => setFiltrosVendas({ ...filtrosVendas, vendedor: value })}
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
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              Período
            </label>
            <Select 
              value={filtrosVendas.periodo} 
              onValueChange={(value: string) => setFiltrosVendas({ ...filtrosVendas, periodo: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="semana">Última Semana</SelectItem>
                <SelectItem value="mes">Último Mês</SelectItem>
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

      {/* Tabela */}
      <div className="table-container overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Carregando vendas...</span>
          </div>
        ) : (
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50">
              <th className="p-4 text-left font-semibold text-foreground">Data</th>
              <th className="p-4 text-left font-semibold text-foreground">Cliente</th>
              <th className="p-4 text-left font-semibold text-foreground">Vendedor</th>
              <th className="p-4 text-left font-semibold text-foreground">
                <span className="flex items-center gap-1">
                  <Hash className="w-4 h-4" />
                  Números Vendidos
                </span>
              </th>
              <th className="p-4 text-right font-semibold text-foreground">Valor Total</th>
              <th className="p-4 text-right font-semibold text-foreground">Valor Pago</th>
              <th className="p-4 text-center font-semibold text-foreground">Status</th>
              <th className="p-4 text-center font-semibold text-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {vendasFiltradas.map((venda) => (
              <tr key={venda.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                <td className="p-4 text-muted-foreground">{formatarData(venda.data_venda)}</td>
                <td className="p-4 font-semibold text-foreground">{venda.cliente_nome}</td>
                <td className="p-4 text-muted-foreground">{venda.vendedor_nome || 'N/A'}</td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-1.5 max-w-xs">
                    {venda.numeros_cartelas.split(',').map((num, idx) => (
                      <span 
                        key={idx} 
                        className="inline-flex items-center justify-center min-w-[2.5rem] px-2 py-1 bg-emerald-500 text-white rounded-md text-sm font-bold shadow-sm"
                      >
                        {formatarNumeroCartela(parseInt(num.trim()))}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-4 text-right font-bold text-foreground">{formatarMoeda(venda.valor_total)}</td>
                <td className="p-4 text-right">
                  {venda.pagamentos && venda.pagamentos.length > 0 ? (
                    <div className="flex flex-col gap-1 items-end">
                      {venda.pagamentos.map((pag, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground capitalize">
                            {pag.forma_pagamento}:
                          </span>
                          <span className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-semibold',
                            Number(venda.valor_pago || 0) >= Number(venda.valor_total || 0)
                              ? 'bg-success/10 text-success' 
                              : 'bg-warning/10 text-warning'
                          )}>
                            {formatarMoeda(pag.valor)}
                          </span>
                        </div>
                      ))}
                      <div className="border-t border-border pt-1 mt-1">
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-sm font-bold',
                          Number(venda.valor_pago || 0) >= Number(venda.valor_total || 0)
                            ? 'bg-success/10 text-success' 
                            : 'bg-warning/10 text-warning'
                        )}>
                          Total: {formatarMoeda(venda.valor_pago)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <span className={cn(
                      'px-2 py-1 rounded-full text-sm font-semibold',
                      Number(venda.valor_pago || 0) >= Number(venda.valor_total || 0)
                        ? 'bg-success/10 text-success' 
                        : 'bg-warning/10 text-warning'
                    )}>
                      {formatarMoeda(venda.valor_pago)}
                    </span>
                  )}
                </td>
                <td className="p-4 text-center">
                  <span className={cn('status-badge', venda.status === 'concluida' ? 'status-pago' : 'status-pendente')}>
                    {venda.status === 'concluida' ? 'Concluída' : 'Pendente'}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex justify-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(venda.id)} title="Editar">
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handlePagamento(venda.id)} 
                      title="Pagamento"
                      className="text-success hover:text-success"
                    >
                      <DollarSign className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRecibo(venda.id)}
                      title="Recibo"
                      className="text-blue-600 hover:text-blue-600"
                    >
                      <Receipt className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(venda.id)} title="Excluir">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {vendasFiltradas.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                  {vendas.length === 0 ? (
                    <div>
                      <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg">Nenhuma venda registrada</p>
                      <p className="text-sm mt-2">Registre sua primeira venda para começar</p>
                      <Button onClick={() => { setEditingVendaId(null); setIsModalOpen(true); }} className="mt-4 gap-2">
                        <Plus className="w-4 h-4" />
                        Registrar Venda
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <Filter className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg">Nenhuma venda encontrada</p>
                      <p className="text-sm mt-2">Tente ajustar os filtros de busca</p>
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        )}
      </div>

      <VendaModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingVendaId(null); }}
        editingId={editingVendaId}
      />

      <PagamentoModal
        isOpen={isPagamentoOpen}
        onClose={() => { setIsPagamentoOpen(false); setPagamentoVendaId(null); }}
        vendaId={pagamentoVendaId}
      />

      <ReciboModal
        isOpen={isReciboOpen}
        onClose={() => { setIsReciboOpen(false); setReciboVendaId(null); }}
        vendaId={reciboVendaId}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Venda</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta venda? As cartelas serão devolvidas ao vendedor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VendasTab;
