import React, { useState } from 'react';
import { useBingo } from '@/contexts/BingoContext';
import { Users, UserPlus, Search, Filter, Eraser, Edit, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatarMoeda, getStatusLabel } from '@/lib/utils/formatters';
import VendedorModal from '@/components/modals/VendedorModal';
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

const VendedoresTab: React.FC = () => {
  const { 
    sorteioAtivo, 
    vendedores, 
    vendas,
    cartelas,
    filtrosVendedores, 
    setFiltrosVendedores,
    deleteVendedor,
    isLoading
  } = useBingo();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendedorId, setEditingVendedorId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingVendedorId, setDeletingVendedorId] = useState<string | null>(null);

  if (!sorteioAtivo) {
    return (
      <div className="text-center py-12">
        <Users className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">Vendedores</h2>
        <p className="text-muted-foreground">Selecione um sorteio para gerenciar vendedores</p>
      </div>
    );
  }

  const vendedoresFiltrados = vendedores.filter(v => {
    if (filtrosVendedores.busca) {
      const busca = filtrosVendedores.busca.toLowerCase();
      const match = v.nome.toLowerCase().includes(busca) ||
                   (v.telefone && v.telefone.includes(busca)) ||
                   (v.email && v.email.toLowerCase().includes(busca));
      if (!match) return false;
    }
    if (filtrosVendedores.status !== 'todos') {
      if (filtrosVendedores.status === 'ativo' && !v.ativo) return false;
      if (filtrosVendedores.status === 'inativo' && v.ativo) return false;
    }
    return true;
  }).map(v => {
    const cartelasAtribuidas = cartelas.filter(c => c.vendedor_id === v.id && c.status === 'ativa').length;
    const cartelasVendidas = cartelas.filter(c => c.vendedor_id === v.id && c.status === 'vendida').length;
    const valorArrecadado = vendas
      .filter(venda => venda.vendedor_id === v.id)
      .reduce((sum, venda) => sum + Number(venda.valor_pago || 0), 0);
    return {
      ...v,
      cartelas_atribuidas: cartelasAtribuidas,
      cartelas_vendidas: cartelasVendidas,
      valor_arrecadado: valorArrecadado
    };
  });

  const handleEdit = (id: string) => {
    setEditingVendedorId(id);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeletingVendedorId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (deletingVendedorId) {
      deleteVendedor(deletingVendedorId);
      toast({
        title: "Vendedor excluído",
        description: "O vendedor foi excluído com sucesso."
      });
    }
    setDeleteDialogOpen(false);
    setDeletingVendedorId(null);
  };

  const limparFiltros = () => {
    setFiltrosVendedores({ busca: '', status: 'todos' });
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-6 h-6" />
          Vendedores - {sorteioAtivo.nome}
        </h2>
        <Button onClick={() => { setEditingVendedorId(null); setIsModalOpen(true); }} className="gap-2">
          <UserPlus className="w-4 h-4" />
          Novo Vendedor
        </Button>
      </div>

      {/* Filtros */}
      <div className="filter-bar">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex items-center gap-1">
              <Search className="w-4 h-4" />
              Buscar
            </label>
            <Input
              placeholder="Nome, telefone ou email..."
              value={filtrosVendedores.busca}
              onChange={(e) => setFiltrosVendedores({ ...filtrosVendedores, busca: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex items-center gap-1">
              <Filter className="w-4 h-4" />
              Status
            </label>
            <Select 
              value={filtrosVendedores.status} 
              onValueChange={(value: 'todos' | 'ativo' | 'inativo') => 
                setFiltrosVendedores({ ...filtrosVendedores, status: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="inativo">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={limparFiltros} className="w-full gap-2">
              <Eraser className="w-4 h-4" />
              Limpar Filtros
            </Button>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="table-container overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Carregando vendedores...</span>
          </div>
        ) : (
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50">
              <th className="p-4 text-left font-semibold text-foreground">ID</th>
              <th className="p-4 text-left font-semibold text-foreground">Nome</th>
              <th className="p-4 text-left font-semibold text-foreground">Telefone</th>
              <th className="p-4 text-left font-semibold text-foreground">E-mail</th>
              <th className="p-4 text-center font-semibold text-foreground">Atribuídas</th>
              <th className="p-4 text-center font-semibold text-foreground">Vendidas</th>
              <th className="p-4 text-right font-semibold text-foreground">Arrecadado</th>
              <th className="p-4 text-center font-semibold text-foreground">Status</th>
              <th className="p-4 text-center font-semibold text-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {vendedoresFiltrados.map((vendedor) => (
              <tr key={vendedor.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                <td className="p-4 font-mono text-sm text-muted-foreground">#{vendedor.id.slice(0, 6)}</td>
                <td className="p-4 font-semibold text-foreground">{vendedor.nome}</td>
                <td className="p-4 text-muted-foreground">{vendedor.telefone || 'Não informado'}</td>
                <td className="p-4 text-muted-foreground">{vendedor.email || 'Não informado'}</td>
                <td className="p-4 text-center">
                  <span className="px-2 py-1 bg-primary/10 text-primary rounded-full text-sm font-semibold">
                    {vendedor.cartelas_atribuidas}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="px-2 py-1 bg-success/10 text-success rounded-full text-sm font-semibold">
                    {vendedor.cartelas_vendidas}
                  </span>
                </td>
                <td className="p-4 text-right font-semibold text-foreground">
                  {formatarMoeda(vendedor.valor_arrecadado)}
                </td>
                <td className="p-4 text-center">
                  <span className={cn('status-badge', vendedor.ativo ? 'status-ativo' : 'status-inativo')}>
                    {vendedor.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex justify-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(vendedor.id)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(vendedor.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {vendedoresFiltrados.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-muted-foreground">
                  {vendedores.length === 0 ? (
                    <div>
                      <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg">Nenhum vendedor cadastrado</p>
                      <p className="text-sm mt-2">Cadastre seu primeiro vendedor para começar</p>
                      <Button onClick={() => { setEditingVendedorId(null); setIsModalOpen(true); }} className="mt-4 gap-2">
                        <UserPlus className="w-4 h-4" />
                        Cadastrar Vendedor
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <Filter className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg">Nenhum vendedor encontrado</p>
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

      <VendedorModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingVendedorId(null); }}
        editingId={editingVendedorId}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Vendedor</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este vendedor? Esta ação não pode ser desfeita.
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

export default VendedoresTab;
