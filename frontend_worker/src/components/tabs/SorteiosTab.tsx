import React, { useState, useMemo } from 'react';
import { Plus, Dice5, Search, Filter, Eraser, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBingo } from '@/contexts/BingoContext';
import { useAuth } from '@/contexts/AuthContext';
import { Sorteio } from '@/types/bingo';
import SorteioCard from '@/components/SorteioCard';
import SorteioModal from '@/components/modals/SorteioModal';
import { sanitizeFilename } from '@/lib/utils/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

const SorteiosTab: React.FC = () => {
  const { 
    sorteios, 
    sorteioAtivo, 
    setSorteioAtivo, 
    deleteSorteio,
    setCurrentTab,
    exportSorteioBackup
  } = useBingo();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSorteioId, setEditingSorteioId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSorteioId, setDeletingSorteioId] = useState<string | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState('');

  // Filtros locais
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'agendado' | 'em_andamento' | 'concluido'>('todos');
  const [filtroOwner, setFiltroOwner] = useState('todos');

  const isAdmin = user?.role === 'admin';

  // Lista de owners únicos (para o filtro de usuários no admin)
  const owners = useMemo(() => {
    const names = new Set<string>();
    sorteios.forEach(s => {
      if (s.owner_nome) names.add(s.owner_nome);
    });
    return Array.from(names).map(name => ({ key: name, label: name }));
  }, [sorteios]);

  // Sorteios filtrados
  const sorteiosFiltrados = useMemo(() => {
    return sorteios.filter(s => {
      if (busca) {
        const termo = busca.toLowerCase();
        if (!s.nome.toLowerCase().includes(termo)) return false;
      }
      if (filtroStatus !== 'todos' && s.status !== filtroStatus) return false;
      if (isAdmin && filtroOwner !== 'todos' && s.owner_nome !== filtroOwner) return false;
      return true;
    });
  }, [sorteios, busca, filtroStatus, filtroOwner, isAdmin]);

  // Agrupamento por owner (apenas para admin)
  const sorteiosAgrupados = useMemo(() => {
    if (!isAdmin) return null;
    const grupos = new Map<string, Sorteio[]>();
    sorteiosFiltrados.forEach(s => {
      const chave = s.owner_nome || 'Sem usuário';
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave)!.push(s);
    });
    return grupos;
  }, [isAdmin, sorteiosFiltrados]);

  const limparFiltros = () => {
    setBusca('');
    setFiltroStatus('todos');
    setFiltroOwner('todos');
  };

  const handleSelect = (id: string) => {
    const sorteio = sorteios.find(s => s.id === id);
    if (sorteio) {
      setSorteioAtivo(sorteio);
      setCurrentTab('dashboard');
      navigate(`/app/dashboard/${sorteio.id}`);
      toast({
        title: "Sorteio selecionado",
        description: `Sorteio "${sorteio.nome}" foi selecionado.`
      });
    }
  };

  const handleEdit = (id: string) => {
    setEditingSorteioId(id);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeletingSorteioId(id);
    setDeleteErrorMessage('');
    setDeleteDialogOpen(true);
  };

  const handleBackup = async (id: string) => {
    const sorteio = sorteios.find(s => s.id === id);
    if (!sorteio) return;

    try {
      const backup = await exportSorteioBackup(id);
      const safeName = sanitizeFilename(sorteio.nome);
      const fileName = `backup-sorteio-${safeName || 'sorteio'}-${new Date().toISOString().split('T')[0]}.json`;
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({
        title: "Backup gerado",
        description: `Backup do sorteio "${sorteio.nome}" baixado com sucesso.`
      });
    } catch (error) {
      console.error('Error downloading backup:', error);
    }
  };

  const confirmDelete = async () => {
    if (!deletingSorteioId) return;
    try {
      await deleteSorteio(deletingSorteioId);
      setDeleteDialogOpen(false);
      setDeletingSorteioId(null);
      setDeleteErrorMessage('');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Não foi possível excluir este sorteio.';
      setDeleteErrorMessage(message);
    }
  };

  const handleNewSorteio = () => {
    setEditingSorteioId(null);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingSorteioId(null);
  };

  const handleDeleteDialogChange = (open: boolean) => {
    setDeleteDialogOpen(open);
    if (!open) {
      setDeleteErrorMessage('');
      setDeletingSorteioId(null);
    }
  };

  const renderCards = (lista: Sorteio[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {lista.map(sorteio => (
        <SorteioCard
          key={sorteio.id}
          sorteio={sorteio}
          isActive={sorteioAtivo?.id === sorteio.id}
          onSelect={handleSelect}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onBackup={handleBackup}
        />
      ))}
    </div>
  );

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Dice5 className="w-6 h-6" />
          Gerenciar Sorteios
        </h2>
        <Button onClick={handleNewSorteio} className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Sorteio
        </Button>
      </div>

      {/* Filtros */}
      <div className="filter-bar">
        <div className={`grid grid-cols-1 gap-4 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex items-center gap-1">
              <Search className="w-4 h-4" />
              Buscar
            </label>
            <Input
              placeholder="Nome do sorteio..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex items-center gap-1">
              <Filter className="w-4 h-4" />
              Status
            </label>
            <Select
              value={filtroStatus}
              onValueChange={(value: typeof filtroStatus) => setFiltroStatus(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="agendado">Agendado</SelectItem>
                <SelectItem value="em_andamento">Em Andamento</SelectItem>
                <SelectItem value="concluido">Concluído</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground flex items-center gap-1">
                <User className="w-4 h-4" />
                Usuário
              </label>
              <Select
                value={filtroOwner}
                onValueChange={setFiltroOwner}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {owners.map(o => (
                    <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-end">
            <Button variant="outline" onClick={limparFiltros} className="w-full gap-2">
              <Eraser className="w-4 h-4" />
              Limpar Filtros
            </Button>
          </div>
        </div>
      </div>

      {sorteios.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-border">
          <Dice5 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">
            Nenhum sorteio encontrado
          </h3>
          <p className="text-muted-foreground mb-6">
            Crie seu primeiro sorteio para começar
          </p>
          <Button onClick={handleNewSorteio} className="gap-2">
            <Plus className="w-4 h-4" />
            Criar Primeiro Sorteio
          </Button>
        </div>
      ) : sorteiosFiltrados.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-border">
          <Dice5 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">
            Nenhum sorteio encontrado
          </h3>
          <p className="text-muted-foreground mb-4">
            Nenhum sorteio corresponde aos filtros aplicados
          </p>
          <Button variant="outline" onClick={limparFiltros} className="gap-2">
            <Eraser className="w-4 h-4" />
            Limpar Filtros
          </Button>
        </div>
      ) : isAdmin && sorteiosAgrupados ? (
        <div className="space-y-8">
          {Array.from(sorteiosAgrupados.entries()).map(([ownerName, lista]) => (
            <div key={ownerName}>
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
                <User className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">{ownerName}</h3>
                <span className="ml-2 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-sm font-medium">
                  {lista.length} {lista.length === 1 ? 'sorteio' : 'sorteios'}
                </span>
              </div>
              {renderCards(lista)}
            </div>
          ))}
        </div>
      ) : (
        renderCards(sorteiosFiltrados)
      )}

      <SorteioModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        editingId={editingSorteioId}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={handleDeleteDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Sorteio</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este sorteio? Esta ação não pode ser desfeita.
              Todos os vendedores, atribuições e vendas relacionados serão perdidos.
            </AlertDialogDescription>
            {deleteErrorMessage && (
              <AlertDialogDescription className="mt-2 rounded-md border border-danger/40 bg-danger/10 p-3 text-danger">
                {deleteErrorMessage}
              </AlertDialogDescription>
            )}
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

export default SorteiosTab;
